import React from 'react';
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
/*
 * During draw phases (isSelectable=true), interactive cards are rendered as
 * plain <div> elements with CSS transitions — ZERO framer-motion on the
 * tappable layer. This is the only approach that reliably fires onClick on
 * Android Chrome when framer-motion is anywhere in the ancestor tree.
 *
 * Cards that are currently animating (deal fly-in, draw fly-in, discard
 * fly-out) still use AnimatedCard so their entrance/exit animations play.
 * Once those animations finish the card is replaced by the plain div.
 *
 * Outside draw phases AnimatedCard is used for all cards as before.
 */

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

        /*
         * Draw-phase interactive path:
         * Use a plain <div> with CSS transitions — no framer-motion at all.
         * Cards currently mid-animation (dealing in, drawing in, discarding)
         * still use AnimatedCard so their entrance/exit plays correctly.
         */
        const needsAnimation = isDeal || isDraw || isDiscarding;

        if (isSelectable && !needsAnimation) {
          return (
            <div
              key={index}
              onClick={() => {
                console.log(
                  `[FlushedUp] card tap index=${index}`,
                  `was_selected=${isSelected}`,
                  `total_selected=${selectedIndices.length}`,
                );
                onCardClick(index);
              }}
              style={{
                width: cardWidth,
                height: cardHeight,
                flexShrink: 0,
                cursor: 'pointer',
                /*
                 * Fan rotation + selection lift in a single CSS transform.
                 * When selected: lift 30 px toward viewer (subtract from yOffset).
                 * transformOrigin 'center bottom' keeps the fan pivot correct.
                 */
                transform: isSelected
                  ? `rotate(${rotation}deg) translateY(${yOffset - 30}px)`
                  : `rotate(${rotation}deg) translateY(${yOffset}px)`,
                transformOrigin: 'center bottom',
                boxShadow: isSelected
                  ? '0 0 16px rgba(220,38,38,0.85), 0 0 32px rgba(220,38,38,0.35)'
                  : 'none',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                /* Mobile: remove 300 ms tap delay, suppress grey flash */
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
                borderRadius: '8px',
                /* Ensure pointer events are not blocked by parent transforms */
                isolation: 'isolate',
              } as React.CSSProperties}
            >
              {/* Shared PlayingCard — same as all other CGP game modes */}
              <PlayingCard
                card={card.isHidden ? undefined : card}
                className="!w-full !h-full !rounded-[8px] !shrink-0"
              />

              {/* Selection ✕ badge */}
              {isSelected && (
                <div
                  style={{
                    position: 'absolute', top: -7, right: -7,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#dc2020',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 700, color: '#fff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
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
