import { motion, useSpring, useTransform } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import type { GameState } from '@shared/gameTypes';
import { CardHand } from './CardHand';
import { OpponentSeat } from './OpponentSeat';
import { WinnerOverlay } from './WinnerOverlay';
import type { CardAnimState } from './useCardAnimations';

/* ── Animated pot counter ─────────────────────────────────────────────────── */

function AnimatedPot({ pot }: { pot: number }) {
  const spring = useSpring(pot, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, v => Math.round(v).toLocaleString());

  useEffect(() => { spring.set(pot); }, [pot, spring]);

  return (
    <div style={{
      textAlign: 'center',
      padding: '6px 16px',
      background: 'rgba(0,0,0,0.6)',
      borderRadius: '10px',
      border: '1px solid rgba(201,162,39,0.3)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
    }}>
      <div style={{ fontSize: '9px', fontFamily: 'monospace', color: 'rgba(201,162,39,0.6)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
        POT
      </div>
      <motion.div style={{
        fontSize: '15px', fontFamily: 'monospace', fontWeight: 700,
        color: '#C9A227', letterSpacing: '0.08em',
        display: 'inline-block',
      }}>
        {display}
      </motion.div>
    </div>
  );
}

/* ── Seat position math ────────────────────────────────────────────────────── */

const OPPONENT_POSITIONS: Array<{ left: string; top: string }> = [
  { left: '8%',  top: '18%' },
  { left: '30%', top: '4%'  },
  { left: '54%', top: '4%'  },
  { left: '78%', top: '18%' },
];

/* ── Phase label ─────────────────────────────────────────────────────────── */

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    WAITING: 'WAITING',
    ANTE: 'ANTE',
    DEAL: 'DEALING',
    BET_1: 'FIRST BET',
    DRAW_1: 'DRAW 1  ·  DISCARD UP TO 3',
    BET_2: 'SECOND BET',
    DRAW_2: 'DRAW 2  ·  DISCARD UP TO 2',
    BET_3: 'THIRD BET',
    DRAW_3: 'DRAW 3  ·  DISCARD UP TO 1',
    BET_4: 'FINAL BET',
    SHOWDOWN: 'SHOWDOWN',
  };
  return map[phase] ?? phase.replace(/_/g, ' ');
}

/* ── Props ───────────────────────────────────────────────────────────────── */

interface FlushedUpTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  animState: CardAnimState;
}

/* ── Table ───────────────────────────────────────────────────────────────── */

