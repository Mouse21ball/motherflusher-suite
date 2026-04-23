// ─── useServerMode ────────────────────────────────────────────────────────────
// Generic client-side hook for any server-authoritative game mode.
// Works with Dead7, Fifteen35, SwingPoker, SuitsPoker.
// Protocol:
//   mount → WebSocket connect → send 'join' with session UUID + modeId
//   server → 'mode:init' { playerId, modeId, state, sessionStats } → hook stores assigned seat
//   server → 'mode:snapshot' { state, sessionStats } → subsequent updates
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

export interface SessionStats {
  startChips: number;
  currentChips: number;
  netProfit: number;
  handsPlayed: number;
  biggestPotWon: number;
  winStreak: number;
  lossStreak: number;
  sessionHighProfit: number;
  sessionLowProfit: number;
  isHeater: boolean;
  isCold: boolean;
  isNearEven: boolean;
  comebackActive: boolean;
  momentum: 'up' | 'down' | 'flat';
  bankrollTier: 'LOW' | 'MID' | 'HIGH';
  tableStakes: 'LOW' | 'MID' | 'HIGH';
  dangerZone: boolean;
  lastStand: boolean;
  protectingLead: boolean;
  peakDrop: number;
  shouldLeaveSignal: boolean;
  shouldContinueSignal: boolean;
}

const DEFAULT_SESSION_STATS: SessionStats = {
  startChips: 0,
  currentChips: 0,
  netProfit: 0,
  handsPlayed: 0,
  biggestPotWon: 0,
  winStreak: 0,
  lossStreak: 0,
  sessionHighProfit: 0,
  sessionLowProfit: 0,
  isHeater: false,
  isCold: false,
  isNearEven: false,
  comebackActive: false,
  momentum: 'flat',
  bankrollTier: 'MID',
  tableStakes: 'MID',
  dangerZone: false,
  lastStand: false,
  protectingLead: false,
  peakDrop: 0,
  shouldLeaveSignal: false,
  shouldContinueSignal: false,
};

export function useServerMode(tableId: string, modeId: string) {
  const [state, setState] = useState<GameState>(() => ({
    ...createInitialState(),
    tableId,
  }));
  const [sessionStats, setSessionStats] = useState<SessionStats>(DEFAULT_SESSION_STATS);

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

      ws.onopen = async () => {
        if (!mountedRef.current) { ws.close(); return; }
        const _params = new URLSearchParams(window.location.search);
        const _quickPlay = _params.get('qp') === '1';
        const _isPrivate = _params.get('private') === '1';

        // ── Real-player priority join ─────────────────────────────────────────
        // If not joining via an invite link (?t=) and not a private/quick-play
        // table, check for an existing public table that already has human players.
        // This prevents each player from landing on an isolated table.
        if (!_params.get('t') && !_isPrivate && !_quickPlay) {
          try {
            const res = await fetch(`/api/tables/mode/${modeIdRef.current}/join`);
            const data = await res.json() as { tableId: string | null };
            if (data.tableId && data.tableId !== tableIdRef.current) {
              tableIdRef.current = data.tableId;
            }
          } catch {}
        }

        ws.send(JSON.stringify({
          type: 'join',
          tableId: tableIdRef.current,
          modeId: modeIdRef.current,
          playerId: sessionId.current,
          identityId: identity.id,
          name: identity.name,
          seatId: sessionId.current,
          ...(_quickPlay ? { quickPlay: true } : {}),
          ...(_isPrivate ? { isPrivate: true } : {}),
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
            if (msg.sessionStats) {
              setSessionStats(msg.sessionStats as SessionStats);
            }
            return;
          }
          if (msg.type === 'mode:snapshot') {
            setState(msg.state as GameState);
            if (msg.sessionStats) {
              setSessionStats(msg.sessionStats as SessionStats);
            }
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

  return { state, handleAction, myId, role, sessionStats };
}
