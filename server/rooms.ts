// ─── WebSocket Room Manager ───────────────────────────────────────────────────
// Handles two concerns:
//   1. Presence-only rooms: server knows who is seated, game runs client-side.
//   2. Authoritative rooms: server owns game state (feature-flagged per mode).
//
// Authoritative tables are activated when FEATURES.SERVER_AUTHORITATIVE_BADUGI
// is true. All other modes remain client-side as before.

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { FEATURES } from '../shared/featureFlags';
import {
  addBadugiConnection,
  removeBadugiConnection,
  handleBadugiAction,
} from './gameEngine';

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
  isAuthoritative: boolean;     // true when the game engine owns state for this room
  createdAt: number;
  seats: Map<string, SeatClaim>;
  connections: Map<string, WebSocket>;
}

// ─── Client message types ─────────────────────────────────────────────────────

type ClientMessage =
  | { type: 'join';          tableId: string; modeId: string; playerId: string; name: string; seatId: string; authoritative?: boolean }
  | { type: 'leave';         tableId: string; playerId: string }
  | { type: 'ping' }
  | { type: 'badugi:action'; tableId: string; playerId: string; action: string; payload: unknown };

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
    const isAuthoritative = FEATURES.SERVER_AUTHORITATIVE_BADUGI && modeId === 'badugi';
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

  // Notify authoritative engine so it can skip this player if needed
  if (room.isAuthoritative) {
    removeBadugiConnection(tableId, playerId);
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

      // ── join ──────────────────────────────────────────────────────────────
      if (msg.type === 'join') {
        const { tableId, modeId, playerId: pid, name, seatId } = msg;
        if (!tableId || !pid) return;

        if (roomId && playerId) releasePlayer(playerId, roomId);

        roomId   = tableId;
        playerId = pid;

        const room = getOrCreateRoom(tableId, modeId || 'unknown');
        room.connections.set(pid, ws);

        if (seatId) {
          room.seats.set(seatId, { seatId, playerId: pid, name: name || 'Player', joinedAt: Date.now() });
        }

        // If this is an authoritative Badugi table, register with the game engine.
        // The engine will immediately send a badugi:snapshot to the joining player.
        if (room.isAuthoritative) {
          addBadugiConnection(tableId, pid, ws);
        }

        broadcastRoomState(room);
        return;
      }

      // ── leave ─────────────────────────────────────────────────────────────
      if (msg.type === 'leave') {
        const { tableId, playerId: pid } = msg;
        if (tableId && pid) releasePlayer(pid, tableId);
        roomId   = null;
        playerId = null;
        return;
      }

      // ── ping ──────────────────────────────────────────────────────────────
      if (msg.type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // ── badugi:action (authoritative mode only) ───────────────────────────
      if (msg.type === 'badugi:action') {
        if (!FEATURES.SERVER_AUTHORITATIVE_BADUGI) return; // flag off → drop
        const { tableId, playerId: pid, action, payload } = msg;
        if (!tableId || !pid || !action) return;
        handleBadugiAction(tableId, pid, action, payload);
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
