// ─── WebSocket Room Manager ───────────────────────────────────────────────────
// Handles presence-only multiplayer: the server knows who is in which room
// and which seats are claimed by real players. Game state still runs
// client-side. Full server-side game sync is Tier 2.

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeatClaim {
  seatId: string;       // 'p1' | 'p2' | 'p3' | 'p4'
  playerId: string;
  name: string;
  joinedAt: number;
}

interface Room {
  tableId: string;
  modeId: string;
  createdAt: number;
  seats: Map<string, SeatClaim>;        // seatId → SeatClaim
  connections: Map<string, WebSocket>;  // playerId → ws
}

// ─── Client message types ─────────────────────────────────────────────────────
// join:  player enters a game page and claims a seat
// leave: player navigates away (client-initiated, backup for ws close)
// ping:  keepalive from client

type ClientMessage =
  | { type: 'join';  tableId: string; modeId: string; playerId: string; name: string; seatId: string }
  | { type: 'leave'; tableId: string; playerId: string }
  | { type: 'ping' };

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
    rooms.set(tableId, {
      tableId,
      modeId,
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
    seats: Array.from(room.seats.values()).map(({ seatId, playerId, name }) => ({
      seatId, playerId, name,
    })),
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

  for (const [seatId, claim] of room.seats.entries()) {
    if (claim.playerId === playerId) room.seats.delete(seatId);
  }

  if (room.connections.size === 0) {
    // Keep room alive briefly for fast rejoins; clean up after 5 min
    setTimeout(() => {
      if (rooms.get(tableId)?.connections.size === 0) rooms.delete(tableId);
    }, 5 * 60 * 1000);
  } else {
    broadcastRoomState(room);
  }
}

// ─── Prune stale rooms (call periodically) ───────────────────────────────────

const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function pruneRooms(): void {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [id, room] of rooms.entries()) {
    if (room.connections.size === 0 && room.createdAt < cutoff) rooms.delete(id);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initRooms(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Prune stale rooms every hour
  setInterval(pruneRooms, 60 * 60 * 1000);

  wss.on('connection', (ws: WebSocket) => {
    let roomId: string | null = null;
    let playerId: string | null = null;

    // Keepalive ping
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

      if (msg.type === 'join') {
        const { tableId, modeId, playerId: pid, name, seatId } = msg;
        if (!tableId || !pid) return;

        // Release any previous room binding for this connection
        if (roomId && playerId) releasePlayer(playerId, roomId);

        roomId = tableId;
        playerId = pid;

        const room = getOrCreateRoom(tableId, modeId || 'unknown');
        room.connections.set(pid, ws);

        if (seatId) {
          room.seats.set(seatId, {
            seatId,
            playerId: pid,
            name: name || 'Player',
            joinedAt: Date.now(),
          });
        }

        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'leave') {
        const { tableId, playerId: pid } = msg;
        if (tableId && pid) releasePlayer(pid, tableId);
        roomId = null;
        playerId = null;
        return;
      }

      if (msg.type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
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
