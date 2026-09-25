/**
 * BadugiTable — visual table layer for the Badugi game mode.
 * Mirrors FlushedUpTable structure with gold (#C9A227) accent colour
 * and a 4-card hand layout specific to Badugi.
 *
 * No WinnerOverlay: ShowdownReveal (z-200 fixed) handles SHOWDOWN display.
 * No debug PHASE/SELECTED strip.
 */
import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import type { GameState } from '@/lib/poker/types';
import { CardHand } from '@/components/flushedUp/CardHand';
import type { CardAnimState } from '@/components/flushedUp/useCardAnimations';
import { evaluateBadugi } from '@shared/modes/badugi';
import { FiveSeatPokerTable, type FiveSeatOpponent } from '@/components/game/FiveSeatPokerTable';
import { BadugiTableEffects } from './BadugiTableEffects';

const GOLD = 'rgba(201,162,39,';
const HERO_CARD_W = 68;
const HERO_CARD_H = 95;

/* ── Phase label ──────────────────────────────────────────────────────────── */

function phaseLabel(phase: string): string {
  const m: Record<string, string> = {
    WAITING:  'WAITING FOR PLAYERS',
    ANTE:     'POSTING ANTE',
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
  return m[phase] ?? phase.replace(/_/g, ' ');
}

/* ── Animated pot ─────────────────────────────────────────────────────────── */

function AnimatedPot({ pot }: { pot: number }) {
  const spring  = useSpring(pot, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, v => Math.round(v).toLocaleString());
  useEffect(() => { spring.set(pot); }, [pot, spring]);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: `1px solid ${GOLD}0.35)`,
      boxShadow: `0 0 18px ${GOLD}0.18), 0 2px 10px rgba(0,0,0,0.5)`,
      padding: '6px 22px', borderRadius: 50, textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, fontFamily: 'monospace', color: `${GOLD}0.7)`, letterSpacing: '0.12em' }}>POT</div>
      <motion.div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>
        {display}
      </motion.div>
    </div>
  );
}

/* ── Props & main component ───────────────────────────────────────────────── */

export interface BadugiTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  animState: CardAnimState;
}

