import { useEffect } from 'react';
import { AnimatedCard } from './AnimatedCard';
import { PlayingCard } from '@/components/game/Card';
import type { CardType } from '@/lib/poker/types';

/* ─── Fan layout ─────────────────────────────────────────────────────────── */

function fanParams(index: number, total: number): { rotation: number; yOffset: number } {
  if (total <= 1) return { rotation: 0, yOffset: 0 };
  const stepDeg = 5;
  const span    = (total - 1) * stepDeg;
  const rotation = -span / 2 + index * stepDeg;
  const mid  = (total - 1) / 2;
  const dist = index - mid;
  const yOffset = dist * dist * 1.5;
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
  // Alias so the user-specified name matches throughout this component.
  const toggleCardSelection = onCardClick;

  // Confirm the function ref is valid on every render where isSelectable=true.
  useEffect(() => {
    if (isSelectable) {
      console.log('[FlushedUp] toggleCardSelection ref:', typeof toggleCardSelection, toggleCardSelection);
    }
  }, [isSelectable, toggleCardSelection]);

  const flushIndices = isShowdown ? detectFlushCards(cards) : new Set<number>();
  const hasFlush = flushIndices.size > 0;

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

        const needsAnimation = isDeal || isDraw || isDiscarding;

        if (isSelectable) {
          return (
            <div
              key={index}
              onClick={() => toggleCardSelection(index)}
              style={{
                cursor: 'pointer',
                display: 'inline-block',
                position: 'relative',
                width: cardWidth,
                height: cardHeight,
                flexShrink: 0,
                transform: isSelected
                  ? `rotate(${rotation}deg) translateY(${yOffset - 30}px)`
                  : `rotate(${rotation}deg) translateY(${yOffset}px)`,
                transformOrigin: 'center bottom',
                border: isSelected ? '2px solid #a855f7' : '2px solid transparent',
                boxShadow: isSelected
                  ? '0 0 12px rgba(168,85,247,0.95), 0 0 28px rgba(168,85,247,0.55)'
                  : 'none',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                borderRadius: '8px',
              }}
            >
              <div style={{ width: '100%', height: '100%' }}>
                <PlayingCard
                  card={card.isHidden ? undefined : card}
                  className="!w-full !h-full !rounded-[8px] !shrink-0"
                />
              </div>

              {/* Selection ✕ badge */}
              {isSelected && (
                <div
                  style={{
                    position: 'absolute', top: -7, right: -7,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#a855f7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 700, color: '#fff',
                    boxShadow: '0 0 8px rgba(168,85,247,0.8)',
                    zIndex: 20, lineHeight: 1,
                    pointerEvents: 'none',
                  }}
                >
                  ✕
                </div>
              )}
            </div>
          );
        }

        /* Non-draw phase or currently-animating card → full AnimatedCard */
        return (
          <AnimatedCard
            key={index}
            card={card}
            isHidden={card.isHidden}
            fanRotation={rotation}
            fanY={yOffset}
            isSelected={isSelected}
            isSelectable={isSelectable && !isDiscarding}
            onSelect={() => toggleCardSelection(index)}
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
