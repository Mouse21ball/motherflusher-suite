import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { GameState, CardType } from '@/lib/poker/types';
import { evaluateBoxChevy } from '../../../../shared/modes/boxchevy';
import { PlayingCard } from '@/components/game/Card';

const SLV  = '#94a3b8';
const ACT  = '#60a5fa';
const nvA  = (a: number) => `rgba(15,28,46,${a})`;
const blA  = (a: number) => `rgba(59,130,246,${a})`;

const SUITS_SYMBOL: Record<string, string> = { hearts:'♥', diamonds:'♦', clubs:'♣', spades:'♠' };
const SUITS_COLOR:  Record<string, string> = { hearts:'#f87171', diamonds:'#f87171', clubs:'#cbd5e1', spades:'#cbd5e1' };

function SmallCard({ card }: { card: CardType }) {
  if (card.isHidden) {
    return (
      <div style={{
        width: 26, height: 38, borderRadius: 4,
        background: nvA(0.8), border: `1px solid ${nvA(0.9)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 6, color: blA(0.3) }}>◈</span>
      </div>
    );
  }
  const color = SUITS_COLOR[card.suit] ?? SLV;
  return (
    <div style={{
      width: 26, height: 38, borderRadius: 4,
      background: 'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(240,244,248,0.94) 100%)',
      border: '1px solid rgba(0,0,0,0.15)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 1, flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1 }}>{card.rank}</div>
      <div style={{ fontSize: 9, color, lineHeight: 1 }}>{SUITS_SYMBOL[card.suit] ?? '?'}</div>
    </div>
  );
}

function declColor(d: string | null | undefined) {
  if (d === 'HIGH')  return { color: ACT,      bg: blA(0.15),               border: blA(0.45)               };
  if (d === 'LOW')   return { color: '#86efac', bg: 'rgba(134,239,172,0.12)', border: 'rgba(134,239,172,0.4)' };
  if (d === 'SWING') return { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.4)'  };
  return { color: SLV, bg: nvA(0.4), border: nvA(0.6) };
}

const COUNTDOWN_SECS = 8;

function CountdownRing({ value, max }: { value: number; max: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const progress = value / max;
  return (
    <svg width={58} height={58} viewBox="0 0 58 58">
      <circle cx="29" cy="29" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="29" cy="29" r={r} fill="none"
        stroke={value <= 2 ? '#f87171' : value <= 4 ? '#fbbf24' : '#60a5fa'}
        strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - progress)}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '29px 29px', transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
      />
      <text x="29" y="34" textAnchor="middle" fontFamily="monospace" fontWeight="700" fontSize="16"
        fill={value <= 2 ? '#f87171' : value <= 4 ? '#fbbf24' : '#e2e8f0'}>
        {value}
      </text>
    </svg>
  );
}

interface BoxChevyShowdownProps {
  state: GameState;
  myId: string;
  onContinue: () => void;
}

export function BoxChevyShowdown({ state, myId, onContinue }: BoxChevyShowdownProps) {
  const communityCards: CardType[] = (state.communityCards ?? []).map(c => ({ ...c, isHidden: false }));
  const players = state.players.map(p => ({ ...p, cards: p.cards.map(c => ({ ...c, isHidden: false })) }));
  const me = players.find(p => p.id === myId);

  /* ── Countdown ────────────────────────────────────────────────────────── */
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  useEffect(() => {
    const iv = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(iv); onContinueRef.current(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const activePlayers = players.filter(p =>
    p.status !== 'folded' && p.declaration && p.declaration !== 'FOLD'
  );
  const winners = players.filter(p => p.isWinner);
  const primaryWinner = winners[0] ?? null;

  const resolutionMessages = (state.messages ?? [])
    .filter(m => m.isResolution || m.text.includes('wins') || m.text.includes('SWING') || m.text.includes('HIGH') || m.text.includes('LOW'))
    .slice(-5);

  void me;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      background: 'rgba(0,0,0,0.80)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }}>
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{
          width: '100%', maxWidth: 500,
          background: `linear-gradient(180deg, #0f1c2e 0%, #091628 100%)`,
          border: `1px solid ${blA(0.3)}`,
          borderBottom: 'none',
          borderRadius: '16px 16px 0 0',
          padding: '16px 14px 28px',
          display: 'flex', flexDirection: 'column', gap: 12,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header + countdown */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.12em',
              color: blA(0.7), textTransform: 'uppercase', marginBottom: 2,
            }}>
              BOX CHEVY · SHOWDOWN
            </div>
            {winners.length > 0 && (
              <div style={{
                fontSize: 15, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.1em',
                color: '#fbbf24',
              }}>
                {winners.map(w => w.name).join(' & ')} WIN{winners.length > 1 ? '' : 'S'}!
              </div>
            )}
          </div>
          <CountdownRing value={countdown} max={COUNTDOWN_SECS} />
        </div>

        {/* Winner combined 10-card display */}
        {primaryWinner && communityCards.length > 0 && (
          <div style={{
            borderRadius: 12,
            background: 'rgba(251,191,36,0.07)',
            border: '1px solid rgba(251,191,36,0.3)',
            padding: '10px 12px',
          }}>
            <div style={{
              fontSize: 11, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em',
              color: '#fbbf24', textAlign: 'center', marginBottom: 8,
            }}>
              🏆 {primaryWinner.name.toUpperCase()} — WINNING HAND
            </div>
            {/* Hole cards row */}
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)',
              letterSpacing: '0.08em', textAlign: 'center', marginBottom: 4,
            }}>
              HOLE CARDS
            </div>
            <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 8 }}>
              {primaryWinner.cards.map((c, i) => (
                <PlayingCard key={i} card={c} className="!w-[36px] !h-[52px]" />
              ))}
            </div>
            {/* Community cards row */}
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)',
              letterSpacing: '0.08em', textAlign: 'center', marginBottom: 4,
            }}>
              COMMUNITY CARDS
            </div>
            <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
              {communityCards.map((c, i) => (
                <PlayingCard key={i} card={c} className="!w-[36px] !h-[52px]" />
              ))}
            </div>
            {/* Hand descriptions */}
            {(() => {
              const ev = evaluateBoxChevy(primaryWinner.cards, communityCards);
              return (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  {(primaryWinner.declaration === 'HIGH' || primaryWinner.declaration === 'SWING') && ev.isMade && (
                    <span style={{ fontSize: 11, color: ACT, fontFamily: 'monospace', fontWeight: 700 }}>
                      ▲ {ev.highName}
                    </span>
                  )}
                  {(primaryWinner.declaration === 'LOW' || primaryWinner.declaration === 'SWING') && ev.isMade && (
                    <span style={{ fontSize: 11, color: '#86efac', fontFamily: 'monospace', fontWeight: 700 }}>
                      ▼ {ev.lowDesc}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Community cards reference */}
        <div style={{
          borderRadius: 10, background: nvA(0.6), border: `1px solid ${nvA(0.8)}`,
          padding: '8px 10px',
        }}>
          <div style={{
            fontSize: 11, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em',
            color: ACT, textAlign: 'center', marginBottom: 6,
          }}>
            ◈ COMMUNITY CARDS ◈
          </div>
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
            {communityCards.map((c, i) => <SmallCard key={i} card={c} />)}
          </div>
        </div>

        {/* All player results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activePlayers.map(p => {
            const isMe = p.id === myId;
            const ev = evaluateBoxChevy(p.cards, communityCards);
            const dc = declColor(p.declaration);
            const isWin = !!p.isWinner;
            return (
              <div key={p.id} style={{
                borderRadius: 10,
                background: isWin ? 'rgba(251,191,36,0.08)' : isMe ? blA(0.07) : nvA(0.5),
                border: `1px solid ${isWin ? 'rgba(251,191,36,0.3)' : isMe ? blA(0.25) : nvA(0.7)}`,
                padding: '8px 10px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: isMe ? ACT : '#e2e8f0' }}>
                    {p.name}{isMe ? ' (YOU)' : ''}
                  </span>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {isWin && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', fontFamily: 'monospace' }}>🏆 WINNER</span>
                    )}
                    {p.declaration && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                        color: dc.color, background: dc.bg,
                        border: `1px solid ${dc.border}`, borderRadius: 4, padding: '1px 5px',
                      }}>
                        {p.declaration}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                  {p.cards.map((c, i) => <SmallCard key={i} card={c} />)}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(p.declaration === 'HIGH' || p.declaration === 'SWING') && ev.isMade && (
                    <span style={{ fontSize: 11, color: ACT, fontFamily: 'monospace' }}>▲ {ev.highName}</span>
                  )}
                  {(p.declaration === 'LOW' || p.declaration === 'SWING') && ev.isMade && (
                    <span style={{ fontSize: 11, color: '#86efac', fontFamily: 'monospace' }}>▼ {ev.lowDesc}</span>
                  )}
                  {!ev.isMade && (
                    <span style={{ fontSize: 11, color: '#fca5a5', fontFamily: 'monospace' }}>✗ No made hand</span>
                  )}
                </div>
              </div>
            );
          })}
          {players.filter(p => p.status === 'folded').map(p => (
            <div key={p.id} style={{
              borderRadius: 8, background: nvA(0.3), border: `1px solid ${nvA(0.5)}`,
              padding: '6px 10px', opacity: 0.7,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#cbd5e1' }}>{p.name}</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>FOLDED</span>
            </div>
          ))}
        </div>

        {/* Resolution messages */}
        {resolutionMessages.length > 0 && (
          <div style={{
            borderRadius: 8, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
            padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            {resolutionMessages.map((m, i) => (
              <div key={m.id ?? i} style={{ fontSize: 11, color: '#fef3c7', fontFamily: 'monospace', textAlign: 'center' }}>
                {m.text}
              </div>
            ))}
          </div>
        )}

        {/* Continue button + countdown label */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={onContinue}
            data-testid="button-continue"
            style={{
              width: '100%', padding: '13px', borderRadius: 10,
              background: blA(0.18), border: `1px solid ${blA(0.5)}`,
              color: ACT, fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
              letterSpacing: '0.12em', cursor: 'pointer',
            }}
          >
            CONTINUE
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>
            Auto-advancing in {countdown}s…
          </div>
        </div>
      </motion.div>
    </div>
  );
}
