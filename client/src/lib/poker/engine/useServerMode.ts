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
import { registerTable, saveSessionResult } from '../../tableSession';
import { apiUrl, wsUrl } from '../../apiConfig';

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
  const [lastWsAt, setLastWsAt] = useState<number | null>(null);
  const [lastWsType, setLastWsType] = useState<string | null>(null);
  // Client-side invariant: total chips + pot should not silently change
  // mid-hand. We log when it does so desync is visible immediately.
  const lastTotalRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<string | null>(null);

  const [myId, setMyId] = useState<string>('p1');
  const [role, setRole] = useState<'player' | 'spectator'>('player');
  const myIdRef    = useRef<string>('p1');
  const wsRef      = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableIdRef      = useRef<string>(tableId);
  const modeIdRef       = useRef<string>(modeId);
  const sessionId       = useRef<string>(getOrCreateSessionId(modeId));
  const sessionStatsRef = useRef<SessionStats>(DEFAULT_SESSION_STATS);

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
      const url = wsUrl();
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
            const res = await fetch(apiUrl(`/api/tables/mode/${modeIdRef.current}/join`));
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
          // ── WS IN audit (every message, regardless of payload shape) ──
          setLastWsAt(Date.now());
          setLastWsType(msg.type ?? '?');
          if (!msg.state) {
            console.log('[WS IN]', msg.type ?? '?', '(no state)', msg.reason ?? '');
          }
          // ── WS IN with state: invariant check ──────────────────────────
          if (msg.state) {
            const s = msg.state as GameState;
            const totalChips = s.players?.reduce((acc: number, p) => acc + (p.chips ?? 0), 0) ?? 0;
            const total = totalChips + (s.pot ?? 0) + (s.players?.reduce((acc: number, p) => acc + (p.bet ?? 0), 0) ?? 0);
            console.log('[WS IN]', msg.type, 'phase=', s.phase, 'pot=', s.pot, 'players=', s.players?.length, 'total(chips+pot+bets)=', total);
            // Phase reset → expect total to stay equal to prev hand's total.
            const phaseChanged = lastPhaseRef.current !== s.phase;
            if (lastTotalRef.current != null && total !== lastTotalRef.current) {
              const delta = total - lastTotalRef.current;
              // Allow legitimate changes only when humans buy in via 'rebuy'
              // (handled separately) — otherwise warn.
              console.warn('[CGP][client] chip+pot invariant changed', {
                prev: lastTotalRef.current, now: total, delta, phase: s.phase, prevPhase: lastPhaseRef.current,
              });
            }
            lastTotalRef.current = total;
            lastPhaseRef.current = s.phase;
            // Hand-start sanity: at ANTE/WAITING the pot should be 0.
            if ((s.phase === 'WAITING' || s.phase === 'ANTE') && (s.pot ?? 0) !== 0 && phaseChanged) {
              console.warn('[CGP][client] pot expected 0 at hand-start', { phase: s.phase, pot: s.pot });
            }
            // NOTE: invariant warning may legitimately fire on rebuy/reseat
            // (chips appear from outside the hand). Tolerated — diagnostic only.
          }

          if (msg.type === 'mode:init') {
            const pid = msg.playerId as string;
            myIdRef.current = pid;
            setMyId(pid);
            if (msg.role === 'spectator' || pid === '__spectator__') {
              setRole('spectator');
            } else {
              setRole('player');
            }
            // FULL replace — no merge.
            setState(msg.state as GameState);
            if (msg.sessionStats) {
              const ss = msg.sessionStats as SessionStats;
              sessionStatsRef.current = ss;
              setSessionStats(ss);
            }
            return;
          }
          if (msg.type === 'mode:snapshot') {
            // FULL replace — no merge.
            setState(msg.state as GameState);
            if (msg.sessionStats) {
              const ss = msg.sessionStats as SessionStats;
              sessionStatsRef.current = ss;
              setSessionStats(ss);
            }
            return;
          }
          if (msg.type === 'mode:error') {
            console.error('[CGP] Server rejected mode connection:', msg.reason, 'modeId=', modeIdRef.current);
            return;
          }
          // Unhandled types — log so we can spot missing handlers.
          console.warn('[WS IN] unhandled message type', msg.type);
        } catch (err) {
          console.error('[WS IN] parse failed', err);
        }
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
      const ss = sessionStatsRef.current;
      if (ss.handsPlayed > 0) {
        saveSessionResult(ss.netProfit, ss.handsPlayed, ss.startChips);
      }
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
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[CGP][client] mode:action DROPPED — ws not open', { action, readyState: ws?.readyState });
      return;
    }
    const outgoing = {
      type: 'mode:action' as const,
      tableId: tableIdRef.current,
      modeId: modeIdRef.current,
      playerId: myIdRef.current,
      action,
      payload: payload ?? null,
    };
    console.log('[CGP][client] → mode:action', outgoing);
    ws.send(JSON.stringify(outgoing));
  }, []);

  return { state, handleAction, myId, role, sessionStats, lastWsAt, lastWsType };
}
