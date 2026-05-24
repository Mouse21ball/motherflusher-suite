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
import { FEATURES } from '../shared/featureFlags';
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
}

// ─── State ────────────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateRoom(tableId: string, modeId: string, playerId?: string): Room {
  if (!rooms.has(tableId)) {
    const isAuthoritative = SERVER_BADUGI_ON && modeId === 'badugi';

    // Read host settings from the routes TableRecord if available
    const record = getTableRecord(tableId);
    const maxPlayers  = record?.maxPlayers  ?? 5;
    const botsEnabled = record?.botsEnabled ?? true;
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

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initRooms(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  setInterval(pruneRooms, 60 * 60 * 1000);

  wss.on('connection', (ws: WebSocket) => {
    let roomId: string | null = null;
    let playerId: string | null = null;

    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 25000);

    ws.on('message', (data: Buffer) => {
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

        const engineOptions = { maxPlayers: room.maxPlayers, botsEnabled: room.botsEnabled };

        if (room.isAuthoritative) {
          addBadugiConnection(tableId, pid, ws, name || undefined, !!isPrivate, !!quickPlay, identityId, engineOptions, msg.buyinChips);
        } else if (SERVER_MODES_ON && modeId !== 'badugi') {
          addGenericConnection(tableId, modeId, pid, ws, name || undefined, !!isPrivate, !!quickPlay, identityId, engineOptions, msg.buyinChips);
        }

        // Send host/settings context to the joining player after engine init
        sendHostUpdateTo(ws, room);
        broadcastRoomState(room);
        return;
      }

      // ── leave ────────────────────────────────────────────────────────────────
      if (msg.type === 'leave') {
        const { tableId, playerId: pid } = msg;
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
        console.log('[CGP][server] ← badugi:action', { tableId: msg.tableId, playerId: msg.playerId, action: msg.action, gateOn: SERVER_BADUGI_ON });
        if (!SERVER_BADUGI_ON) { console.warn('[CGP][server] badugi:action DROPPED — gate off'); return; }
        const { tableId, playerId: pid, action, payload } = msg;
        if (!tableId || !pid || !action) { console.warn('[CGP][server] badugi:action DROPPED — missing field', { tableId, pid, action }); return; }
        handleBadugiAction(tableId, pid, action, payload);
        return;
      }

      // ── mode:action (generic authoritative modes) ───────────────────────────
      if (msg.type === 'mode:action') {
        console.log('[CGP][server] ← mode:action', { tableId: msg.tableId, modeId: msg.modeId, playerId: msg.playerId, action: msg.action, gateOn: SERVER_MODES_ON });
        if (!SERVER_MODES_ON) { console.warn('[CGP][server] mode:action DROPPED — gate off'); return; }
        const { tableId, playerId: pid, action, payload } = msg;
        if (!tableId || !pid || !action) { console.warn('[CGP][server] mode:action DROPPED — missing field', { tableId, pid, action }); return; }
        handleGenericAction(tableId, pid, action, payload);
        return;
      }
    });

    ws.on('close', () => {
      clearInterval(pingTimer);
      if (roomId && playerId) releasePlayer(playerId, roomId);
    });

    ws.on('error', () => ws.terminate());
  });

  return wss;
}
