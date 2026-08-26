import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardType, GameState } from '@/lib/poker/types';
import { hasMadeHand } from '../../../../shared/modes/boxchevy';
import { PlayingCard } from '@/components/game/Card';

const SLV  = '#94a3b8';
const ACT  = '#60a5fa';
const nvA  = (a: number) => `rgba(15,28,46,${a})`;
const blA  = (a: number) => `rgba(59,130,246,${a})`;

function PipRow({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: 13, height: 19, borderRadius: 3,
          background: nvA(0.7), border: `1px solid ${nvA(0.9)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 6, color: blA(0.3) }}>◈</div>
        </div>
      ))}
    </div>
  );
}

interface OpponentPanelProps {
  player: GameState['players'][0];
  phase: string;
}

function OpponentPanel({ player, phase }: OpponentPanelProps) {
  const isActive   = player.status === 'active';
  const folded     = player.status === 'folded';
  const isShowdown = phase === 'SHOWDOWN';
  const chipColor  = player.isWinner ? '#fbbf24' : SLV;

  return (
    <div style={{
      borderRadius: 10,
      background: 'rgba(0,0,0,0.50)',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      border: `1px solid ${isActive && !folded ? blA(0.35) : nvA(0.6)}`,
      padding: '6px 8px',
      display: 'flex', flexDirection: 'column', gap: 4,
      opacity: folded ? 0.45 : 1,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: folded ? SLV : '#e2e8f0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>
          {player.name}
        </span>
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: chipColor, fontWeight: 700 }}>
          ${player.chips}
        </span>
      </div>
      {player.declaration && (
        <div style={{
          fontSize: 8, fontWeight: 700, textAlign: 'center', fontFamily: 'monospace',
          color: player.declaration === 'SWING' ? '#fbbf24' : player.declaration === 'HIGH' ? ACT : '#86efac',
          background: player.declaration === 'SWING' ? 'rgba(251,191,36,0.15)' : player.declaration === 'HIGH' ? blA(0.12) : 'rgba(134,239,172,0.12)',
          borderRadius: 4, padding: '1px 4px',
        }}>
          {player.declaration}
        </div>
      )}
      {folded ? (
        <div style={{ fontSize: 8, textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>FOLDED</div>
      ) : isShowdown && player.cards.some(c => !c.isHidden) ? (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          {player.cards.map((c, i) => (
            <PlayingCard key={i} card={c} className="!w-[26px] !h-[38px]" />
          ))}
        </div>
      ) : (
        <PipRow count={player.cards.length || 5} />
      )}
    </div>
  );
}

interface BoxChevyTableProps {
  state: GameState;
  myId: string;
  phase: string;
  isDrawPhase: boolean;
}

export function BoxChevyTable({ state, myId, phase, isDrawPhase }: BoxChevyTableProps) {
  const me          = state.players.find(p => p.id === myId);
  const opponents   = state.players.filter(p => p.id !== myId);
  const communityCards: CardType[] = (state.communityCards ?? []).map(c => ({ ...c, isHidden: false }));

  const heroCards = (me?.cards ?? []).map(c => ({ ...c, isHidden: false }));
  const madeHand  = communityCards.length > 0 && heroCards.length > 0
    ? hasMadeHand(heroCards, communityCards)
    : null;

  const pot = state.pot;

  /* ── Staggered deal animation ─────────────────────────────────────────── */
  // visibleCount tracks how many community cards have animated in.
  // When communityCards transitions from 0→5 we stagger the reveal.
  // Joining mid-hand (cards already present) shows all immediately.
  const [visibleCount, setVisibleCount] = useState(communityCards.length);
  const prevLenRef = useRef(communityCards.length);
  const timersRef  = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const newLen = communityCards.length;
    const oldLen = prevLenRef.current;
    prevLenRef.current = newLen;

    if (newLen === 0) {
      // New hand reset — clear count so next deal animates
      setVisibleCount(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }

    if (oldLen === 0 && newLen > 0) {
      // Cards just dealt — stagger reveal: 200ms first card, +280ms each subsequent
      setVisibleCount(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      for (let i = 0; i < newLen; i++) {
        const t = setTimeout(() => setVisibleCount(i + 1), 200 + i * 300);
        timersRef.current.push(t);
      }
      return () => { timersRef.current.forEach(clearTimeout); };
    }

    // Mid-hand join or phase change — show all immediately
    if (newLen > oldLen) setVisibleCount(newLen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityCards.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Opponent grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: opponents.length <= 2 ? `repeat(${Math.max(1, opponents.length)}, 1fr)` : 'repeat(2, 1fr)',
        gap: 8,
      }}>
        {opponents.slice(0, 4).map(opp => (
          <OpponentPanel key={opp.id} player={opp} phase={phase} />
        ))}
      </div>

      {/* Community cards — staggered animation */}
      <div style={{
        borderRadius: 14,
        background: 'rgba(0,0,0,0.60)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid rgba(96,165,250,0.30)`,
        padding: '10px 12px 14px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          fontSize: 8, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.22em',
          color: ACT, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase',
        }}>
          ◈ COMMUNITY CARDS ◈
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'flex-end' }}>
          {communityCards.length > 0 ? (
            communityCards.map((c, i) => (
              <div key={i} style={{ flexShrink: 0, width: 58, height: 84 }}>
                <AnimatePresence>
                  {i < visibleCount && (
                    <motion.div
                      key={`comm-${i}`}
                      initial={{ opacity: 0, y: -22, rotateY: 90, scale: 0.85 }}
                      animate={{ opacity: 1, y: 0,   rotateY: 0,  scale: 1    }}
                      transition={{ duration: 0.32, ease: 'easeOut' }}
                      style={{ transformOrigin: 'top center' }}
                    >
                      <PlayingCard card={c} className="!w-[58px] !h-[84px] sm:!w-[68px] sm:!h-[96px]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          ) : (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: 58, height: 84, borderRadius: 8,
                border: `1px dashed ${nvA(0.5)}`,
                background: nvA(0.25),
                flexShrink: 0,
              }} />
            ))
          )}
        </div>
      </div>

      {/* Pot + phase + made-hand — high-contrast dark backdrop */}
      <div style={{
        borderRadius: 10,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        fontFamily: 'monospace', fontSize: 11,
        boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
      }}>
        <div style={{ color: SLV }}>
          POT <span style={{ color: '#e2e8f0', fontWeight: 700 }}>${pot}</span>
        </div>

        {madeHand !== null && (phase === 'BET_1' || phase === 'BET_2' || phase === 'BET_3' || isDrawPhase) && (
          <div style={{
            fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
            color: madeHand ? '#86efac' : '#fca5a5',
            background: madeHand ? 'rgba(134,239,172,0.18)' : 'rgba(252,165,165,0.18)',
            border: `1px solid ${madeHand ? 'rgba(134,239,172,0.45)' : 'rgba(252,165,165,0.45)'}`,
            borderRadius: 6, padding: '2px 8px',
          }}>
            {madeHand ? '✓ MADE HAND' : '✗ NO MADE HAND'}
          </div>
        )}

        <div style={{
          fontSize: 9, fontWeight: 700,
          color: 'rgba(255,255,255,0.75)',
          background: 'rgba(255,255,255,0.07)',
          borderRadius: 5, padding: '2px 7px',
          letterSpacing: '0.10em',
        }}>
          {phase.replace(/_/g, ' ')}
        </div>
      </div>
    </div>
  );
}
