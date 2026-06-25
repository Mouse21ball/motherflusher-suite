import { motion } from 'framer-motion';
import { AnimatedCard } from './AnimatedCard';
import type { CardType } from '@/lib/poker/types';

/* ── Fan layout math ─────────────────────────────────────────────────────── */

function fanParams(index: number, total: number): { rotation: number; yOffset: number } {
  if (total <= 1) return { rotation: 0, yOffset: 0 };
  const span = total === 2 ? 10 : total === 3 ? 16 : total <= 5 ? 24 : 30;
  const spread = span / (total - 1);
  const rotation = -span / 2 + index * spread;
  const mid = (total - 1) / 2;
  const dist = index - mid;
  const yOffset = dist * dist * 2.8;
  return { rotation, yOffset };
}

/* ── Flush card detection ────────────────────────────────────────────────── */

function detectFlushCards(cards: CardType[]): Set<number> {
  const suitCount: Record<string, number> = {};
  for (const c of cards) {
    if (!c.isHidden) suitCount[c.suit] = (suitCount[c.suit] ?? 0) + 1;
  }
  const flushSuit = Object.entries(suitCount).find(([, n]) => n >= 5)?.[0];
  if (!flushSuit) return new Set();
  return new Set(cards.map((c, i) => c.suit === flushSuit ? i : -1).filter(i => i >= 0));
}

/* ── Props ───────────────────────────────────────────────────────────────── */

interface CardHandProps {
  cards: CardType[];
  selectedIndices: number[];
  onCardClick: (index: number) => void;
  isSelectable: boolean;

  dealingIndices: number[];
  drawingIndices: number[];
  discardingIndices: number[];

  isShowdown: boolean;
  cardWidth?: number;
  cardHeight?: number;
}

/* ── CardHand ────────────────────────────────────────────────────────────── */

export function CardHand({
  cards,
  selectedIndices,
  onCardClick,
  isSelectable,
  dealingIndices,
  drawingIndices,
  discardingIndices,
  isShowdown,
  cardWidth = 56,
  cardHeight = 80,
}: CardHandProps) {
  const isShowdownPhase = isShowdown;
  const flushIndices = isShowdownPhase ? detectFlushCards(cards) : new Set<number>();
  const hasFlush = flushIndices.size > 0;

  const gap = Math.max(4, 8 - Math.max(0, cards.length - 4));

  return (
    <motion.div
      layout
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap,
        paddingTop: 32,
        paddingBottom: 8,
        position: 'relative',
      }}
    >
      {cards.map((card, index) => {
        const { rotation, yOffset } = fanParams(index, cards.length);
        const isDeal = dealingIndices.includes(index);
        const isDraw = drawingIndices.includes(index);
        const isDiscarding = discardingIndices.includes(index);
        const isSelected = selectedIndices.includes(index);
        const dealDelay = index * 120;
        const drawDelay = drawingIndices.indexOf(index) * 150;
        const discardDelay = discardingIndices.indexOf(index) * 50;

        const isFlushCard = hasFlush && flushIndices.has(index);
        const isNonFlushCard = hasFlush && !flushIndices.has(index);

        return (
          <AnimatedCard
            key={index}
            card={card}
            isHidden={card.isHidden}
            fanRotation={rotation}
            fanY={yOffset}
            isSelected={isSelected}
            isSelectable={isSelectable && !isDiscarding}
            onSelect={() => onCardClick(index)}
            isDeal={isDeal}
            dealDelay={dealDelay}
            isDraw={isDraw}
            drawDelay={drawDelay}
            isDiscarding={isDiscarding}
            discardDelay={discardDelay}
            isShowdown={isShowdownPhase}
            wasHiddenBeforeShowdown={isShowdownPhase && card.isHidden === false && false}
            isFlushCard={isFlushCard}
            isNonFlushCard={isNonFlushCard}
            width={cardWidth}
            height={cardHeight}
          />
        );
      })}
    </motion.div>
  );
}
