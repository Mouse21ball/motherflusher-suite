// ─── WebSocket Room Manager ───────────────────────────────────────────────────
// Handles two concerns:
//   1. Presence-only rooms: server knows who is seated, game runs client-side.
//   2. Authoritative rooms: server owns game state (feature-flagged per mode).
//
// Host authority layer:
//   • The first human to join a room becomes the host.
//   • Host can kick players and adjust settings before the first hand.
//   • If the host disconnects, host status transfers to the longest-seated human.
//   • Settings (maxPlayers, botsEnabled) are read from the routes TableRecord on
//     first join and enforced for that table's lifetime.

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { FEATURES } from '../shared/featureFlags';
import { storage } from './storage';
import {
  addBadugiConnection,
  removeBadugiConnection,
  handleBadugiAction,
  getBadugiTablePhase,
  updateBadugiTableSettings,
} from './gameEngine';
import {
  addGenericConnection,
  removeGenericConnection,
  handleGenericAction,
  getGenericTablePhase,
  updateGenericTableSettings,
} from './genericEngine';
import { getTableRecord, updateTableRecord } from './routes';
import {
  handleLLJoin,
  handleLLSelect,
  handleLLWager,
  handleLLSideBet,
  handleLLStart,
  handleLLDisconnect,
  handleLLSpectate,
  handleLLSpectatorSideBet,
  handleLLSpectatorLeave,
} from './ladyluckEngine';

// ─── Rollout gate ─────────────────────────────────────────────────────────────

const SERVER_BADUGI_ON: boolean =
  FEATURES.SERVER_AUTHORITATIVE_BADUGI ||
  process.env.BADUGI_ALPHA_ENABLED === 'true';

const SERVER_MODES_ON: boolean =
  process.env.MODES_ALPHA_ENABLED === 'true' || SERVER_BADUGI_ON;

