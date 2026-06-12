import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { apiUrl, wsUrl } from '@/lib/apiConfig';
import { ensurePlayerIdentity } from '@/lib/persistence';
import {
  LadyLuckState,
  LadyLuckSuit,
  LadyLuckRoom,
  LADY_LUCK_ROOMS,
  SUITS,
  SUIT_SYMBOLS,
  SUIT_COLORS,
} from '../../../shared/modes/ladyluck';

// ── Helpers ───────────────────────────────────────────────────────────────────

function suitBg(suit: LadyLuckSuit) {
  return suit === 'hearts' || suit === 'diamonds' ? '#1a0000' : '#0a0a14';
}

function RaceCard({ rank, suit, big }: { rank: string; suit: LadyLuckSuit; big?: boolean }) {
  const color = SUIT_COLORS[suit];
  const size = big ? { w: 80, h: 110, fs: 36, rfs: 18 } : { w: 36, h: 50, fs: 16, rfs: 10 };
  return (
    <div style={{
      width: size.w, height: size.h,
      background: '#fff',
      borderRadius: big ? 12 : 6,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative',
      boxShadow: big ? '0 4px 20px rgba(0,0,0,0.7)' : '0 2px 6px rgba(0,0,0,0.5)',
      flexShrink: 0,
    }}>
      <span style={{ position: 'absolute', top: 3, left: 5, fontSize: size.rfs, fontWeight: 800, color, lineHeight: 1 }}>{rank}</span>
      <span style={{ fontSize: size.fs, color }}>{SUIT_SYMBOLS[suit]}</span>
      <span style={{ position: 'absolute', bottom: 3, right: 5, fontSize: size.rfs, fontWeight: 800, color, lineHeight: 1, transform: 'rotate(180deg)' }}>{rank}</span>
    </div>
  );
}

