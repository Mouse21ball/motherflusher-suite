/**
 * BadugiTable — prototype-matched table layout (Detroit 2026-10-10).
 * Structure from Claude prototype: topbar → info grid → opponent grid →
 * big pot → hero (avatar + cards) → actions. Yard graphics on everything,
 * nothing that isn't needed.
 */
import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { GameState } from '@/lib/poker/types';
import type { Player } from '@shared/gameTypes';
import { CardHand } from '@/components/flushedUp/CardHand';
import type { CardAnimState } from '@/components/flushedUp/useCardAnimations';
import { evaluateBadugi } from '@shared/modes/badugi';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { UniversalTableHeader } from '@/components/game/UniversalTableHeader';
import { BadugiTableEffects } from './BadugiTableEffects';
import { PotStack } from '@/components/game/PotStack';
import { WinCelebration } from '@/components/game/WinCelebration';

const HERO_CARD_W = 72;
const HERO_CARD_H = 102;

function phaseLabel(phase: string): string {
  if (phase.startsWith('DRAW_')) return `DRAW ${phase.split('_')[1]} / 3`;
  if (phase.startsWith('BET_')) return 'BETTING';
  if (phase === 'SHOWDOWN') return 'SHOWDOWN';
  if (phase === 'ANTE') return 'ANTES';
  if (phase === 'WAITING') return 'WAITING';
  return phase.replace(/_/g, ' ');
}

