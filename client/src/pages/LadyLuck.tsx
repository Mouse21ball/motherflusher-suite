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

  if (claimed && suit) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{
          width: 72, height: 100, background: '#fff', borderRadius: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: `2px solid ${SUIT_COLORS[suit]}`, position: 'relative',
          boxShadow: `0 0 12px ${SUIT_COLORS[suit] === '#e53935' ? '#e5393540' : '#ffffff20'}, 0 2px 8px rgba(0,0,0,0.5)`,
          animation: 'll-card-appear 0.4s ease-out',
        }}>
          <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 12, fontWeight: 800, color: SUIT_COLORS[suit] }}>Q</span>
          <span style={{ fontSize: 28, color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
          <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 12, fontWeight: 800, color: SUIT_COLORS[suit], transform: 'rotate(180deg)' }}>Q</span>
        </div>
        {claimedBy && <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{claimedBy}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        onClick={canPick ? onPick : undefined}
        style={{
          width: 72, height: 100,
          background: peeked ? '#fff' : 'linear-gradient(135deg, #1a237e 0%, #0d1362 100%)',
          borderRadius: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: canPick ? '2px solid #e53935' : peeked ? '2px solid #C9A227' : '2px solid rgba(255,255,255,0.12)',
          boxShadow: canPick ? '0 0 14px #e5393550, 0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.5)',
          cursor: canPick ? 'pointer' : 'default',
          position: 'relative',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {peeked && suit ? (
          <>
            <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 12, fontWeight: 800, color: SUIT_COLORS[suit] }}>Q</span>
            <span style={{ fontSize: 28, color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
            <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 12, fontWeight: 800, color: SUIT_COLORS[suit], transform: 'rotate(180deg)' }}>Q</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 32, color: 'rgba(255,255,255,0.12)' }}>?</span>
            {canPick && <span style={{ position: 'absolute', bottom: 6, fontSize: 9, fontFamily: 'monospace', color: '#e53935', fontWeight: 700, letterSpacing: 1 }}>PICK</span>}
          </>
        )}
      </div>
      {!claimed && suit && !peeked && (
        <button
          onClick={() => setPeeked(true)}
          style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 1, padding: '1px 4px' }}
        >
          PEEK
        </button>
      )}
      {peeked && suit && !claimed && (
        <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#C9A227', letterSpacing: 1 }}>PEEKED</span>
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

// ── Room counts hook ───────────────────────────────────────────────────────────

function useLLRoomCounts() {
  const [counts, setCounts] = useState<Record<LadyLuckRoom, number>>({ pony: 0, thoroughbred: 0, champion: 0 });
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(apiUrl('/api/ladyluck/tables'));
        if (!res.ok) return;
        const data: { tableId: string; roomType: LadyLuckRoom; playerCount: number }[] = await res.json();
        const c: Record<LadyLuckRoom, number> = { pony: 0, thoroughbred: 0, champion: 0 };
        for (const t of data) c[t.roomType] = (c[t.roomType] ?? 0) + t.playerCount;
        setCounts(c);
      } catch {}
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);
  return counts;
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
  const [sideBetSuit, setSideBetSuit] = useState<LadyLuckSuit | null>(null);
  const [sideBetAmt, setSideBetAmt]   = useState(0);

  const wsRef    = useRef<WebSocket | null>(null);
  const identity = ensurePlayerIdentity();
  const roomCounts = useLLRoomCounts();

  // ── WebSocket connection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!tableId) return;
    let ws: WebSocket | null = null;
    let alive = true;

    setWsError(null);
    setConnTimedOut(false);

    // 5-second connection timeout
    const timeoutId = setTimeout(() => {
      if (alive && !state) setConnTimedOut(true);
    }, 5000);

    const connect = async () => {
      try {
        const tokenRes = await apiFetch('/api/auth/ws-token');
        let token: string | null = null;
        if (tokenRes.ok) { const j = await tokenRes.json(); token = j.token ?? null; }

        console.log('[ladyluck] WS connecting, tableId from state:', tableId, '| wsUrl:', wsUrl(token));
        ws = new WebSocket(wsUrl(token));
        wsRef.current = ws;

        ws.onopen = () => {
          if (!alive) { ws?.close(); return; }
          setConnected(true);
          const joinMsg = { type: 'll:join', tableId, playerId: identity.id, name: identity.name };
          console.log('[ladyluck] WS open — sending ll:join with tableId:', tableId, '| full msg:', joinMsg);
          ws?.send(JSON.stringify(joinMsg));
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string);
            if (msg.type === 'll:state') {
              clearTimeout(timeoutId);
              setState(msg.state as LadyLuckState);
              setWagerAmt(v => v || LADY_LUCK_ROOMS[(msg.state as LadyLuckState).roomType].minWager);
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
          console.error('[ladyluck] ws.onerror fired:', ev);
          setWsError('WebSocket connection error');
        };

        ws.onclose = (ev) => {
          if (!alive) return;
          setConnected(false);
          if (!state) {
            console.warn('[ladyluck] WS closed before state received — code:', ev.code, 'reason:', ev.reason);
          }
        };
      } catch (err) {
        console.error('[ladyluck] connect() threw:', err);
        setWsError(err instanceof Error ? err.message : String(err));
      }
    };

    connect();
    return () => { alive = false; clearTimeout(timeoutId); ws?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const goBack = () => { setTableId(null); setState(null); navigate('/ladyluck'); };

  const handleJoinRoom = async (roomType: LadyLuckRoom) => {
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
    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <style>{`@keyframes ll-card-appear { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }`}</style>

        {/* Header */}
        <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} data-testid="button-back-home"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>
            ← Home
          </button>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 26, color: '#e53935', letterSpacing: 2 }}>LADY LUCK</div>
        </div>
        <div style={{ padding: '4px 16px 12px', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 2 }}>PICK YOUR QUEEN. RUN THE RACE.</div>

        {/* Queen nicknames preview */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
          {SUITS.map(suit => (
            <div key={suit} style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${SUIT_BG_COLORS[suit] === '#e53935' ? '#e5393528' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 10, padding: '8px 6px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, color: SUIT_BG_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.45)', marginTop: 3, lineHeight: 1.4 }}>{QUEEN_NICKNAMES[suit]}</div>
            </div>
          ))}
        </div>

        {/* Room cards */}
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(Object.entries(ROOM_CFGS) as [LadyLuckRoom, typeof ROOM_CFGS[LadyLuckRoom]][]).map(([id, cfg]) => (
            <div key={id} data-testid={`card-room-${id}`}
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${cfg.color}44`, borderRadius: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 19, color: cfg.color, letterSpacing: 1 }}>{cfg.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>WAGER {cfg.range} CHIPS</div>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.22)', marginTop: 2 }}>SIDE BET MAX {cfg.sideBetMax.toLocaleString()} · PAYS 2.5×</div>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 3 }}>
                  {roomCounts[id] > 0 ? `${roomCounts[id]} players online` : 'No active tables'}
                </div>
              </div>
              <button
                data-testid={`button-join-${id}`}
                onClick={() => handleJoinRoom(id)}
                disabled={joining}
                style={{ background: cfg.color, color: '#fff', border: 'none', borderRadius: 22, padding: '10px 20px', fontWeight: 800, fontSize: 13, cursor: joining ? 'not-allowed' : 'pointer', letterSpacing: 1, opacity: joining ? 0.6 : 1, flexShrink: 0 }}>
                JOIN
              </button>
            </div>
          ))}
        </div>

        {joinError && (
          <div style={{ margin: '12px 16px 0', background: 'rgba(229,57,53,0.12)', border: '1px solid #e5393560', borderRadius: 10, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#ff6b6b' }}>
            ✕ {joinError}
          </div>
        )}

        <div style={{ margin: '14px 16px 24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.8 }}>
            4 Queens race to 9 card flips. Pick clockwise — dealer gets last. Wager chips, place side bets. First to 9 wins the pot. Side bets pay 2.5×.
          </div>
        </div>
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
    const isHost = state.players[0]?.id === identity.id;
    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={goBack} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>← Back</button>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 22, color: '#e53935', letterSpacing: 2 }}>LADY LUCK</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 10, color: roomCfg.color, letterSpacing: 2, textTransform: 'uppercase' }}>{state.roomType}</div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#C9A227', letterSpacing: 2, marginBottom: 10 }}>PLAYERS IN LOBBY</div>
          {state.players.map(p => {
            const isBot  = p.presence === 'bot';
            const isMe   = p.id === identity.id;
            const isHost = p.id === state.players[0]?.id;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isBot ? 'rgba(255,255,255,0.2)' : isMe ? '#C9A227' : '#10b981', flexShrink: 0 }} />
                <span style={{ fontFamily: 'monospace', fontSize: 13, color: isBot ? 'rgba(255,255,255,0.35)' : isMe ? '#C9A227' : '#fff', fontStyle: isBot ? 'italic' : 'normal' }}>
                  {p.name}{isMe ? ' (you)' : ''}
                </span>
                {isBot && (
                  <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: 1, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 3px' }}>BOT</span>
                )}
                {!isBot && isHost && <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>HOST</span>}
              </div>
            );
          })}
          {Array.from({ length: 4 - state.players.length }).map((_, i) => (
            <div key={`open-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.18)' }}>Open seat</span>
            </div>
          ))}
        </div>

        {state.startingIn !== null ? (
          <div style={{ background: '#1a1a2e', border: '1px solid #e53935', borderRadius: 24, padding: '14px 0', textAlign: 'center', fontWeight: 800, fontSize: 16, letterSpacing: 2, color: '#e53935', fontFamily: 'monospace' }}>
            Starting in {state.startingIn}…
          </div>
        ) : isHost ? (
          <button
            data-testid="button-ll-start"
            onClick={handleStart}
            disabled={state.players.length < 2}
            style={{ background: state.players.length >= 2 ? '#e53935' : 'rgba(255,255,255,0.07)', color: '#fff', border: 'none', borderRadius: 24, padding: '14px 0', fontWeight: 800, fontSize: 15, cursor: state.players.length >= 2 ? 'pointer' : 'not-allowed', letterSpacing: 1 }}>
            {state.players.length >= 2 ? `START GAME (${state.players.length} players)` : 'Waiting for 2+ players…'}
          </button>
        ) : (
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: 12 }}>
            Waiting for host to start…
          </div>
        )}
      </div>
    );
  }

  // ── SELECT ──────────────────────────────────────────────────────────────────
  if (state.phase === 'SELECT') {
    const myIdx      = state.players.findIndex(p => p.id === identity.id);
    const isMyTurn   = myIdx !== -1 && state.currentPickIndex === myIdx;
    const isDealer   = myIdx === state.dealerIndex;
    const pickerPlayer = state.players[state.currentPickIndex] ?? null;
    const dealerAutoGets = isDealer && state.claimedSuits.length >= state.players.length - 1;

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
        <style>{`
          @keyframes ll-card-appear { from{opacity:0;transform:scale(0.85) rotateY(-20deg)} to{opacity:1;transform:scale(1) rotateY(0deg)} }
          @keyframes ll-your-turn-pulse { 0%,100%{box-shadow:0 0 0 0 #e5393530} 50%{box-shadow:0 0 0 8px #e5393510} }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 22, color: '#e53935', letterSpacing: 2 }}>LADY LUCK</div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', letterSpacing: 2 }}>CHOOSE YOUR QUEEN</div>
        </div>

        {/* Pick order row */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.28)', letterSpacing: 2, marginBottom: 8 }}>PICK ORDER</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {state.players.map((p, idx) => {
              const isCurrent = idx === state.currentPickIndex;
              const isDlr     = idx === state.dealerIndex;
              const hasPicked = p.suit !== null;
              return (
                <div key={p.id} style={{
                  flex: 1, padding: '6px 4px', borderRadius: 8, textAlign: 'center',
                  background: isCurrent ? 'rgba(201,162,39,0.15)' : hasPicked ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isCurrent ? '#C9A22770' : hasPicked ? '#10b98135' : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <div style={{ fontSize: hasPicked && p.suit ? 15 : 10, color: isCurrent ? '#C9A227' : hasPicked ? '#10b981' : 'rgba(255,255,255,0.35)' }}>
                    {hasPicked && p.suit ? SUIT_SYMBOLS[p.suit] : isDlr ? '🎴' : `${idx + 1}`}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 7, color: p.id === identity.id ? '#C9A227' : 'rgba(255,255,255,0.3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isDlr ? 'DEALER' : p.name.slice(0, 6)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status */}
        <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, minHeight: 20 }}>
          {state.currentPickIndex === -1 ? (
            <span style={{ color: '#10b981' }}>All Queens assigned — moving to wager…</span>
          ) : dealerAutoGets ? (
            <span style={{ color: '#C9A227' }}>You're the dealer — you get the last Queen! 🎴</span>
          ) : isMyTurn ? (
            <span style={{ color: '#e53935', fontWeight: 700 }}>YOUR TURN — Pick a Queen!</span>
          ) : pickerPlayer ? (
            <span style={{ color: 'rgba(255,255,255,0.38)' }}>Waiting for {pickerPlayer.name}…</span>
          ) : null}
        </div>

        {/* 4 cards */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', paddingBottom: 20, animation: isMyTurn ? 'll-your-turn-pulse 1.5s ease-in-out infinite' : 'none', borderRadius: 14 }}>
          {SUITS.map(suit => {
            const claimer  = state.players.find(p => p.suit === suit);
            const isClaimed = state.claimedSuits.includes(suit);
            const canPick   = isMyTurn && !isClaimed;
            return (
              <div key={suit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <FaceDownCard
                  suit={suit}
                  claimed={isClaimed}
                  claimedBy={claimer?.name}
                  canPick={canPick}
                  onPick={() => handleSelectSuit(suit)}
                />
                {isClaimed && (
                  <div style={{ fontFamily: 'monospace', fontSize: 8, color: SUIT_BG_COLORS[suit] === '#e53935' ? '#e53935' : 'rgba(255,255,255,0.5)', textAlign: 'center', letterSpacing: 0.5 }}>
                    {QUEEN_NICKNAMES[suit]}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!isMyTurn && state.currentPickIndex !== -1 && (
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.18)' }}>
            Tap PEEK to privately preview a suit
          </div>
        )}
      </div>
    );
  }

  // ── WAGER ───────────────────────────────────────────────────────────────────
  if (state.phase === 'WAGER') {
    const alreadyWagered = myPlayer?.wagered ?? false;

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 22, color: '#e53935', letterSpacing: 2 }}>LADY LUCK</div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 2 }}>PLACE YOUR WAGER</div>
        </div>

        {/* Queen cards */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {SUITS.map(suit => {
            const owner   = state.players.find(p => p.suit === suit);
            const isYours = myPlayer?.suit === suit;
            return <QueenCard key={suit} suit={suit} isYours={isYours} playerName={owner?.name} />;
          })}
        </div>

        {/* Pot + wager status */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#C9A227' }}>POT {state.pot.toLocaleString()}</span>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            {state.players.filter(p => p.wagered).length}/{state.players.length} wagered
          </span>
        </div>

        {/* Per-player wager status row */}
        <div style={{ display: 'flex', gap: 6 }}>
          {state.players.map(p => (
            <div key={p.id} style={{
              flex: 1, padding: '6px 4px', borderRadius: 8, textAlign: 'center',
              background: p.wagered ? 'rgba(16,185,129,0.09)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${p.wagered ? '#10b98132' : 'rgba(255,255,255,0.05)'}`,
            }}>
              {p.suit && <div style={{ fontSize: 14, color: SUIT_BG_COLORS[p.suit] }}>{SUIT_SYMBOLS[p.suit]}</div>}
              <div style={{ fontFamily: 'monospace', fontSize: 7, color: p.wagered ? '#10b981' : 'rgba(255,255,255,0.28)', marginTop: 2 }}>
                {p.wagered ? `✓ ${p.wager.toLocaleString()}` : 'WAITING'}
              </div>
            </div>
          ))}
        </div>

        {/* Wager control */}
        {!alreadyWagered ? (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 10 }}>
              YOUR WAGER · {room.minWager.toLocaleString()}–{room.maxWager.toLocaleString()} CHIPS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <button onClick={() => setWagerAmt(v => Math.max(room.minWager, v - 100))}
                style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontFamily: 'Anton, Impact, sans-serif', fontSize: 28, color: '#C9A227' }}>{wagerAmt.toLocaleString()}</div>
              <button onClick={() => setWagerAmt(v => Math.min(room.maxWager, v + 100))}
                style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>+</button>
            </div>
            <input type="range" min={room.minWager} max={room.maxWager} step={100}
              value={wagerAmt} onChange={e => setWagerAmt(Number(e.target.value))}
              data-testid="slider-wager"
              style={{ width: '100%', marginBottom: 12, accentColor: '#C9A227' }} />
            <button
              data-testid="button-confirm-wager"
              onClick={handleWager}
              style={{ width: '100%', background: '#C9A227', color: '#000', border: 'none', borderRadius: 24, padding: '13px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}>
              CONFIRM WAGER
            </button>
          </div>
        ) : (
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid #10b98140', borderRadius: 12, padding: 14, textAlign: 'center', fontFamily: 'monospace', fontSize: 13, color: '#10b981' }}>
            ✓ Wager placed — {myPlayer?.wager.toLocaleString()} chips
          </div>
        )}

        {/* Side bets */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 10 }}>
            SIDE BET — max {room.maxSideBet.toLocaleString()} chips · pays 2.5×
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {SUITS.map(suit => (
              <button key={suit}
                data-testid={`button-sidebet-suit-${suit}`}
                onClick={() => setSideBetSuit(suit)}
                style={{
                  flex: 1, padding: '7px 2px', borderRadius: 10, cursor: 'pointer',
                  background: sideBetSuit === suit ? (SUIT_BG_COLORS[suit] === '#e53935' ? 'rgba(229,57,53,0.15)' : 'rgba(255,255,255,0.09)') : 'rgba(255,255,255,0.04)',
                  border: `2px solid ${sideBetSuit === suit ? SUIT_BG_COLORS[suit] : 'rgba(255,255,255,0.07)'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                <span style={{ fontSize: 18, color: SUIT_BG_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
                <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.38)', lineHeight: 1.2 }}>{QUEEN_NICKNAMES[suit].split(' ')[0]}</span>
              </button>
            ))}
          </div>
          {sideBetSuit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" min={1} max={room.maxSideBet}
                value={sideBetAmt || ''} onChange={e => setSideBetAmt(Number(e.target.value))}
                placeholder={`1–${room.maxSideBet}`}
                data-testid="input-sidebet-amount"
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14 }} />
              <button
                data-testid="button-place-sidebet"
                onClick={handleSideBet}
                style={{ background: '#e53935', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                BET {SUIT_SYMBOLS[sideBetSuit]}
              </button>
            </div>
          )}
          {state.sideBets.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {state.sideBets.map((b, i) => (
                <div key={i} style={{ fontFamily: 'monospace', fontSize: 10, color: SUIT_BG_COLORS[b.suit] }}>
                  {b.playerName} · {b.amount.toLocaleString()} on {QUEEN_NICKNAMES[b.suit]} {SUIT_SYMBOLS[b.suit]}
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
    const flipCount = state.flippedCards.length;
    const maxPos    = Math.max(0, ...SUITS.map(s => state.positions[s] ?? 0));
    const leader    = maxPos > 0 ? SUITS.find(s => (state.positions[s] ?? 0) === maxPos) ?? null : null;
    const speedLabel = maxPos >= 7 ? '⚡ FINAL STRETCH' : maxPos >= 5 ? '🔥 HEATING UP' : '';

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', padding: '12px 14px', gap: 8 }}>
        <style>{`
          @keyframes ll-queen-pulse {
            0%   { transform: translateY(-50%) scale(1); }
            40%  { transform: translateY(-50%) scale(1.22); box-shadow: 0 0 18px #C9A227cc; }
            100% { transform: translateY(-50%) scale(1); }
          }
          @keyframes ll-card-flip {
            0%   { opacity:0; transform: perspective(400px) rotateY(-90deg) scale(0.7); }
            30%  { opacity:1; transform: perspective(400px) rotateY(12deg)  scale(1.05); }
            55%  { opacity:1; transform: perspective(400px) rotateY(0deg)   scale(1); }
            80%  { opacity:1; transform: perspective(400px) rotateY(0deg)   scale(1); }
            100% { opacity:0; transform: perspective(400px) rotateY(0deg)   scale(0.85); }
          }
        `}</style>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 2 }}>RACE IN PROGRESS</div>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 16, color: '#C9A227' }}>POT {state.pot.toLocaleString()}</div>
        </div>

        {/* Leader bar */}
        {leader && (
          <div style={{ background: 'rgba(201,162,39,0.1)', border: '1px solid #C9A22738', borderRadius: 9, padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227' }}>
              LEADING: {QUEEN_NICKNAMES[leader]} {SUIT_SYMBOLS[leader]}
            </div>
            {speedLabel && <div style={{ fontFamily: 'monospace', fontSize: 9, color: maxPos >= 7 ? '#00bcd4' : '#f59e0b' }}>{speedLabel}</div>}
            <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 13, color: '#C9A227' }}>{maxPos}/9</div>
          </div>
        )}

        {/* Flipped card center */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 90, flexShrink: 0, position: 'relative' }}>
          {state.currentCard ? (
            <div key={flipCount} style={{
              animation: 'll-card-flip 1.3s ease-out forwards',
              width: 62, height: 88, background: '#fff', borderRadius: 9,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
              boxShadow: `0 6px 24px rgba(0,0,0,0.7), 0 0 18px ${SUIT_BG_COLORS[state.currentCard.suit]}50`,
            }}>
              <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 12, fontWeight: 800, color: SUIT_COLORS[state.currentCard.suit] }}>{state.currentCard.rank}</span>
              <span style={{ fontSize: 32, color: SUIT_COLORS[state.currentCard.suit] }}>{SUIT_SYMBOLS[state.currentCard.suit]}</span>
              <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 12, fontWeight: 800, color: SUIT_COLORS[state.currentCard.suit], transform: 'rotate(180deg)' }}>{state.currentCard.rank}</span>
            </div>
          ) : (
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>Starting race…</div>
          )}
          {/* Recent 4 cards mini */}
          {state.flippedCards.length > 1 && (
            <div style={{ position: 'absolute', right: 0, bottom: 0, display: 'flex', gap: 3 }}>
              {[...state.flippedCards].reverse().slice(1, 5).map((c, i) => (
                <div key={i} style={{ width: 28, height: 40, background: '#fff', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                  <span style={{ fontSize: 15, color: SUIT_COLORS[c.suit] }}>{SUIT_SYMBOLS[c.suit]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Race tracks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {/* Position header */}
          <div style={{ display: 'flex', marginLeft: 56, marginRight: 26 }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontSize: 8, color: i === 8 ? '#C9A227' : 'rgba(255,255,255,0.16)', fontWeight: i === 8 ? 700 : 400 }}>
                {i === 8 ? '👑' : i + 1}
              </div>
            ))}
          </div>

          {SUITS.map(suit => {
            const owner     = state.players.find(p => p.suit === suit);
            const pos       = state.positions[suit] ?? 0;
            const isPulse   = flipAnim === suit;
            const isMe      = myPlayer?.suit === suit;
            const isLeading = pos === maxPos && maxPos > 0;
            const posColor  = pos >= 9 ? '#10b981' : pos >= 7 ? '#f97316' : pos >= 5 ? '#f59e0b' : 'rgba(255,255,255,0.7)';
            const nick      = QUEEN_NICKNAMES[suit].split(' ')[0];

            return (
              <div key={suit} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: isMe ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isMe ? `${SUIT_BG_COLORS[suit]}28` : 'rgba(255,255,255,0.04)'}`,
                borderRadius: 7, padding: '3px 5px',
              }}>
                {/* Label */}
                <div style={{ width: 46, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 17, color: SUIT_BG_COLORS[suit], lineHeight: 1 }}>{SUIT_SYMBOLS[suit]}</span>
                  <span style={{ fontSize: 7, fontFamily: 'monospace', color: isMe ? SUIT_BG_COLORS[suit] : 'rgba(255,255,255,0.22)', marginTop: 1, whiteSpace: 'nowrap' }}>{nick}</span>
                  {owner && <span style={{ fontSize: 6, fontFamily: 'monospace', color: 'rgba(255,255,255,0.18)', whiteSpace: 'nowrap', maxWidth: 46, overflow: 'hidden', textOverflow: 'ellipsis' }}>{owner.name.slice(0, 6)}</span>}
                </div>

                {/* Track */}
                <div style={{ flex: 1, height: 60, position: 'relative', borderRadius: 5, overflow: 'hidden', background: 'rgba(0,0,0,0.4)' }}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i / 9) * 100}%`, width: 1, background: i === 9 ? '#C9A22780' : 'rgba(255,255,255,0.04)' }} />
                  ))}
                  <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 2, background: '#C9A227' }} />
                  {/* Progress fill */}
                  <div style={{
                    position: 'absolute', top: '34%', bottom: '34%', left: 0,
                    width: `calc(${(pos / 9) * 100}% - 4px)`,
                    background: `linear-gradient(to right, ${SUIT_BG_COLORS[suit]}15, ${SUIT_BG_COLORS[suit]}28)`,
                    borderRadius: '0 2px 2px 0',
                    transition: 'width 0.5s ease-out',
                  }} />
                  {/* Sliding Queen card */}
                  <div style={{
                    position: 'absolute', top: '50%',
                    left: `calc(${(pos / 9) * 100}% - ${(pos / 9) * 42}px)`,
                    transform: 'translateY(-50%)',
                    transition: 'left 0.5s ease-out',
                    width: 42, height: 58, background: '#fff', borderRadius: 6,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isLeading ? `0 0 12px #C9A227aa, 0 2px 6px rgba(0,0,0,0.6)` : '0 2px 6px rgba(0,0,0,0.5)',
                    border: isLeading ? '2px solid #C9A227' : `1.5px solid ${SUIT_COLORS[suit] === '#1a1a1a' ? 'rgba(0,0,0,0.3)' : '#e5393550'}`,
                    animation: isPulse ? 'll-queen-pulse 0.5s ease-out' : 'none',
                    zIndex: 2,
                  }}>
                    <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 8, fontWeight: 800, color: SUIT_COLORS[suit] }}>Q</span>
                    <span style={{ fontSize: 18, color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
                    <span style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 8, fontWeight: 800, color: SUIT_COLORS[suit], transform: 'rotate(180deg)' }}>Q</span>
                  </div>
                </div>

                {/* Score */}
                <div style={{ width: 20, flexShrink: 0, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: isLeading ? '#C9A227' : posColor }}>{pos}</div>
              </div>
            );
          })}
        </div>

        {/* History bar */}
        {state.flippedCards.length > 4 && (
          <div style={{ display: 'flex', gap: 3, overflowX: 'auto', flexShrink: 0, alignItems: 'center', paddingBottom: 2 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>HISTORY</span>
            {[...state.flippedCards].reverse().slice(0, 8).map((c, i) => (
              <div key={i} style={{ width: 24, height: 34, background: '#fff', borderRadius: 3, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                <span style={{ fontSize: 6, fontWeight: 800, color: SUIT_COLORS[c.suit], lineHeight: 1 }}>{c.rank}</span>
                <span style={{ fontSize: 10, color: SUIT_COLORS[c.suit] }}>{SUIT_SYMBOLS[c.suit]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Side bets */}
        {state.sideBets.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 7, padding: '5px 8px', flexShrink: 0 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.22)', letterSpacing: 2, marginBottom: 3 }}>SIDE BETS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {state.sideBets.map((b, i) => (
                <span key={i} style={{ fontFamily: 'monospace', fontSize: 9, color: SUIT_BG_COLORS[b.suit] }}>
                  {b.playerName} · {b.amount.toLocaleString()} on {QUEEN_NICKNAMES[b.suit]}
                </span>
              ))}
            </div>
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

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px', gap: 14 }}>
        <style>{`
          @keyframes ll-winner-glow { 0%,100%{box-shadow:0 0 20px #C9A227aa,0 0 40px #C9A22740} 50%{box-shadow:0 0 32px #C9A227cc,0 0 60px #C9A22760} }
          @keyframes ll-result-in { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        `}</style>

        <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 28, color: isWinner ? '#C9A227' : '#e53935', letterSpacing: 2, animation: 'll-result-in 0.5s ease-out' }}>
          {isWinner ? '🏆 YOU WIN!' : 'RACE OVER'}
        </div>

        {/* Winner Queen */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: 'll-result-in 0.5s ease-out 0.1s both' }}>
          <div style={{ fontSize: 22 }}>👑</div>
          <div style={{ width: 80, height: 112, background: '#fff', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', border: '3px solid #C9A227', animation: 'll-winner-glow 2s ease-in-out infinite' }}>
            <span style={{ position: 'absolute', top: 5, left: 7, fontSize: 14, fontWeight: 800, color: SUIT_COLORS[winner] }}>Q</span>
            <span style={{ fontSize: 36, color: SUIT_COLORS[winner] }}>{SUIT_SYMBOLS[winner]}</span>
            <span style={{ position: 'absolute', bottom: 5, right: 7, fontSize: 14, fontWeight: 800, color: SUIT_COLORS[winner], transform: 'rotate(180deg)' }}>Q</span>
          </div>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 18, color: '#C9A227', letterSpacing: 1 }}>{QUEEN_NICKNAMES[winner]}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            {winPlayer?.name ?? 'Unknown'} wins {state.pot.toLocaleString()} chips
          </div>
        </div>

        {/* All 4 Queens final positions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', width: '100%', animation: 'll-result-in 0.5s ease-out 0.2s both' }}>
          {SUITS.map(suit => {
            const owner   = state.players.find(p => p.suit === suit);
            const pos     = state.positions[suit] ?? 0;
            const isWin   = suit === winner;
            const isYours = myPlayer?.suit === suit;
            return (
              <div key={suit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <QueenCard suit={suit} isWinner={isWin} playerName={owner?.name} isYours={isYours} />
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: isWin ? '#C9A227' : 'rgba(255,255,255,0.28)' }}>{pos}/9</div>
              </div>
            );
          })}
        </div>

        {/* My chips delta */}
        <div style={{ background: myDelta >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(229,57,53,0.1)', border: `1px solid ${myDelta >= 0 ? '#10b98138' : '#e5393538'}`, borderRadius: 12, padding: '12px 20px', textAlign: 'center', width: '100%', animation: 'll-result-in 0.5s ease-out 0.3s both' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>YOUR RESULT</div>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 24, color: myDelta >= 0 ? '#10b981' : '#e53935', letterSpacing: 1 }}>
            {myDelta >= 0 ? '+' : ''}{myDelta.toLocaleString()} chips
          </div>
          {(myWager > 0 || myBetsTotal > 0) && (
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>
              wager {myWager.toLocaleString()} · side bets {myBetsTotal.toLocaleString()} · payout {(myPayout + myBetPayout).toLocaleString()}
            </div>
          )}
        </div>

        {/* Side bet results */}
        {state.sideBets.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 14px', width: '100%', animation: 'll-result-in 0.5s ease-out 0.35s both' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: 2, marginBottom: 8 }}>SIDE BETS</div>
            {state.sideBets.map((b, i) => {
              const won    = b.suit === winner;
              const payout = won ? Math.floor(b.amount * 2.5) : 0;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: 'monospace', fontSize: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: SUIT_BG_COLORS[b.suit] }}>{b.playerName} · {QUEEN_NICKNAMES[b.suit]} · {b.amount.toLocaleString()}</span>
                  <span style={{ color: won ? '#10b981' : '#e53935', fontWeight: 700 }}>{won ? `+${payout.toLocaleString()}` : `−${b.amount.toLocaleString()}`}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Per-player P&L table */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 14px', width: '100%', animation: 'll-result-in 0.5s ease-out 0.38s both' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: 2, marginBottom: 8 }}>ALL PLAYERS</div>
          {state.players.filter(p => p.presence !== 'open').map(p => {
            const won   = p.suit === winner;
            const delta = won ? state.pot - p.wager : -p.wager;
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.suit && <span style={{ fontSize: 14, color: SUIT_BG_COLORS[p.suit] }}>{SUIT_SYMBOLS[p.suit]}</span>}
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: p.id === identity.id ? '#C9A227' : 'rgba(255,255,255,0.65)' }}>
                    {p.name}{p.id === identity.id ? ' (you)' : ''}
                  </span>
                  {p.presence === 'bot' && <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 3px' }}>BOT</span>}
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: delta >= 0 ? '#10b981' : '#e53935' }}>
                  {delta >= 0 ? '+' : ''}{delta.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Countdown + leave */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', animation: 'll-result-in 0.5s ease-out 0.45s both' }}>
          {state.resultsTimeLeft !== null && state.resultsTimeLeft > 0 && (
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: 1 }}>
              Next race starting in <span style={{ color: '#C9A227', fontWeight: 700 }}>{state.resultsTimeLeft}</span>…
            </div>
          )}
          <button
            data-testid="button-leave-table"
            onClick={goBack}
            style={{ width: '100%', background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 24, padding: '13px 0', fontWeight: 700, fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}>
            Leave Table
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

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', padding: '12px 14px', gap: 10 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={goBack} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>← Back</button>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 22, color: '#e53935', letterSpacing: 2 }}>LADY LUCK</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 9, color: roomCfg.color, letterSpacing: 2 }}>NEXT RACE</div>
        </div>

        {/* Countdown bar */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${isUrgent ? '#e5393540' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: '10px 14px', transition: 'border-color 0.3s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: isUrgent ? '#e53935' : '#C9A227', letterSpacing: 2 }}>
              PLACE YOUR BET
            </div>
            <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 20, color: isUrgent ? '#e53935' : '#C9A227', transition: 'color 0.3s' }}>
              {betTime}s
            </div>
          </div>
          <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(betTime / 30) * 100}%`,
              background: isUrgent ? '#e53935' : '#C9A227',
              borderRadius: 3,
              transition: 'width 1s linear, background 0.3s',
            }} />
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 6, textAlign: 'right' }}>
            {wageredCount}/{activeCount} locked in
          </div>
        </div>

        {/* Player status grid */}
        <div style={{ display: 'flex', gap: 6 }}>
          {state.players.map(p => {
            const isOpen = p.presence === 'open';
            const isBot  = p.presence === 'bot';
            const isMe   = p.id === identity.id;
            return (
              <div key={p.id} style={{
                flex: 1, padding: '6px 4px', borderRadius: 8, textAlign: 'center',
                background: isOpen ? 'rgba(255,255,255,0.02)' : p.wagered ? 'rgba(16,185,129,0.09)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isOpen ? 'rgba(255,255,255,0.04)' : p.wagered ? '#10b98132' : 'rgba(255,255,255,0.08)'}`,
              }}>
                {isOpen ? (
                  <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.18)' }}>OPEN</div>
                ) : (
                  <>
                    {p.suit
                      ? <div style={{ fontSize: 15, color: SUIT_BG_COLORS[p.suit] }}>{SUIT_SYMBOLS[p.suit]}</div>
                      : <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', lineHeight: '22px' }}>—</div>
                    }
                    <div style={{ fontFamily: 'monospace', fontSize: 6, color: p.wagered ? '#10b981' : p.suit ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)', marginTop: 1 }}>
                      {p.wagered ? `✓ ${p.wager.toLocaleString()}` : p.suit ? 'BETTING' : 'PICKING'}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 6, color: isMe ? '#C9A22790' : 'rgba(255,255,255,0.18)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isBot ? '🤖' : isMe ? '★' : ''}{p.name.slice(0, 5)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Action area */}
        {amActive ? (
          myWagered ? (
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid #10b98140', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>✓</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#10b981' }}>
                {mySuit ? SUIT_SYMBOLS[mySuit] : ''} {mySuit ? QUEEN_NICKNAMES[mySuit] : ''} · {myPlayer?.wager.toLocaleString()} chips locked in
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                Waiting for others…
              </div>
            </div>
          ) : mySuit === null ? (
            /* Suit picker */
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#C9A227', letterSpacing: 2, marginBottom: 12 }}>PICK YOUR QUEEN</div>
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
                        flex: 1, padding: '14px 4px', borderRadius: 12,
                        cursor: taken ? 'not-allowed' : 'pointer',
                        background: taken ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                        border: `2px solid ${taken ? 'rgba(255,255,255,0.06)' : SUIT_BG_COLORS[suit]}`,
                        opacity: taken ? 0.28 : 1,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                        transition: 'opacity 0.2s',
                      }}>
                      <span style={{ fontSize: 26, color: taken ? 'rgba(255,255,255,0.2)' : SUIT_BG_COLORS[suit] }}>
                        {SUIT_SYMBOLS[suit]}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.38)', lineHeight: 1.2 }}>
                        {QUEEN_NICKNAMES[suit].split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Wager control */
            <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${SUIT_BG_COLORS[mySuit]}28`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 2 }}>
                  YOUR WAGER · {room.minWager.toLocaleString()}–{room.maxWager.toLocaleString()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'monospace', fontSize: 11, color: SUIT_BG_COLORS[mySuit] }}>
                  <span style={{ fontSize: 16 }}>{SUIT_SYMBOLS[mySuit]}</span>
                  {QUEEN_NICKNAMES[mySuit]}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <button
                  onClick={() => setWagerAmt(v => Math.max(room.minWager, v - 100))}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>−</button>
                <div style={{ flex: 1, textAlign: 'center', fontFamily: 'Anton, Impact, sans-serif', fontSize: 28, color: '#C9A227' }}>
                  {effectiveWager.toLocaleString()}
                </div>
                <button
                  onClick={() => setWagerAmt(v => Math.min(room.maxWager, v + 100))}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>+</button>
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
                style={{ width: '100%', background: '#C9A227', color: '#000', border: 'none', borderRadius: 24, padding: '13px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}>
                LOCK IN {effectiveWager.toLocaleString()} CHIPS
              </button>
            </div>
          )
        ) : (
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: 16 }}>
            Spectating — join a table from the lobby to play
          </div>
        )}
      </div>
    );
  }

  return null;
}
