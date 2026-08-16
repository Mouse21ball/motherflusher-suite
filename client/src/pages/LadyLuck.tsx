import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { apiUrl, wsUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';
import { ensurePlayerIdentity } from '@/lib/persistence';
import {
  LadyLuckState,
  LadyLuckSuit,
  LadyLuckRoom,
  LADY_LUCK_ROOMS,
} from '../../../shared/modes/ladyluck';

// ── Constants ──────────────────────────────────────────────────────────────────

const QUEEN_NICKNAMES: Record<string, string> = {
  spades:   'Black Widow',
  hearts:   'Lady Red',
  diamonds: 'Diamond Dee',
  clubs:    'Club Ace',
};

const SUIT_SYMBOLS: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

// Card face text color (on white background)
const SUIT_COLORS: Record<string, string> = {
  spades: '#1a1a1a', hearts: '#e53935', diamonds: '#e53935', clubs: '#1a1a1a',
};

// Suit symbol color on dark background
const SUIT_BG_COLORS: Record<string, string> = {
  spades: '#ffffff', hearts: '#e53935', diamonds: '#e53935', clubs: '#ffffff',
};

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as LadyLuckSuit[];

const ROOM_CFGS: Record<LadyLuckRoom, { label: string; color: string; range: string; sideBetMax: number }> = {
  pony:         { label: 'PONY',         color: '#10b981', range: '100–500',    sideBetMax: 200  },
  thoroughbred: { label: 'THOROUGHBRED', color: '#f59e0b', range: '500–2,000',  sideBetMax: 1000 },
  champion:     { label: 'CHAMPION',     color: '#e53935', range: '2,000–5,000',sideBetMax: 2500 },
};

// ── FaceDownCard ───────────────────────────────────────────────────────────────

function FaceDownCard({
  suit, claimed, claimedBy, canPick, onPick,
}: {
  suit?: LadyLuckSuit;
  claimed?: boolean;
  claimedBy?: string;
  canPick?: boolean;
  onPick?: () => void;
}) {
  const [peeked, setPeeked] = useState(false);
  const isRed = suit === 'hearts' || suit === 'diamonds';

  if (claimed && suit) {
    return (
      <div style={{
        width: 72, height: 100,
        background: 'linear-gradient(160deg,#f5ead6 0%,#e8d5aa 55%,#d4b87a 100%)',
        borderRadius: 9,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: `2px solid ${isRed ? '#e53935' : 'rgba(255,255,255,0.55)'}`,
        position: 'relative', flexShrink: 0,
        boxShadow: `0 0 16px ${isRed ? '#e5393555' : '#ffffff25'}, 0 3px 10px rgba(0,0,0,0.6)`,
        animation: 'll-card-appear 0.4s ease-out',
      }}>
        <span style={{ position: 'absolute', top: 3, left: 5, fontSize: 11, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif' }}>Q</span>
        <span style={{ position: 'absolute', top: 14, left: 5, fontSize: 9, color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
        <span style={{ fontSize: 32, color: SUIT_COLORS[suit], lineHeight: 1 }}>{SUIT_SYMBOLS[suit]}</span>
        <span style={{ position: 'absolute', bottom: 3, right: 5, fontSize: 11, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif', transform: 'rotate(180deg)' }}>Q</span>
        <span style={{ position: 'absolute', bottom: 14, right: 5, fontSize: 9, color: SUIT_COLORS[suit], transform: 'rotate(180deg)' }}>{SUIT_SYMBOLS[suit]}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div
        onClick={canPick ? onPick : undefined}
        style={{
          width: 72, height: 100, borderRadius: 9, position: 'relative', overflow: 'hidden', flexShrink: 0,
          background: peeked
            ? 'linear-gradient(160deg,#f5ead6 0%,#e8d5aa 55%,#d4b87a 100%)'
            : undefined,
          backgroundImage: peeked ? undefined : "url('/ladyluck/card-back-cgp.png')",
          backgroundSize: peeked ? undefined : 'cover',
          backgroundPosition: peeked ? undefined : 'center',
          border: canPick
            ? '2px solid #C9A227'
            : peeked ? `2px solid ${isRed ? '#e53935' : 'rgba(255,255,255,0.5)'}` : '1.5px solid #C9A22748',
          boxShadow: canPick
            ? '0 0 18px #C9A22755, 0 3px 10px rgba(0,0,0,0.6)'
            : '0 3px 10px rgba(0,0,0,0.6)',
          cursor: canPick ? 'pointer' : 'default',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {peeked && suit ? (
          <>
            <span style={{ position: 'absolute', top: 3, left: 5, fontSize: 11, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif' }}>Q</span>
            <span style={{ position: 'absolute', top: 14, left: 5, fontSize: 9, color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
            <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 32, color: SUIT_COLORS[suit], lineHeight: 1 }}>{SUIT_SYMBOLS[suit]}</span>
            <span style={{ position: 'absolute', bottom: 3, right: 5, fontSize: 11, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif', transform: 'rotate(180deg)' }}>Q</span>
            <span style={{ position: 'absolute', bottom: 14, right: 5, fontSize: 9, color: SUIT_COLORS[suit], transform: 'rotate(180deg)' }}>{SUIT_SYMBOLS[suit]}</span>
          </>
        ) : (
          canPick && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(201,162,39,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#C9A227', fontWeight: 700, letterSpacing: 1 }}>PICK</span>
            </div>
          )
        )}
      </div>
      {!claimed && suit && !peeked && (
        <button
          onClick={() => setPeeked(true)}
          style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(201,162,39,0.45)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 2, padding: '1px 4px' }}
        >
          PEEK
        </button>
      )}
      {peeked && suit && !claimed && (
        <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#C9A22799', letterSpacing: 1 }}>PEEKED</span>
      )}
    </div>
  );
}

// ── QueenCard ──────────────────────────────────────────────────────────────────

function QueenCard({
  suit, isWinner, isYours, playerName,
}: {
  suit: LadyLuckSuit;
  isWinner?: boolean;
  isYours?: boolean;
  playerName?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 72, height: 100, background: '#fff', borderRadius: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: isWinner ? '2.5px solid #C9A227' : isYours ? `2px solid ${SUIT_COLORS[suit]}` : '2px solid rgba(200,200,200,0.3)',
        boxShadow: isWinner
          ? '0 0 24px #C9A227cc, 0 4px 16px rgba(0,0,0,0.5)'
          : isYours ? `0 0 10px ${SUIT_COLORS[suit]}40` : '0 2px 10px rgba(0,0,0,0.4)',
        position: 'relative',
        animation: isWinner ? 'll-winner-glow 2s ease-in-out infinite' : undefined,
      }}>
        <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 12, fontWeight: 800, color: SUIT_COLORS[suit] }}>Q</span>
        <span style={{ fontSize: 28, color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
        <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 12, fontWeight: 800, color: SUIT_COLORS[suit], transform: 'rotate(180deg)' }}>Q</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: isWinner ? '#C9A227' : 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>{QUEEN_NICKNAMES[suit]}</div>
        {playerName && <div style={{ fontSize: 8, fontFamily: 'monospace', color: isYours ? '#C9A227' : 'rgba(255,255,255,0.35)', marginTop: 1 }}>{isYours ? '★ ' : ''}{playerName.slice(0, 10)}</div>}
      </div>
    </div>
  );
}

// ── Room data hook ─────────────────────────────────────────────────────────────

interface LLRoomData {
  counts:      Record<LadyLuckRoom, number>;
  fullTableId: Record<LadyLuckRoom, string | null>;
}

function useLLRoomData(): LLRoomData {
  const [data, setData] = useState<LLRoomData>({
    counts:      { pony: 0, thoroughbred: 0, champion: 0 },
    fullTableId: { pony: null, thoroughbred: null, champion: null },
  });
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(apiUrl('/api/ladyluck/tables'));
        if (!res.ok) return;
        const tables: { tableId: string; roomType: LadyLuckRoom; playerCount: number; isFull?: boolean }[] = await res.json();
        const counts:      Record<LadyLuckRoom, number>      = { pony: 0, thoroughbred: 0, champion: 0 };
        const fullTableId: Record<LadyLuckRoom, string|null> = { pony: null, thoroughbred: null, champion: null };
        for (const t of tables) {
          counts[t.roomType] = (counts[t.roomType] ?? 0) + t.playerCount;
          if (t.isFull && !fullTableId[t.roomType]) fullTableId[t.roomType] = t.tableId;
        }
        setData({ counts, fullTableId });
      } catch {}
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);
  return data;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LadyLuck() {
  const [, navigate]          = useLocation();
  const [tableId, setTableId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('t'));
  const [state, setState]     = useState<LadyLuckState | null>(null);
  const [connected, setConnected] = useState(false);
  const [wsError, setWsError]     = useState<string | null>(null);
  const [connTimedOut, setConnTimedOut] = useState(false);
  const [flipAnim, setFlipAnim]   = useState<LadyLuckSuit | null>(null);
  const [joining, setJoining]     = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [wagerAmt, setWagerAmt]   = useState(0);
  const [sideBetSuit, setSideBetSuit]             = useState<LadyLuckSuit | null>(null);
  const [sideBetAmt, setSideBetAmt]               = useState(0);
  const [selectedQueenPreview, setSelectedQueenPreview] = useState<LadyLuckSuit | null>(null);
  const [showRules, setShowRules] = useState(false);

  const wsRef    = useRef<WebSocket | null>(null);
  const identity = ensurePlayerIdentity();
  const { counts: roomCounts, fullTableId } = useLLRoomData();

  // ── WebSocket connection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!tableId) return;
    let ws: WebSocket | null = null;
    let alive = true;
    let stateReceived = false;
    let reconnTimerId: ReturnType<typeof setTimeout> | null = null;

    setWsError(null);
    setConnTimedOut(false);

    // 15-second connection timeout — Android Chrome on a slow network or a cold
    // Replit server can easily take >5 s for token fetch + WS handshake + first message.
    const timeoutId = setTimeout(() => {
      if (alive && !stateReceived) setConnTimedOut(true);
    }, 15000);

    const connect = async () => {
      if (!alive) return;
      try {
        const wsTimingStart = Date.now();
        console.log(`[LL-TIMING] GET /api/auth/ws-ticket starting at ${wsTimingStart}`);
        const tokenRes = await apiFetch('/api/auth/ws-ticket');
        let token: string | null = null;
        if (tokenRes.ok) { const j = await tokenRes.json(); token = j.ticket ?? null; }
        console.log(`[LL-TIMING] GET /api/auth/ws-ticket resolved at ${Date.now()} (+${Date.now() - wsTimingStart}ms)`);

        if (!alive) return;

        console.log(`[LL-TIMING] new WebSocket() called at ${Date.now()} (+${Date.now() - wsTimingStart}ms)`);
        console.log('[ladyluck] WS connecting, tableId from state:', tableId, '| wsUrl:', wsUrl(token));
        ws = new WebSocket(wsUrl(token));
        wsRef.current = ws;
        const wsCreatedAt = Date.now();

        ws.onopen = () => {
          if (!alive) { ws?.close(); return; }
          setConnected(true);
          console.log(`[LL-TIMING] ws.onopen fired at ${Date.now()} (+${Date.now() - wsCreatedAt}ms after new WebSocket())`);
          const joinMsg = { type: 'll:join', tableId, playerId: identity.id, name: identity.name };
          console.log(`[LL-TIMING] ll:join sent at ${Date.now()}`);
          console.log('[ladyluck] WS open — sending ll:join with tableId:', tableId, '| full msg:', joinMsg);
          ws?.send(JSON.stringify(joinMsg));
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string);
            if (msg.type === 'll:state') {
              console.log(`[LL-TIMING] ll:state received at ${Date.now()} (+${Date.now() - wsCreatedAt}ms after new WebSocket())`);
              if (!stateReceived) { clearTimeout(timeoutId); stateReceived = true; }
              setState(msg.state as LadyLuckState);
              setWagerAmt(v => v || LADY_LUCK_ROOMS[(msg.state as LadyLuckState).roomType].minWager);
            }
            if (msg.type === 'll:spectator_count') {
              setState(prev => prev ? { ...prev, spectatorCount: msg.count as number } : prev);
            }
            if (msg.type === 'll:flip') {
              const flippedSuit = (msg.card as { suit: LadyLuckSuit }).suit;
              setFlipAnim(flippedSuit);
              setState(prev => prev ? {
                ...prev,
                positions:    msg.positions as Record<LadyLuckSuit, number>,
                currentCard:  msg.card as { rank: string; suit: LadyLuckSuit },
                flippedCards: [...(prev.flippedCards ?? []), msg.card as { rank: string; suit: LadyLuckSuit }],
              } : prev);
              setTimeout(() => setFlipAnim(null), 700);
            }
            if (msg.type === 'll:result') {
              setState(msg.state as LadyLuckState);
            }
            if (msg.type === 'll:error') {
              const errMsg = (msg.message as string) ?? 'unknown_error';
              console.error('[ladyluck] ll:error received:', errMsg, '| tableId sent:', tableId);
              setWsError(errMsg);
            }
          } catch {}
        };

        ws.onerror = (ev) => {
          if (!alive) return;
          // Don't surface the error yet — onclose fires next and will trigger reconnect
          console.error('[ladyluck] ws.onerror fired:', ev);
        };

        ws.onclose = (ev) => {
          if (!alive) return;
          setConnected(false);
          console.warn('[ladyluck] WS closed — code:', ev.code, 'reason:', ev.reason, 'stateReceived:', stateReceived);
          // Reconnect unless the server sent a deliberate auth/policy close (4001+).
          // This fixes iOS Safari silently dropping the TCP connection mid-race, which
          // left the client frozen on "RACE STARTING…" with no flip messages arriving.
          if (ev.code < 4001) {
            reconnTimerId = setTimeout(() => { if (alive) connect(); }, 2000 + Math.random() * 1000);
          } else {
            setWsError('Connection closed by server');
          }
        };
      } catch (err) {
        if (!alive) return;
        console.error('[ladyluck] connect() threw:', err);
        setWsError(err instanceof Error ? err.message : String(err));
      }
    };

    // iOS Safari kills WebSocket connections when the tab is backgrounded.
    // Force an immediate reconnect when visibility is restored rather than
    // waiting for the delayed onclose → reconnect timer.
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const currentWs = wsRef.current;
      if (!currentWs || currentWs.readyState === WebSocket.CLOSED || currentWs.readyState === WebSocket.CLOSING) {
        if (reconnTimerId) { clearTimeout(reconnTimerId); reconnTimerId = null; }
        if (alive) connect();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    connect();
    return () => {
      alive = false;
      clearTimeout(timeoutId);
      if (reconnTimerId) clearTimeout(reconnTimerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // Auto-pick the last remaining suit when human player is the dealer and all others have picked
  useEffect(() => {
    if (!state || state.phase !== 'SELECT') return;
    const myIdx = state.players.findIndex(p => p.id === identity.id);
    if (myIdx === -1 || myIdx !== state.dealerIndex) return;
    const remaining = SUITS.filter(s => !state.claimedSuits.includes(s));
    if (remaining.length !== 1) return;
    // currentPickIndex must be pointing at us (the dealer)
    if (state.currentPickIndex !== myIdx) return;
    const timer = setTimeout(() => {
      send({ type: 'll:select', tableId, playerId: identity.id, suit: remaining[0] });
    }, 900);
    return () => clearTimeout(timer);
  }, [state?.phase, state?.claimedSuits.length, state?.currentPickIndex]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────
  const goBack = () => { setTableId(null); setState(null); navigate('/ladyluck'); };

  const handleJoinRoom = async (roomType: LadyLuckRoom) => {
    const llStart = Date.now();
    console.log(`[LL-TIMING] JOIN tapped at ${llStart} (+0ms)`);
    setJoining(true); setJoinError(null);
    try {
      const res = await apiFetch('/api/ladyluck/tables', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomType }),
      });
      if (!res.ok) {
        let msg = `Server returned ${res.status}`;
        try { const j = await res.json(); msg = j.error || msg; } catch {}
        throw new Error(msg);
      }
      const { tableId: tid } = await res.json() as { tableId: string };
      console.log(`[LL-TIMING] POST /api/ladyluck/tables resolved tableId=${tid} at ${Date.now()} (+${Date.now() - llStart}ms)`);
      setTableId(tid);
      navigate(`/ladyluck?t=${tid}`, { replace: true });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    }
    setJoining(false);
  };

  const handleStart      = () => send({ type: 'll:start',   tableId, playerId: identity.id });
  const handleSelectSuit = (suit: LadyLuckSuit) => send({ type: 'll:select', tableId, playerId: identity.id, suit });
  const handleWager      = () => send({ type: 'll:wager',   tableId, playerId: identity.id, amount: wagerAmt });
  const handleSideBet    = () => {
    if (!sideBetSuit || !sideBetAmt) return;
    send({ type: 'll:sidebet', tableId, playerId: identity.id, suit: sideBetSuit, amount: sideBetAmt });
    setSideBetSuit(null); setSideBetAmt(0);
  };

  // ── ROOM SELECTION (no tableId) ─────────────────────────────────────────────
  if (!tableId) {
    const QUEEN_PORTRAITS: Record<string, string> = {
      spades:   '/ladyluck/queens/queen-spades.png',
      hearts:   '/ladyluck/queens/queen-hearts.png',
      diamonds: '/ladyluck/queens/queen-diamonds.png',
      clubs:    '/ladyluck/queens/queen-clubs.png',
    };
    const TIER_ROWS: { id: LadyLuckRoom; color: string; horseImg: string }[] = [
      { id: 'pony',         color: '#10b981', horseImg: '/ladyluck/horses/horse-pony.png' },
      { id: 'thoroughbred', color: '#d97706', horseImg: '/ladyluck/horses/horse-thoroughbred.png' },
      { id: 'champion',     color: '#dc2626', horseImg: '/ladyluck/horses/horse-champion.png' },
    ];
    const chipBalance = (() => { try { const v = localStorage.getItem('cgp_balance'); return v ? Number(v).toLocaleString() : '—'; } catch { return '—'; } })();

    return (
      <div style={{ minHeight: '100dvh', background: '#120c08', backgroundImage: "url('/ladyluck/ladyluck-bg.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed', color: '#fff', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', position: 'relative', overflowX: 'hidden' }}>
        <style>{`
          @keyframes ll-glow-pulse { 0%,100%{opacity:0.75} 50%{opacity:1} }
          @keyframes ll-fade-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        `}</style>

        {/* ── HEADER ── */}
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(201,162,39,0.15)', position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={() => navigate('/')} data-testid="button-back-home"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 10px', color: 'rgba(255,255,255,0.7)', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1, flexShrink: 0 }}>
            ← BACK
          </button>
          <button onClick={() => navigate('/shop')} data-testid="button-cgp-shop"
            style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', letterSpacing: 3 }}>CGP SHOP</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.22)', borderRadius: 14, padding: '4px 8px' }}>
              <span style={{ fontSize: 10 }}>🪙</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C9A227', fontWeight: 700 }}>{chipBalance}</span>
            </div>
            <button onClick={() => setShowRules(true)} data-testid="button-rules"
              style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>?</button>
          </div>
        </div>

        {/* ── HERO ── */}
        <div style={{ position: 'relative', textAlign: 'center', padding: '18px 16px 14px', overflow: 'hidden' }}>
          {/* Dark gradient overlay for title legibility */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.7) 100%)', pointerEvents: 'none' }} />
          {/* Crown — centered above title */}
          <img src="/crews/icon-crown.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', animation: 'll-glow-pulse 3s ease-in-out infinite', display: 'block', margin: '0 auto 8px', position: 'relative', zIndex: 1 }} />
          {/* LADY LUCK title */}
          <div style={{
            fontFamily: 'Anton, Georgia, serif', fontSize: 54, fontWeight: 900, letterSpacing: 3,
            background: 'linear-gradient(180deg,#f5d76e 0%,#C9A227 38%,#7a5a10 72%,#C9A227 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            lineHeight: 0.95, marginBottom: 8, position: 'relative',
          }}>
            LADY LUCK
          </div>
          {/* Subtitle with decorative lines */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', position: 'relative' }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22780)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#C9A227', letterSpacing: 3, whiteSpace: 'nowrap' }}>PICK YOUR QUEEN. RUN THE RACE.</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22780)' }} />
          </div>
          {/* LOYALTY NEVER LEAVES — right side vertical banner */}
          <div style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%) rotate(90deg)',
            fontFamily: 'monospace', fontSize: 6, letterSpacing: 3, color: '#C9A22788',
            background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(201,162,39,0.18)',
            padding: '3px 7px', whiteSpace: 'nowrap', borderRadius: 3, transformOrigin: 'center center',
          }}>
            LOYALTY NEVER LEAVES
          </div>
        </div>

        {/* ── QUEEN CARDS ── */}
        <div style={{ padding: '10px 12px 6px', display: 'flex', gap: 7, animation: 'll-fade-up 0.4s ease-out', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,215,0,0.15)', borderBottom: '1px solid rgba(255,215,0,0.15)' }}>
          {SUITS.map(suit => {
            const isSel   = selectedQueenPreview === suit;
            const pip     = SUIT_BG_COLORS[suit];
            return (
              <button key={suit}
                data-testid={`button-queen-preview-${suit}`}
                onClick={() => setSelectedQueenPreview(isSel ? null : suit as LadyLuckSuit)}
                style={{ flex: 1, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: '100%', aspectRatio: '2/3', borderRadius: 10, overflow: 'hidden', position: 'relative',
                  border: `2px solid ${isSel ? pip : 'rgba(255,255,255,0.12)'}`,
                  boxShadow: isSel ? `0 0 18px ${pip}55, 0 0 5px ${pip}30` : '0 3px 10px rgba(0,0,0,0.7)',
                  background: '#0d0d1e', transition: 'border-color 0.2s, box-shadow 0.2s',
                }}>
                  {/* Suit pip corner */}
                  <div style={{ position: 'absolute', top: 4, left: 5, fontSize: 10, color: pip, fontWeight: 900, lineHeight: 1, zIndex: 2, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                    {SUIT_SYMBOLS[suit]}
                  </div>
                  {/* Portrait */}
                  <img src={QUEEN_PORTRAITS[suit]} alt={QUEEN_NICKNAMES[suit]}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block', filter: 'brightness(0.82) contrast(1.1)' }} />
                  {/* Bottom gradient */}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 45%,rgba(0,0,0,0.75) 100%)', pointerEvents: 'none' }} />
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 6, letterSpacing: 0.5, color: isSel ? pip : 'rgba(255,255,255,0.52)', textAlign: 'center', textTransform: 'uppercase', lineHeight: 1.3 }}>
                  {QUEEN_NICKNAMES[suit].toUpperCase()}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── RACE TIERS ── */}
        <div style={{ padding: '6px 12px 0', display: 'flex', flexDirection: 'column', gap: 8, animation: 'll-fade-up 0.4s ease-out 0.1s both' }}>
          {TIER_ROWS.map(({ id, color, horseImg }) => {
            const cfg = ROOM_CFGS[id];
            return (
              <div key={id} data-testid={`card-room-${id}`} style={{
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,215,0,0.15)',
                borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'stretch',
                boxShadow: `0 2px 14px ${color}18`,
              }}>
                {/* Horse portrait */}
                <div style={{ width: 84, flexShrink: 0, backgroundImage: `url('${horseImg}')`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent 55%,rgba(0,0,0,0.5))' }} />
                </div>
                {/* Info + button */}
                <div style={{ flex: 1, padding: '11px 10px 11px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 17, color, letterSpacing: 1, lineHeight: 1 }}>{cfg.label}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.48)', marginTop: 3 }}>WAGER {cfg.range} CHIPS</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, color: `${color}99`, marginTop: 2 }}>SIDE BET MAX {cfg.sideBetMax.toLocaleString()} · PAYS 2.5×</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.28)', marginTop: 3 }}>
                      {roomCounts[id] > 0 ? `${roomCounts[id]} players online` : 'No active tables'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {fullTableId[id] && (
                      <button
                        data-testid={`button-watch-${id}`}
                        onClick={() => navigate(`/ladyluck/spectate?t=${fullTableId[id]}`)}
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 9, padding: '10px 10px', fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: 0.5, lineHeight: 1 }}
                      >
                        👁 WATCH
                      </button>
                    )}
                    <button data-testid={`button-join-${id}`}
                      onClick={() => handleJoinRoom(id)}
                      disabled={joining}
                      style={{ background: color, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 13px', fontWeight: 800, fontSize: 12, cursor: joining ? 'not-allowed' : 'pointer', letterSpacing: 1, opacity: joining ? 0.55 : 1, lineHeight: 1, boxShadow: `0 2px 8px ${color}55` }}>
                      JOIN
                    </button>
                    <span style={{ color, fontSize: 15, fontWeight: 700, lineHeight: 1 }}>›</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* join error */}
        {joinError && (
          <div style={{ margin: '8px 12px 0', background: 'rgba(229,57,53,0.12)', border: '1px solid #e5393560', borderRadius: 10, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#ff6b6b' }}>
            ✕ {joinError}
          </div>
        )}

        {/* ── RULES FOOTER ── */}
        <div style={{ margin: '10px 12px', background: "linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)), url('/ladyluck/ladyluck-footer-bg.png') center/cover", backdropFilter: 'blur(12px)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/crews/icon-crown.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.1)', flexShrink: 0 }} />
          <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 9, color: 'rgba(201,162,39,0.72)', lineHeight: 1.75 }}>
            4 Queens race to 9 card flips. Pick clockwise — dealer gets last. Wager chips, place side bets.{' '}
            <span style={{ color: '#C9A227', fontWeight: 700 }}>FIRST TO 9 WINS THE POT. SIDE BETS PAY 2.5×.</span>
          </div>
          <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', border: '1px solid rgba(201,162,39,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton, Impact, sans-serif', fontSize: 10, color: '#C9A227', letterSpacing: 1 }}>CGP</div>
        </div>

        {/* ── BOTTOM NAV ── */}
        <div style={{ marginTop: 'auto', background: 'rgba(8,6,4,0.97)', borderTop: '1px solid rgba(201,162,39,0.18)', display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {([
            { label: 'HOME',    icon: '⌂',  path: '/',                 active: false },
            { label: 'LOBBY',   icon: '☆',  path: '/ladyluck',         active: true  },
            { label: 'HISTORY', icon: '🏆', path: '/ladyluck/history', active: false },
          ] as { label: string; icon: string; path: string; active: boolean }[]).map(item => (
            <button key={item.label}
              data-testid={`button-nav-${item.label.toLowerCase()}`}
              onClick={() => navigate(item.path)}
              style={{ flex: 1, padding: '10px 4px 8px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative' }}>
              <span style={{ fontSize: 16, color: item.active ? '#C9A227' : 'rgba(255,255,255,0.28)' }}>{item.icon}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, color: item.active ? '#C9A227' : 'rgba(255,255,255,0.28)' }}>{item.label}</span>
            </button>
          ))}
        </div>

        {/* ── RULES MODAL ── */}
        {showRules && (
          <div onClick={() => setShowRules(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: 'rgba(18,12,8,0.96)', border: '1px solid rgba(201,162,39,0.45)', borderRadius: 18, padding: '22px 20px 18px', maxWidth: 360, width: '100%', boxShadow: '0 0 40px rgba(201,162,39,0.18), 0 8px 32px rgba(0,0,0,0.8)' }}>
              {/* Crown + title */}
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <img src="/crews/icon-crown.png" alt="" style={{ width: 42, height: 42, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 10px' }} />
                <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 22, letterSpacing: 3, background: 'linear-gradient(180deg,#f5d76e 0%,#C9A227 60%,#7a5a10 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  LADY LUCK
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(201,162,39,0.6)', letterSpacing: 3, marginTop: 4 }}>HOW TO PLAY</div>
              </div>
              {/* Rules list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {[
                  { icon: '♛', text: '4 Queens race to 9 card flips. Each flip reveals a card that advances one queen.' },
                  { icon: '🃏', text: 'Cards flip one at a time from a shuffled deck. The suit on the card earns a flip for that queen.' },
                  { icon: '💰', text: 'Pick your queen and wager chips before the race begins. First to 9 flips wins the pot.' },
                  { icon: '🎲', text: 'Side bets: pick any suit to win 2.5× your bet if that queen finishes first.' },
                  { icon: '👑', text: 'Selection order goes clockwise — the dealer picks last. Choose wisely.' },
                ].map(({ icon, text }) => (
                  <div key={icon} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{text}</span>
                  </div>
                ))}
              </div>
              {/* Divider */}
              <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(201,162,39,0.35),transparent)', marginBottom: 14 }} />
              {/* Close button */}
              <button onClick={() => setShowRules(false)} data-testid="button-rules-close"
                style={{ width: '100%', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.35)', borderRadius: 10, padding: '11px 0', fontFamily: 'monospace', fontSize: 11, color: '#C9A227', cursor: 'pointer', letterSpacing: 2 }}>
                GOT IT
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Connecting ──────────────────────────────────────────────────────────────
  if (!state) {
    const showError = wsError || connTimedOut;
    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: '0 24px' }}>
        {showError ? (
          <>
            <div style={{ fontSize: 28 }}>⚠️</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#ff6b6b', textAlign: 'center' }}>
              {wsError
                ? `Connection error: ${wsError}`
                : 'Connection timed out — server did not respond'}
            </div>
            <button
              data-testid="button-conn-back"
              onClick={goBack}
              style={{ background: '#e53935', color: '#fff', border: 'none', borderRadius: 22, padding: '10px 24px', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
              ← Back to rooms
            </button>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
              {connected ? 'Joining table…' : 'Connecting…'}
            </div>
            <button
              onClick={goBack}
              style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← Back to rooms
            </button>
          </>
        )}
      </div>
    );
  }

  const myPlayer = state.players.find(p => p.id === identity.id);
  const room     = LADY_LUCK_ROOMS[state.roomType];
  const roomCfg  = ROOM_CFGS[state.roomType];

  // ── IN-TABLE LOBBY ──────────────────────────────────────────────────────────
  if (state.phase === 'LOBBY') {
    const isHost    = state.players[0]?.id === identity.id;
    const canStart  = state.players.length >= 2;
    const tierColor = roomCfg.color;

    return (
      <div style={{
        minHeight: '100dvh', color: '#fff', display: 'flex', flexDirection: 'column',
        backgroundColor: '#120c08',
        backgroundImage: "url('/ladyluck/ladyluck-bg.png')", backgroundSize: 'cover',
        backgroundPosition: 'center', backgroundAttachment: 'fixed',
      }}>
        <style>{`@keyframes ll-lob-pulse { 0%,100%{opacity:0.7} 50%{opacity:1} }`}</style>

        {/* ── HERO HEADER ── */}
        <div style={{ position: 'relative', padding: '14px 14px 18px', textAlign: 'center', overflow: 'hidden' }}>
          {/* gradient overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.15) 60%,rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />

          {/* Back circle button — top left */}
          <button onClick={goBack} data-testid="button-lobby-back"
            style={{ position: 'absolute', top: 14, left: 14, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
            ←
          </button>
          <div style={{ position: 'absolute', top: 14, left: 58, fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, paddingTop: 10, zIndex: 2 }}>BACK</div>

          {/* Tier badge — top right */}
          <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,0.6)', border: `1px solid ${tierColor}55`, borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, zIndex: 2 }}>
            <img src="/ladyluck/horses/horse-champion.png" alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: '50%', filter: `sepia(1) saturate(3) hue-rotate(${state.roomType === 'pony' ? '100deg' : state.roomType === 'thoroughbred' ? '20deg' : '-10deg'}) brightness(1.1)` }} />
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: tierColor, fontWeight: 700, letterSpacing: 2 }}>{roomCfg.label}</span>
          </div>

          {/* Crown */}
          <img src="/crews/icon-crown.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 6px', position: 'relative', zIndex: 1, animation: 'll-lob-pulse 3s ease-in-out infinite' }} />

          {/* Title */}
          <div style={{
            fontFamily: 'Anton, Georgia, serif', fontSize: 48, fontWeight: 900, letterSpacing: 3,
            background: 'linear-gradient(180deg,#f5d76e 0%,#C9A227 38%,#7a5a10 72%,#C9A227 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            lineHeight: 0.95, marginBottom: 8, position: 'relative', zIndex: 1,
          }}>LADY LUCK</div>

          {/* Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', position: 'relative', zIndex: 1 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22780)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 7, color: '#C9A227', letterSpacing: 3, whiteSpace: 'nowrap' }}>PICK YOUR QUEEN. RUN THE RACE.</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22780)' }} />
          </div>
        </div>

        {/* ── PLAYERS IN LOBBY PANEL ── */}
        <div style={{ margin: '0 14px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(201,162,39,0.28)', borderRadius: 14, overflow: 'hidden' }}>
          {/* Panel header */}
          <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22760)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#C9A227', letterSpacing: 4, whiteSpace: 'nowrap' }}>PLAYERS IN LOBBY</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22760)' }} />
          </div>
          {/* Ornamental divider */}
          <div style={{ textAlign: 'center', fontSize: 12, color: '#C9A22755', marginBottom: 4, letterSpacing: 6 }}>✦ ✦ ✦</div>

          {/* Player rows */}
          <div style={{ padding: '0 14px 10px' }}>
            {state.players.map(p => {
              const isBot    = p.presence === 'bot';
              const isMe     = p.id === identity.id;
              const isPHost  = p.id === state.players[0]?.id;
              const isActive = !isBot || true; // bots count as active
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(201,162,39,0.1)' }}>
                  {/* Status dot */}
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isMe ? '#C9A227' : '#C9A22766', flexShrink: 0, boxShadow: isMe ? '0 0 6px #C9A22790' : 'none' }} />
                  {/* Horse avatar */}
                  <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${isMe ? '#C9A227' : '#C9A22733'}`, flexShrink: 0, background: '#0d0d0d' }}>
                    <img src="/ladyluck/horses/horse-champion.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isMe ? 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.3)' : isBot ? 'grayscale(1) brightness(0.5)' : 'sepia(1) saturate(2) hue-rotate(-10deg) brightness(1.0)' }} />
                  </div>
                  {/* Name */}
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 14, color: isMe ? '#C9A227' : 'rgba(255,255,255,0.75)', fontWeight: isMe ? 700 : 400 }}>
                    {p.name}{isMe ? ' (you)' : ''}
                    {isBot && <span style={{ marginLeft: 6, fontSize: 9, color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, padding: '1px 4px' }}>BOT</span>}
                  </span>
                  {/* Host badge */}
                  {isPHost && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, filter: 'sepia(1) saturate(3) hue-rotate(-10deg)' }}>♛</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#C9A227', letterSpacing: 2 }}>HOST</span>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Open seats */}
            {Array.from({ length: 4 - state.players.length }).map((_, i) => (
              <div key={`open-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(201,162,39,0.06)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
                <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.08)', flexShrink: 0, background: '#0d0d0d' }}>
                  <img src="/ladyluck/horses/horse-champion.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) brightness(0.28)' }} />
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.22)' }}>Open seat</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ACTION PANEL ── */}
        <div style={{ margin: '12px 14px 0', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(201,162,39,0.28)', borderRadius: 14, padding: '16px 14px 14px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          {/* Corner bracket decorations */}
          {(['top-left','top-right','bottom-left','bottom-right'] as const).map(corner => (
            <div key={corner} style={{
              position: 'absolute',
              top:    corner.includes('top')    ? 6  : undefined,
              bottom: corner.includes('bottom') ? 6  : undefined,
              left:   corner.includes('left')   ? 6  : undefined,
              right:  corner.includes('right')  ? 6  : undefined,
              width: 14, height: 14,
              borderTop:    corner.includes('top')    ? '1px solid #C9A22799' : 'none',
              borderBottom: corner.includes('bottom') ? '1px solid #C9A22799' : 'none',
              borderLeft:   corner.includes('left')   ? '1px solid #C9A22799' : 'none',
              borderRight:  corner.includes('right')  ? '1px solid #C9A22799' : 'none',
            }} />
          ))}

          {state.startingIn !== null ? (
            <>
              <img src="/crews/icon-crown.png" alt="" style={{ width: 26, height: 26, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 8px' }} />
              <div style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: 4, color: '#e53935', fontWeight: 700 }}>
                STARTING IN {state.startingIn}…
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22750)' }} />
                <div style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #C9A22760', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src="/ladyluck/horses/horse-champion.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.2)' }} />
                </div>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22750)' }} />
              </div>
            </>
          ) : isHost && canStart ? (
            <>
              <img src="/crews/icon-crown.png" alt="" style={{ width: 26, height: 26, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 8px' }} />
              <button
                data-testid="button-ll-start"
                onClick={handleStart}
                style={{ background: 'linear-gradient(180deg,#d4a820 0%,#8B6914 100%)', color: '#000', border: 'none', borderRadius: 10, padding: '13px 40px', fontWeight: 900, fontSize: 14, cursor: 'pointer', letterSpacing: 2, fontFamily: 'monospace', boxShadow: '0 2px 14px #C9A22755' }}>
                START GAME ({state.players.length} PLAYERS)
              </button>
            </>
          ) : (
            <>
              <img src="/crews/icon-crown.png" alt="" style={{ width: 26, height: 26, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 8px' }} />
              <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 4, color: '#C9A227', marginBottom: 10 }}>
                {isHost ? 'WAITING FOR 2+ PLAYERS...' : 'WAITING FOR HOST TO START...'}
              </div>
              {/* Ornamental divider with horse medallion */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22750)' }} />
                <div style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #C9A22760', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  <img src="/ladyluck/horses/horse-champion.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.2)' }} />
                </div>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22750)' }} />
              </div>
              {/* Hidden start button (required for host even when canStart=false) */}
              {isHost && (
                <button
                  data-testid="button-ll-start"
                  onClick={handleStart}
                  disabled={true}
                  style={{ display: 'none' }}
                />
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── SELECT ──────────────────────────────────────────────────────────────────
  if (state.phase === 'SELECT') {
    const myIdx          = state.players.findIndex(p => p.id === identity.id);
    const isMyTurn       = myIdx !== -1 && state.currentPickIndex === myIdx;
    const isDealer       = myIdx === state.dealerIndex;
    const pickerPlayer   = state.players[state.currentPickIndex] ?? null;
    const dealerAutoGets = isDealer && state.claimedSuits.length >= state.players.length - 1;
    const tierHorseImg   = `/ladyluck/horses/horse-${state.roomType}.png`;
    const tierColor      = roomCfg.color;

    return (
      <div style={{
        minHeight: '100dvh', color: '#fff', display: 'flex', flexDirection: 'column',
        backgroundColor: '#120c08',
        backgroundImage: "url('/ladyluck/ladyluck-bg.png')", backgroundSize: 'cover',
        backgroundPosition: 'center', backgroundAttachment: 'fixed',
      }}>
        <style>{`
          @keyframes ll-card-appear { from{opacity:0;transform:scale(0.88) rotateY(-18deg)} to{opacity:1;transform:scale(1) rotateY(0deg)} }
          @keyframes ll-sel-pulse   { 0%,100%{opacity:0.7} 50%{opacity:1} }
        `}</style>

        {/* ── HERO HEADER ── */}
        <div style={{ position: 'relative', padding: '14px 14px 16px', textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.15) 60%,rgba(0,0,0,0.6) 100%)', pointerEvents: 'none' }} />

          {/* Back circle button */}
          <button onClick={goBack} data-testid="button-select-back"
            style={{ position: 'absolute', top: 14, left: 14, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
            ←
          </button>
          <div style={{ position: 'absolute', top: 14, left: 58, fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, paddingTop: 10, zIndex: 2 }}>BACK</div>

          {/* Tier badge */}
          <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,0.6)', border: `1px solid ${tierColor}55`, borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, zIndex: 2 }}>
            <img src={tierHorseImg} alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: '50%', filter: 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: tierColor, fontWeight: 700, letterSpacing: 2 }}>{roomCfg.label}</span>
          </div>

          {/* Crown */}
          <img src="/crews/icon-crown.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 5px', position: 'relative', zIndex: 1, animation: 'll-sel-pulse 3s ease-in-out infinite' }} />

          {/* Title */}
          <div style={{
            fontFamily: 'Anton, Georgia, serif', fontSize: 44, fontWeight: 900, letterSpacing: 3,
            background: 'linear-gradient(180deg,#f5d76e 0%,#C9A227 38%,#7a5a10 72%,#C9A227 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            lineHeight: 0.95, marginBottom: 7, position: 'relative', zIndex: 1,
          }}>LADY LUCK</div>

          {/* Subtitle with diamond divider */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 6 }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22780)' }} />
              <span style={{ fontFamily: 'monospace', fontSize: 7, color: '#C9A227', letterSpacing: 3 }}>CHOOSE YOUR QUEEN</span>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22780)' }} />
            </div>
            <div style={{ fontSize: 10, color: '#C9A22755', letterSpacing: 4, textAlign: 'center' }}>◆ ◆ ◆</div>
          </div>
        </div>

        {/* ── PICK ORDER PANEL ── */}
        <div style={{ margin: '0 14px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(201,162,39,0.28)', borderRadius: 14, padding: '10px 12px 12px' }}>
          {/* Panel header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22755)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#C9A227', letterSpacing: 4 }}>✦ PICK ORDER ✦</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22755)' }} />
          </div>
          {/* 4 cells */}
          <div style={{ display: 'flex', gap: 6 }}>
            {state.players.map((p, idx) => {
              const isCurrent = idx === state.currentPickIndex;
              const isDlr     = idx === state.dealerIndex;
              const hasPicked = p.suit !== null;
              const isMe      = p.id === identity.id;
              return (
                <div key={p.id} style={{
                  flex: 1, padding: '8px 4px 7px', borderRadius: 10, textAlign: 'center',
                  background: isCurrent ? 'rgba(201,162,39,0.16)' : hasPicked ? 'rgba(16,185,129,0.09)' : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${isCurrent ? '#C9A227' : hasPicked ? '#10b98140' : 'rgba(255,255,255,0.07)'}`,
                  boxShadow: isCurrent ? '0 0 12px #C9A22748, inset 0 0 8px #C9A22712' : 'none',
                  transition: 'all 0.2s',
                }}>
                  {/* 36px circular avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 5px',
                    border: `1.5px solid ${isCurrent ? '#C9A227' : hasPicked ? '#10b98155' : 'rgba(255,255,255,0.1)'}`,
                    background: '#0d0d0d', flexShrink: 0,
                    boxShadow: isCurrent ? '0 0 8px #C9A22755' : 'none',
                  }}>
                    <img
                      src="/ladyluck/horses/horse-champion.png"
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover',
                        filter: isMe
                          ? 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.3)'
                          : hasPicked
                          ? 'sepia(1) saturate(2) brightness(0.9)'
                          : 'grayscale(1) brightness(0.45)',
                      }}
                    />
                  </div>
                  {/* Suit symbol if picked */}
                  {hasPicked && p.suit && (
                    <div style={{ fontSize: 11, color: SUIT_BG_COLORS[p.suit], lineHeight: 1, marginBottom: 3 }}>
                      {SUIT_SYMBOLS[p.suit]}
                    </div>
                  )}
                  {/* Dealer badge */}
                  {isDlr && !hasPicked && (
                    <div style={{ fontSize: 8, background: 'rgba(139,0,0,0.7)', border: '1px solid #8B000080', borderRadius: 3, padding: '1px 3px', display: 'inline-block', marginBottom: 3 }}>♠</div>
                  )}
                  <div style={{ fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, color: isMe ? '#C9A227' : 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isDlr ? 'DEALER' : p.name.slice(0, 7).toUpperCase()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── STATUS LINE ── */}
        <div style={{ textAlign: 'center', padding: '8px 14px', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, minHeight: 28 }}>
          {state.currentPickIndex === -1 ? (
            <span style={{ color: '#10b981' }}>ALL QUEENS ASSIGNED — MOVING TO WAGER…</span>
          ) : dealerAutoGets ? (
            <span style={{ color: '#C9A227' }}>YOU'RE THE DEALER — LAST QUEEN IS YOURS ♛</span>
          ) : isMyTurn ? (
            <span style={{ color: '#C9A227', fontWeight: 700 }}>YOUR TURN — PICK A QUEEN</span>
          ) : pickerPlayer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,rgba(201,162,39,0.3))' }} />
              <span style={{ color: 'rgba(201,162,39,0.65)' }}>WAITING FOR {pickerPlayer.name.toUpperCase()}…</span>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,rgba(201,162,39,0.3))' }} />
            </div>
          ) : null}
        </div>

        {/* ── CARDS ROW ── */}
        <div style={{ margin: '0 14px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          {SUITS.map(suit => {
            const claimer   = state.players.find(p => p.suit === suit);
            const isClaimed = state.claimedSuits.includes(suit);
            const canPick   = isMyTurn && !isClaimed;
            const isRed     = suit === 'hearts' || suit === 'diamonds';

            return (
              <div key={suit} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                {/* Card */}
                {isClaimed ? (
                  <FaceDownCard suit={suit} claimed={true} canPick={false} />
                ) : (
                  <FaceDownCard suit={suit} claimed={false} canPick={canPick} onPick={() => handleSelectSuit(suit)} />
                )}
                {/* Player avatar */}
                <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', border: `1.5px solid ${isClaimed ? (isRed ? '#e5393580' : 'rgba(255,255,255,0.4)') : 'rgba(255,255,255,0.1)'}`, flexShrink: 0, background: '#0d0d0d' }}>
                  <img src="/ladyluck/horses/horse-champion.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isClaimed ? (claimer?.id === identity.id ? 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.3)' : 'sepia(1) saturate(2) brightness(0.9)') : 'grayscale(1) brightness(0.25)' }} />
                </div>
                {/* Name / queen nickname */}
                {isClaimed && claimer ? (
                  <>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, color: claimer.id === identity.id ? '#C9A227' : 'rgba(255,255,255,0.6)', textAlign: 'center', letterSpacing: 0.5, lineHeight: 1.3, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {claimer.name}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 7, color: isRed ? '#e53935' : 'rgba(255,255,255,0.45)', textAlign: 'center', letterSpacing: 0.5 }}>
                      {QUEEN_NICKNAMES[suit]}
                    </div>
                  </>
                ) : (
                  <div style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.18)', letterSpacing: 1 }}>—</div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── HINT FOOTER ── */}
        <div style={{ margin: '10px 14px 14px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', border: '1px solid rgba(201,162,39,0.2)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, opacity: 0.6 }}>👁</span>
          <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(201,162,39,0.65)', letterSpacing: 3 }}>TAP PEEK TO PRIVATELY PREVIEW A SUIT</span>
        </div>
      </div>
    );
  }

  // ── WAGER ───────────────────────────────────────────────────────────────────
  if (state.phase === 'WAGER') {
    const alreadyWagered = myPlayer?.wagered ?? false;
    const wageredCount   = state.players.filter(p => p.wagered).length;
    const tierHorseImg   = `/ladyluck/horses/horse-${state.roomType}.png`;
    const tierColor      = roomCfg.color;

    return (
      <div style={{
        minHeight: '100dvh', color: '#fff', display: 'flex', flexDirection: 'column',
        backgroundColor: '#120c08',
        backgroundImage: "url('/ladyluck/ladyluck-bg.png')", backgroundSize: 'cover',
        backgroundPosition: 'center', backgroundAttachment: 'fixed',
        overflowX: 'hidden',
      }}>
        <style>{`@keyframes ll-wag-pulse { 0%,100%{opacity:0.75} 50%{opacity:1} }`}</style>

        {/* ── HERO HEADER ── */}
        <div style={{ position: 'relative', padding: '14px 14px 14px', textAlign: 'center', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.15) 60%,rgba(0,0,0,0.6) 100%)', pointerEvents: 'none' }} />
          {/* Back button */}
          <button onClick={goBack} data-testid="button-wager-back"
            style={{ position: 'absolute', top: 14, left: 14, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>←</button>
          <div style={{ position: 'absolute', top: 14, left: 58, fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, paddingTop: 10, zIndex: 2 }}>BACK</div>
          {/* Tier badge */}
          <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,0.6)', border: `1px solid ${tierColor}55`, borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, zIndex: 2 }}>
            <img src={tierHorseImg} alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: '50%', filter: 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: tierColor, fontWeight: 700, letterSpacing: 2 }}>{roomCfg.label}</span>
          </div>
          {/* Crown */}
          <img src="/crews/icon-crown.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 4px', position: 'relative', zIndex: 1, animation: 'll-wag-pulse 3s ease-in-out infinite' }} />
          {/* Title */}
          <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 42, fontWeight: 900, letterSpacing: 3, background: 'linear-gradient(180deg,#f5d76e 0%,#C9A227 38%,#7a5a10 72%,#C9A227 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 0.95, marginBottom: 7, position: 'relative', zIndex: 1 }}>LADY LUCK</div>
          {/* Subtitle */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 4 }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22780)' }} />
              <span style={{ fontFamily: 'monospace', fontSize: 7, color: '#C9A227', letterSpacing: 3 }}>PLACE YOUR WAGER</span>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22780)' }} />
            </div>
            <div style={{ fontSize: 10, color: '#C9A22755', letterSpacing: 4, textAlign: 'center' }}>◆ ◆ ◆</div>
          </div>
        </div>

        {/* ── QUEEN CARDS ROW ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 14px', flexShrink: 0 }}>
          {SUITS.map(suit => {
            const owner   = state.players.find(p => p.suit === suit);
            const isYours = myPlayer?.suit === suit;
            const isRed   = suit === 'hearts' || suit === 'diamonds';
            return (
              <div key={suit} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                {/* Parchment card */}
                <div style={{
                  width: 64, height: 90,
                  background: 'linear-gradient(160deg,#f5ead6 0%,#e8d5aa 55%,#d4b87a 100%)',
                  borderRadius: 8, position: 'relative', flexShrink: 0,
                  border: isYours ? `2px solid #C9A227` : `1.5px solid ${isRed ? '#e5393570' : 'rgba(255,255,255,0.45)'}`,
                  boxShadow: isYours ? '0 0 14px #C9A22760, 0 3px 10px rgba(0,0,0,0.6)' : `0 0 10px ${isRed ? '#e5393530' : '#ffffff15'}, 0 3px 8px rgba(0,0,0,0.5)`,
                }}>
                  <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 10, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif' }}>Q</span>
                  <span style={{ position: 'absolute', top: 12, left: 4, fontSize: 8, color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
                  <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 28, color: SUIT_COLORS[suit], lineHeight: 1 }}>{SUIT_SYMBOLS[suit]}</span>
                  <span style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif', transform: 'rotate(180deg)' }}>Q</span>
                  <span style={{ position: 'absolute', bottom: 12, right: 4, fontSize: 8, color: SUIT_COLORS[suit], transform: 'rotate(180deg)' }}>{SUIT_SYMBOLS[suit]}</span>
                  {isYours && <div style={{ position: 'absolute', inset: 0, border: '1px solid #C9A22740', borderRadius: 6, pointerEvents: 'none' }} />}
                </div>
                {/* Queen name */}
                <div style={{ fontFamily: 'monospace', fontSize: 7, color: isRed ? '#e5393599' : 'rgba(255,255,255,0.5)', letterSpacing: 1, textAlign: 'center' }}>
                  {QUEEN_NICKNAMES[suit].toUpperCase()}
                </div>
                {/* Player name */}
                {owner && (
                  <div style={{ fontFamily: 'monospace', fontSize: 7, color: isYours ? '#C9A227' : 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textAlign: 'center', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isYours ? '★ ' : ''}{owner.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── POT + WAGER STATUS PANEL ── */}
        <div style={{ margin: '10px 14px 0', background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(12px)', border: '1px solid rgba(201,162,39,0.28)', borderRadius: 13, padding: '10px 14px', flexShrink: 0 }}>
          {/* Filigree rule top */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22755)' }} />
            <span style={{ fontSize: 9, color: '#C9A22755', letterSpacing: 3 }}>✦</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22755)' }} />
          </div>
          {/* Pot row */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(201,162,39,0.6)', letterSpacing: 3 }}>POT</span>
            <span style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 28, color: '#C9A227', letterSpacing: 1 }}>{state.pot.toLocaleString()}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>• {wageredCount}/{state.players.length} WAGERED</span>
          </div>
          {/* Filigree rule bottom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22755)' }} />
            <span style={{ fontSize: 9, color: '#C9A22755', letterSpacing: 3 }}>✦</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22755)' }} />
          </div>
          {/* Wager status grid */}
          <div style={{ display: 'flex', gap: 6 }}>
            {state.players.map(p => {
              const isMe = p.id === identity.id;
              return (
                <div key={p.id} style={{
                  flex: 1, padding: '7px 4px', borderRadius: 9, textAlign: 'center',
                  background: p.wagered ? 'rgba(16,185,129,0.1)' : 'rgba(0,0,0,0.35)',
                  border: `1px solid ${p.wagered ? '#10b98140' : 'rgba(201,162,39,0.15)'}`,
                }}>
                  {p.suit && <div style={{ fontSize: 14, color: SUIT_BG_COLORS[p.suit], lineHeight: 1, marginBottom: 3 }}>{SUIT_SYMBOLS[p.suit]}</div>}
                  <div style={{ fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, color: p.wagered ? '#10b981' : isMe ? 'rgba(201,162,39,0.5)' : 'rgba(255,255,255,0.25)' }}>
                    {p.wagered ? `✓ ${p.wager.toLocaleString()}` : 'WAITING'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── YOUR WAGER PANEL ── */}
        {!alreadyWagered ? (
          <div style={{ margin: '10px 14px 0', background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(12px)', border: '1px solid rgba(201,162,39,0.28)', borderRadius: 13, padding: '12px 14px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            {/* Corner brackets */}
            {(['top-left','top-right','bottom-left','bottom-right'] as const).map(c => (
              <div key={c} style={{ position: 'absolute', top: c.includes('top') ? 6 : undefined, bottom: c.includes('bottom') ? 6 : undefined, left: c.includes('left') ? 6 : undefined, right: c.includes('right') ? 6 : undefined, width: 12, height: 12, borderTop: c.includes('top') ? '1px solid #C9A22788' : 'none', borderBottom: c.includes('bottom') ? '1px solid #C9A22788' : 'none', borderLeft: c.includes('left') ? '1px solid #C9A22788' : 'none', borderRight: c.includes('right') ? '1px solid #C9A22788' : 'none' }} />
            ))}
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22755)' }} />
              <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#C9A227', letterSpacing: 3 }}>YOUR WAGER • {room.minWager.toLocaleString()}–{room.maxWager.toLocaleString()} CHIPS</span>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22755)' }} />
            </div>
            {/* Amount + buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <button onClick={() => setWagerAmt(v => Math.max(room.minWager, v - 100))}
                style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(201,162,39,0.35)', color: '#C9A227', fontSize: 20, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontFamily: 'Anton, Georgia, serif', fontSize: 32, background: 'linear-gradient(180deg,#f5d76e 0%,#C9A227 60%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{wagerAmt.toLocaleString()}</div>
              <button onClick={() => setWagerAmt(v => Math.min(room.maxWager, v + 100))}
                style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(201,162,39,0.35)', color: '#C9A227', fontSize: 20, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
            {/* Slider */}
            <input type="range" min={room.minWager} max={room.maxWager} step={100}
              value={wagerAmt} onChange={e => setWagerAmt(Number(e.target.value))}
              data-testid="slider-wager"
              style={{ width: '100%', marginBottom: 14, accentColor: '#C9A227' }} />
            {/* Confirm button */}
            <button
              data-testid="button-confirm-wager"
              onClick={handleWager}
              style={{ width: '100%', background: 'linear-gradient(180deg,#d4a820 0%,#8B6914 100%)', color: '#000', border: 'none', borderRadius: 10, padding: '13px 0', fontWeight: 900, fontSize: 13, cursor: 'pointer', letterSpacing: 2, fontFamily: 'monospace', boxShadow: '0 2px 14px #C9A22755' }}>
              CONFIRM WAGER
            </button>
          </div>
        ) : (
          <div style={{ margin: '10px 14px 0', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b98145', borderRadius: 13, padding: '13px 14px', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#10b981', letterSpacing: 1 }}>✓ WAGER PLACED — {myPlayer?.wager.toLocaleString()} CHIPS</div>
          </div>
        )}

        {/* ── SIDE BET PANEL ── */}
        <div style={{ margin: '10px 14px 14px', background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(12px)', border: '1px solid rgba(201,162,39,0.22)', borderRadius: 13, padding: '12px 14px', flexShrink: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22750)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#C9A22799', letterSpacing: 2, whiteSpace: 'nowrap' }}>SIDE BET — MAX {room.maxSideBet.toLocaleString()} CHIPS • PAYS 2.5×</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22750)' }} />
          </div>
          {/* Suit buttons */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
            {SUITS.map(suit => {
              const isRed      = suit === 'hearts' || suit === 'diamonds';
              const isSelected = sideBetSuit === suit;
              return (
                <button key={suit}
                  data-testid={`button-sidebet-suit-${suit}`}
                  onClick={() => setSideBetSuit(suit)}
                  style={{
                    flex: 1, padding: '8px 2px', borderRadius: 10, cursor: 'pointer',
                    background: isSelected ? (isRed ? 'rgba(229,57,53,0.18)' : 'rgba(255,255,255,0.1)') : 'rgba(0,0,0,0.4)',
                    border: `1.5px solid ${isSelected ? SUIT_BG_COLORS[suit] : 'rgba(201,162,39,0.2)'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    boxShadow: isSelected ? `0 0 8px ${isRed ? '#e5393540' : '#ffffff20'}` : 'none',
                  }}>
                  <span style={{ fontSize: 18, color: SUIT_BG_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
                  <span style={{ fontSize: 6, fontFamily: 'monospace', color: isSelected ? (isRed ? '#e5393599' : 'rgba(255,255,255,0.6)') : 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>{QUEEN_NICKNAMES[suit].split(' ')[0].toUpperCase()}</span>
                </button>
              );
            })}
          </div>
          {/* Amount + place bet */}
          {sideBetSuit && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="number" min={1} max={room.maxSideBet}
                value={sideBetAmt || ''} onChange={e => setSideBetAmt(Number(e.target.value))}
                placeholder={`1–${room.maxSideBet}`}
                data-testid="input-sidebet-amount"
                style={{ flex: 1, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, padding: '8px 12px', color: '#C9A227', fontSize: 14 }} />
              <button
                data-testid="button-place-sidebet"
                onClick={handleSideBet}
                style={{ background: 'linear-gradient(180deg,#d4a820 0%,#8B6914 100%)', color: '#000', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'monospace' }}>
                BET {SUIT_SYMBOLS[sideBetSuit]}
              </button>
            </div>
          )}
          {/* Current side bets list */}
          {state.sideBets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
              {state.sideBets.map((b, i) => (
                <div key={i} style={{ fontFamily: 'monospace', fontSize: 9, color: SUIT_BG_COLORS[b.suit], display: 'flex', justifyContent: 'space-between' }}>
                  <span>{b.playerName} · {QUEEN_NICKNAMES[b.suit]}</span>
                  <span>{b.amount.toLocaleString()} {SUIT_SYMBOLS[b.suit]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RACE ────────────────────────────────────────────────────────────────────
  if (state.phase === 'RACE') {
    const flipCount  = state.flippedCards.length;
    const maxPos     = Math.max(0, ...SUITS.map(s => state.positions[s] ?? 0));
    const leader     = maxPos > 0 ? SUITS.find(s => (state.positions[s] ?? 0) === maxPos) ?? null : null;
    const isFinal    = maxPos >= 7;

    // Energy line colour per suit
    const TRACK_GLOW: Record<string, string> = {
      spades: '#C9A227', hearts: '#e53935', diamonds: '#e53935', clubs: '#aaaaaa',
    };

    return (
      <div style={{
        minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column',
        backgroundColor: '#120c08',
        backgroundImage: "url('/ladyluck/ladyluck-race-bg.png')", backgroundSize: 'cover',
        backgroundPosition: 'center top', backgroundAttachment: 'fixed',
        overflowX: 'hidden',
      }}>
        <style>{`
          @keyframes ll-race-crown { 0%,100%{opacity:0.8;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
          @keyframes ll-queen-pulse {
            0%   { transform:translateY(-50%) scale(1); }
            40%  { transform:translateY(-50%) scale(1.18); }
            100% { transform:translateY(-50%) scale(1); }
          }
          @keyframes ll-card-flip {
            0%   { opacity:0; transform:perspective(500px) rotateY(-90deg) scale(0.7); }
            25%  { opacity:1; transform:perspective(500px) rotateY(10deg)  scale(1.06); }
            50%  { opacity:1; transform:perspective(500px) rotateY(0deg)   scale(1); }
            80%  { opacity:1; transform:perspective(500px) rotateY(0deg)   scale(1); }
            100% { opacity:0.6; transform:perspective(500px) rotateY(0deg) scale(0.9); }
          }
          @keyframes ll-energy {
            0%   { opacity:0.55; }
            50%  { opacity:1; }
            100% { opacity:0.55; }
          }
        `}</style>

        {/* ── HERO HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 14px 10px', flexShrink: 0 }}>

          {/* LEFT — back button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, width: 52 }}>
            <button onClick={goBack} data-testid="button-race-back"
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
            <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>BACK</span>
          </div>

          {/* CENTER — crown + title + subtitle */}
          <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
            <img src="/crews/icon-crown.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 2px', animation: 'll-race-crown 3s ease-in-out infinite' }} />
            <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 34, fontWeight: 900, letterSpacing: 3, background: 'linear-gradient(180deg,#f5d76e 0%,#C9A227 40%,#7a5a10 72%,#C9A227 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 0.92, marginBottom: 5 }}>LADY LUCK</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22780)' }} />
              <span style={{ fontFamily: 'monospace', fontSize: 7, color: '#C9A22799', letterSpacing: 3, whiteSpace: 'nowrap' }}>THE RACE IS ON</span>
              <div style={{ width: 24, height: 1, background: 'linear-gradient(270deg,transparent,#C9A22780)' }} />
            </div>
          </div>

          {/* RIGHT — CGP box + POT box stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, alignItems: 'flex-end' }}>
            {/* CGP logo */}
            <div style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 7, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <img src="/ladyluck/horses/horse-champion.png" alt="" style={{ width: 18, height: 18, objectFit: 'cover', filter: 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)' }} />
              <div>
                <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 10, color: '#C9A227', letterSpacing: 2 }}>CGP</div>
                <div style={{ fontFamily: 'monospace', fontSize: 5, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, whiteSpace: 'nowrap' }}>LOYALTY NEVER LEAVES</div>
              </div>
            </div>
            {/* POT */}
            <div style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(201,162,39,0.45)', borderRadius: 7, padding: '5px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(201,162,39,0.6)', letterSpacing: 3 }}>POT</div>
              <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 20, color: '#C9A227', lineHeight: 1 }}>{state.pot.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* ── STATUS BAR ── */}
        <div style={{ margin: '0 14px 8px', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(10px)', border: '1px solid rgba(201,162,39,0.28)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          {/* Leader */}
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#C9A227', letterSpacing: 1 }}>
            {leader
              ? <><span style={{ color: 'rgba(201,162,39,0.55)' }}>LEADING: </span><strong>{QUEEN_NICKNAMES[leader].toUpperCase()}</strong> {SUIT_SYMBOLS[leader]}</>
              : <span style={{ color: 'rgba(255,255,255,0.25)' }}>RACE STARTING…</span>
            }
          </div>
          {/* Final stretch */}
          {isFinal && (
            <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#f59e0b', letterSpacing: 2 }}>⚡ FINAL STRETCH</div>
          )}
          {/* Laps */}
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textAlign: 'right' }}>
            <div style={{ color: '#C9A227', fontSize: 11, fontFamily: 'Anton, Georgia, serif' }}>{flipCount}/9</div>
            <div style={{ fontSize: 6, letterSpacing: 2, marginTop: -1 }}>LAPS COMPLETED</div>
          </div>
        </div>

        {/* ── CARD FLIP AREA ── */}
        <div style={{ margin: '0 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, minHeight: 116, background: 'transparent', borderRadius: 12, padding: '8px 10px' }}>
          {state.currentCard ? (
            <div key={flipCount} style={{
              animation: 'll-card-flip 1.6s ease-out forwards',
              width: 84, height: 116, flexShrink: 0,
              background: 'linear-gradient(160deg,#f5ead6 0%,#e8d5aa 55%,#d4b87a 100%)',
              borderRadius: 10, position: 'relative',
              border: `2px solid ${SUIT_COLORS[state.currentCard.suit] === '#1a1a1a' ? 'rgba(0,0,0,0.35)' : '#e5393575'}`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.75), 0 0 24px ${SUIT_BG_COLORS[state.currentCard.suit]}55`,
            }}>
              <span style={{ position: 'absolute', top: 5, left: 7, fontSize: 14, fontWeight: 900, color: SUIT_COLORS[state.currentCard.suit], fontFamily: 'serif' }}>{state.currentCard.rank}</span>
              <span style={{ position: 'absolute', top: 20, left: 7, fontSize: 11, color: SUIT_COLORS[state.currentCard.suit] }}>{SUIT_SYMBOLS[state.currentCard.suit]}</span>
              <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 36, color: SUIT_COLORS[state.currentCard.suit], lineHeight: 1 }}>{SUIT_SYMBOLS[state.currentCard.suit]}</span>
              <span style={{ position: 'absolute', bottom: 5, right: 7, fontSize: 14, fontWeight: 900, color: SUIT_COLORS[state.currentCard.suit], fontFamily: 'serif', transform: 'rotate(180deg)' }}>{state.currentCard.rank}</span>
              <span style={{ position: 'absolute', bottom: 20, right: 7, fontSize: 11, color: SUIT_COLORS[state.currentCard.suit], transform: 'rotate(180deg)' }}>{SUIT_SYMBOLS[state.currentCard.suit]}</span>
            </div>
          ) : (
            <div style={{ width: 84, height: 116, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,162,39,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'center', letterSpacing: 1 }}>STARTING…</span>
            </div>
          )}
        </div>

        {/* ── RACE TRACKER TABLE ── */}
        <div style={{ margin: '0 14px', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(10px)', border: '1px solid rgba(201,162,39,0.32)', borderRadius: 14, padding: '10px 12px', flexShrink: 0 }}>
          {/* Column header row */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ width: 100, flexShrink: 0, fontFamily: 'monospace', fontSize: 7, color: 'rgba(201,162,39,0.45)', letterSpacing: 3 }}>LAP</div>
            <div style={{ flex: 1, display: 'flex', position: 'relative', height: 14 }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontSize: i === 8 ? 12 : 7, color: i === 8 ? '#C9A227' : 'rgba(255,255,255,0.18)', lineHeight: 1 }}>
                  {i === 8 ? '👑' : i + 1}
                </div>
              ))}
            </div>
            <div style={{ width: 30, flexShrink: 0 }} />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,#C9A22750,transparent)', marginBottom: 6 }} />

          {/* Queen rows */}
          {SUITS.map(suit => {
            const owner     = state.players.find(p => p.suit === suit);
            const pos       = state.positions[suit] ?? 0;
            const isPulse   = flipAnim === suit;
            const isMe      = myPlayer?.suit === suit;
            const isLeading = pos === maxPos && maxPos > 0;
            const glowColor = TRACK_GLOW[suit];
            const isRed     = suit === 'hearts' || suit === 'diamonds';

            return (
              <div key={suit} style={{
                display: 'flex', alignItems: 'center', gap: 0, marginBottom: 4,
                background: 'transparent',
                borderRadius: 8, padding: '3px 0',
                borderLeft: isMe ? '2px solid rgba(201,162,39,0.35)' : '2px solid transparent',
              }}>
                {/* Left label */}
                <div style={{ width: 100, flexShrink: 0, paddingLeft: isMe ? 4 : 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 16, color: isRed ? '#e53935' : '#cccccc', lineHeight: 1, flexShrink: 0 }}>{SUIT_SYMBOLS[suit]}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 7, fontWeight: 700, color: isRed ? '#e5393599' : 'rgba(255,255,255,0.75)', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{QUEEN_NICKNAMES[suit].toUpperCase()}</div>
                    {owner && <div style={{ fontFamily: 'monospace', fontSize: 6.5, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{owner.name}</div>}
                  </div>
                </div>

                {/* Track */}
                <div style={{ flex: 1, height: 52, position: 'relative', background: 'rgba(0,0,0,0.45)', borderRadius: 5, overflow: 'visible' }}>
                  {/* Grid lines */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i / 9) * 100}%`, width: 1, background: i === 9 ? '#C9A22780' : 'rgba(255,255,255,0.05)', zIndex: 1 }} />
                  ))}
                  {/* Finish line */}
                  <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 2, background: '#C9A22790', zIndex: 1 }} />

                  {/* Lightning trail — wide blur layer (spread glow) */}
                  {pos > 0 && (
                    <div style={{
                      position: 'absolute', top: 'calc(48% - 2px)', left: 0,
                      width: `calc(${(pos / 9) * 100}% - 4px)`,
                      height: 8,
                      background: `linear-gradient(90deg, transparent, ${glowColor}66 44%, ${glowColor}99)`,
                      filter: 'blur(4px)',
                      borderRadius: 2, zIndex: 2,
                      transition: 'width 0.5s ease-out',
                      pointerEvents: 'none',
                    }} />
                  )}
                  {/* Lightning trail — sharp primary line */}
                  {pos > 0 && (
                    <div style={{
                      position: 'absolute', top: '48%', left: 0,
                      width: `calc(${(pos / 9) * 100}% - 4px)`,
                      height: 3,
                      background: `linear-gradient(90deg, transparent, ${glowColor}70 44%, ${glowColor}cc, ${glowColor})`,
                      boxShadow: `0 0 8px ${glowColor}, 0 0 20px ${glowColor}e0`,
                      filter: 'blur(0.5px)',
                      borderRadius: 2, zIndex: 3,
                      animation: isLeading ? 'll-energy 1.5s ease-in-out infinite' : 'none',
                      transition: 'width 0.5s ease-out',
                    }} />
                  )}

                  {/* Sliding Queen card — centred in the correct lap column */}
                  {pos > 0 && (
                    <div style={{
                      position: 'absolute', top: '50%',
                      left: `calc(${((pos - 0.5) / 9) * 100}% - 18px)`,
                      transform: 'translateY(-50%)',
                      transition: 'left 0.5s ease-out',
                      width: 36, height: 50,
                      background: 'linear-gradient(160deg,#f5ead6 0%,#e8d5aa 55%,#d4b87a 100%)',
                      borderRadius: 5, zIndex: 3,
                      border: isLeading ? '1.5px solid #C9A227' : `1px solid ${isRed ? '#e5393560' : 'rgba(255,255,255,0.35)'}`,
                      boxShadow: isLeading
                        ? `0 0 14px ${glowColor}bb, 0 2px 8px rgba(0,0,0,0.7)`
                        : `0 0 6px ${glowColor}44, 0 2px 6px rgba(0,0,0,0.6)`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      animation: isPulse ? 'll-queen-pulse 0.5s ease-out' : 'none',
                    }}>
                      <span style={{ position: 'absolute', top: 2, left: 3, fontSize: 7, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif' }}>Q</span>
                      <span style={{ fontSize: 16, color: SUIT_COLORS[suit], lineHeight: 1 }}>{SUIT_SYMBOLS[suit]}</span>
                      <span style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 7, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif', transform: 'rotate(180deg)' }}>Q</span>
                    </div>
                  )}
                </div>

                {/* Lap score */}
                <div style={{ width: 30, flexShrink: 0, textAlign: 'center' }}>
                  <div style={{
                    background: 'rgba(0,0,0,0.5)', border: `1px solid ${isLeading ? '#C9A227' : 'rgba(201,162,39,0.2)'}`,
                    borderRadius: 6, padding: '3px 0',
                    fontFamily: 'Anton, Georgia, serif', fontSize: 16,
                    color: isLeading ? '#C9A227' : 'rgba(255,255,255,0.55)',
                    boxShadow: isLeading ? '0 0 8px #C9A22740' : 'none',
                  }}>{pos}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── HISTORY BAR ── */}
        <div style={{ margin: '8px 14px 14px', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(10px)', border: '1px solid rgba(201,162,39,0.2)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const, scrollbarWidth: 'none' as const }}>
          <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#C9A22799', letterSpacing: 2, flexShrink: 0 }}>HISTORY</span>
          <div style={{ width: 1, height: 24, background: 'rgba(201,162,39,0.3)', flexShrink: 0 }} />
          {state.flippedCards.length === 0 ? (
            <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.2)' }}>No cards flipped yet</span>
          ) : (
            [...state.flippedCards].reverse().map((c, i) => {
              const isRed = c.suit === 'hearts' || c.suit === 'diamonds';
              return (
                <div key={i} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '3px 6px', borderRadius: 5, background: i === 0 ? 'rgba(201,162,39,0.1)' : 'rgba(255,255,255,0.03)', border: i === 0 ? '1px solid rgba(201,162,39,0.35)' : '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 800, color: isRed ? '#e53935' : 'rgba(255,255,255,0.75)', lineHeight: 1 }}>{c.rank}</span>
                  <span style={{ fontSize: 11, color: isRed ? '#e53935' : 'rgba(255,255,255,0.65)', lineHeight: 1 }}>{SUIT_SYMBOLS[c.suit]}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Side bets — compact strip */}
        {state.sideBets.length > 0 && (
          <div style={{ margin: '0 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {state.sideBets.map((b, i) => (
              <span key={i} style={{ fontFamily: 'monospace', fontSize: 8, color: SUIT_BG_COLORS[b.suit], background: 'rgba(0,0,0,0.4)', border: `1px solid ${SUIT_BG_COLORS[b.suit]}30`, borderRadius: 5, padding: '3px 7px' }}>
                {b.playerName} · {b.amount.toLocaleString()} on {QUEEN_NICKNAMES[b.suit]}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── RESULT ──────────────────────────────────────────────────────────────────
  if (state.phase === 'RESULTS') {
    const winner      = state.winner!;
    const winPlayer   = state.players.find(p => p.suit === winner);
    const isWinner    = winPlayer?.id === identity.id;
    const myWager     = myPlayer?.wager ?? 0;
    const myBets      = state.sideBets.filter(b => b.playerId === identity.id);
    const myBetsTotal = myBets.reduce((s, b) => s + b.amount, 0);
    const myPayout    = isWinner ? state.pot : 0;
    const myBetPayout = myBets.filter(b => b.suit === winner).reduce((s, b) => s + Math.floor(b.amount * 2.5), 0);
    const myDelta     = myPayout + myBetPayout - myWager - myBetsTotal;
    const isRed = (s: string) => s === 'hearts' || s === 'diamonds';

    return (
      <div style={{
        minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column',
        backgroundColor: '#120c08',
        backgroundImage: "url('/ladyluck/ladyluck-race-bg.png')", backgroundSize: 'cover',
        backgroundPosition: 'center top', backgroundAttachment: 'fixed',
        overflowX: 'hidden',
      }}>
        <style>{`
          @keyframes ll-res-crown { 0%,100%{opacity:0.8;transform:scale(1)} 50%{opacity:1;transform:scale(1.1)} }
          @keyframes ll-winner-glow { 0%,100%{box-shadow:0 0 22px #C9A227aa,0 0 44px #C9A22740,0 6px 24px rgba(0,0,0,0.8)} 50%{box-shadow:0 0 38px #C9A227cc,0 0 70px #C9A22760,0 6px 24px rgba(0,0,0,0.8)} }
          @keyframes ll-result-in { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
          @keyframes ll-title-in  { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        `}</style>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 14px 10px', flexShrink: 0 }}>

          {/* LEFT — back */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, width: 52 }}>
            <button onClick={goBack} data-testid="button-results-back"
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
            <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>BACK</span>
          </div>

          {/* CENTER — crown + title */}
          <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
            <img src="/crews/icon-crown.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 3px', animation: 'll-res-crown 3s ease-in-out infinite' }} />
            <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 40, fontWeight: 900, letterSpacing: 4, background: 'linear-gradient(180deg,#f5d76e 0%,#C9A227 38%,#7a5a10 68%,#C9A227 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 0.88, animation: 'll-title-in 0.6s ease-out both' }}>RACE OVER</div>
          </div>

          {/* RIGHT — CGP box */}
          <div style={{ flexShrink: 0, width: 52, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 7, padding: '4px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <img src="/ladyluck/horses/horse-champion.png" alt="" style={{ width: 18, height: 18, objectFit: 'cover', filter: 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)' }} />
              <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 9, color: '#C9A227', letterSpacing: 2 }}>CGP</div>
              <div style={{ fontFamily: 'monospace', fontSize: 4.5, color: 'rgba(255,255,255,0.28)', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>LOYALTY NEVER LEAVES</div>
            </div>
          </div>
        </div>

        {/* ── WINNER CARD ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 14px 10px', animation: 'll-result-in 0.55s ease-out 0.1s both', flexShrink: 0 }}>
          <img src="/crews/icon-crown.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.4)', display: 'block' }} />
          {/* Large winner parchment card */}
          <div style={{
            width: 96, height: 134,
            background: 'linear-gradient(160deg,#f5ead6 0%,#e8d5aa 55%,#d4b87a 100%)',
            borderRadius: 12, position: 'relative',
            border: '3px solid #C9A227',
            animation: 'll-winner-glow 2.2s ease-in-out infinite',
          }}>
            <span style={{ position: 'absolute', top: 6, left: 8, fontSize: 16, fontWeight: 900, color: SUIT_COLORS[winner], fontFamily: 'serif' }}>Q</span>
            <span style={{ position: 'absolute', top: 24, left: 8, fontSize: 13, color: SUIT_COLORS[winner] }}>{SUIT_SYMBOLS[winner]}</span>
            <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 44, color: SUIT_COLORS[winner], lineHeight: 1 }}>{SUIT_SYMBOLS[winner]}</span>
            <span style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 16, fontWeight: 900, color: SUIT_COLORS[winner], fontFamily: 'serif', transform: 'rotate(180deg)' }}>Q</span>
            <span style={{ position: 'absolute', bottom: 24, right: 8, fontSize: 13, color: SUIT_COLORS[winner], transform: 'rotate(180deg)' }}>{SUIT_SYMBOLS[winner]}</span>
          </div>
          {/* Queen name */}
          <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 22, letterSpacing: 3, background: 'linear-gradient(180deg,#f5d76e,#C9A227)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontVariant: 'small-caps' }}>{QUEEN_NICKNAMES[winner]}</div>
          {/* Decorative wins line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 18, height: 1, background: 'linear-gradient(90deg,transparent,#C9A22799)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#C9A22799', letterSpacing: 2 }}>›</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', letterSpacing: 1, whiteSpace: 'nowrap' }}>
              {(winPlayer?.name ?? 'Unknown').toUpperCase()} WINS {state.pot.toLocaleString()} CHIPS
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#C9A22799', letterSpacing: 2 }}>‹</span>
            <div style={{ width: 18, height: 1, background: 'linear-gradient(90deg,#C9A22799,transparent)' }} />
          </div>
        </div>

        {/* ── ALL 4 QUEENS ROW ── */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '0 14px 10px', animation: 'll-result-in 0.55s ease-out 0.2s both', flexShrink: 0 }}>
          {SUITS.map(suit => {
            const owner   = state.players.find(p => p.suit === suit);
            const pos     = state.positions[suit] ?? 0;
            const isWin   = suit === winner;
            const isYours = myPlayer?.suit === suit;
            return (
              <div key={suit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: '0 0 calc(25% - 6px)', opacity: isWin ? 1 : 0.55 }}>
                {/* Parchment queen card */}
                <div style={{
                  width: '100%', aspectRatio: '0.72', maxWidth: 72,
                  background: 'linear-gradient(160deg,#f5ead6 0%,#e8d5aa 55%,#d4b87a 100%)',
                  borderRadius: 8, position: 'relative',
                  border: isWin ? '2px solid #C9A227' : `1px solid ${isRed(suit) ? '#e5393550' : 'rgba(255,255,255,0.28)'}`,
                  boxShadow: isWin ? '0 0 16px #C9A22790, 0 4px 14px rgba(0,0,0,0.7)' : '0 3px 10px rgba(0,0,0,0.55)',
                }}>
                  <span style={{ position: 'absolute', top: 3, left: 5, fontSize: 10, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif' }}>Q</span>
                  <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 26, color: SUIT_COLORS[suit], lineHeight: 1 }}>{SUIT_SYMBOLS[suit]}</span>
                  <span style={{ position: 'absolute', bottom: 3, right: 5, fontSize: 10, fontWeight: 900, color: SUIT_COLORS[suit], fontFamily: 'serif', transform: 'rotate(180deg)' }}>Q</span>
                </div>
                {/* Queen name */}
                <div style={{ fontFamily: 'monospace', fontSize: 7, fontWeight: 700, color: isWin ? '#C9A227' : 'rgba(255,255,255,0.45)', letterSpacing: 1, textAlign: 'center', fontVariant: 'small-caps', whiteSpace: 'nowrap' }}>{QUEEN_NICKNAMES[suit]}</div>
                {/* Player name */}
                <div style={{ fontFamily: 'monospace', fontSize: 6.5, color: isYours ? '#C9A22799' : 'rgba(255,255,255,0.3)', textAlign: 'center', letterSpacing: 0.5 }}>
                  {isYours ? '★ ' : ''}{(owner?.name ?? '—').slice(0, 8)}
                </div>
                {/* Lap count */}
                <div style={{ fontFamily: 'monospace', fontSize: 7, color: isWin ? '#C9A22780' : 'rgba(255,255,255,0.22)' }}>{pos}/9</div>
              </div>
            );
          })}
        </div>

        {/* ── YOUR RESULT PANEL ── */}
        <div style={{ margin: '0 14px 10px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', border: `1px solid ${myDelta >= 0 ? 'rgba(16,185,129,0.35)' : 'rgba(229,57,53,0.35)'}`, borderRadius: 12, padding: '12px 14px', position: 'relative', overflow: 'hidden', animation: 'll-result-in 0.55s ease-out 0.3s both', flexShrink: 0 }}>
          {/* Horse watermarks */}
          <img src="/ladyluck/horses/horse-thoroughbred.png" alt="" style={{ position: 'absolute', left: -8, bottom: -4, width: 56, height: 56, objectFit: 'contain', opacity: 0.07, filter: 'sepia(1) saturate(2)', transform: 'scaleX(-1)', pointerEvents: 'none' }} />
          <img src="/ladyluck/horses/horse-thoroughbred.png" alt="" style={{ position: 'absolute', right: -8, bottom: -4, width: 56, height: 56, objectFit: 'contain', opacity: 0.07, filter: 'sepia(1) saturate(2)', pointerEvents: 'none' }} />
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(201,162,39,0.6)', letterSpacing: 3, marginBottom: 5, textAlign: 'center', fontVariant: 'small-caps' }}>YOUR RESULT</div>
          <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 36, letterSpacing: 2, color: myDelta >= 0 ? '#10b981' : '#e53935', textAlign: 'center', lineHeight: 1 }}>
            {myDelta >= 0 ? '+' : ''}{myDelta.toLocaleString()}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.18)', textAlign: 'center', marginTop: 5, letterSpacing: 1 }}>
            WAGER {myWager.toLocaleString()} · SIDE BETS {myBetsTotal.toLocaleString()} · PAYOUT {(myPayout + myBetPayout).toLocaleString()}
          </div>
        </div>

        {/* ── ALL PLAYERS PANEL ── */}
        <div style={{ margin: '0 14px 10px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', border: '1px solid rgba(201,162,39,0.22)', borderRadius: 12, padding: '10px 14px', animation: 'll-result-in 0.55s ease-out 0.38s both', flexShrink: 0 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(201,162,39,0.55)', letterSpacing: 3, marginBottom: 8, fontVariant: 'small-caps' }}>ALL PLAYERS</div>
          {state.players.filter(p => p.presence !== 'open').map(p => {
            const won   = p.suit === winner;
            const delta = won ? state.pot - p.wager : -p.wager;
            const isMe  = p.id === identity.id;
            const isBot = p.presence === 'bot';
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.suit && <span style={{ fontSize: 15, color: isRed(p.suit) ? '#e53935' : '#cccccc', lineHeight: 1 }}>{SUIT_SYMBOLS[p.suit]}</span>}
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: isMe ? '#C9A227' : 'rgba(255,255,255,0.7)' }}>{p.name}</span>
                  {isMe && <span style={{ fontFamily: 'monospace', fontSize: 7, color: '#C9A22799', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 3, padding: '1px 4px', letterSpacing: 1 }}>YOU</span>}
                  {isBot && <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 4px', letterSpacing: 1 }}>BOT</span>}
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: delta >= 0 ? '#10b981' : '#e53935' }}>
                  {delta >= 0 ? '+' : ''}{delta.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── NEXT RACE / LEAVE ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 14px 24px', animation: 'll-result-in 0.55s ease-out 0.45s both', flexShrink: 0 }}>
          {state.resultsTimeLeft !== null && state.resultsTimeLeft > 0 && (
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(201,162,39,0.55)', letterSpacing: 2, textAlign: 'center' }}>
              NEXT RACE STARTING IN <span style={{ color: '#C9A227', fontWeight: 700 }}>{state.resultsTimeLeft}</span>
            </div>
          )}
          <button
            data-testid="button-leave-table"
            onClick={goBack}
            style={{ width: '100%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 24, padding: '13px 0', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', letterSpacing: 2 }}>
            LEAVE TABLE
          </button>
        </div>
      </div>
    );
  }

  // ── BET ─────────────────────────────────────────────────────────────────────
  if (state.phase === 'BET') {
    const betTime   = state.betTimeLeft ?? 0;
    const isUrgent  = betTime > 0 && betTime <= 10;
    const mySuit    = myPlayer?.suit ?? null;
    const myWagered = myPlayer?.wagered ?? false;
    const amActive  = myPlayer !== undefined && myPlayer.presence !== 'open';
    const effectiveWager = wagerAmt < room.minWager ? room.minWager : wagerAmt;
    const activeCount   = state.players.filter(p => p.presence !== 'open').length;
    const wageredCount  = state.players.filter(p => p.wagered).length;
    const betIsRed = (s: string) => s === 'hearts' || s === 'diamonds';

    return (
      <div style={{
        minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column',
        backgroundColor: '#120c08',
        backgroundImage: "url('/ladyluck/ladyluck-race-bg.png')", backgroundSize: 'cover',
        backgroundPosition: 'center top', backgroundAttachment: 'fixed',
        overflowX: 'hidden', padding: '0 0 24px',
      }}>
        <style>{`
          @keyframes ll-bet-crown { 0%,100%{opacity:0.8;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
          @keyframes ll-bet-urgent { 0%,100%{opacity:1} 50%{opacity:0.5} }
        `}</style>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 10px', flexShrink: 0 }}>
          {/* LEFT — back */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, width: 60 }}>
            <button onClick={goBack} data-testid="button-bet-back"
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
            <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>BACK</span>
          </div>

          {/* CENTER — crown + title + subtitle */}
          <div style={{ flex: 1, textAlign: 'center', padding: '0 4px' }}>
            <img src="/crews/icon-crown.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', display: 'block', margin: '0 auto 2px', animation: 'll-bet-crown 3s ease-in-out infinite' }} />
            <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 28, fontWeight: 900, letterSpacing: 3, background: 'linear-gradient(180deg,#f5d76e 0%,#C9A227 40%,#7a5a10 72%,#C9A227 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 1, marginBottom: 2 }}>LADY LUCK</div>
            <div style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(201,162,39,0.5)', letterSpacing: 3 }}>NEXT RACE</div>
          </div>

          {/* RIGHT — CGP box */}
          <div style={{ flexShrink: 0, width: 60, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 7, padding: '5px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <img src="/ladyluck/horses/horse-champion.png" alt="" style={{ width: 18, height: 18, objectFit: 'cover', filter: 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)' }} />
              <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 9, color: '#C9A227', letterSpacing: 2 }}>CGP</div>
            </div>
          </div>
        </div>

        {/* ── TIMER PANEL ── */}
        <div style={{ margin: '0 14px 10px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', border: `1px solid ${isUrgent ? 'rgba(229,57,53,0.55)' : 'rgba(201,162,39,0.25)'}`, borderRadius: 12, padding: '10px 14px', transition: 'border-color 0.3s', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: isUrgent ? '#e53935' : '#C9A227', letterSpacing: 2 }}>PLACE YOUR BET</div>
            <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 28, color: isUrgent ? '#e53935' : '#C9A227', lineHeight: 1, transition: 'color 0.3s', animation: isUrgent ? 'll-bet-urgent 0.8s ease-in-out infinite' : 'none' }}>
              {betTime}<span style={{ fontSize: 13, opacity: 0.7 }}>s</span>
            </div>
          </div>
          <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(betTime / 30) * 100}%`, background: isUrgent ? 'linear-gradient(90deg,#e5393580,#e53935)' : 'linear-gradient(90deg,#C9A22780,#C9A227)', borderRadius: 2, transition: 'width 1s linear, background 0.3s' }} />
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.28)', marginTop: 5, textAlign: 'right', letterSpacing: 1 }}>
            {wageredCount}/{activeCount} LOCKED IN
          </div>
        </div>

        {/* ── PLAYER STATUS GRID ── */}
        <div style={{ display: 'flex', gap: 5, margin: '0 14px 10px', flexShrink: 0 }}>
          {state.players.map(p => {
            const isOpen = p.presence === 'open';
            const isBot  = p.presence === 'bot';
            const isMe   = p.id === identity.id;
            return (
              <div key={p.id} style={{
                flex: 1, padding: '7px 4px 6px', borderRadius: 8, textAlign: 'center',
                background: isOpen ? 'rgba(0,0,0,0.25)' : p.wagered ? 'rgba(16,185,129,0.1)' : 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${isOpen ? 'rgba(255,255,255,0.07)' : p.wagered ? 'rgba(16,185,129,0.4)' : 'rgba(201,162,39,0.25)'}`,
                boxShadow: isMe ? 'inset 0 0 0 1px rgba(201,162,39,0.2)' : 'none',
              }}>
                {isOpen ? (
                  <div style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.18)', letterSpacing: 1 }}>OPEN</div>
                ) : (
                  <>
                    {p.suit ? (
                      <div style={{ fontSize: 18, color: betIsRed(p.suit) ? '#e53935' : '#d0d0d0', lineHeight: 1, marginBottom: 2 }}>{SUIT_SYMBOLS[p.suit]}</div>
                    ) : (
                      <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1px dashed rgba(201,162,39,0.3)' }} />
                      </div>
                    )}
                    {p.wagered ? (
                      <div style={{ fontFamily: 'monospace', fontSize: 6, color: '#10b981', letterSpacing: 0.5, marginBottom: 1 }}>✓ {p.wager.toLocaleString()}</div>
                    ) : (
                      <div style={{ fontFamily: 'monospace', fontSize: 6, color: p.suit ? 'rgba(201,162,39,0.5)' : 'rgba(255,255,255,0.2)', letterSpacing: 1, marginBottom: 1 }}>{p.suit ? 'BETTING' : 'PICKING'}</div>
                    )}
                    <div style={{ fontFamily: 'monospace', fontSize: 6, color: isMe ? '#C9A22799' : 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: 0.5 }}>
                      {isMe ? '★' : isBot ? '⚙' : ''}{p.name.slice(0, 6)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── ACTION AREA ── */}
        <div style={{ margin: '0 14px', flexShrink: 0 }}>
          {amActive ? (
            myWagered ? (
              /* Locked-in confirmation */
              <div style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 12, padding: '18px 14px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 20, color: '#10b981', marginBottom: 5 }}>✓</div>
                <div style={{ fontFamily: 'Anton, Georgia, serif', fontSize: 16, color: '#10b981', letterSpacing: 2 }}>
                  {mySuit ? SUIT_SYMBOLS[mySuit] : ''} {mySuit ? QUEEN_NICKNAMES[mySuit].toUpperCase() : ''} · {myPlayer?.wager.toLocaleString()} CHIPS
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 5, letterSpacing: 1 }}>
                  LOCKED IN — WAITING FOR OTHERS
                </div>
              </div>
            ) : mySuit === null ? (
              /* PICK YOUR QUEEN — CGP card backs */
              <div style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(201,162,39,0.25)', borderRadius: 14, padding: 14 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#C9A227', letterSpacing: 3, marginBottom: 12, textAlign: 'center' }}>PICK YOUR QUEEN</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {SUITS.map(suit => {
                    const taken = state.claimedSuits.includes(suit);
                    return (
                      <button
                        key={suit}
                        data-testid={`button-bet-suit-${suit}`}
                        disabled={taken}
                        onClick={() => handleSelectSuit(suit)}
                        style={{
                          flex: 1, padding: 0, borderRadius: 10,
                          cursor: taken ? 'not-allowed' : 'pointer',
                          background: 'transparent', border: 'none',
                          opacity: taken ? 0.38 : 1,
                          transition: 'opacity 0.2s',
                        }}>
                        {taken ? (
                          /* Face-up — claimed/revealed */
                          <div style={{
                            width: '100%', aspectRatio: '0.714',
                            borderRadius: 10,
                            background: 'linear-gradient(160deg,#f5ead6 0%,#e8d5aa 55%,#d4b87a 100%)',
                            border: `2px solid ${betIsRed(suit) ? '#e5393560' : 'rgba(255,255,255,0.25)'}`,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.55)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}>
                            <span style={{ fontSize: 24, color: SUIT_COLORS[suit], lineHeight: 1 }}>{SUIT_SYMBOLS[suit]}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 6, color: SUIT_COLORS[suit], letterSpacing: 0.5, textAlign: 'center', lineHeight: 1.3, opacity: 0.8 }}>{QUEEN_NICKNAMES[suit]}</span>
                          </div>
                        ) : (
                          /* Face-down — CGP card back */
                          <img
                            src="/ladyluck/card-back-cgp.png"
                            alt="card"
                            style={{
                              width: '100%', aspectRatio: '0.714',
                              borderRadius: 10, display: 'block',
                              border: '2px solid rgba(201,162,39,0.5)',
                              boxShadow: '0 6px 20px rgba(0,0,0,0.7), 0 0 14px rgba(201,162,39,0.2)',
                              objectFit: 'cover',
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Wager control */
              <div style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', border: `1px solid ${betIsRed(mySuit) ? 'rgba(229,57,53,0.35)' : 'rgba(201,162,39,0.25)'}`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 2 }}>
                    YOUR WAGER · {room.minWager.toLocaleString()}–{room.maxWager.toLocaleString()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'monospace', fontSize: 11, color: betIsRed(mySuit) ? '#e53935' : '#C9A227' }}>
                    <span style={{ fontSize: 16 }}>{SUIT_SYMBOLS[mySuit]}</span>
                    {QUEEN_NICKNAMES[mySuit]}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <button
                    onClick={() => setWagerAmt(v => Math.max(room.minWager, v - 100))}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <div style={{ flex: 1, textAlign: 'center', fontFamily: 'Anton, Georgia, serif', fontSize: 32, color: '#C9A227', lineHeight: 1 }}>
                    {effectiveWager.toLocaleString()}
                  </div>
                  <button
                    onClick={() => setWagerAmt(v => Math.min(room.maxWager, v + 100))}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
                <input
                  type="range" min={room.minWager} max={room.maxWager} step={100}
                  value={effectiveWager}
                  onChange={e => setWagerAmt(Number(e.target.value))}
                  data-testid="slider-bet-wager"
                  style={{ width: '100%', marginBottom: 12, accentColor: '#C9A227' }} />
                <button
                  data-testid="button-confirm-bet-wager"
                  onClick={() => { if (wagerAmt < room.minWager) setWagerAmt(room.minWager); handleWager(); }}
                  style={{ width: '100%', background: 'linear-gradient(135deg,#C9A227,#f5d76e,#C9A227)', color: '#0a0600', border: 'none', borderRadius: 24, padding: '13px 0', fontFamily: 'Anton, Georgia, serif', fontSize: 15, fontWeight: 900, cursor: 'pointer', letterSpacing: 2, boxShadow: '0 4px 20px rgba(201,162,39,0.45)' }}>
                  LOCK IN {effectiveWager.toLocaleString()} CHIPS
                </button>
              </div>
            )
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
              SPECTATING — JOIN A TABLE FROM THE LOBBY TO PLAY
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
