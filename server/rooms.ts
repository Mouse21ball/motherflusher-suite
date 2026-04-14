// ─── WebSocket Room Manager ───────────────────────────────────────────────────
// Handles two concerns:
//   1. Presence-only rooms: server knows who is seated, game runs client-side.
//   2. Authoritative rooms: server owns game state (feature-flagged per mode).
//
// Authoritative Badugi is enabled when either:
//   a) FEATURES.SERVER_AUTHORITATIVE_BADUGI = true  (code-level broad rollout), OR
//   b) BADUGI_ALPHA_ENABLED=true  in the environment  (zero-code alpha testing)
//
// To enable for controlled alpha without changing any source file:
//   BADUGI_ALPHA_ENABLED=true npm run dev

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { FEATURES } from '../shared/featureFlags';
import {
  addBadugiConnection,
  removeBadugiConnection,
  handleBadugiAction,
} from './gameEngine';
import {
  addGenericConnection,
  removeGenericConnection,
  handleGenericAction,
} from './genericEngine';

// ─── Rollout gate ─────────────────────────────────────────────────────────────
// Evaluated once per process start. Changing BADUGI_ALPHA_ENABLED requires restart.

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
}

// ─── Client message types ─────────────────────────────────────────────────────

type ClientMessage =
  | { type: 'join';          tableId: string; modeId: string; playerId: string; name: string; seatId: string; authoritative?: boolean; isPrivate?: boolean; quickPlay?: boolean }
  | { type: 'leave';         tableId: string; playerId: string }
  | { type: 'ping' }
  | { type: 'badugi:action'; tableId: string; playerId: string; action: string; payload: unknown }
  | { type: 'mode:action';   tableId: string; modeId: string; playerId: string; action: string; payload: unknown };

// ─── Server broadcast payload ─────────────────────────────────────────────────

interface RoomUpdate {
  type: 'room_update';
  tableId: string;
  humanCount: number;
  seats: Omit<SeatClaim, 'joinedAt'>[];
}

// ─── State ────────────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateRoom(tableId: string, modeId: string): Room {
  if (!rooms.has(tableId)) {
    const isAuthoritative = SERVER_BADUGI_ON && modeId === 'badugi';
    rooms.set(tableId, {
      tableId,
      modeId,
      isAuthoritative,
      createdAt: Date.now(),
      seats: new Map(),
      connections: new Map(),
    });
  }
  return rooms.get(tableId)!;
}

function broadcastRoomState(room: Room): void {
  const payload: RoomUpdate = {
    type: 'room_update',
    tableId: room.tableId,
    humanCount: room.connections.size,
    seats: Array.from(room.seats.values()).map(({ seatId, playerId, name }) => ({ seatId, playerId, name })),
  };
  const msg = JSON.stringify(payload);
  for (const ws of room.connections.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function releasePlayer(playerId: string, tableId: string): void {
  const room = rooms.get(tableId);
  if (!room) return;

  room.connections.delete(playerId);

  if (room.isAuthoritative) {
    removeBadugiConnection(tableId, playerId);
  } else if (SERVER_MODES_ON && room.modeId !== 'badugi') {
    removeGenericConnection(tableId, playerId);
  }

  for (const [seatId, claim] of room.seats.entries()) {
    if (claim.playerId === playerId) room.seats.delete(seatId);
  }

  if (room.connections.size === 0) {
    setTimeout(() => {
      if (rooms.get(tableId)?.connections.size === 0) rooms.delete(tableId);
    }, 5 * 60 * 1000);
  } else {
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
        const { tableId, modeId, playerId: pid, name, seatId, isPrivate, quickPlay } = msg;
        if (!tableId || !pid) return;

        if (roomId && playerId) releasePlayer(playerId, roomId);

        roomId   = tableId;
        playerId = pid;

        const room = getOrCreateRoom(tableId, modeId || 'unknown');
        room.connections.set(pid, ws);

        if (seatId) {
          room.seats.set(seatId, { seatId, playerId: pid, name: name || 'Player', joinedAt: Date.now() });
        }

        // If authoritative Badugi, register with game engine.
        // Engine assigns a seat (p1-p4) and sends a badugi:init message that
        // bundles the seat assignment and the masked snapshot atomically.
        if (room.isAuthoritative) {
          addBadugiConnection(tableId, pid, ws, name || undefined, !!isPrivate, !!quickPlay);
        } else if (SERVER_MODES_ON && modeId !== 'badugi') {
          addGenericConnection(tableId, modeId, pid, ws, name || undefined, !!isPrivate, !!quickPlay);
        }

        broadcastRoomState(room);
        return;
      }

      // ── leave ────────────────────────────────────────────────────────────────
      if (msg.type === 'leave') {
        const { tableId, playerId: pid } = msg;
        if (tableId && pid) releasePlayer(pid, tableId);
        roomId   = null;
        playerId = null;
        return;
      }

      // ── ping ─────────────────────────────────────────────────────────────────
      if (msg.type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // ── badugi:action (authoritative mode only) ────────────────────────────
      if (msg.type === 'badugi:action') {
        if (!SERVER_BADUGI_ON) return; // gate off → silently drop
        const { tableId, playerId: pid, action, payload } = msg;
        if (!tableId || !pid || !action) return;
        handleBadugiAction(tableId, pid, action, payload);
        return;
      }

      // ── mode:action (generic authoritative modes) ───────────────────────────
      if (msg.type === 'mode:action') {
        if (!SERVER_MODES_ON) return;
        const { tableId, playerId: pid, action, payload } = msg;
        if (!tableId || !pid || !action) return;
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
