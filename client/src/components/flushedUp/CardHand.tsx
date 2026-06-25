import { AnimatedCard } from './AnimatedCard';
import type { CardType } from '@/lib/poker/types';

/* ─── Fan layout ─────────────────────────────────────────────────────────── */
/*
 * For 5 cards the user wants exactly -10, -5, 0, +5, +10 degrees.
 * We generalise this as: span = (n-1) * 5° for n ≤ 5 cards.
 * yOffset arc is gentle: dist² × 1.5 px (outer card dips ~6 px).
 */

function fanParams(index: number, total: number): { rotation: number; yOffset: number } {
  if (total <= 1) return { rotation: 0, yOffset: 0 };
  const stepDeg = 5;                        // 5° between adjacent cards
  const span    = (total - 1) * stepDeg;    // total arc
  const rotation = -span / 2 + index * stepDeg;
  const mid  = (total - 1) / 2;
  const dist = index - mid;
  const yOffset = dist * dist * 1.5;        // max ≈ 6 px for 5-card outer card
  return { rotation, yOffset };
}

/* ─── Flush detection ────────────────────────────────────────────────────── */

function detectFlushCards(cards: CardType[]): Set<number> {
  const counts: Record<string, number> = {};
  for (const c of cards) {
    if (!c.isHidden) counts[c.suit] = (counts[c.suit] ?? 0) + 1;
  }
  const flushSuit = Object.entries(counts).find(([, n]) => n >= 5)?.[0];
  if (!flushSuit) return new Set();
  return new Set(cards.map((c, i) => (c.suit === flushSuit ? i : -1)).filter(i => i >= 0));
}

/* ─── Props ──────────────────────────────────────────────────────────────── */

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

/* ─── CardHand ───────────────────────────────────────────────────────────── */

export function CardHand({
  cards,
  selectedIndices,
  onCardClick,
  isSelectable,
  dealingIndices,
  drawingIndices,
  discardingIndices,
  isShowdown,
  cardWidth = 58,
  cardHeight = 81,
}: CardHandProps) {
  const flushIndices = isShowdown ? detectFlushCards(cards) : new Set<number>();
  const hasFlush = flushIndices.size > 0;

  /* Slightly tighter gap so a 5-card fan at ±10° still fits on 375 px */
  const gap = Math.max(2, 5 - Math.max(0, cards.length - 4));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap,
        paddingTop: 20,
        paddingBottom: 6,
        position: 'relative',
        /* No overflow:hidden here — rotated cards need their full hit-area */
      }}
    >
      {cards.map((card, index) => {
        const { rotation, yOffset } = fanParams(index, cards.length);
        const isDeal       = dealingIndices.includes(index);
        const isDraw       = drawingIndices.includes(index);
        const isDiscarding = discardingIndices.includes(index);
        const isSelected   = selectedIndices.includes(index);
        const dealDelay    = index * 110;
        const drawDelay    = drawingIndices.indexOf(index) * 140;
        const discardDelay = discardingIndices.indexOf(index) * 50;
        const isFlushCard    = hasFlush && flushIndices.has(index);
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
            isShowdown={isShowdown}
            wasHiddenBeforeShowdown={false}
            isFlushCard={isFlushCard}
            isNonFlushCard={isNonFlushCard}
            width={cardWidth}
            height={cardHeight}
          />
        );
      })}
    </div>
  );
}
