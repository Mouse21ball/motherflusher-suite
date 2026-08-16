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
import { apiUrl, wsUrl } from '../../apiConfig';
import { apiFetch } from '../../session';

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
  const [lastWsAt, setLastWsAt] = useState<number | null>(null);
  const [lastWsType, setLastWsType] = useState<string | null>(null);
  const lastTotalRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<string | null>(null);

  // Start with 'p1' as a safe default for the pre-init render.
  // Will be replaced by the server-assigned seat when badugi:init arrives.
  const [myId, setMyId] = useState<string>('p1');
  const myIdRef = useRef<string>('p1');
  const [role, setRole] = useState<'player' | 'spectator'>('player');

  // Host authority state
  const [hostId, setHostId] = useState<string | null>(null);
  const [tableSettings, setTableSettings] = useState<{ maxPlayers: number; botsEnabled: boolean; isInviteOnly: boolean }>({ maxPlayers: 5, botsEnabled: true, isInviteOnly: false });
  const isClubTableRef = useRef(false);
  const [isClubTable, setIsClubTable] = useState(false);
  const [kickedByHost, setKickedByHost] = useState(false);

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

  // Once isClubTable has been set to true via the ref it must never revert.
  // React state can temporarily read stale false during re-renders; the ref is
  // the durable source of truth.
  useEffect(() => {
    if (isClubTableRef.current && !isClubTable) {
      setIsClubTable(true);
    }
  }, [isClubTable]);

  // Eagerly detect club table from the REST API before the WebSocket connects.
  // GET /api/tables/:tableId returns crewId regardless of humanCount, so this
  // fires at mount and sets isClubTable before the first renderWaitingCenter call.
  useEffect(() => {
    const tid = tableIdRef.current.toUpperCase();
    fetch(apiUrl(`/api/tables/${tid}`))
      .then(r => r.ok ? r.json() : null)
      .then((data: { crewId?: string | null } | null) => {
        if (data?.crewId) {
          isClubTableRef.current = true;
          setIsClubTable(true);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket lifecycle — only active when the flag is on.
  useEffect(() => {
    if (!activeFlag) return;
    mountedRef.current = true;

    async function connect() {
      if (!mountedRef.current) return;
      const identity = ensurePlayerIdentity();
      // Fetch a short-lived WS ticket — session token stays out of the upgrade URL.
      let ticket: string | null = null;
      try {
        const ticketRes = await apiFetch(apiUrl('/api/auth/ws-ticket'));
        if (ticketRes.ok) { const j = await ticketRes.json(); ticket = j.ticket ?? null; }
      } catch {}
      const url = wsUrl(ticket);
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
            const res = await fetch(apiUrl('/api/tables/mode/badugi/join'));
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
            const phaseChanged = lastPhaseRef.current !== s.phase;
            if (lastTotalRef.current != null && total !== lastTotalRef.current) {
              console.warn('[CGP][client] chip+pot invariant changed', {
                prev: lastTotalRef.current, now: total, delta: total - lastTotalRef.current,
                phase: s.phase, prevPhase: lastPhaseRef.current,
              });
            }
            lastTotalRef.current = total;
            lastPhaseRef.current = s.phase;
            if ((s.phase === 'WAITING' || s.phase === 'ANTE') && (s.pot ?? 0) !== 0 && phaseChanged) {
              console.warn('[CGP][client] pot expected 0 at hand-start', { phase: s.phase, pot: s.pot });
            }
            // NOTE: invariant warning may legitimately fire on rebuy/reseat
            // (chips appear from outside the hand). Tolerated — diagnostic only.
          }

          // badugi:init: first message after join — carries seat, state, and sessionStats.
          // Must be processed before any snapshot so masking uses the correct seat.
          if (msg.type === 'badugi:init') {
            myIdRef.current = msg.playerId as string;
            setMyId(msg.playerId as string);
            // FULL replace — no merge.
            setState(msg.state as GameState);
            if (msg.sessionStats) {
              const ss = msg.sessionStats as BadugiSessionStats;
              sessionStatsRef.current = ss;
              setSessionStats(ss);
            }
            if (msg.role === 'spectator' || msg.playerId === '__spectator__') {
              setRole('spectator');
            }
            if (msg.crewId) { isClubTableRef.current = true; setIsClubTable(true); }
            return;
          }

          // badugi:snapshot: subsequent broadcasts after each action.
          if (msg.type === 'badugi:snapshot') {
            // FULL replace — no merge.
            setState(msg.state as GameState);
            if (msg.sessionStats) {
              const ss = msg.sessionStats as BadugiSessionStats;
              sessionStatsRef.current = ss;
              setSessionStats(ss);
            }
            return;
          }
          // host_update: host identity or settings changed
          if (msg.type === 'host_update') {
            setHostId((msg.hostId as string | null) ?? null);
            if (msg.tableSettings) {
              setTableSettings(msg.tableSettings as { maxPlayers: number; botsEnabled: boolean; isInviteOnly: boolean });
            }
            if (msg.crewId) { isClubTableRef.current = true; setIsClubTable(true); }
            return;
          }

          // host_kicked: this player was removed by the host
          if (msg.type === 'host_kicked') {
            setKickedByHost(true);
            return;
          }

          // session_expired: server closed the connection because the session token expired.
          // Stop reconnecting — the user must re-authenticate.
          if (msg.type === 'session_expired') {
            mountedRef.current = false;
            ws.close();
            return;
          }

          // Unhandled types — log to spot missing handlers.
          console.warn('[WS IN] unhandled message type', msg.type);
        } catch (err) {
          console.error('[WS IN] parse failed', err);
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        reconnectRef.current = setTimeout(connect, Math.min(3000 + Math.random() * 1000, 8000));
      };

      ws.onerror = () => ws.close();
    }

    // iOS Safari kills WebSocket connections when the tab is backgrounded.
    // On visibility restored, force an immediate reconnect instead of waiting
    // for the onclose → 3-8 s delay to fire (which may never fire while hidden).
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
        connect();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    connect();

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
    if (!activeFlag) {
      console.warn('[CGP][client] badugi:action DROPPED — activeFlag off', { action });
      return;
    }
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[CGP][client] badugi:action DROPPED — ws not open', { action, readyState: ws?.readyState });
      return;
    }
    const outgoing = {
      type: 'badugi:action' as const,
      tableId: tableIdRef.current,
      playerId: myIdRef.current,
      action,
      payload: payload ?? null,
    };
    console.log('[CGP][client] → badugi:action', outgoing);
    ws.send(JSON.stringify(outgoing));
  }, [activeFlag]);

  const sendHostAction = useCallback((
    type: 'host:kick' | 'host:settings',
    payload: Record<string, unknown>
  ) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, tableId: tableIdRef.current, playerId: myIdRef.current, ...payload }));
  }, []);

  return { state, handleAction, myId, role, sessionStats, lastWsAt, lastWsType, hostId, tableSettings, isClubTable, sendHostAction, kickedByHost };
}