export function FlushedUpTable({
  state,
  myId,
  selectedCardIndices,
  onCardClick,
  isDrawPhase,
  animState,
}: FlushedUpTableProps) {
  const me = state.players.find(p => p.id === myId);
  const opponents = state.players.filter(p => p.id !== myId);

  /* Rearrange opponents so the one left of hero comes first */
  const myIndex = state.players.findIndex(p => p.id === myId);
  const reorderedOpps = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId).slice(0, 4);

  /* Winner detection */
  const [winnerData, setWinnerData] = useState<{ name: string; pot: number; isHero: boolean } | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const prevPhaseRef = useRef(state.phase);

  useEffect(() => {
    if (state.phase === 'SHOWDOWN' && prevPhaseRef.current !== 'SHOWDOWN') {
      const winner = state.players.find(p => p.isWinner);
      if (winner) {
        setTimeout(() => {
          setWinnerData({ name: winner.name, pot: state.pot, isHero: winner.id === myId });
          setShowWinner(true);
        }, 900);
      }
    }
    if (state.phase === 'WAITING') {
      setShowWinner(false);
      setWinnerData(null);
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, state.players, state.pot, myId]);

  /* Card widths based on device */
  const cardW = 52;
  const cardH = 76;
  const heroCardW = 60;
  const heroCardH = 86;

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 340, padding: '0 8px' }}>
      {/* ── Opponent seats ─────────────────────────────────────────────── */}
      {reorderedOpps.map((opp, i) => {
        const pos = OPPONENT_POSITIONS[i] ?? OPPONENT_POSITIONS[OPPONENT_POSITIONS.length - 1];
        const isFolded = opp.status === 'folded';
        const isAbsent = opp.presence === 'reserved';
        if (isAbsent) {
          return (
            <div key={opp.id} style={{
              position: 'absolute', ...pos, transform: 'translate(-50%, 0)',
            }}>
              <div style={{
                padding: '6px 10px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.1)',
                minWidth: 60, textAlign: 'center',
              }}>
                <div style={{ fontSize: '9px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)' }}>OPEN</div>
              </div>
            </div>
          );
        }
        return (
          <div key={opp.id} style={{
            position: 'absolute', ...pos, transform: 'translate(-50%, 0)',
            zIndex: 5,
          }}>
            <OpponentSeat
              name={opp.name}
              chips={opp.chips}
              cards={opp.cards}
              status={opp.status}
              isDealer={opp.isDealer}
              isActive={state.activePlayerId === opp.id}
              isWinner={!!opp.isWinner}
              isFolded={isFolded}
              isShowdown={state.phase === 'SHOWDOWN'}
              cardWidth={cardW}
              cardHeight={cardH}
            />
          </div>
        );
      })}

      {/* ── Center area: phase label + pot ──────────────────────────────── */}
      <div style={{
        position: 'absolute', left: '50%', top: '42%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        zIndex: 4,
      }}>
        <motion.div
          key={state.phase}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            fontSize: '9px', fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.18em', textTransform: 'uppercase',
          }}
        >
          {phaseLabel(state.phase)}
        </motion.div>
        {state.pot > 0 && <AnimatedPot pot={state.pot} />}
      </div>

      {/* ── Table oval graphic ──────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: '5%', left: '50%',
        width: '90%', height: '75%',
        transform: 'translateX(-50%)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(20,60,30,0.25) 0%, rgba(0,0,0,0.1) 100%)',
        pointerEvents: 'none',
        zIndex: 1,
      }} />

      {/* ── Hero seat area ─────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        marginTop: 190,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 10,
      }}>
        {/* Hero name + dealer chip row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
        }}>
          {me?.isDealer && (
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: 'linear-gradient(135deg, #C9A227, #A07C10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '8px', fontWeight: 700, color: '#000', fontFamily: 'monospace',
            }}>D</div>
          )}
          {state.activePlayerId === myId && state.phase !== 'WAITING' && (
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#C9A227',
                boxShadow: '0 0 8px rgba(201,162,39,0.9)',
              }}
            />
          )}
          <div style={{
            fontSize: '11px', fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.8)', fontWeight: 600,
            letterSpacing: '0.05em',
          }}>
            {me?.name ?? 'You'}
          </div>
          {me && me.chips > 0 && (
            <div style={{
              fontSize: '10px', fontFamily: 'monospace',
              color: 'rgba(201,162,39,0.85)', fontWeight: 600,
              letterSpacing: '0.05em',
            }}>
              {me.chips.toLocaleString()}
            </div>
          )}
        </div>

        {/* Hero card hand */}
        {me && me.cards.length > 0 ? (
          <CardHand
            cards={me.cards}
            selectedIndices={selectedCardIndices}
            onCardClick={onCardClick}
            isSelectable={isDrawPhase}
            dealingIndices={animState.dealingIndices}
            drawingIndices={animState.drawingIndices}
            discardingIndices={animState.discardingIndices}
            isShowdown={state.phase === 'SHOWDOWN'}
            cardWidth={heroCardW}
            cardHeight={heroCardH}
          />
        ) : (
          <div style={{
            display: 'flex', gap: 6, paddingTop: 12, paddingBottom: 8,
          }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: heroCardW, height: heroCardH, borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px dashed rgba(255,255,255,0.08)',
              }} />
            ))}
          </div>
        )}

        {/* Hero bet indicator */}
        {me && me.bet > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              fontSize: '10px', fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em',
              marginTop: 2,
            }}
          >
            BET {me.bet.toLocaleString()}
          </motion.div>
        )}
      </div>

      {/* ── Winner overlay ─────────────────────────────────────────────── */}
      {winnerData && (
        <WinnerOverlay
          show={showWinner}
          winnerName={winnerData.name}
          potAmount={winnerData.pot}
          isHeroWinner={winnerData.isHero}
          onDone={() => setShowWinner(false)}
        />
      )}
    </div>
  );
}