function QueenCard({
  suit,
  claimed,
  claimedBy,
  isYours,
  isMyTurn,
  isDealer,
  onPick,
}: {
  suit: LadyLuckSuit;
  claimed: boolean;
  claimedBy?: string;
  isYours?: boolean;
  isMyTurn?: boolean;
  isDealer?: boolean;
  onPick?: () => void;
}) {
  const color = SUIT_COLORS[suit];
  const pulse = isMyTurn && !claimed;
  return (
    <div
      onClick={pulse ? onPick : undefined}
      style={{
        width: 80, height: 110,
        background: suitBg(suit),
        border: `2px solid ${pulse ? '#C9A227' : isYours ? '#C9A227' : claimed ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: pulse ? 'pointer' : 'default',
        position: 'relative',
        boxShadow: pulse ? `0 0 20px #C9A22780, 0 0 40px #C9A22740` : isYours ? `0 0 12px ${color}60` : 'none',
        animation: pulse ? 'll-pulse 1.2s infinite' : 'none',
        transition: 'box-shadow 0.2s',
        opacity: claimed && !isYours ? 0.7 : 1,
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 38, color }}>{SUIT_SYMBOLS[suit]}</span>
      <span style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>Q</span>
      {claimed && claimedBy && (
        <span style={{
          position: 'absolute', bottom: 6, left: 0, right: 0,
          textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.7)',
          fontFamily: 'monospace', fontWeight: 700, padding: '0 4px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{claimedBy}</span>
      )}
      {isDealer && !claimed && (
        <span style={{ position: 'absolute', bottom: 4, fontSize: 8, color: '#C9A227', fontFamily: 'monospace', fontWeight: 700 }}>AUTO</span>
      )}
    </div>
  );
}

// ── Room counts ───────────────────────────────────────────────────────────────

function useLLRoomCounts() {
  const [counts, setCounts] = useState<Record<LadyLuckRoom, number>>({ pony: 0, thoroughbred: 0, champion: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(apiUrl('/api/ladyluck/tables'));
        if (!res.ok) return;
        const data: { tableId: string; roomType: LadyLuckRoom; playerCount: number }[] = await res.json();
        const c = { pony: 0, thoroughbred: 0, champion: 0 } as Record<LadyLuckRoom, number>;
        for (const t of data) c[t.roomType] = (c[t.roomType] ?? 0) + t.playerCount;
        setCounts(c);
      } catch {}
    };
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  return counts;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LadyLuck() {
  const [, navigate] = useLocation();
  const [tableId, setTableId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('t');
  });

  const [state, setState]     = useState<LadyLuckState | null>(null);
  const [connected, setConnected] = useState(false);
  const [countdown, setCountdown] = useState(8);
  const [flipAnim, setFlipAnim]   = useState<LadyLuckSuit | null>(null);
  const [joining, setJoining]     = useState(false);
  const [wagerAmt, setWagerAmt]   = useState(0);
  const [sideBetSuit, setSideBetSuit] = useState<LadyLuckSuit | null>(null);
  const [sideBetAmt, setSideBetAmt]   = useState(0);

  const wsRef      = useRef<WebSocket | null>(null);
  const identity   = ensurePlayerIdentity();
  const roomCounts = useLLRoomCounts();

  // Connect WS when tableId is available
  useEffect(() => {
    if (!tableId) return;
    let ws: WebSocket | null = null;
    let alive = true;

    const connect = async () => {
      try {
        const tokenRes = await fetch(apiUrl('/api/auth/ws-token'), { credentials: 'include' });
        let token: string | null = null;
        if (tokenRes.ok) {
          const j = await tokenRes.json();
          token = j.token ?? null;
        }

        const url = wsUrl(token);
        ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!alive) { ws?.close(); return; }
          setConnected(true);
          ws?.send(JSON.stringify({
            type:     'll:join',
            tableId,
            playerId: identity.id,
            name:     identity.name,
          }));
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'll:state') {
              setState(msg.state as LadyLuckState);
              const s = msg.state as LadyLuckState;
              const room = LADY_LUCK_ROOMS[s.roomType];
              setWagerAmt(v => v || room.minWager);
            }
            if (msg.type === 'll:flip') {
              setFlipAnim(msg.card.suit);
              setState(prev => prev ? { ...prev, positions: msg.positions, currentCard: msg.card, flippedCards: [...(prev.flippedCards ?? []), msg.card] } : prev);
              setTimeout(() => setFlipAnim(null), 600);
            }
            if (msg.type === 'll:result') {
              setState(msg.state as LadyLuckState);
              let c = 8;
              setCountdown(c);
              const id = setInterval(() => {
                c--;
                setCountdown(c);
                if (c <= 0) clearInterval(id);
              }, 1000);
            }
          } catch {}
        };

        ws.onclose = () => {
          if (!alive) return;
          setConnected(false);
        };
      } catch {}
    };

    connect();
    return () => {
      alive = false;
      ws?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const handleJoinRoom = async (roomType: LadyLuckRoom) => {
    setJoining(true);
    try {
      const res = await fetch(apiUrl('/api/ladyluck/tables'), {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ roomType }),
      });
      if (!res.ok) throw new Error('Failed to create table');
      const { tableId: tid } = await res.json() as { tableId: string };
      setTableId(tid);
      navigate(`/ladyluck?t=${tid}`, { replace: true });
    } catch (err) {
      console.error(err);
    }
    setJoining(false);
  };

  const handleSelectSuit = (suit: LadyLuckSuit) => {
    send({ type: 'll:select', tableId, playerId: identity.id, suit });
  };

  const handleWager = () => {
    send({ type: 'll:wager', tableId, playerId: identity.id, amount: wagerAmt });
  };

  const handleSideBet = () => {
    if (!sideBetSuit || sideBetAmt <= 0) return;
    send({ type: 'll:sidebet', tableId, playerId: identity.id, suit: sideBetSuit, amount: sideBetAmt });
    setSideBetSuit(null);
    setSideBetAmt(0);
  };

  const handleStart = () => {
    send({ type: 'll:start', tableId, playerId: identity.id });
  };

  const myPlayer = state?.players.find(p => p.id === identity.id);
  const isMyTurn = state?.phase === 'SELECT' && state.currentPickIndex >= 0 &&
    state.players[state.currentPickIndex]?.id === identity.id;

  // ── LOBBY ──────────────────────────────────────────────────────────────────
  if (!tableId || (!state && !connected)) {
    const rooms: { id: LadyLuckRoom; label: string; range: string; color: string }[] = [
      { id: 'pony',         label: 'PONY',         range: '100 – 500',   color: '#10b981' },
      { id: 'thoroughbred', label: 'THOROUGHBRED',  range: '500 – 2,000', color: '#f59e0b' },
      { id: 'champion',     label: 'CHAMPION',      range: '2,000 – 5,000', color: '#e53935' },
    ];

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <style>{`@keyframes ll-pulse { 0%,100%{box-shadow:0 0 18px #C9A22780,0 0 36px #C9A22740} 50%{box-shadow:0 0 28px #C9A227b0,0 0 50px #C9A22760} }`}</style>

        {/* Header */}
        <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} data-testid="button-back-home"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>
            ← Home
          </button>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 28, color: '#e53935', letterSpacing: 2 }}>LADY LUCK</div>
        </div>

        <div style={{ padding: '8px 16px 4px', fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase' }}>
          PICK YOUR QUEEN. RUN THE RACE.
        </div>

        {/* Room cards */}
        <div style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rooms.map(room => (
            <div key={room.id} data-testid={`card-room-${room.id}`}
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${room.color}44`, borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 22, color: room.color, letterSpacing: 1 }}>{room.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                  WAGER {room.range} CHIPS
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                  {roomCounts[room.id] > 0 ? `${roomCounts[room.id]} players online` : 'No active tables'}
                </div>
              </div>
              <button
                data-testid={`button-join-${room.id}`}
                onClick={() => handleJoinRoom(room.id)}
                disabled={joining}
                style={{ background: room.color, color: '#fff', border: 'none', borderRadius: 24, padding: '10px 20px', fontWeight: 800, fontSize: 13, cursor: joining ? 'not-allowed' : 'pointer', letterSpacing: 1, opacity: joining ? 0.6 : 1 }}
              >
                JOIN
              </button>
            </div>
          ))}
        </div>

        {/* How it works blurb */}
        <div style={{ margin: '0 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
            4 Queens race to 9 card flips. Pick your Queen, place your wager. First Queen to 9 wins the pot. Side bets pay 2.5×.
          </div>
        </div>
      </div>
    );
  }

  // ── Waiting for connection ─────────────────────────────────────────────────
  if (!state) {
    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
        Connecting…
      </div>
    );
  }

  const room = LADY_LUCK_ROOMS[state.roomType];

  // ── LOBBY (in-table, waiting for start) ────────────────────────────────────
  if (state.phase === 'LOBBY') {
    const isHost = state.players[0]?.id === identity.id;
    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', padding: 16 }}>
        <style>{`@keyframes ll-pulse { 0%,100%{box-shadow:0 0 18px #C9A22780,0 0 36px #C9A22740} 50%{box-shadow:0 0 28px #C9A227b0,0 0 50px #C9A22760} }`}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>← Home</button>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 24, color: '#e53935', letterSpacing: 2 }}>LADY LUCK</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{state.roomType}</div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#C9A227', letterSpacing: 2, marginBottom: 10 }}>PLAYERS IN LOBBY</div>
          {state.players.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: p.id === identity.id ? '#C9A227' : '#fff' }}>{p.name}{p.id === identity.id ? ' (you)' : ''}</span>
            </div>
          ))}
          {Array.from({ length: 4 - state.players.length }).map((_, i) => (
            <div key={`open-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Open seat</span>
            </div>
          ))}
        </div>

        {isHost && (
          <button
            data-testid="button-ll-start"
            onClick={handleStart}
            disabled={state.players.length < 2}
            style={{ background: state.players.length >= 2 ? '#e53935' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 24, padding: '14px 0', fontWeight: 800, fontSize: 15, cursor: state.players.length >= 2 ? 'pointer' : 'not-allowed', letterSpacing: 1 }}
          >
            {state.players.length >= 2 ? `START GAME (${state.players.length} players)` : 'Waiting for 2+ players…'}
          </button>
        )}
        {!isHost && (
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: 16 }}>
            Waiting for host to start…
          </div>
        )}
      </div>
    );
  }

  // ── SELECT ─────────────────────────────────────────────────────────────────
  if (state.phase === 'SELECT') {
    const pickerName = state.currentPickIndex >= 0 ? state.players[state.currentPickIndex]?.name : null;
    const isDealer   = (i: number) => i === state.dealerIndex;

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', padding: 16 }}>
        <style>{`@keyframes ll-pulse { 0%,100%{box-shadow:0 0 18px #C9A22780,0 0 36px #C9A22740} 50%{box-shadow:0 0 28px #C9A227b0,0 0 50px #C9A22760} }`}</style>

        <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 26, color: '#C9A227', letterSpacing: 2, textAlign: 'center', marginBottom: 4 }}>PICK YOUR QUEEN</div>
        {!isMyTurn && pickerName && (
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>
            Waiting for <span style={{ color: '#C9A227' }}>{pickerName}</span> to pick…
          </div>
        )}
        {isMyTurn && (
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#C9A227', marginBottom: 16, fontWeight: 700 }}>
            YOUR TURN — tap a Queen to claim it
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
          {SUITS.map(suit => {
            const claimed   = state.claimedSuits.includes(suit);
            const claimedBy = state.players.find(p => p.suit === suit)?.name;
            const myIdx     = state.players.findIndex(p => p.id === identity.id);
            const isDeale   = SUITS.indexOf(suit) === -1; // not used
            const dealerSuit = state.players[state.dealerIndex]?.suit;
            const isDealerCard = !claimed && state.players[state.dealerIndex] && !state.players[state.dealerIndex].suit;

            return (
              <QueenCard
                key={suit}
                suit={suit}
                claimed={claimed}
                claimedBy={claimedBy}
                isYours={myPlayer?.suit === suit}
                isMyTurn={isMyTurn && !claimed}
                isDealer={state.currentPickIndex >= 0 &&
                  state.players[state.currentPickIndex]?.id !== identity.id &&
                  !claimed &&
                  state.claimedSuits.length === 3 &&
                  state.players[state.dealerIndex]?.suit === null &&
                  suit !== state.claimedSuits[0] && suit !== state.claimedSuits[1] && suit !== state.claimedSuits[2]}
                onPick={() => handleSelectSuit(suit)}
              />
            );
          })}
        </div>

        {/* Pick order */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 8 }}>PICK ORDER</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {state.players.map((p, i) => {
              const isDealer = i === state.dealerIndex;
              const isCurrent = i === state.currentPickIndex;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: isCurrent ? '#C9A227' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: isCurrent ? '#000' : 'rgba(255,255,255,0.3)' }}>
                    {isDealer ? 'D' : i === (state.dealerIndex + 1) % state.players.length ? '1' :
                     i === (state.dealerIndex + 2) % state.players.length ? '2' : '3'}
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: isCurrent ? '#C9A227' : p.suit ? SUIT_COLORS[p.suit] : 'rgba(255,255,255,0.5)', fontWeight: isCurrent ? 700 : 400 }}>
                    {p.name}{p.id === identity.id ? ' (you)' : ''}
                    {isDealer ? ' — GETS LAST CARD' : ''}
                    {p.suit ? ` ${SUIT_SYMBOLS[p.suit]}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── WAGER ──────────────────────────────────────────────────────────────────
  if (state.phase === 'WAGER') {
    const myWagered = myPlayer?.wagered ?? false;

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', padding: 16, gap: 14 }}>
        <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 24, color: '#C9A227', letterSpacing: 2, textAlign: 'center' }}>PLACE YOUR WAGER</div>

        {/* Queens row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {SUITS.map(suit => {
            const owner = state.players.find(p => p.suit === suit);
            return (
              <div key={suit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <QueenCard suit={suit} claimed={!!owner} claimedBy={owner?.name} isYours={myPlayer?.suit === suit} />
                {owner && (
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: owner.wagered ? '#10b981' : 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>
                    {owner.wagered ? 'WAGERED' : 'WAITING'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pot */}
        <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 14, color: '#C9A227' }}>
          POT: <span style={{ fontWeight: 800, fontSize: 18 }}>{state.pot.toLocaleString()}</span> chips
        </div>

        {/* Wager control */}
        {!myWagered ? (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>
              YOUR WAGER — {room.minWager.toLocaleString()}–{room.maxWager.toLocaleString()} chips
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <button onClick={() => setWagerAmt(v => Math.max(room.minWager, v - 100))}
                style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontFamily: 'Anton, Impact, sans-serif', fontSize: 28, color: '#C9A227' }}>
                {wagerAmt.toLocaleString()}
              </div>
              <button onClick={() => setWagerAmt(v => Math.min(room.maxWager, v + 100))}
                style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>+</button>
            </div>
            <input type="range" min={room.minWager} max={room.maxWager} step={100}
              value={wagerAmt}
              onChange={e => setWagerAmt(Number(e.target.value))}
              style={{ width: '100%', marginBottom: 12, accentColor: '#C9A227' }}
              data-testid="slider-wager"
            />
            <button
              data-testid="button-confirm-wager"
              onClick={handleWager}
              style={{ width: '100%', background: '#C9A227', color: '#000', border: 'none', borderRadius: 24, padding: '12px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}>
              CONFIRM WAGER
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b98144', borderRadius: 12, padding: 14, fontFamily: 'monospace', fontSize: 13, color: '#10b981' }}>
            ✓ Wager placed — {myPlayer?.wager.toLocaleString()} chips
          </div>
        )}

        {/* Side bets */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: 2, marginBottom: 10 }}>
            SIDE BETS — max {room.maxSideBet.toLocaleString()} · pays 2.5×
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {SUITS.map(suit => (
              <button key={suit}
                data-testid={`button-sidebet-suit-${suit}`}
                onClick={() => setSideBetSuit(suit)}
                style={{ flex: 1, padding: '8px 4px', borderRadius: 10, background: sideBetSuit === suit ? suitBg(suit) : 'rgba(255,255,255,0.06)', border: `2px solid ${sideBetSuit === suit ? SUIT_COLORS[suit] : 'rgba(255,255,255,0.1)'}`, color: SUIT_COLORS[suit], fontSize: 20, cursor: 'pointer' }}>
                {SUIT_SYMBOLS[suit]}
              </button>
            ))}
          </div>
          {sideBetSuit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                min={1}
                max={room.maxSideBet}
                value={sideBetAmt || ''}
                onChange={e => setSideBetAmt(Number(e.target.value))}
                placeholder="Amount"
                data-testid="input-sidebet-amount"
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14 }}
              />
              <button
                data-testid="button-place-sidebet"
                onClick={handleSideBet}
                style={{ background: '#e53935', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                BET {SUIT_SYMBOLS[sideBetSuit]}
              </button>
            </div>
          )}
          {state.sideBets.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {state.sideBets.map((b, i) => (
                <div key={i} style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {b.playerName} bet {b.amount.toLocaleString()} on {SUIT_SYMBOLS[b.suit]}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RACE ───────────────────────────────────────────────────────────────────
  if (state.phase === 'RACE') {
    const flipCount  = state.flippedCards.length;
    const maxPos     = Math.max(...SUITS.map(s => state.positions[s] ?? 0));

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', padding: '12px 14px', gap: 10 }}>
        <style>{`
          @keyframes ll-queen-pulse {
            0%   { transform: scale(1); }
            40%  { transform: scale(1.22); box-shadow: 0 0 18px #C9A227cc, 0 0 32px #C9A22766; }
            100% { transform: scale(1); box-shadow: none; }
          }
          @keyframes ll-card-flip {
            0%   { opacity: 0; transform: perspective(400px) rotateY(-90deg) scale(0.7); }
            30%  { opacity: 1; transform: perspective(400px) rotateY(12deg)  scale(1.05); }
            55%  { opacity: 1; transform: perspective(400px) rotateY(0deg)   scale(1); }
            80%  { opacity: 1; transform: perspective(400px) rotateY(0deg)   scale(1); }
            100% { opacity: 0; transform: perspective(400px) rotateY(0deg)   scale(0.85); }
          }
          @keyframes ll-track-glow {
            0%,100% { box-shadow: none; }
            50%     { box-shadow: 0 0 14px #C9A22750; }
          }
        `}</style>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 2 }}>RACE IN PROGRESS</div>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 17, color: '#C9A227' }}>
            POT {state.pot.toLocaleString()}
          </div>
        </div>

        {/* Card flip display — animates on every new flip */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 100, flexShrink: 0, position: 'relative' }}>
          {state.currentCard ? (
            <div
              key={flipCount}
              style={{
                animation: 'll-card-flip 1.3s ease-out forwards',
                width: 68, height: 96,
                background: '#fff',
                borderRadius: 10,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                boxShadow: `0 6px 28px rgba(0,0,0,0.7), 0 0 20px ${SUIT_COLORS[state.currentCard.suit]}60`,
              }}
            >
              <span style={{ position: 'absolute', top: 5, left: 7, fontSize: 14, fontWeight: 800, color: SUIT_COLORS[state.currentCard.suit], lineHeight: 1 }}>
                {state.currentCard.rank}
              </span>
              <span style={{ fontSize: 40, color: SUIT_COLORS[state.currentCard.suit] }}>
                {SUIT_SYMBOLS[state.currentCard.suit]}
              </span>
              <span style={{ position: 'absolute', bottom: 5, right: 7, fontSize: 14, fontWeight: 800, color: SUIT_COLORS[state.currentCard.suit], lineHeight: 1, transform: 'rotate(180deg)' }}>
                {state.currentCard.rank}
              </span>
            </div>
          ) : (
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Starting race…</div>
          )}
          {/* Last 3 flipped cards (small, behind) */}
          {state.flippedCards.length > 1 && (
            <div style={{ position: 'absolute', right: 0, bottom: 0, display: 'flex', gap: 4 }}>
              {[...state.flippedCards].reverse().slice(1, 4).map((c, i) => (
                <RaceCard key={i} rank={c.rank} suit={c.suit} />
              ))}
            </div>
          )}
        </div>

        {/* Race tracks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {/* Position markers header */}
          <div style={{ display: 'flex', marginLeft: 64, marginRight: 32, marginBottom: 2 }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{
                flex: 1, textAlign: 'center',
                fontFamily: 'monospace', fontSize: 9,
                color: i === 8 ? '#C9A227' : 'rgba(255,255,255,0.2)',
                fontWeight: i === 8 ? 700 : 400,
              }}>
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

            return (
              <div key={suit} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: isMe ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isMe ? `${SUIT_COLORS[suit]}33` : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 10,
                padding: '6px 8px',
                animation: isPulse ? 'll-track-glow 0.6s ease-out' : 'none',
              }}>
                {/* Left label */}
                <div style={{ width: 48, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 20, color: SUIT_COLORS[suit], lineHeight: 1 }}>{SUIT_SYMBOLS[suit]}</span>
                  <span style={{
                    fontSize: 8, fontFamily: 'monospace',
                    color: isMe ? SUIT_COLORS[suit] : 'rgba(255,255,255,0.3)',
                    fontWeight: isMe ? 700 : 400,
                    marginTop: 2, textAlign: 'center',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 48,
                  }}>
                    {owner ? owner.name.slice(0, 7) : '—'}
                  </span>
                </div>

                {/* Track */}
                <div style={{
                  flex: 1,
                  height: 72,
                  position: 'relative',
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: 'rgba(0,0,0,0.35)',
                }}>
                  {/* Grid lines at each position */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `${(i / 9) * 100}%`,
                      width: 1,
                      background: i === 9 ? '#C9A22780' : 'rgba(255,255,255,0.06)',
                    }} />
                  ))}
                  {/* Finish crown line */}
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, right: 0, width: 3,
                    background: 'linear-gradient(to bottom, #C9A227, #C9A22780)',
                    borderRadius: 2,
                  }} />

                  {/* Filled track behind queen */}
                  <div style={{
                    position: 'absolute', top: '30%', bottom: '30%', left: 0,
                    width: `calc(${(pos / 9) * 100}% - 4px)`,
                    background: `linear-gradient(to right, ${SUIT_COLORS[suit]}22, ${SUIT_COLORS[suit]}44)`,
                    borderRadius: '0 3px 3px 0',
                    transition: 'width 0.5s ease-out',
                  }} />

                  {/* Queen card — moves along track */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: `calc(${(pos / 9) * 100}% - ${(pos / 9) * 48}px)`,
                    transform: 'translateY(-50%)',
                    transition: 'left 0.5s ease-out',
                    width: 48, height: 68,
                    background: '#fff',
                    borderRadius: 7,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    boxShadow: isLeading
                      ? `0 0 14px #C9A227cc, 0 2px 8px rgba(0,0,0,0.6)`
                      : '0 2px 8px rgba(0,0,0,0.6)',
                    border: isLeading ? '2px solid #C9A227' : `1.5px solid ${SUIT_COLORS[suit]}66`,
                    animation: isPulse ? 'll-queen-pulse 0.5s ease-out' : 'none',
                    zIndex: 2,
                    flexShrink: 0,
                  }}>
                    <span style={{ position: 'absolute', top: 3, left: 5, fontSize: 10, fontWeight: 800, color: SUIT_COLORS[suit] === '#ffffff' ? '#1a1a2e' : SUIT_COLORS[suit], lineHeight: 1 }}>Q</span>
                    <span style={{ fontSize: 22, color: SUIT_COLORS[suit] === '#ffffff' ? '#1a1a2e' : SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
                    <span style={{ position: 'absolute', bottom: 3, right: 5, fontSize: 10, fontWeight: 800, color: SUIT_COLORS[suit] === '#ffffff' ? '#1a1a2e' : SUIT_COLORS[suit], lineHeight: 1, transform: 'rotate(180deg)' }}>Q</span>
                  </div>
                </div>

                {/* Right: score */}
                <div style={{ width: 24, flexShrink: 0, textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: isLeading ? '#C9A227' : SUIT_COLORS[suit] }}>
                  {pos}
                </div>
              </div>
            );
          })}
        </div>

        {/* Side bets panel */}
        {state.sideBets.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px', flexShrink: 0 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, marginBottom: 5 }}>SIDE BETS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {state.sideBets.map((b, i) => (
                <div key={i} style={{ fontFamily: 'monospace', fontSize: 10, color: SUIT_COLORS[b.suit] }}>
                  {b.playerName}: {b.amount.toLocaleString()} on {SUIT_SYMBOLS[b.suit]}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── RESULT ─────────────────────────────────────────────────────────────────
  if (state.phase === 'RESULT') {
    const winner     = state.winner!;
    const winPlayer  = state.players.find(p => p.suit === winner);
    const isWinner   = winPlayer?.id === identity.id;

    return (
      <div style={{ minHeight: '100dvh', background: '#0d0d16', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24, gap: 16 }}>
        <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 32, color: '#C9A227', letterSpacing: 2 }}>
          {isWinner ? '🏆 YOU WIN!' : 'RACE OVER'}
        </div>

        {/* Winner queen */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 32 }}>👑</div>
          <div style={{ position: 'relative' }}>
            <QueenCard suit={winner} claimed isYours={isWinner} claimedBy={winPlayer?.name} />
            <div style={{ position: 'absolute', inset: -4, borderRadius: 16, boxShadow: `0 0 30px ${SUIT_COLORS[winner]}80, 0 0 60px ${SUIT_COLORS[winner]}40`, pointerEvents: 'none' }} />
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#C9A227', fontWeight: 700 }}>
            {winPlayer?.name ?? 'Unknown'} wins {state.pot.toLocaleString()} chips
          </div>
        </div>

        {/* Final positions */}
        <div style={{ display: 'flex', gap: 10 }}>
          {SUITS.map(suit => (
            <div key={suit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 24, color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: suit === winner ? '#C9A227' : 'rgba(255,255,255,0.45)', fontWeight: suit === winner ? 700 : 400 }}>
                {state.positions[suit] ?? 0}/9
              </div>
            </div>
          ))}
        </div>

        {/* Side bet results */}
        {state.sideBets.length > 0 && (
          <div style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 8 }}>SIDE BET RESULTS</div>
            {state.sideBets.map((b, i) => {
              const won = b.suit === winner;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: 'monospace', fontSize: 12 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>{b.playerName} on {SUIT_SYMBOLS[b.suit]}</span>
                  <span style={{ color: won ? '#10b981' : '#e53935', fontWeight: 700 }}>
                    {won ? `+${Math.floor(b.amount * 2.5).toLocaleString()}` : `-${b.amount.toLocaleString()}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Countdown and play again */}
        <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          New game in {countdown}s…
        </div>
        <button
          data-testid="button-play-again"
          onClick={() => { setTableId(null); setState(null); navigate('/ladyluck'); }}
          style={{ background: '#e53935', color: '#fff', border: 'none', borderRadius: 24, padding: '12px 32px', fontWeight: 800, fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}>
          PLAY AGAIN
        </button>
      </div>
    );
  }

  return null;
}