function OpponentCell({ player, seatNum, isActive, isDrawPhase }: {
  player: Player; seatNum: number; isActive: boolean; isDrawPhase: boolean;
}) {
  const isFolded = player.status === 'folded';
  const badge = !isDrawPhase || isFolded ? null
    : player.lastDrawCount === undefined ? 'WAITING'
    : player.lastDrawCount === 0 ? 'STAND PAT'
    : `DREW ${player.lastDrawCount}`;
  const cardCount = 4;
  const darkened = isDrawPhase && player.lastDrawCount !== undefined ? player.lastDrawCount : 0;

  return (
    <div className={`pt-seat${isFolded ? ' is-out' : ''}${isActive ? ' is-turn' : ''}`}
      data-player-seat={player.id} data-deal-seat={player.id}>
      <div className="pt-sav">
        <img src={getAvatarForSeat(seatNum)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
        {isActive && <span className="pt-turn-ring" />}
      </div>
      <div className="pt-nm">{player.name}</div>
      <div className="pt-st">{player.chips.toLocaleString()}</div>
      {badge && <div className={`pt-tag${badge === 'WAITING' ? '' : ' hl'}`}>{badge}</div>}
      <div className="pt-cards">
        {Array.from({ length: cardCount }).map((_, i) => (
          <i key={i} className={i >= cardCount - darkened ? ' is-dark' : ''} />
        ))}
      </div>
    </div>
  );
}

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
  const [tableRoot, setTableRoot] = useState<HTMLElement | null>(null);

  const heroHandEval = me && me.cards.length > 0 && !me.cards.some(card => card.isHidden)
    ? evaluateBadugi(me.cards.map(c => ({ ...c, isHidden: false })) as Parameters<typeof evaluateBadugi>[0])
    : null;
  const heroIsLoser = isShowdown && !(me as any)?.isWinner && me?.status !== 'folded';

  const myIndex = state.players.findIndex(p => p.id === myId);
  const gridOpps = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId);

  const activeCount = state.players.filter(p => p.status === 'active').length;
  const potSpring = useSpring(state.pot, { stiffness: 80, damping: 20 });
  const potDisplay = useTransform(potSpring, v => Math.round(v).toLocaleString());
  useEffect(() => { potSpring.set(state.pot); }, [state.pot, potSpring]);

  const heroFilter = heroIsLoser ? 'brightness(0.6) saturate(0.5)' : 'none';
  const mySeatNum = myIndex + 1;

  // Win celebration — show for any winner at showdown (Detroit 2026-10-13)
  const showdownWinner = isShowdown ? state.players.find(p => (p as any).isWinner) : undefined;
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [celebratingWinnerId, setCelebratingWinnerId] = useState<string | null>(null);
  useEffect(() => {
    if (showdownWinner && celebratingWinnerId !== showdownWinner.id) {
      setCelebratingWinnerId(showdownWinner.id);
      setCelebrationKey(k => k + 1);
    } else if (!isShowdown && celebratingWinnerId) {
      setCelebratingWinnerId(null);
    }
  }, [isShowdown, showdownWinner, celebratingWinnerId]);

  return (
    <div className="pt-table" ref={setTableRoot}>
      <UniversalTableHeader mode="badugi" title="BADUGI" subtitle="4-CARD DRAW" />

      {/* Info grid */}
      <div className="pt-info">
        <div><b>PLAYERS</b><span>{activeCount} / {state.players.length}</span></div>
        <div><b>POT</b><span>${state.pot.toLocaleString()}</span></div>
        <div><b>DRAW</b><span>{state.phase.startsWith('DRAW_') ? `${state.phase.split('_')[1]} / 3` : '–'}</span></div>
        <div><b>PHASE</b><span>{phaseLabel(state.phase)}</span></div>
      </div>

      {/* Opponents */}
      <div className="pt-opps">
        {gridOpps.map((opp, i) => (
          <OpponentCell key={opp.id} player={opp} seatNum={i + 1}
            isActive={opp.id === state.activePlayerId} isDrawPhase={isDrawPhase} />
        ))}
      </div>

      {/* Big pot */}
      <div className="pt-pot" data-pot-anchor>
        <div className="pt-pot-label">POT</div>
        <PotStack amount={state.pot} />
        <motion.div className="pt-pot-value">{potDisplay}</motion.div>
      </div>

      {/* Hero */}
      <div className="pt-me" data-player-seat={myId} data-deal-seat={myId}>
        <div className={`pt-mehead${state.activePlayerId === myId ? ' is-turn' : ''}`}>
          <span className="pt-me-avatar">
            <img src={getAvatarForSeat(mySeatNum)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
          </span>
          <span className="pt-me-name">{me?.name ?? 'YOU'}</span>
          <span className="pt-me-stack">{(me?.chips ?? 0).toLocaleString()}</span>
        </div>
        {me && me.cards.length > 0 && me.status !== 'folded' ? (
          <>
            <div className="pt-hand" style={{ filter: heroFilter }}>
              <CardHand cards={me.cards} celebrationCardMarkers selectedIndices={selectedCardIndices} onCardClick={onCardClick}
                isSelectable={isDrawPhase} dealingIndices={animState.dealingIndices} drawingIndices={animState.drawingIndices}
                discardingIndices={animState.discardingIndices} isShowdown={isShowdown} cardWidth={HERO_CARD_W} cardHeight={HERO_CARD_H} testIdPrefix="badugi-card" />
            </div>
            <div className="pt-hint">
              {isDrawPhase ? `Tap cards to discard${selectedCardIndices.length ? ` · ${selectedCardIndices.length} selected` : ''}`
                : heroHandEval ? heroHandEval.description : ''}
            </div>
          </>
        ) : me?.status === 'folded' ? (
          <div className="pt-folded">FOLDED</div>
        ) : (
          <div className="pt-queued">DEALT IN NEXT HAND</div>
        )}
      </div>

      <div data-muck-anchor aria-hidden="true" className="pt-muck" />
      <BadugiTableEffects state={state} tableRoot={tableRoot} />

      {/* Win celebration — any winner at showdown (Detroit 2026-10-13) */}
      {celebratingWinnerId && showdownWinner && (
        <WinCelebration
          key={celebrationKey}
          winnerName={showdownWinner.name}
          onDone={() => setCelebratingWinnerId(null)}
        />
      )}
    </div>
  );
}
