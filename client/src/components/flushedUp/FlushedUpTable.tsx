import { motion, useSpring, useTransform } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import type { GameState } from '@shared/gameTypes';
import { CardHand } from './CardHand';
import { OpponentSeat } from './OpponentSeat';
import { WinnerOverlay } from './WinnerOverlay';
import type { CardAnimState } from './useCardAnimations';

/* ── Frosted glass token ─────────────────────────────────────────────────── */
const glass = {
  background: 'rgba(0,0,0,0.45)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
} as const;

/* ── Animated pot counter ─────────────────────────────────────────────────── */

function AnimatedPot({ pot }: { pot: number }) {
  const spring = useSpring(pot, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, v => Math.round(v).toLocaleString());
  useEffect(() => { spring.set(pot); }, [pot, spring]);

  return (
    <div style={{
      ...glass,
      textAlign: 'center',
      padding: '5px 18px',
      borderRadius: '20px',
      boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
    }}>
      <div style={{ fontSize: '8px', fontFamily: 'monospace', color: 'rgba(201,162,39,0.55)', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
        POT
      </div>
      <motion.div style={{
        fontSize: '14px', fontFamily: 'monospace', fontWeight: 700,
        color: '#C9A227', letterSpacing: '0.08em',
        display: 'inline-block',
      }}>
        {display}
      </motion.div>
    </div>
  );
}

/* ── Seat positions (% of container width, fixed layout for up to 4 opp) ── */

const OPPONENT_POSITIONS: Array<{ left: string; top: string }> = [
  { left: '10%',  top: '14%' },
  { left: '32%',  top: '2%'  },
  { left: '56%',  top: '2%'  },
  { left: '80%',  top: '14%' },
];

/* ── Phase label ─────────────────────────────────────────────────────────── */

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    WAITING: 'WAITING',
    ANTE:    'ANTE',
    DEAL:    'DEALING',
    BET_1:   'FIRST BET',
    DRAW_1:  'DRAW 1 · DISCARD UP TO 3',
    BET_2:   'SECOND BET',
    DRAW_2:  'DRAW 2 · DISCARD UP TO 2',
    BET_3:   'THIRD BET',
    DRAW_3:  'DRAW 3 · DISCARD UP TO 1',
    BET_4:   'FINAL BET',
    SHOWDOWN:'SHOWDOWN',
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

  /* Reorder: player left of hero first, wrap around, max 4 opponents */
  const myIndex = state.players.findIndex(p => p.id === myId);
  const reorderedOpps = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId).slice(0, 4);

  /* Winner overlay */
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

  const oppCardW = 30;
  const oppCardH = 44;
  const heroCardW = 60;
  const heroCardH = 86;

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 340, padding: '0 8px' }}>

      {/* ── Opponent floating seats ─────────────────────────────────────── */}
      {reorderedOpps.map((opp, i) => {
        const pos = OPPONENT_POSITIONS[i] ?? OPPONENT_POSITIONS[OPPONENT_POSITIONS.length - 1];
        const isFolded = opp.status === 'folded';
        const isAbsent = opp.presence === 'reserved';

        if (isAbsent) {
          return (
            <div key={opp.id} style={{ position: 'absolute', ...pos, transform: 'translate(-50%, 0)', zIndex: 5 }}>
              <div style={{
                padding: '5px 10px', borderRadius: '10px',
                border: '1px dashed rgba(255,255,255,0.08)',
                minWidth: 56, textAlign: 'center',
              }}>
                <div style={{ fontSize: '8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.18)' }}>OPEN</div>
              </div>
            </div>
          );
        }

        return (
          <div key={opp.id} style={{ position: 'absolute', ...pos, transform: 'translate(-50%, 0)', zIndex: 5 }}>
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
              cardWidth={oppCardW}
              cardHeight={oppCardH}
            />
          </div>
        );
      })}

      {/* ── Centre: phase label + pot — both float freely ───────────────── */}
      <div style={{
        position: 'absolute', left: '50%', top: '48%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        zIndex: 4, pointerEvents: 'none',
      }}>
        <motion.div
          key={state.phase}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            fontSize: '9px', fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.38)',
            letterSpacing: '0.2em', textTransform: 'uppercase',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}
        >
          {phaseLabel(state.phase)}
        </motion.div>
        {state.pot > 0 && <AnimatedPot pot={state.pot} />}
      </div>

      {/* ── Hero area — fully transparent, only cards visible ───────────── */}
      <div style={{
        position: 'relative',
        marginTop: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 10,
      }}>
        {/* Hero identity row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          {me?.isDealer && (
            <div style={{
              width: 17, height: 17, borderRadius: '50%',
              background: 'linear-gradient(135deg, #C9A227, #A07C10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '7px', fontWeight: 700, color: '#000', fontFamily: 'monospace',
              boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
            }}>D</div>
          )}
          {state.activePlayerId === myId && state.phase !== 'WAITING' && (
            <motion.div
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 0.85, repeat: Infinity }}
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#C9A227',
                boxShadow: '0 0 8px rgba(201,162,39,0.9)',
              }}
            />
          )}
          <span style={{
            fontSize: '11px', fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.82)', fontWeight: 600,
            letterSpacing: '0.04em',
            textShadow: '0 1px 6px rgba(0,0,0,0.9)',
          }}>
            {me?.name ?? 'You'}
          </span>
          {me && me.chips > 0 && (
            <span style={{
              fontSize: '10px', fontFamily: 'monospace',
              color: 'rgba(201,162,39,0.85)', fontWeight: 600,
              letterSpacing: '0.06em',
              textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            }}>
              {me.chips.toLocaleString()}
            </span>
          )}
        </div>

        {/* Hero cards — float directly on background with no backing panel */}
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
          /* Empty ghost slots */
          <div style={{ display: 'flex', gap: 6, paddingTop: 12, paddingBottom: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: heroCardW, height: heroCardH, borderRadius: '10px',
                border: '1px dashed rgba(255,255,255,0.1)',
              }} />
            ))}
          </div>
        )}

        {/* Hero current-bet chip */}
        {me && me.bet > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              marginTop: 3,
              fontSize: '9px', fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}
          >
            BET {me.bet.toLocaleString()}
          </motion.div>
        )}

        {/* Draw phase instruction */}
        {isDrawPhase && (
          <motion.div
            key={state.phase}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              marginTop: 6,
              fontSize: '9px', fontFamily: 'monospace',
              color: 'rgba(201,162,39,0.65)', letterSpacing: '0.15em',
              textTransform: 'uppercase',
              textShadow: '0 1px 6px rgba(0,0,0,0.9)',
            }}
          >
            {selectedCardIndices.length === 0 ? 'TAP CARDS TO DISCARD' : `${selectedCardIndices.length} SELECTED · TAP DRAW`}
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
