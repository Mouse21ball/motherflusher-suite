/**
 * BadugiTable — visual table layer for the Badugi game mode.
 * Mirrors FlushedUpTable structure with gold (#C9A227) accent colour
 * and a 4-card hand layout specific to Badugi.
 *
 * No WinnerOverlay: ShowdownReveal (z-200 fixed) handles SHOWDOWN display.
 * No debug PHASE/SELECTED strip.
 */
import { motion, useSpring, useTransform } from 'framer-motion';
import { Crown } from 'lucide-react';
import { YardOpponentSeat } from '@/components/game/YardOpponentSeat';
import { useEffect } from 'react';
import type { GameState } from '@/lib/poker/types';
import { CardHand } from '@/components/flushedUp/CardHand';
import type { CardAnimState } from '@/components/flushedUp/useCardAnimations';
import { evaluateBadugi } from '@shared/modes/badugi';
import { FiveSeatPokerTable, type FiveSeatOpponent } from '@/components/game/FiveSeatPokerTable';
import { BadugiTableEffects } from './BadugiTableEffects';
import { TableBoard } from '@/components/game/TableBoard';
import { YardHeroIdentity } from '@/components/game/YardHeroIdentity';

const GOLD = 'rgba(201,162,39,';
const HERO_CARD_W = 68;
const HERO_CARD_H = 95;

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
      <motion.div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 800, color: '#FDE68A', letterSpacing: '0.05em' }}>
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

  /* Read-only evaluator powers the live hand label; it never changes game state. */
  const heroHandEval = me && me.cards.length > 0 && !me.cards.some(card => card.isHidden)
    ? evaluateBadugi(me.cards.map(c => ({ ...c, isHidden: false })) as Parameters<typeof evaluateBadugi>[0])
    : null;
  const heroIsWinner = !!(me as any)?.isWinner;
  const heroIsLoser  = isShowdown && !heroIsWinner && me?.status !== 'folded';

  /* Opponent reorder: player left of hero first */
  const myIndex     = state.players.findIndex(p => p.id === myId);
  const chipLeaderId = state.players.reduce((leader, player) => player.chips > (leader?.chips ?? -1) ? player : leader, state.players[0])?.id;
  const gridOpps    = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId);
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
      isChipLeader: opp.id === chipLeaderId,
      seatNum: parseInt(opp.id.replace('p', ''), 10) || 1,
      isOpen: opp.presence === 'reserved' || opp.presence === 'open',
    })),
    ...Array.from({ length: Math.max(0, 3 - gridOpps.length) }, (_, index) => ({
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
  const opponentSeats = opponents.map((opponent) => <div key={opponent.id} data-deal-seat={opponent.id} data-player-seat={opponent.id}>
    <YardOpponentSeat name={opponent.name} chips={opponent.chips} seat={opponent.seatNum} active={opponent.isActive} chipLeader={opponent.isChipLeader}
      folded={opponent.status === 'folded'} winner={opponent.isWinner} dealer={opponent.isDealer} open={opponent.isOpen}>
      {!opponent.isOpen && opponent.status !== 'folded' && <span className="yard-opponent-cards">
        {Array.from({ length: Math.max(1, opponent.cardCount) }).map((_, index) => <i key={index} data-celebration-card />)}
      </span>}
    </YardOpponentSeat>
  </div>);

  /* Suppress hero hand glow when not winning */
  const heroFilter  = heroIsLoser ? 'brightness(0.6) saturate(0.5)' : 'none';
  const heroCards = me ? (
    <div className="yard-hero-hand">
      <YardHeroIdentity state={state} myId={myId} accent="#8B5CF6" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 8, flexShrink: 0, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        {isDrawPhase && (
          <motion.div className="yard-discard-prompt" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            style={{ marginBottom: 4, padding: '3px 12px', borderRadius: 20, background: `${GOLD}0.2)`, border: `1px solid ${GOLD}0.4)`,
              fontSize: 14, fontFamily: 'monospace', color: '#FBBF24', letterSpacing: '0.04em' }}>
            ↻ SELECT CARDS TO DISCARD{selectedCardIndices.length ? ` · ${selectedCardIndices.length} SELECTED` : ''}
          </motion.div>
        )}
        {me && me.cards.length > 0 && me.status !== 'folded' ? <>
          <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '12px 10px 4px', overflow: 'visible', filter: heroFilter, transition: 'filter 0.4s ease' }}>
            <CardHand cards={me.cards} celebrationCardMarkers selectedIndices={selectedCardIndices} onCardClick={onCardClick}
              isSelectable={isDrawPhase} dealingIndices={animState.dealingIndices} drawingIndices={animState.drawingIndices}
              discardingIndices={animState.discardingIndices} isShowdown={isShowdown} cardWidth={HERO_CARD_W} cardHeight={HERO_CARD_H} testIdPrefix="badugi-card" />
          </div>
          {isShowdown && heroHandEval && <div style={{ marginTop: 3, fontSize: 11, fontFamily: 'monospace',
            color: heroIsWinner ? '#C9A227' : 'rgba(255,255,255,0.7)', fontWeight: heroIsWinner ? 700 : 400,
            letterSpacing: '0.08em', textAlign: 'center', textShadow: heroIsWinner ? `0 0 10px ${GOLD}0.65)` : '0 1px 6px rgba(0,0,0,0.9)' }}>
            {heroHandEval.description}
          </div>}
        </> : me?.status === 'folded' ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.62 }}
          style={{ padding: '18px 26px', color: 'rgba(255,255,255,0.62)', font: '700 11px monospace', letterSpacing: '0.14em' }}>FOLDED</motion.div>
          : <div style={{ display: 'flex', gap: 4, paddingTop: 16, paddingBottom: 6 }}>{Array.from({ length: 4 }).map((_, i) =>
            <div key={i} style={{ width: HERO_CARD_W, height: HERO_CARD_H, borderRadius: 8, border: `1px dashed ${GOLD}0.12)` }} />)}</div>}
      </div>
    </div>
  ) : undefined;

  return (
    <TableBoard gameAccent="#8B5CF6" title="BADUGI" subtitle="4-CARD DRAW" phase={state.phase} heroCards={heroCards} heroPlayerId={myId}
      opponentSeats={opponentSeats}
      centerReadout={<span className="yard-table-readout">{isDrawPhase ? `DRAW ${state.phase.split('_')[1]} / 3 · ` : ''}{heroHandEval?.description ?? (me?.status === 'folded' ? 'FOLDED' : 'WAITING FOR HAND')}</span>}
      pot={state.pot > 0 ? <AnimatedPot pot={state.pot} /> : undefined}>
    <FiveSeatPokerTable
      players={state.players}
      phase={state.phase}
      myId={myId}
       opponents={[]}
      accent="#8B5CF6"
      modeLabel="badugi"
      activePlayerId={state.activePlayerId}
      turnDeadline={state.turnDeadline}
      heroInBoardSlot
      effects={tableRoot => <BadugiTableEffects state={state} tableRoot={(tableRoot?.closest('.yard-table-board') as HTMLElement | null) ?? tableRoot} />}
      center={(
        <>
        {/* "BADUGI" watermark */}
        <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.4em', color: `${GOLD}0.08)`, textTransform: 'uppercase', userSelect: 'none' }}>
          BADUGI
        </div>

        </>
      )}
      hero={null}
    />
    </TableBoard>
  );
}
