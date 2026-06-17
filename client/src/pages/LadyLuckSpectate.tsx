import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { wsUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';
import { ensurePlayerIdentity } from '@/lib/persistence';
import type { LadyLuckState, LadyLuckSuit } from '../../../shared/modes/ladyluck';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

const SUIT_SYMS: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};
const SUIT_COLS: Record<string, string> = {
  spades: '#ffffff', hearts: '#e53935', diamonds: '#e53935', clubs: '#ffffff',
};
const SUIT_FACE_COLS: Record<string, string> = {
  spades: '#1a1a1a', hearts: '#e53935', diamonds: '#e53935', clubs: '#1a1a1a',
};
const QUEEN_NAMES: Record<string, string> = {
  spades: 'Black Widow', hearts: 'Lady Red', diamonds: 'Diamond Dee', clubs: 'Club Ace',
};

const RACE_BG = {
  minHeight: '100vh' as const,
  backgroundColor: '#0d0c1e',
  backgroundImage: "url('/ladyluck/ladyluck-race-bg.png')",
  backgroundSize: 'cover',
  backgroundPosition: 'center top',
  backgroundRepeat: 'no-repeat',
  backgroundAttachment: 'scroll',
};

const GLASS_CARD = {
  background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,215,0,0.18)',
  borderRadius: 16,
};

// ── Queen card (face-down, selectable) ───────────────────────────────────────

function QueenCard({
  suit, selected, onSelect, disabled,
}: {
  suit: LadyLuckSuit;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const col = SUIT_COLS[suit];
  const faceCol = SUIT_FACE_COLS[suit];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <button
        data-testid={`spectate-queen-${suit}`}
        onClick={disabled ? undefined : onSelect}
        style={{
          width: 62, height: 88, borderRadius: 8,
          backgroundImage: selected ? undefined : "url('/ladyluck/card-back-cgp.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          background: selected
            ? 'linear-gradient(160deg,#f5ead6 0%,#e8d5aa 55%,#d4b87a 100%)'
            : undefined,
          border: selected ? `2px solid ${col}` : '1.5px solid rgba(201,162,39,0.35)',
          boxShadow: selected ? `0 0 16px ${col}66, 0 3px 10px rgba(0,0,0,0.5)` : '0 3px 10px rgba(0,0,0,0.5)',
          cursor: disabled ? 'default' : 'pointer',
          position: 'relative',
          flexShrink: 0,
          transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
          transform: selected ? 'translateY(-4px) scale(1.05)' : 'none',
          padding: 0,
        }}
      >
        {selected && (
          <>
            <span style={{ position: 'absolute', top: 3, left: 4, fontSize: 10, fontWeight: 900, color: faceCol, fontFamily: 'serif' }}>Q</span>
            <span style={{ position: 'absolute', top: 13, left: 4, fontSize: 8, color: faceCol }}>{SUIT_SYMS[suit]}</span>
            <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 26, color: faceCol, lineHeight: 1 }}>{SUIT_SYMS[suit]}</span>
            <span style={{ position: 'absolute', bottom: 3, right: 4, fontSize: 10, fontWeight: 900, color: faceCol, fontFamily: 'serif', rotate: '180deg' }}>Q</span>
          </>
        )}
      </button>
      <div style={{ fontSize: 8, fontFamily: 'monospace', color: selected ? col : 'rgba(255,255,255,0.45)', textAlign: 'center', letterSpacing: 0.4 }}>
        {QUEEN_NAMES[suit].toUpperCase()}
      </div>
    </div>
  );
}

// ── Race track ────────────────────────────────────────────────────────────────

