// ─── useServerBadugi ─────────────────────────────────────────────────────────
// Client-side hook for a server-authoritative Badugi table.
// Mirrors the interface of useGameEngine so BadugiGame.tsx can switch between
// them with a single feature-flag branch — no changes to the UI layer.
//
// Seat assignment protocol:
//   mount  → WebSocket connect → send 'join' with opaque session UUID
//   server → 'badugi:init' { playerId, state } → hook stores assigned seat
//   server → 'badugi:snapshot' { state } → subsequent updates after actions
//   handleAction → send 'badugi:action' with assigned seat id → server processes

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState } from '@shared/gameTypes';
import { createInitialState } from './useGameEngine';
import { ensurePlayerIdentity } from '../../persistence';
import { registerTable, saveSessionResult } from '../../tableSession';
import { FEATURES } from '../../featureFlags';

// ─── Session UUID ─────────────────────────────────────────────────────────────
// Persisted in sessionStorage so a page refresh on the same tab gets the same
// server seat back (server keeps sessionToSeat across disconnects).
// Different tabs or devices get different UUIDs → different seats.

const SESSION_STORAGE_KEY = 'badugi_session_id';

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const id = Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18);
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 18);
  }
}

// tableId is the 6-char code determined by the caller (from URL ?t= param or
// freshly generated). No myId parameter — the server assigns the seat.
export interface BadugiSessionStats {
  startChips:          number;
  currentChips:        number;
  netProfit:           number;
  handsPlayed:         number;
  biggestPotWon:       number;
  winStreak:           number;
  lossStreak:          number;
  sessionHighProfit:   number;
  sessionLowProfit:    number;
  isHeater:            boolean;
  isCold:              boolean;
  isNearEven:          boolean;
  comebackActive:      boolean;
  momentum:            'up' | 'down' | 'flat';
  bankrollTier:        'LOW' | 'MID' | 'HIGH';
  tableStakes:         'LOW' | 'MID' | 'HIGH';
  dangerZone:          boolean;
  lastStand:           boolean;
  protectingLead:      boolean;
  peakDrop:            number;
  shouldLeaveSignal:   boolean;
  shouldContinueSignal: boolean;
}

const DEFAULT_SESSION_STATS: BadugiSessionStats = {
  startChips: 0, currentChips: 0, netProfit: 0,
  handsPlayed: 0, biggestPotWon: 0, winStreak: 0, lossStreak: 0,
  sessionHighProfit: 0, sessionLowProfit: 0,
  isHeater: false, isCold: false, isNearEven: false,
  comebackActive: false, momentum: 'flat',
  bankrollTier: 'MID', tableStakes: 'MID',
  dangerZone: false, lastStand: false,
  protectingLead: false, peakDrop: 0,
  shouldLeaveSignal: false, shouldContinueSignal: false,
};

export function useServerBadugi(tableId: string) {
  const [state, setState] = useState<GameState>(() => ({
    ...createInitialState(),
    tableId,
  }));
  const [sessionStats, setSessionStats] = useState<BadugiSessionStats>(DEFAULT_SESSION_STATS);

  // Start with 'p1' as a safe default for the pre-init render.
  // Will be replaced by the server-assigned seat when badugi:init arrives.
  const [myId, setMyId] = useState<string>('p1');
  const myIdRef = useRef<string>('p1');
  const [role, setRole] = useState<'player' | 'spectator'>('player');

  const wsRef           = useRef<WebSocket | null>(null);
  const mountedRef      = useRef(true);
  const reconnectRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableIdRef      = useRef<string>(tableId);
  const sessionId       = useRef<string>(getOrCreateSessionId());
  const sessionStatsRef = useRef<BadugiSessionStats>(DEFAULT_SESSION_STATS);
  const activeFlag   = FEATURES.SERVER_AUTHORITATIVE_BADUGI || import.meta.env.VITE_BADUGI_ALPHA === 'true';

  // Register the table code server-side so /join/:code can resolve it.
  // Skip if the player is joining someone else's table via ?t= invite URL —
  // the creator already registered it, and a second POST would 409.
  useEffect(() => {
    if (!activeFlag) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('t')) return;
    const identity = ensurePlayerIdentity();
    registerTable({ tableId, modeId: 'badugi', createdAt: Date.now(), createdBy: identity.id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket lifecycle — only active when the flag is on.
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

      ws.onopen = async () => {
        if (!mountedRef.current) { ws.close(); return; }
        // Read table intent flags from URL params, set by the Home screen when
        // creating a Quick Play table (?qp=1) or a private table (?private=1).
        const _params = new URLSearchParams(window.location.search);
        const _quickPlay = _params.get('qp') === '1';
        const _isPrivate = _params.get('private') === '1';

        // ── Real-player priority join ─────────────────────────────────────────
        // If not joining via an invite link (?t=) and not a private/quick-play
        // table, check for an existing public table that already has human players.
        if (!_params.get('t') && !_isPrivate && !_quickPlay) {
          try {
            const res = await fetch('/api/tables/mode/badugi/join');
            const data = await res.json() as { tableId: string | null };
            if (data.tableId && data.tableId !== tableIdRef.current) {
              tableIdRef.current = data.tableId;
            }
          } catch {}
        }

        // Send the opaque session UUID as playerId.
        // The server maps it to a game seat (p1/p2/p3/p4) and responds with badugi:init.
        ws.send(JSON.stringify({
          type: 'join', tableId: tableIdRef.current, modeId: 'badugi',
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

          // badugi:init: first message after join — carries seat, state, and sessionStats.
          // Must be processed before any snapshot so masking uses the correct seat.
          if (msg.type === 'badugi:init') {
            myIdRef.current = msg.playerId as string;
            setMyId(msg.playerId as string);
            setState(msg.state as GameState);
            if (msg.sessionStats) {
              const ss = msg.sessionStats as BadugiSessionStats;
              sessionStatsRef.current = ss;
              setSessionStats(ss);
            }
            if (msg.role === 'spectator' || msg.playerId === '__spectator__') {
              setRole('spectator');
            }
            return;
          }

          // badugi:snapshot: subsequent broadcasts after each action.
          if (msg.type === 'badugi:snapshot') {
            setState(msg.state as GameState);
            if (msg.sessionStats) {
              const ss = msg.sessionStats as BadugiSessionStats;
              sessionStatsRef.current = ss;
              setSessionStats(ss);
            }
            return;
          }
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
      const ss = sessionStatsRef.current;
      if (ss.handsPlayed > 0) {
        saveSessionResult(ss.netProfit, ss.handsPlayed, ss.startChips);
      }
      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'leave', tableId: tableIdRef.current, playerId: sessionId.current })); } catch { /* ignore */ }
        }
        ws.close();
        wsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // handleAction uses a ref so it always sends the currently-assigned seat,
  // even if React hasn't re-rendered yet after receiving badugi:init.
  const handleAction = useCallback((action: string, payload?: unknown) => {
    if (!activeFlag) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'badugi:action',
      tableId: tableIdRef.current,
      playerId: myIdRef.current,
      action,
      payload: payload ?? null,
    }));
  }, [activeFlag]);

  return { state, handleAction, myId, role, sessionStats };
}
