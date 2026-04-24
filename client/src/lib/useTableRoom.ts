// ─── useTableRoom ─────────────────────────────────────────────────────────────
// Maintains a WebSocket connection for a player's seat in a room.
// Announces presence on mount, releases seat on unmount.
// Handles reconnection automatically.
// Game state does NOT flow through this channel yet — that is Tier 2.

import { useEffect, useRef } from 'react';
import { ensurePlayerIdentity } from './persistence';
import { wsUrl } from './apiConfig';

export interface RoomSeat {
  seatId: string;
  playerId: string;
  name: string;
}

export interface RoomState {
  tableId: string;
  humanCount: number;
  seats: RoomSeat[];
}

interface UseTableRoomOptions {
  tableId: string;
  modeId: string;
  seatId?: string;
  onRoomUpdate?: (state: RoomState) => void;
}

export function useTableRoom({ tableId, modeId, seatId = 'p1', onRoomUpdate }: UseTableRoomOptions): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const identity = ensurePlayerIdentity();
      const url = wsUrl();

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        // WebSocket not supported or blocked — fail silently, game still works
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        ws.send(JSON.stringify({
          type: 'join',
          tableId,
          modeId,
          playerId: identity.id,
          name: identity.name,
          seatId,
        }));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!onRoomUpdate) return;
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'room_update') {
            onRoomUpdate({
              tableId: msg.tableId as string,
              humanCount: msg.humanCount as number,
              seats: msg.seats as RoomSeat[],
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        // Reconnect with exponential back-off capped at 8s
        reconnectRef.current = setTimeout(connect, Math.min(3000 + Math.random() * 1000, 8000));
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }

      const ws = wsRef.current;
      if (ws) {
        // Graceful leave before close
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'leave', tableId, playerId: ensurePlayerIdentity().id }));
          } catch {}
        }
        ws.close();
        wsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, modeId, seatId]);
}
