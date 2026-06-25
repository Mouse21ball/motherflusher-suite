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
      background: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(201,162,39,0.22)',
      textAlign: 'center',
      padding: '5px 16px',
      borderRadius: '20px',
      boxShadow: '0 2px 14px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        fontSize: '8px', fontFamily: 'monospace',
        color: 'rgba(201,162,39,0.5)', letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>
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

/* ── Phase label ─────────────────────────────────────────────────────────── */

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    WAITING:  'WAITING',
    ANTE:     'ANTE',
    DEAL:     'DEALING',
    BET_1:    'FIRST BET',
    DRAW_1:   'DRAW 1 · UP TO 3',
    BET_2:    'SECOND BET',
    DRAW_2:   'DRAW 2 · UP TO 2',
    BET_3:    'THIRD BET',
    DRAW_3:   'DRAW 3 · UP TO 1',
    BET_4:    'FINAL BET',
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

  /* Card sizes: opponent cards very small to fit panel; hero cards at proper ratio */
  const oppCardW = 22;   /* 22 × 31 ≈ 0.71 ratio */
  const oppCardH = 31;
  const heroCardW = 58;  /* 58 × 81 = 0.716 ≈ 0.714 ratio ✓ */
  const heroCardH = 81;

  return (
    /*
     * Layout: flex column
     *   top    — opponent panels in a centered flex-wrap row
     *   middle — pot + phase label, fills remaining space
     *   bottom — hero hand + identity
     */
    <div style={{
      position: 'relative',
      width: '100%',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 420,
    }}>

      {/* ── Opponents — top row, flex-wrap ────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 6,
        padding: '10px 10px 0',
      }}>
        {reorderedOpps.map((opp) => {
          if (opp.presence === 'reserved') {
            return (
              <div key={opp.id} style={{
                padding: '5px 10px', borderRadius: '10px',
                border: '1px dashed rgba(255,255,255,0.06)',
                minWidth: 52, textAlign: 'center',
              }}>
                <div style={{ fontSize: '8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)' }}>OPEN</div>
              </div>
            );
          }
          return (
            <OpponentSeat
              key={opp.id}
              name={opp.name}
              chips={opp.chips}
              cards={opp.cards}
              status={opp.status}
              isDealer={opp.isDealer}
              isActive={state.activePlayerId === opp.id}
              isWinner={!!opp.isWinner}
              isFolded={opp.status === 'folded'}
              isShowdown={state.phase === 'SHOWDOWN'}
              cardWidth={oppCardW}
              cardHeight={oppCardH}
            />
          );
        })}
      </div>

      {/* ── Centre — phase label + pot, grows to fill middle ─────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        pointerEvents: 'none',
        paddingBottom: 8,
      }}>
        <motion.div
          key={state.phase}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            fontSize: '9px', fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.2em', textTransform: 'uppercase',
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          }}
        >
          {phaseLabel(state.phase)}
        </motion.div>
        {state.pot > 0 && <AnimatedPot pot={state.pot} />}
      </div>

      {/* ── Hero area — bottom, no backing panel, cards float on background ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingBottom: 10,
      }}>
        {/* Hero identity row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          {me?.isDealer && (
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: 'linear-gradient(135deg, #C9A227, #A07C10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '7px', fontWeight: 700, color: '#000', fontFamily: 'monospace',
              boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
            }}>D</div>
          )}
          {state.activePlayerId === myId && state.phase !== 'WAITING' && (
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
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
              color: 'rgba(201,162,39,0.82)', fontWeight: 600,
              letterSpacing: '0.06em',
              textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            }}>
              {me.chips.toLocaleString()}
            </span>
          )}
        </div>

        {/* Hero cards — float directly on background, no backing panel */}
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
          <div style={{ display: 'flex', gap: 5, paddingTop: 18, paddingBottom: 6 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: heroCardW, height: heroCardH, borderRadius: '8px',
                border: '1px dashed rgba(255,255,255,0.08)',
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
              color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em',
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
              marginTop: 5,
              fontSize: '9px', fontFamily: 'monospace',
              color: 'rgba(201,162,39,0.6)', letterSpacing: '0.15em',
              textTransform: 'uppercase',
              textShadow: '0 1px 6px rgba(0,0,0,0.9)',
            }}
          >
            {selectedCardIndices.length === 0
              ? 'TAP CARDS TO DISCARD'
              : `${selectedCardIndices.length} SELECTED · TAP DRAW`}
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
