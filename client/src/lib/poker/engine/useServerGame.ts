// ─── useServerBadugi ─────────────────────────────────────────────────────────
// Client-side hook for a server-authoritative Badugi table.
// Mirrors the interface of useGameEngine so BadugiGame.tsx can switch between
// them with a single feature-flag branch — no changes to the UI layer.
//
// State flow:
//   mount → WebSocket connect → send 'join' (handled by existing rooms.ts)
//   server → 'badugi:snapshot' → update local state
//   handleAction → send 'badugi:action' → server processes → new snapshot

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState } from '@shared/gameTypes';
import { createInitialState } from './useGameEngine';
import { ensurePlayerIdentity } from '../../persistence';
import { registerTable } from '../../tableSession';
import { FEATURES } from '../../featureFlags';

export function useServerBadugi(myId: string = 'p1') {
  // Placeholder state used both as initial value and as the full return value
  // when the flag is off — no WebSocket is opened and no resources are consumed.
  const [state, setState] = useState<GameState>(() => createInitialState());

  const wsRef        = useRef<WebSocket | null>(null);
  const mountedRef   = useRef(true);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableIdRef   = useRef<string>(state.tableId);
  const activeFlag   = FEATURES.SERVER_AUTHORITATIVE_BADUGI;

  // Register the table server-side so /join/:code resolves correctly.
  // Only runs when the authoritative flag is on.
  useEffect(() => {
    if (!activeFlag) return;
    const identity = ensurePlayerIdentity();
    registerTable({ tableId: tableIdRef.current, modeId: 'badugi', createdAt: Date.now(), createdBy: identity.id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket lifecycle — only active when the flag is on.
  // Both this effect and the registration effect above are ALWAYS called
  // (React rules of hooks), but early-return when the flag is off so no
  // connections, timers, or side effects are created.
  useEffect(() => {
    if (!activeFlag) return;
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const identity = ensurePlayerIdentity();
      const proto    = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url      = `${proto}//${window.location.host}/ws`;
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { return; }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        ws.send(JSON.stringify({
          type: 'join', tableId: tableIdRef.current, modeId: 'badugi',
          playerId: identity.id, name: identity.name, seatId: myId,
        }));
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'badugi:snapshot') setState(msg.state as GameState);
        } catch { /* malformed — ignore */ }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        reconnectRef.current = setTimeout(connect, Math.min(3000 + Math.random() * 1000, 8000));
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'leave', tableId: tableIdRef.current, playerId: ensurePlayerIdentity().id })); } catch { /* ignore */ }
        }
        ws.close();
        wsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAction = useCallback((action: string, payload?: unknown) => {
    if (!activeFlag) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'badugi:action', tableId: tableIdRef.current, playerId: myId, action, payload: payload ?? null }));
  }, [myId, activeFlag]);

  return { state, handleAction };
}