function RaceTrack({
  positions, winner, myBetSuit,
}: {
  positions: Record<LadyLuckSuit, number>;
  winner: LadyLuckSuit | null;
  myBetSuit: LadyLuckSuit | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {SUITS.map(suit => {
        const pos = positions[suit] ?? 0;
        const isWinner = winner === suit;
        const isMine   = myBetSuit === suit;
        const col = SUIT_COLS[suit];
        return (
          <div key={suit} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, color: col, width: 22, textAlign: 'center', flexShrink: 0 }}>{SUIT_SYMS[suit]}</span>
            <div style={{ flex: 1, height: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: 0, right: 'auto',
                width: `${Math.min((pos / 9) * 100, 100)}%`,
                background: isWinner ? 'linear-gradient(90deg,#C9A227,#ffe08a)' : col,
                borderRadius: 8,
                transition: 'width 0.45s ease',
                opacity: isWinner ? 1 : 0.75,
              }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.55)', width: 26, textAlign: 'right', flexShrink: 0 }}>
              {pos}/9
            </span>
            <div style={{ width: 40, flexShrink: 0 }}>
              {isWinner && (
                <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#C9A227', fontWeight: 700 }}>WINS!</span>
              )}
              {isMine && !isWinner && (
                <span style={{ fontSize: 8, fontFamily: 'monospace', color: col, opacity: 0.8 }}>MY BET</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LadyLuckSpectate() {
  const [, navigate] = useLocation();
  const tableId = new URLSearchParams(window.location.search).get('t') ?? '';

  const [state, setState]           = useState<LadyLuckState | null>(null);
  const [connected, setConnected]   = useState(false);
  const [notFound, setNotFound]     = useState(false);
  const [sideBetSuit, setSideBetSuit] = useState<LadyLuckSuit | null>(null);
  const [sideBetAmt, setSideBetAmt]   = useState(100);
  const [myBet, setMyBet]             = useState<{ suit: LadyLuckSuit; amount: number } | null>(null);
  const [betLocked, setBetLocked]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [prevPhase, setPrevPhase]     = useState<string | null>(null);

  const wsRef    = useRef<WebSocket | null>(null);
  const identity = ensurePlayerIdentity();

  // ── Reset bet state when phase transitions to a new round ──────────────────
  useEffect(() => {
    if (!state) return;
    const phase = state.phase;
    if (prevPhase === 'RESULTS' && phase !== 'RESULTS') {
      setMyBet(null);
      setBetLocked(false);
      setSideBetSuit(null);
      setSideBetAmt(100);
      setError(null);
    }
    setPrevPhase(phase);
  }, [state?.phase]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tableId) { setNotFound(true); return; }
    let alive = true;

    const connect = async () => {
      try {
        const tokenRes = await apiFetch('/api/auth/ws-token');
        let token: string | null = null;
        if (tokenRes.ok) { const j = await tokenRes.json(); token = j.token ?? null; }

        const ws = new WebSocket(wsUrl(token));
        wsRef.current = ws;

        ws.onopen = () => {
          if (!alive) { ws.close(); return; }
          setConnected(true);
          ws.send(JSON.stringify({
            type:     'll:spectate',
            tableId,
            userId:   identity.id,
            username: identity.name,
          }));
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string);
            if (msg.type === 'll:state')  setState(msg.state as LadyLuckState);
            if (msg.type === 'll:spectator_count') {
              setState(prev => prev ? { ...prev, spectatorCount: msg.count as number } : prev);
            }
            if (msg.type === 'll:error')  {
              if (msg.message === 'table_not_found') setNotFound(true);
              else setError(msg.message);
            }
          } catch {}
        };

        ws.onclose = () => { if (alive) setConnected(false); };
      } catch {}
    };

    connect();

    return () => {
      alive = false;
      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'll:spectator_leave', tableId, userId: identity.id })); } catch {}
        }
        ws.close();
        wsRef.current = null;
      }
    };
  }, [tableId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const send = (msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const handleLockBet = () => {
    if (!sideBetSuit || sideBetAmt < 100 || sideBetAmt > 2000 || betLocked) return;
    setError(null);
    send({ type: 'll:spectator_sidebet', tableId, userId: identity.id, suit: sideBetSuit, amount: sideBetAmt });
    setMyBet({ suit: sideBetSuit, amount: sideBetAmt });
    setBetLocked(true);
  };

  const handleLeave = () => {
    send({ type: 'll:spectator_leave', tableId, userId: identity.id });
    wsRef.current?.close();
    navigate('/ladyluck');
  };

  const handleWatchNext = () => {
    setMyBet(null);
    setBetLocked(false);
    setSideBetSuit(null);
    setSideBetAmt(100);
    setError(null);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const phase        = state?.phase ?? null;
  const winner       = state?.winner ?? null;
  const didWin       = myBet && winner ? myBet.suit === winner : null;
  const grossPayout  = myBet ? Math.floor(myBet.amount * 2.5) : 0;
  const spectators   = state?.spectatorCount ?? 0;

  // ── Not found ──────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div style={{ ...RACE_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <div style={{ ...GLASS_CARD, padding: '28px 36px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'monospace', color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>Table not found or already closed.</p>
          <button data-testid="button-spectate-leave" onClick={() => navigate('/ladyluck')} style={{ background: '#C9A227', color: '#000', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 800, fontFamily: 'monospace', fontSize: 13, cursor: 'pointer', letterSpacing: 1 }}>
            ← BACK TO LOBBY
          </button>
        </div>
      </div>
    );
  }

  // ── Connecting ─────────────────────────────────────────────────────────────
  if (!connected || !state) {
    return (
      <div style={{ ...RACE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Connecting…</p>
      </div>
    );
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 20, color: '#C9A227', letterSpacing: 2 }}>LADY LUCK</span>
        <span data-testid="badge-spectating" style={{ background: 'rgba(201,162,39,0.15)', border: '1px solid rgba(201,162,39,0.4)', borderRadius: 6, padding: '2px 8px', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: '#C9A227', letterSpacing: 1 }}>
          SPECTATING
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span data-testid="text-spectator-count" style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)' }}>
          👁 {spectators} watching
        </span>
        <button data-testid="button-spectate-leave" onClick={handleLeave} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 12px', fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', letterSpacing: 0.5 }}>
          LEAVE
        </button>
      </div>
    </div>
  );

  // ── RESULTS phase ──────────────────────────────────────────────────────────
  if (phase === 'RESULTS') {
    return (
      <div style={{ ...RACE_BG, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {header}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px 24px' }}>

          {/* Winner card */}
          <div style={{ ...GLASS_CARD, padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: 6 }}>WINNER</div>
            <div style={{ fontSize: 40, color: winner ? SUIT_COLS[winner] : '#fff' }}>{winner ? SUIT_SYMS[winner] : '?'}</div>
            <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 18, color: '#C9A227', letterSpacing: 1, marginTop: 4 }}>
              {winner ? QUEEN_NAMES[winner].toUpperCase() : '—'}
            </div>
          </div>

          {/* My bet result */}
          {myBet && (
            <div style={{ ...GLASS_CARD, padding: '16px 20px', textAlign: 'center', border: didWin ? '1px solid rgba(201,162,39,0.5)' : '1px solid rgba(255,80,80,0.3)' }}>
              {didWin ? (
                <>
                  <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 22, color: '#C9A227', letterSpacing: 1 }}>YOU WIN!</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
                    +{grossPayout.toLocaleString()} CHIPS
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    {SUIT_SYMS[myBet.suit]} {QUEEN_NAMES[myBet.suit]} · bet {myBet.amount.toLocaleString()}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 22, color: '#e53935', letterSpacing: 1 }}>YOU LOSE</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                    -{myBet.amount.toLocaleString()} CHIPS
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    {SUIT_SYMS[myBet.suit]} {QUEEN_NAMES[myBet.suit]} · bet {myBet.amount.toLocaleString()}
                  </div>
                </>
              )}
            </div>
          )}

          {!myBet && (
            <div style={{ ...GLASS_CARD, padding: '14px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>No side bet placed</div>
            </div>
          )}

          {/* Race track replay */}
          <div style={{ ...GLASS_CARD, padding: '14px 16px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 10 }}>FINAL POSITIONS</div>
            <RaceTrack positions={state.positions} winner={winner} myBetSuit={myBet?.suit ?? null} />
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button data-testid="button-watch-next" onClick={handleWatchNext} style={{ flex: 1, background: '#C9A227', color: '#000', border: 'none', borderRadius: 10, padding: '13px 0', fontWeight: 800, fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', letterSpacing: 1 }}>
              WATCH NEXT RACE
            </button>
            <button data-testid="button-leave-results" onClick={handleLeave} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.65)', borderRadius: 10, padding: '13px 18px', fontWeight: 700, fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', letterSpacing: 0.5 }}>
              LEAVE
            </button>
          </div>

          {state.resultsTimeLeft != null && (
            <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              Next race in {state.resultsTimeLeft}s
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RACE phase ─────────────────────────────────────────────────────────────
  if (phase === 'RACE') {
    return (
      <div style={{ ...RACE_BG, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {header}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px 24px' }}>

          {/* Race tracker */}
          <div style={{ ...GLASS_CARD, padding: '16px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 12 }}>RACE IN PROGRESS</div>
            <RaceTrack positions={state.positions} winner={state.winner} myBetSuit={myBet?.suit ?? null} />
          </div>

          {/* Current card */}
          {state.currentCard && (
            <div style={{ ...GLASS_CARD, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>LAST FLIP</div>
              <div style={{ fontFamily: 'monospace', fontSize: 18, color: SUIT_COLS[state.currentCard.suit], fontWeight: 700 }}>
                {state.currentCard.rank}{SUIT_SYMS[state.currentCard.suit]}
              </div>
            </div>
          )}

          {/* My side bet status */}
          {myBet ? (
            <div style={{ ...GLASS_CARD, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, color: SUIT_COLS[myBet.suit] }}>{SUIT_SYMS[myBet.suit]}</span>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
                  YOUR SIDE BET · {QUEEN_NAMES[myBet.suit]}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  {myBet.amount.toLocaleString()} chips · pays {Math.floor(myBet.amount * 2.5).toLocaleString()} on win
                </div>
              </div>
            </div>
          ) : (
            <div style={{ ...GLASS_CARD, padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>No side bet placed for this race</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── BET / WAGER phase — show side bet panel ────────────────────────────────
  if (phase === 'BET' || phase === 'WAGER') {
    const canBet = !betLocked;
    return (
      <div style={{ ...RACE_BG, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {header}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px 24px' }}>

          {/* Phase status */}
          <div style={{ ...GLASS_CARD, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2 }}>
              {phase === 'BET' ? `BET OPEN · ${state.betTimeLeft ?? ''}s` : 'PLAYERS WAGERING…'}
            </div>
          </div>

          {/* Side bet panel */}
          <div style={{ ...GLASS_CARD, padding: '18px 16px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', letterSpacing: 2, fontWeight: 700, marginBottom: 14 }}>PLACE SIDE BET</div>

            {canBet ? (
              <>
                {/* Queen card picker */}
                <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 16 }}>
                  {SUITS.map(suit => (
                    <QueenCard
                      key={suit}
                      suit={suit}
                      selected={sideBetSuit === suit}
                      onSelect={() => setSideBetSuit(suit)}
                      disabled={false}
                    />
                  ))}
                </div>

                {/* Wager input */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 6, letterSpacing: 1 }}>
                    AMOUNT (100–2,000)
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[100, 200, 500, 1000, 2000].map(v => (
                      <button
                        key={v}
                        data-testid={`spectate-bet-chip-${v}`}
                        onClick={() => setSideBetAmt(v)}
                        style={{
                          background: sideBetAmt === v ? '#C9A227' : 'rgba(255,255,255,0.07)',
                          color: sideBetAmt === v ? '#000' : 'rgba(255,255,255,0.7)',
                          border: sideBetAmt === v ? 'none' : '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 7, padding: '6px 10px', fontSize: 10, fontFamily: 'monospace',
                          fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
                        }}
                      >
                        {v >= 1000 ? `${v / 1000}K` : v}
                      </button>
                    ))}
                  </div>
                  <input
                    data-testid="spectate-bet-input"
                    type="number" min={100} max={2000} step={100}
                    value={sideBetAmt}
                    onChange={e => setSideBetAmt(Math.max(100, Math.min(2000, Number(e.target.value))))}
                    style={{ marginTop: 8, width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontFamily: 'monospace', fontSize: 13, padding: '8px 12px', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Lock in bet */}
                <button
                  data-testid="button-lock-bet"
                  onClick={handleLockBet}
                  disabled={!sideBetSuit || sideBetAmt < 100 || sideBetAmt > 2000}
                  style={{
                    width: '100%', background: sideBetSuit ? '#C9A227' : 'rgba(255,255,255,0.1)',
                    color: sideBetSuit ? '#000' : 'rgba(255,255,255,0.35)',
                    border: 'none', borderRadius: 10, padding: '13px 0',
                    fontWeight: 800, fontFamily: 'monospace', fontSize: 13,
                    cursor: sideBetSuit ? 'pointer' : 'default', letterSpacing: 1,
                  }}
                >
                  LOCK IN BET
                </button>

                {!sideBetSuit && (
                  <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                    Pick a queen to activate
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, color: SUIT_COLS[myBet!.suit], marginBottom: 6 }}>{SUIT_SYMS[myBet!.suit]}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>
                  BET LOCKED — {QUEEN_NAMES[myBet!.suit].toUpperCase()}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                  {myBet!.amount.toLocaleString()} chips · pays {Math.floor(myBet!.amount * 2.5).toLocaleString()} on win
                </div>
              </div>
            )}

            {error && (
              <div data-testid="spectate-error" style={{ marginTop: 10, background: 'rgba(229,57,53,0.12)', border: '1px solid #e5393560', borderRadius: 8, padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#ff6b6b', textAlign: 'center' }}>
                {error}
              </div>
            )}
          </div>

          {/* Pot info */}
          {state.pot > 0 && (
            <div style={{ ...GLASS_CARD, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>MAIN POT</span>
              <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#C9A227', fontWeight: 700 }}>{state.pot.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LOBBY / SELECT / other phases — waiting screen ─────────────────────────
  return (
    <div style={{ ...RACE_BG, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {header}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px 24px' }}>
        <div style={{ ...GLASS_CARD, padding: '28px 20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 16, color: '#C9A227', letterSpacing: 1, marginBottom: 8 }}>
            {phase === 'LOBBY' ? 'RACE STARTING SOON' : phase === 'SELECT' ? 'PLAYERS SELECTING QUEENS' : 'RACE IN PROGRESS'}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {state.players.filter(p => p.presence !== 'open').length} players · {spectators} watching
          </div>
          {state.startingIn != null && (
            <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 36, color: '#C9A227', marginTop: 12 }}>
              {state.startingIn}
            </div>
          )}
        </div>

        <div style={{ ...GLASS_CARD, padding: '14px 16px' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, marginBottom: 8 }}>RACE POSITIONS</div>
          <RaceTrack positions={state.positions} winner={state.winner} myBetSuit={myBet?.suit ?? null} />
        </div>

        <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>
          Side bet panel opens during BET phase
        </div>
      </div>
    </div>
  );
}
