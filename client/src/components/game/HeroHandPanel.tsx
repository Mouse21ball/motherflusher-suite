import { useMemo } from 'react';
import { CardHand } from '@/components/flushedUp/CardHand';
import { evaluateBadugi } from '@/lib/poker/modes/badugi';
import type { CardType, GamePhase, Player } from '@/lib/poker/types';

interface HeroHandPanelProps {
  player: Player;
  modeId: string;
  phase: GamePhase;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
  sessionNetProfit?: number;
  isShowdown?: boolean;
  communityCards?: CardType[];
}

export function HeroHandPanel({
  player,
  modeId,
  phase,
  selectedCardIndices,
  onCardClick,
  selectableCards,
  sessionNetProfit = 0,
  isShowdown = false,
  communityCards = [],
}: HeroHandPanelProps) {
  const qualifier = useMemo(() => {
    if (modeId !== 'badugi' || !player.cards.length || ['WAITING', 'ANTE', 'DEAL', 'SHOWDOWN'].includes(phase)) return null;
    const result = evaluateBadugi(player.cards);
    return result?.isValidBadugi ? result.description : 'No Badugi yet';
  }, [modeId, player.cards, phase]);
  const drawing = phase === 'DRAW_1' || phase === 'DRAW_2' || phase === 'DRAW_3';

  return (
    <section className="w-full rounded-xl border border-white/[0.08] bg-[#0B0B0D]/85 px-3 py-2 shadow-xl backdrop-blur-md" data-testid="panel-hero-hand">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Your hand</div>
        <div className="font-mono text-[11px] text-emerald-200/70" aria-live="polite">
          {qualifier ?? (drawing ? 'Choose cards to draw' : '')}
        </div>
      </div>
      <CardHand
        cards={player.cards.map(card => ({ ...card, isHidden: !isShowdown && card.isHidden }))}
        selectedIndices={selectedCardIndices}
        onCardClick={onCardClick}
        isSelectable={selectableCards}
        dealingIndices={[]}
        drawingIndices={[]}
        discardingIndices={[]}
        isShowdown={isShowdown}
      />
      {communityCards.length > 0 && (
        <div className="sr-only" aria-label={`${communityCards.length} community cards in play`}>
          {communityCards.length} community cards
        </div>
      )}
      <div className="mt-1 text-center font-mono text-[10px] text-white/35">
        {sessionNetProfit >= 0 ? '+' : ''}{sessionNetProfit.toLocaleString()} session
      </div>
    </section>
  );
}