if (SERVER_BADUGI_ON) {
  const src = FEATURES.SERVER_AUTHORITATIVE_BADUGI ? 'featureFlag' : 'env:BADUGI_ALPHA_ENABLED';
  console.log(`[badugi] Server-authoritative mode ENABLED (source: ${src})`);
} else {
  console.log('[badugi] Server-authoritative mode OFF — client engine active.');
}
if (SERVER_MODES_ON) {
  console.log('[modes] Generic server-authoritative mode ENABLED for all game modes.');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeatClaim {
  seatId: string;
  playerId: string;
  name: string;
  joinedAt: number;
}

interface Room {
  tableId: string;
  modeId: string;
  isAuthoritative: boolean;
  createdAt: number;
  seats: Map<string, SeatClaim>;
  connections: Map<string, WebSocket>;
  // Host authority
  hostId: string | null;
  maxPlayers: number;
  botsEnabled: boolean;
  isInviteOnly: boolean;
  crewId?: string;
}

// ─── Client message types ─────────────────────────────────────────────────────

type ClientMessage =
  | { type: 'join';          tableId: string; modeId: string; playerId: string; name: string; seatId: string; authoritative?: boolean; isPrivate?: boolean; quickPlay?: boolean; identityId?: string; subscriptionTier?: string; buyinChips?: number }
  | { type: 'leave';         tableId: string; playerId: string }
  | { type: 'ping' }
  | { type: 'badugi:action'; tableId: string; playerId: string; action: string; payload: unknown }
  | { type: 'mode:action';   tableId: string; modeId: string; playerId: string; action: string; payload: unknown }
  | { type: 'host:kick';     tableId: string; playerId: string; targetPlayerId: string }
  | { type: 'host:settings'; tableId: string; playerId: string; maxPlayers?: number; botsEnabled?: boolean; isInviteOnly?: boolean };

// ─── Server broadcast payloads ────────────────────────────────────────────────

interface RoomUpdate {
  type: 'room_update';
  tableId: string;
  humanCount: number;
  seats: Omit<SeatClaim, 'joinedAt'>[];
  hostId: string | null;
}

interface HostUpdate {
  type: 'host_update';
  hostId: string | null;
  hostName: string | null;
  tableSettings: { maxPlayers: number; botsEnabled: boolean; isInviteOnly: boolean };
  crewId: string | null;
}

// ─── State ────────────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();

// ─── Seat ownership registry ──────────────────────────────────────────────────
// The WS AUTHZ checks must not compare a message's `playerId` (which the engine
// assigns as a short seat label like "p1") against the join-time session UUID
// stored in the `playerId` closure variable.  Instead, we record which
// authenticated player owns each seat at join time and verify against that.
//
// Key format: "${tableId}:${seatPid}"  (e.g. "TABLE1:p1")
// Value:      authWs.authenticatedPlayerId  (the verified profile/session UUID)
const seatOwners = new Map<string, string>();

function setSeatOwner(tableId: string, seatPid: string, authedId: string): void {
  seatOwners.set(`${tableId}:${seatPid}`, authedId);
}
function getSeatOwner(tableId: string, seatPid: string): string | undefined {
  return seatOwners.get(`${tableId}:${seatPid}`);
}
function clearSeatOwner(tableId: string, seatPid: string): void {
  seatOwners.delete(`${tableId}:${seatPid}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateRoom(tableId: string, modeId: string, playerId?: string): Room {
  if (!rooms.has(tableId)) {
    const isAuthoritative = SERVER_BADUGI_ON && modeId === 'badugi';

    // Read host settings from the routes TableRecord if available
    const record = getTableRecord(tableId);
    const maxPlayers  = record?.maxPlayers  ?? 5;
    const botsEnabled = record?.crewId ? false : (record?.botsEnabled ?? true);
    const isInviteOnly = record?.isInviteOnly ?? false;
    const hostId = playerId ?? record?.hostId ?? null;

    rooms.set(tableId, {
      tableId,
      modeId,
      isAuthoritative,
      createdAt: Date.now(),
      seats: new Map(),
      connections: new Map(),
      hostId,
      maxPlayers,
      botsEnabled,
      isInviteOnly,
      crewId: record?.crewId,
    });
  }
  return rooms.get(tableId)!;
}

function buildHostUpdate(room: Room): HostUpdate {
  const hostName = room.hostId
    ? (Array.from(room.seats.values()).find(s => s.playerId === room.hostId)?.name ?? null)
    : null;
  return {
    type: 'host_update',
    hostId: room.hostId,
    hostName,
    tableSettings: {
      maxPlayers:  room.maxPlayers,
      botsEnabled: room.botsEnabled,
      isInviteOnly: room.isInviteOnly,
    },
    crewId: room.crewId ?? null,
  };
}

function broadcastRoomState(room: Room): void {
  const payload: RoomUpdate = {
    type: 'room_update',
    tableId: room.tableId,
    humanCount: room.connections.size,
    seats: Array.from(room.seats.values()).map(({ seatId, playerId, name }) => ({ seatId, playerId, name })),
    hostId: room.hostId,
  };
  const msg = JSON.stringify(payload);
  for (const ws of room.connections.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function broadcastHostUpdate(room: Room): void {
  const msg = JSON.stringify(buildHostUpdate(room));
  for (const ws of room.connections.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function sendHostUpdateTo(ws: WebSocket, room: Room): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(buildHostUpdate(room)));
  }
}

function migrateHost(room: Room): void {
  // Find the longest-seated connected human (smallest joinedAt, still connected)
  let oldest: SeatClaim | null = null;
  for (const claim of room.seats.values()) {
    if (claim.playerId === room.hostId) continue;
    if (!room.connections.has(claim.playerId)) continue;
    if (!oldest || claim.joinedAt < oldest.joinedAt) oldest = claim;
  }
  room.hostId = oldest?.playerId ?? null;
  broadcastHostUpdate(room);
}

function releasePlayer(playerId: string, tableId: string, intentional = false): void {
  const room = rooms.get(tableId);
  if (!room) return;

  const wasHost = room.hostId === playerId;

  room.connections.delete(playerId);

  if (room.isAuthoritative) {
    removeBadugiConnection(tableId, playerId, intentional);
  } else if (SERVER_MODES_ON && room.modeId !== 'badugi') {
    removeGenericConnection(tableId, playerId, intentional);
  }

  for (const [seatId, claim] of room.seats.entries()) {
    if (claim.playerId === playerId) room.seats.delete(seatId);
  }

  if (room.connections.size === 0) {
    setTimeout(() => {
      if (rooms.get(tableId)?.connections.size === 0) rooms.delete(tableId);
    }, 5 * 60 * 1000);
  } else {
    // If host left, migrate to oldest remaining human
    if (wasHost) migrateHost(room);
    broadcastRoomState(room);
  }
}

// ─── Prune stale rooms ────────────────────────────────────────────────────────

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

function pruneRooms(): void {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [id, room] of rooms.entries()) {
    if (room.connections.size === 0 && room.createdAt < cutoff) rooms.delete(id);
  }
}

// ─── Authenticated WebSocket type ────────────────────────────────────────────

interface AuthenticatedWs extends WebSocket {
  authenticatedPlayerId: string;
  sessionExpiresAt: Date;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initRooms(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    // ── Handshake authentication ──────────────────────────────────────────────
    // Every WS connection must supply a valid session token as ?token= in the URL.
    // The token is verified against the database before the HTTP 101 upgrade is
    // sent. Connections without a valid token are rejected at the TCP level —
    // no game messages are ever processed.
    verifyClient: (
      info: { req: IncomingMessage; origin: string; secure: boolean },
      done: (result: boolean, code?: number, message?: string) => void,
    ) => {
      const urlStr = info.req.url ?? '/';
      const qs     = urlStr.includes('?') ? urlStr.split('?')[1] : '';
      const token  = new URLSearchParams(qs).get('token');
      const ip     = info.req.socket?.remoteAddress ?? 'unknown';
      const at     = new Date().toISOString();

      if (!token) {
        console.warn(`[WS AUTH] ${at} ip=${ip} reason=missing_token — rejected`);
        done(false, 401, 'Unauthorized');
        return;
      }

      storage.getSession(token)
        .then(session => {
          if (!session) {
            console.warn(`[WS AUTH] ${at} ip=${ip} reason=invalid_or_expired_token — rejected`);
            done(false, 401, 'Unauthorized');
            return;
          }
          // Attach authenticated identity to request for use in connection handler
          (info.req as any).authenticatedPlayerId = session.playerId;
          (info.req as any).sessionExpiresAt      = session.expiresAt;
          done(true);
        })
        .catch(err => {
          console.error(`[WS AUTH] ${at} ip=${ip} reason=session_lookup_error msg=${(err as Error).message}`);
          done(false, 500, 'Internal Error');
        });
    },
  });

  setInterval(pruneRooms, 60 * 60 * 1000);

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const authWs = ws as AuthenticatedWs;
    authWs.authenticatedPlayerId = (req as any).authenticatedPlayerId as string;
    authWs.sessionExpiresAt      = (req as any).sessionExpiresAt      as Date;
    const remoteIp = req.socket?.remoteAddress ?? 'unknown';

    let roomId:           string | null      = null;
    let playerId:         string | null      = null;
    let engineSeatPid:    string | null      = null; // seat label assigned by the engine (e.g. "p1")
    let spectatorTableId: string | undefined = undefined;
    let spectatorUserId:  string | undefined = undefined;

    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 25000);

    // ── Session expiration check ─────────────────────────────────────────────
    // Fires every 60 s. If the session has expired mid-game, the server sends
    // a session_expired event and closes the connection gracefully.
    const sessionCheckTimer = setInterval(() => {
      if (new Date() > authWs.sessionExpiresAt) {
        console.log(`[WS AUTH] Session expired: player=${authWs.authenticatedPlayerId} — closing connection`);
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'session_expired' })); } catch {}
        }
        ws.close();
      }
    }, 60_000);

    ws.on('message', async (data: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        return;
      }

      // ── join ────────────────────────────────────────────────────────────────
      if (msg.type === 'join') {
        const { tableId, modeId, playerId: pid, name, seatId, isPrivate, quickPlay, identityId } = msg;
        if (!tableId || !pid) return;

        // ── Identity verification ──────────────────────────────────────────────
        // useServerGame / useServerMode send playerId=sessionUUID and identityId=profileId.
        // useTableRoom sends playerId=profileId with no identityId field.
        // In both patterns the resolved profile identity must match the authenticated session.
        const claimedIdentity = identityId ?? pid;
        if (claimedIdentity !== authWs.authenticatedPlayerId) {
          console.warn(
            `[WS AUTHZ] ${new Date().toISOString()} authenticated=${authWs.authenticatedPlayerId} ` +
            `claimed_identity=${claimedIdentity} msg=join ip=${remoteIp} — REJECTED (identity mismatch)`,
          );
          ws.close();
          return;
        }

        // ── Club membership gate ───────────────────────────────────────────────
        const tableRec = getTableRecord(tableId);
        if (tableRec?.crewId) {
          const isMember = await storage.isCrewMember(tableRec.crewId, pid);
          if (!isMember) {
            ws.send(JSON.stringify({ type: 'error', message: 'This is a private club table. Members only.' }));
            ws.close();
            return;
          }
        }

        if (roomId && playerId) releasePlayer(playerId, roomId);

        roomId   = tableId;
        playerId = pid;

        const isNewRoom = !rooms.has(tableId);
        const room = getOrCreateRoom(tableId, modeId || 'unknown', isNewRoom ? pid : undefined);
        room.connections.set(pid, ws);

        // Set host: first human to join owns the room
        if (isNewRoom || !room.hostId) {
          room.hostId = pid;
        }

        if (seatId) {
          room.seats.set(seatId, { seatId, playerId: pid, name: name || 'Player', joinedAt: Date.now() });
        }

        const engineOptions = { maxPlayers: room.maxPlayers, botsEnabled: room.botsEnabled, crewId: room.crewId };

        let assignedSeat: string | null = null;
        if (room.isAuthoritative) {
          assignedSeat = addBadugiConnection(tableId, pid, ws, name || undefined, !!isPrivate, !!quickPlay, identityId, engineOptions, msg.buyinChips);
        } else if (SERVER_MODES_ON && modeId !== 'badugi') {
          assignedSeat = addGenericConnection(tableId, modeId, pid, ws, name || undefined, !!isPrivate, !!quickPlay, identityId, engineOptions, msg.buyinChips);
        }

        // Register seat ownership so subsequent AUTHZ checks can resolve seat
        // labels (e.g. "p1") back to the verified authenticatedPlayerId.
        // We register both the join-time pid (used by leave/host messages) and
        // the engine-assigned seat label (used by badugi:action / mode:action).
        setSeatOwner(tableId, pid, authWs.authenticatedPlayerId);
        if (assignedSeat && assignedSeat !== '__spectator__') {
          engineSeatPid = assignedSeat;
          setSeatOwner(tableId, assignedSeat, authWs.authenticatedPlayerId);
        }

        // Send host/settings context to the joining player after engine init
        sendHostUpdateTo(ws, room);
        broadcastRoomState(room);
        return;
      }

      // ── leave ────────────────────────────────────────────────────────────────
      if (msg.type === 'leave') {
        const { tableId, playerId: pid } = msg;
        // Authorization: claimed pid must be owned by this authenticated connection
        if (getSeatOwner(tableId, pid) !== authWs.authenticatedPlayerId) {
          console.warn(
            `[WS AUTHZ] ${new Date().toISOString()} authenticated=${authWs.authenticatedPlayerId} ` +
            `claimed_pid=${pid} seat_owner=${getSeatOwner(tableId, pid) ?? 'none'} ` +
            `msg=leave ip=${remoteIp} — REJECTED`,
          );
          return;
        }
        if (tableId && pid) releasePlayer(pid, tableId, true);
        roomId   = null;
        playerId = null;
        return;
      }

      // ── ping ─────────────────────────────────────────────────────────────────
      if (msg.type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // ── host:kick ────────────────────────────────────────────────────────────
      if (msg.type === 'host:kick') {
        const { tableId, playerId: senderPid, targetPlayerId } = msg;
        // Authorization: sender must be owned by this authenticated connection
        if (getSeatOwner(tableId, senderPid) !== authWs.authenticatedPlayerId) {
          console.warn(
            `[WS AUTHZ] ${new Date().toISOString()} authenticated=${authWs.authenticatedPlayerId} ` +
            `claimed_pid=${senderPid} seat_owner=${getSeatOwner(tableId, senderPid) ?? 'none'} ` +
            `msg=host:kick ip=${remoteIp} — REJECTED`,
          );
          return;
        }
        const room = rooms.get(tableId);
        if (!room) return;
        // Only the host can kick
        if (room.hostId !== senderPid) return;
        // Can't kick yourself
        if (targetPlayerId === senderPid) return;

        const targetWs = room.connections.get(targetPlayerId);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
          try { targetWs.send(JSON.stringify({ type: 'host_kicked', reason: 'kicked by host' })); } catch {}
          targetWs.close();
        }
        // releasePlayer is called via the ws.on('close') handler of the target
        return;
      }

      // ── host:settings ─────────────────────────────────────────────────────────
      if (msg.type === 'host:settings') {
        const { tableId, playerId: senderPid, maxPlayers, botsEnabled, isInviteOnly } = msg;
        // Authorization: sender must be owned by this authenticated connection
        if (getSeatOwner(tableId, senderPid) !== authWs.authenticatedPlayerId) {
          console.warn(
            `[WS AUTHZ] ${new Date().toISOString()} authenticated=${authWs.authenticatedPlayerId} ` +
            `claimed_pid=${senderPid} seat_owner=${getSeatOwner(tableId, senderPid) ?? 'none'} ` +
            `msg=host:settings ip=${remoteIp} — REJECTED`,
          );
          return;
        }
        const room = rooms.get(tableId);
        if (!room) return;
        // Only the host can change settings
        if (room.hostId !== senderPid) return;

        // Settings lock: cannot change after first hand starts
        const phase = room.isAuthoritative
          ? getBadugiTablePhase(tableId)
          : getGenericTablePhase(room.modeId, tableId);
        if (phase && phase !== 'WAITING') {
          // Game already started — silently reject
          return;
        }

        // Apply updates
        if (maxPlayers  !== undefined) room.maxPlayers  = maxPlayers;
        if (botsEnabled !== undefined) room.botsEnabled = botsEnabled;
        if (isInviteOnly !== undefined) room.isInviteOnly = isInviteOnly;

        // Persist to routes registry
        updateTableRecord(tableId, {
          ...(maxPlayers  !== undefined ? { maxPlayers }  : {}),
          ...(botsEnabled !== undefined ? { botsEnabled } : {}),
          ...(isInviteOnly !== undefined ? { isInviteOnly } : {}),
        });

        // Push to engine
        if (room.isAuthoritative) {
          updateBadugiTableSettings(tableId, { maxPlayers, botsEnabled });
        } else {
          updateGenericTableSettings(tableId, room.modeId, { maxPlayers, botsEnabled });
        }

        // Broadcast updated settings to all players
        broadcastHostUpdate(room);
        return;
      }

      // ── badugi:action (authoritative mode only) ────────────────────────────
      if (msg.type === 'badugi:action') {
        const { tableId, playerId: pid, action, payload } = msg;
        if (!tableId || !pid || !action) {
          console.warn('[CGP][server] badugi:action DROPPED — missing field', { tableId, pid, action });
          return;
        }
        // Authorization: claimed pid must be owned by this authenticated connection
        if (getSeatOwner(tableId, pid) !== authWs.authenticatedPlayerId) {
          console.warn(
            `[WS AUTHZ] ${new Date().toISOString()} authenticated=${authWs.authenticatedPlayerId} ` +
            `claimed_pid=${pid} seat_owner=${getSeatOwner(tableId, pid) ?? 'none'} ` +
            `action=${action} msg=badugi:action ip=${remoteIp} — REJECTED`,
          );
          return;
        }
        console.log('[CGP][server] ← badugi:action', { tableId, playerId: pid, action, gateOn: SERVER_BADUGI_ON });
        if (!SERVER_BADUGI_ON) { console.warn('[CGP][server] badugi:action DROPPED — gate off'); return; }
        handleBadugiAction(tableId, pid, action, payload);
        return;
      }

      // ── mode:action (generic authoritative modes) ───────────────────────────
      if (msg.type === 'mode:action') {
        const { tableId, playerId: pid, action, payload } = msg;
        if (!tableId || !pid || !action) {
          console.warn('[CGP][server] mode:action DROPPED — missing field', { tableId, pid, action });
          return;
        }
        // Authorization: claimed pid must be owned by this authenticated connection
        if (getSeatOwner(tableId, pid) !== authWs.authenticatedPlayerId) {
          console.warn(
            `[WS AUTHZ] ${new Date().toISOString()} authenticated=${authWs.authenticatedPlayerId} ` +
            `claimed_pid=${pid} seat_owner=${getSeatOwner(tableId, pid) ?? 'none'} ` +
            `action=${action} msg=mode:action ip=${remoteIp} — REJECTED`,
          );
          return;
        }
        console.log('[CGP][server] ← mode:action', { tableId, modeId: msg.modeId, playerId: pid, action, gateOn: SERVER_MODES_ON });
        if (!SERVER_MODES_ON) { console.warn('[CGP][server] mode:action DROPPED — gate off'); return; }
        handleGenericAction(tableId, pid, action, payload);
        return;
      }

      // ── Lady Luck messages (ll: prefix) ─────────────────────────────────────
      // msg is narrowed to `never` after the ClientMessage union is exhausted above,
      // so we widen to a generic record for the dynamic message types below.
      const llMsg = msg as { type: string; tableId?: string; playerId?: string; name?: string; suit?: string; amount?: number };

      if (llMsg.type === 'll:join') {
        const tid = llMsg.tableId; const pid = llMsg.playerId; const name = llMsg.name;
        if (!tid || !pid) return;
        roomId   = tid;
        playerId = pid;
        setSeatOwner(tid, pid, authWs.authenticatedPlayerId);
        const profile = await storage.getPlayerProfile(pid).catch(() => null);
        const chips   = profile?.chipBalance ?? 1000;
        handleLLJoin(tid, pid, name || 'Player', chips, ws);
        return;
      }

      if (llMsg.type === 'll:start') {
        const tid = llMsg.tableId; const pid = llMsg.playerId;
        if (!tid || !pid) return;
        if (getSeatOwner(tid, pid) !== authWs.authenticatedPlayerId) return;
        handleLLStart(tid, pid);
        return;
      }

      if (llMsg.type === 'll:select') {
        const tid = llMsg.tableId; const pid = llMsg.playerId; const suit = llMsg.suit;
        if (!tid || !pid || !suit) return;
        if (getSeatOwner(tid, pid) !== authWs.authenticatedPlayerId) return;
        const result = handleLLSelect(tid, pid, suit as import('../shared/modes/ladyluck').LadyLuckSuit);
        if (!result.ok && ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'll:error', message: result.error })); } catch {}
        }
        return;
      }

      if (llMsg.type === 'll:wager') {
        const tid = llMsg.tableId; const pid = llMsg.playerId; const amount = llMsg.amount;
        if (!tid || !pid || amount == null) return;
        if (getSeatOwner(tid, pid) !== authWs.authenticatedPlayerId) return;
        handleLLWager(tid, pid, amount).then(result => {
          if (!result.ok && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'll:error', message: result.error })); } catch {}
          }
        }).catch(() => {});
        return;
      }

      if (llMsg.type === 'll:sidebet') {
        const tid = llMsg.tableId; const pid = llMsg.playerId; const suit = llMsg.suit; const amount = llMsg.amount;
        if (!tid || !pid || !suit || amount == null) return;
        if (getSeatOwner(tid, pid) !== authWs.authenticatedPlayerId) return;
        handleLLSideBet(tid, pid, suit as import('../shared/modes/ladyluck').LadyLuckSuit, amount).then(result => {
          if (!result.ok && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'll:error', message: result.error })); } catch {}
          }
        }).catch(() => {});
        return;
      }

      const spectatorMsg = llMsg as { type: string; tableId?: string; userId?: string; username?: string; suit?: string; amount?: number };

      if (spectatorMsg.type === 'll:spectate') {
        const tid      = spectatorMsg.tableId;
        const uid      = spectatorMsg.userId;
        const username = spectatorMsg.username || 'Spectator';
        if (!tid || !uid) return;
        spectatorTableId = tid;
        spectatorUserId  = uid;
        const profile    = await storage.getPlayerProfile(uid).catch(() => null);
        const avatar     = (profile as any)?.avatarId ?? '';
        handleLLSpectate(tid, uid, username, avatar, ws);
        return;
      }

      if (spectatorMsg.type === 'll:spectator_sidebet') {
        const tid    = spectatorMsg.tableId;
        const uid    = spectatorMsg.userId;
        const suit   = spectatorMsg.suit;
        const amount = spectatorMsg.amount;
        if (!tid || !uid || !suit || amount == null) return;
        if (spectatorTableId !== tid || spectatorUserId !== uid) return;
        handleLLSpectatorSideBet(tid, uid, suit as import('../shared/modes/ladyluck').LadyLuckSuit, amount, ws).catch(() => {});
        return;
      }

      if (spectatorMsg.type === 'll:spectator_leave') {
        const tid = spectatorMsg.tableId;
        const uid = spectatorMsg.userId;
        if (!tid || !uid) return;
        handleLLSpectatorLeave(tid, uid);
        spectatorTableId = undefined;
        spectatorUserId  = undefined;
        return;
      }
    });

    ws.on('close', () => {
      clearInterval(pingTimer);
      clearInterval(sessionCheckTimer);
      if (spectatorTableId && spectatorUserId) {
        handleLLSpectatorLeave(spectatorTableId, spectatorUserId);
      } else if (roomId && playerId) {
        handleLLDisconnect(roomId, playerId);
        releasePlayer(playerId, roomId);
        clearSeatOwner(roomId, playerId);
        if (engineSeatPid) clearSeatOwner(roomId, engineSeatPid);
      }
    });

    ws.on('error', () => ws.terminate());
  });

  return wss;
}
