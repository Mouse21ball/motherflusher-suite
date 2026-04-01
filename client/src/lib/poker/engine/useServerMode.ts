// ─── useServerMode ────────────────────────────────────────────────────────────
// Generic client-side hook for any server-authoritative game mode.
// Works with Dead7, Fifteen35, SwingPoker, SuitsPoker.
// Protocol:
//   mount → WebSocket connect → send 'join' with session UUID + modeId
//   server → 'mode:init' { playerId, modeId, state } → hook stores assigned seat
//   server → 'mode:snapshot' { state } → subsequent updates
//   handleAction → send 'mode:action' → server processes

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState } from '@shared/gameTypes';
import { createInitialState } from './useGameEngine';
import { ensurePlayerIdentity } from '../../persistence';
import { registerTable } from '../../tableSession';

const SESSION_KEY_PREFIX = 'cgp_session_';

function getOrCreateSessionId(modeId: string): string {
  const key = SESSION_KEY_PREFIX + modeId;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18);
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 18);
  }
}

export function useServerMode(tableId: string, modeId: string) {
  const [state, setState] = useState<GameState>(() => ({
    ...createInitialState(),
    tableId,
  }));

  const [myId, setMyId] = useState<string>('p1');
  const [role, setRole] = useState<'player' | 'spectator'>('player');
  const myIdRef    = useRef<string>('p1');
  const wsRef      = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableIdRef = useRef<string>(tableId);
  const modeIdRef  = useRef<string>(modeId);
  const sessionId  = useRef<string>(getOrCreateSessionId(modeId));

  useEffect(() => {
    // Only register when this player created the table (no ?t= in URL).
    // Joiners arriving via an invite link must not re-register — the creator's
    // registration is already in place, and a duplicate POST causes a 409 that
    // could overwrite the creator record if the server restarted.
    const params = new URLSearchParams(window.location.search);
    if (params.get('t')) return;
    const identity = ensurePlayerIdentity();
    registerTable({ tableId, modeId, createdAt: Date.now(), createdBy: identity.id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const identity = ensurePlayerIdentity();
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws`;
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { return; }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        ws.send(JSON.stringify({
          type: 'join',
          tableId: tableIdRef.current,
          modeId: modeIdRef.current,
          playerId: sessionId.current,
          name: identity.name,
          seatId: sessionId.current,
        }));
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'mode:init') {
            const pid = msg.playerId as string;
            myIdRef.current = pid;
            setMyId(pid);
            if (msg.role === 'spectator' || pid === '__spectator__') {
              setRole('spectator');
            } else {
              setRole('player');
            }
            setState(msg.state as GameState);
            return;
          }
          if (msg.type === 'mode:snapshot') {
            setState(msg.state as GameState);
            return;
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        reconnRef.current = setTimeout(connect, Math.min(3000 + Math.random() * 1000, 8000));
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnRef.current) { clearTimeout(reconnRef.current); reconnRef.current = null; }
      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'leave', tableId: tableIdRef.current, playerId: sessionId.current })); } catch {}
        }
        ws.close();
        wsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAction = useCallback((action: string, payload?: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'mode:action',
      tableId: tableIdRef.current,
      modeId: modeIdRef.current,
      playerId: myIdRef.current,
      action,
      payload: payload ?? null,
    }));
  }, []);

  return { state, handleAction, myId, role };
}
