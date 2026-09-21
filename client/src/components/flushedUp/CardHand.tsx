import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AnimatedCard } from './AnimatedCard';
import type { CardType } from '@/lib/poker/types';
import { getCardFanGeometry, getCardIdentity } from './cardFanGeometry';

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

export interface CardHandProps {
  cards: CardType[];
  selectedIndices?: number[];
  onCardClick?: (index: number) => void;
  isSelectable?: boolean;
  dealingIndices?: number[];
  drawingIndices?: number[];
  discardingIndices?: number[];
  isShowdown?: boolean;
  cardWidth?: number;
  cardHeight?: number;
  className?: string;
  testIdPrefix?: string;
}

/* ─── CardHand ───────────────────────────────────────────────────────────── */

export function CardHand({
  cards,
  selectedIndices = [],
  onCardClick,
  isSelectable = false,
  dealingIndices = [],
  drawingIndices = [],
  discardingIndices = [],
  isShowdown = false,
  cardWidth = 58,
  cardHeight = 81,
  className,
  testIdPrefix,
}: CardHandProps) {
  const handRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(320);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const node = handRef.current;
    if (!node) return;
    const update = () => setAvailableWidth(Math.max(1, node.clientWidth));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const flushIndices = isShowdown ? detectFlushCards(cards) : new Set<number>();
  const hasFlush = flushIndices.size > 0;

  const geometries = useMemo(
    () => cards.map((_, index) => getCardFanGeometry(index, cards.length, availableWidth, cardWidth)),
    [availableWidth, cardWidth, cards.length],
  );
  const maxDrop = geometries.reduce((max, geometry) => Math.max(max, geometry.yOffset), 0);
  const scale = geometries[0]?.scale ?? 1;

  return (
    <div
      ref={handRef}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 0,
        paddingTop: 20 + maxDrop,
        paddingBottom: 8,
        position: 'relative',
        width: '100%',
        minWidth: 0,
        overflow: 'visible',
      }}
    >
      <AnimatePresence initial={false}>
        {cards.map((card, index) => {
          const { rotation, yOffset, overlap } = geometries[index];
          const isDeal       = dealingIndices.includes(index);
          const isDraw       = drawingIndices.includes(index);
          const isDiscarding = discardingIndices.includes(index);
          const isSelected   = selectedIndices.includes(index);
          const dealDelay    = index * 110;
          const drawDelay    = drawingIndices.indexOf(index) * 140;
          const discardDelay = discardingIndices.indexOf(index) * 50;
          const isFlushCard    = hasFlush && flushIndices.has(index);
          const isNonFlushCard = hasFlush && !flushIndices.has(index);

          // Occurrence is part of the key: duplicate cards and hidden placeholders
          // remain visually stable when the server replaces one card in-place.
          const occurrence = cards.slice(0, index).filter(previous =>
            previous.rank === card.rank &&
            previous.suit === card.suit
          ).length;
          const identity = getCardIdentity(card, occurrence);
          return (
            <motion.div
              layout="position"
              key={identity}
              data-testid={testIdPrefix ? `${testIdPrefix}-${index}` : undefined}
              initial={false}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
              transition={reducedMotion
                ? { duration: 0 }
                : { layout: { duration: 0.16, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.12 } }}
              style={{
                width: cardWidth,
                height: cardHeight,
                flexShrink: 0,
                marginLeft: index === 0 ? 0 : -overlap,
                position: 'relative',
                zIndex: isSelected ? cards.length + 10 : index,
              }}
            >
              <AnimatedCard
                card={card}
                isHidden={card.isHidden}
                fanRotation={rotation}
                fanY={yOffset}
                isSelected={isSelected}
                isSelectable={isSelectable && !isDiscarding}
                onSelect={onCardClick ? () => onCardClick(index) : undefined}
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
                scale={scale}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