export function BadugiTable({ state, myId, selectedCardIndices, onCardClick, isDrawPhase, animState }: BadugiTableProps) {
  const me = state.players.find(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';

  /* Showdown hand label */
  const heroHandEval = isShowdown && me && me.cards.length > 0
    ? evaluateBadugi(me.cards.map(c => ({ ...c, isHidden: false })) as Parameters<typeof evaluateBadugi>[0])
    : null;
  const heroIsWinner = !!(me as any)?.isWinner;
  const heroIsLoser  = isShowdown && !heroIsWinner && me?.status !== 'folded';

  /* Opponent reorder: player left of hero first */
  const myIndex     = state.players.findIndex(p => p.id === myId);
  const gridOpps    = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId).slice(0, 4);
  const opponents: FiveSeatOpponent[] = [
    ...gridOpps.map(opp => ({
      id: opp.id,
      name: opp.name,
      chips: opp.chips,
      cardCount: opp.cards.length,
      status: opp.status,
      isActive: state.activePlayerId === opp.id,
      isWinner: !!(opp as any).isWinner,
      isDealer: !!(opp as any).isDealer,
      seatNum: parseInt(opp.id.replace('p', ''), 10) || 1,
      isOpen: opp.presence === 'reserved' || opp.presence === 'open',
    })),
    ...Array.from({ length: Math.max(0, 4 - gridOpps.length) }, (_, index) => ({
      id: `open-${index}`,
      name: 'OPEN',
      chips: 0,
      cardCount: 0,
      status: 'folded' as const,
      isActive: false,
      isWinner: false,
      isDealer: false,
      seatNum: 0,
      isOpen: true,
    })),
  ];

  /* Suppress hero hand glow when not winning */
  const heroFilter  = heroIsLoser ? 'brightness(0.6) saturate(0.5)' : 'none';

  return (
    <FiveSeatPokerTable
      players={state.players}
      phase={state.phase}
      myId={myId}
      opponents={opponents}
      accent="#c9a227"
      modeLabel="badugi"
      activePlayerId={state.activePlayerId}
      turnDeadline={state.turnDeadline}
      effects={tableRoot => <BadugiTableEffects state={state} tableRoot={tableRoot} />}
      center={(
        <>
        {/* Phase label */}
        <motion.div key={state.phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          style={{ fontSize: 11, fontFamily: 'monospace', color: `${GOLD}0.7)`, letterSpacing: '0.12em', textTransform: 'uppercase', textShadow: `0 0 12px ${GOLD}0.35)` }}>
          {phaseLabel(state.phase)}
        </motion.div>

        {/* "BADUGI" watermark */}
        <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.4em', color: `${GOLD}0.08)`, textTransform: 'uppercase', userSelect: 'none' }}>
          BADUGI
        </div>

        {state.pot > 0 && <AnimatedPot pot={state.pot} />}

        {/* Hero identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {(me as any)?.isDealer && (
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'linear-gradient(135deg, #C9A227, #A07C10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 700, color: '#000', fontFamily: 'monospace' }}>D</div>
          )}
          {state.activePlayerId === myId && state.phase !== 'WAITING' && (
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.85, repeat: Infinity }}
              style={{ width: 5, height: 5, borderRadius: '50%', background: '#C9A227' }} />
          )}
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.06em', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
            {me?.name ?? 'You'}
          </span>
        </div>
        </>
      )}
      hero={(
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 8, flexShrink: 0 }}>
        {/* Selection badge */}
        {isDrawPhase && selectedCardIndices.length > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            style={{ marginBottom: 4, padding: '3px 12px', borderRadius: 20,
              background: `${GOLD}0.2)`, border: `1px solid ${GOLD}0.4)`,
              fontSize: 11, fontFamily: 'monospace', color: '#C9A227', letterSpacing: '0.08em' }}>
            {selectedCardIndices.length} SELECTED · TAP DRAW
          </motion.div>
        )}

        {me && me.cards.length > 0 && me.status !== 'folded' ? (
          <>
            <div style={{ width: '100%', boxSizing: 'border-box', padding: '12px 10px 4px', overflow: 'visible', filter: heroFilter, transition: 'filter 0.4s ease' }}>
              <CardHand cards={me.cards} celebrationCardMarkers selectedIndices={selectedCardIndices} onCardClick={onCardClick}
                isSelectable={isDrawPhase} dealingIndices={animState.dealingIndices}
                drawingIndices={animState.drawingIndices} discardingIndices={animState.discardingIndices}
                isShowdown={isShowdown} cardWidth={HERO_CARD_W} cardHeight={HERO_CARD_H} />
            </div>

            {isShowdown && heroHandEval && (
              <div style={{ marginTop: 3, fontSize: 11, fontFamily: 'monospace',
                color: heroIsWinner ? '#C9A227' : 'rgba(255,255,255,0.7)',
                fontWeight: heroIsWinner ? 700 : 400, letterSpacing: '0.08em', textAlign: 'center',
                textShadow: heroIsWinner ? `0 0 10px ${GOLD}0.65)` : '0 1px 6px rgba(0,0,0,0.9)' }}>
                {heroHandEval.description}
              </div>
            )}
          </>
        ) : me?.status === 'folded' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.62 }}
            style={{ padding: '18px 26px', color: 'rgba(255,255,255,0.62)', font: '700 11px monospace', letterSpacing: '0.14em' }}
          >
            FOLDED
          </motion.div>
        ) : (
          /* Ghost card slots */
          <div style={{ display: 'flex', gap: 4, paddingTop: 16, paddingBottom: 6 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ width: HERO_CARD_W, height: HERO_CARD_H, borderRadius: 8, border: `1px dashed ${GOLD}0.12)` }} />
            ))}
          </div>
        )}
        </div>
      )}
    />
  );
}
