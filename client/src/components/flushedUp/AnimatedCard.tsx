import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import type { CardType } from '@/lib/poker/types';
import { PlayingCard } from '@/components/game/Card';

/* ── Flush glow colour ─────────────────────────────────────────────────────── */

function suitGlowColor(suit: string): string {
  if (suit === 'hearts' || suit === 'diamonds') return 'rgba(196, 30, 58, 0.7)';
  if (suit === 'spades') return 'rgba(100, 130, 210, 0.7)';
  return 'rgba(30, 150, 70, 0.7)';
}

/* ── Props ─────────────────────────────────────────────────────────────────── */

export interface AnimatedCardProps {
  card?: CardType;
  isHidden?: boolean;

  fanRotation?: number;
  fanY?: number;

  isSelected?: boolean;
  isSelectable?: boolean;
  onSelect?: () => void;

  isDeal?: boolean;
  dealDelay?: number;
  isDraw?: boolean;
  drawDelay?: number;

  isDiscarding?: boolean;
  discardDelay?: number;

  isShowdown?: boolean;
  wasHiddenBeforeShowdown?: boolean;

  isFlushCard?: boolean;
  isNonFlushCard?: boolean;

  width?: number;
  height?: number;

  className?: string;
}

/* ── AnimatedCard ──────────────────────────────────────────────────────────── */
/*                                                                              */
/*  FIX 1 — Mobile tap: selectable hero cards are wrapped in a plain <button>. */
/*  The button owns the onClick; framer-motion motion.div inside is purely     */
/*  visual and has no gesture handlers. This is the only approach guaranteed   */
/*  to fire on Android Chrome without framer-motion swallowing the touch event.*/
/*                                                                              */
/*  FIX 2 — Card face/back uses the shared <PlayingCard> component from        */
/*  client/src/components/game/Card.tsx — identical look to all other CGP      */
/*  game modes (Badugi, Suits & Poker, 15/35, Dead 7).                         */
/* ─────────────────────────────────────────────────────────────────────────── */

export function AnimatedCard({
  card,
  isHidden = false,
  fanRotation = 0,
  fanY = 0,
  isSelected = false,
  isSelectable = false,
  onSelect,
  isDeal = false,
  dealDelay = 0,
  isDraw = false,
  drawDelay = 0,
  isDiscarding = false,
  discardDelay = 0,
  isShowdown = false,
  wasHiddenBeforeShowdown = false,
  isFlushCard = false,
  isNonFlushCard = false,
  width = 58,
  height = 81,
  className,
}: AnimatedCardProps) {
  const isFlying  = isDeal || isDraw;
  const flyDelay  = isDeal ? dealDelay : drawDelay;
  const glowColor = isFlushCard && card && !isHidden ? suitGlowColor(card.suit) : undefined;
  const cardDimmed = isNonFlushCard;

  /* Showdown reveal state */
  const [revealed, setRevealed] = useState(!wasHiddenBeforeShowdown);
  useEffect(() => {
    if (isShowdown && wasHiddenBeforeShowdown && !revealed) {
      const t = setTimeout(() => setRevealed(true), 300);
      return () => clearTimeout(t);
    }
    if (!isShowdown) setRevealed(!wasHiddenBeforeShowdown);
  }, [isShowdown, wasHiddenBeforeShowdown]);

  /*
   * resolvedCard: pass a real card to PlayingCard to show the face;
   * pass undefined to show the card back.
   */
  const resolvedCard: CardType | undefined = isHidden ? undefined : card;

  /* Shared card visual — uses the same PlayingCard as all other CGP modes */
  const cardEl = (
    <div
      style={{
        width: '100%', height: '100%',
        opacity: cardDimmed ? 0.38 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      <PlayingCard
        card={resolvedCard}
        className="!w-full !h-full !rounded-[8px] !shrink-0"
      />
    </div>
  );

  const DECK_Y = -380;

  /* ── Discard animation ──────────────────────────────────────────────── */
  if (isDiscarding) {
    return (
      <motion.div
        className={className}
        initial={{ x: 0, y: fanY, rotate: fanRotation, scale: 1, opacity: 1 }}
        animate={{
          x: (Math.random() - 0.5) * 60,
          y: -480,
          rotate: fanRotation + (Math.random() > 0.5 ? 28 : -28),
          scale: 0.65,
          opacity: 0,
        }}
        transition={{ duration: 0.22, delay: discardDelay / 1000, ease: [0.4, 0, 0.8, 0.2] }}
        style={{ width, height, flexShrink: 0, transformOrigin: 'center bottom', willChange: 'transform, opacity' }}
      >
        {cardEl}
      </motion.div>
    );
  }

  /* ── Flying in from deck ────────────────────────────────────────────── */
  if (isFlying) {
    return (
      <motion.div
        className={className}
        initial={{ x: 0, y: DECK_Y, scale: 0.6, rotate: (Math.random() - 0.5) * 20, opacity: 0 }}
        animate={{
          x: 0,
          y: [DECK_Y, DECK_Y * 0.3, fanY],
          scale: [0.6, 1.08, 1.0],
          rotate: [null, fanRotation * 0.5, fanRotation],
          opacity: [0, 1, 1],
        }}
        transition={{
          duration: 0.38, delay: flyDelay / 1000, ease: 'easeOut',
          y: { times: [0, 0.55, 1], ease: ['easeOut', 'easeInOut'] },
          scale: { times: [0, 0.65, 1] },
          opacity: { times: [0, 0.1, 1] },
        }}
        style={{ width, height, flexShrink: 0, transformOrigin: 'center center', willChange: 'transform, opacity' }}
      >
        {cardEl}
      </motion.div>
    );
  }

  /* ── Showdown flip ──────────────────────────────────────────────────── */
  if (isShowdown && wasHiddenBeforeShowdown) {
    /* Back visual — no card */
    const backEl = (
      <div style={{ width: '100%', height: '100%' }}>
        <PlayingCard className="!w-full !h-full !rounded-[8px] !shrink-0" />
      </div>
    );
    /* Face visual */
    const faceEl = (
      <div style={{ width: '100%', height: '100%', opacity: cardDimmed ? 0.38 : 1, transition: 'opacity 0.3s' }}>
        <PlayingCard
          card={resolvedCard}
          className="!w-full !h-full !rounded-[8px] !shrink-0"
        />
      </div>
    );

    return (
      <div style={{ width, height, flexShrink: 0, perspective: '600px' }} className={className}>
        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div
              key="back"
              style={{ width: '100%', height: '100%' }}
              initial={{ rotateY: 0 }}
              exit={{ rotateY: 90 }}
              transition={{ duration: 0.15, ease: 'easeIn' }}
            >
              {backEl}
            </motion.div>
          ) : (
            <motion.div
              key="front"
              style={{ width: '100%', height: '100%' }}
              initial={{ rotateY: -90 }}
              animate={{
                rotateY: 0,
                scale: isFlushCard ? [1, 1.06, 1] : 1,
                y: isFlushCard ? [0, -6, 0] : 0,
              }}
              transition={{
                rotateY: { duration: 0.15, ease: 'easeOut' },
                scale: { duration: 0.4, delay: 0.15 },
                y: { duration: 0.4, delay: 0.15 },
              }}
            >
              {card && !isHidden ? faceEl : backEl}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  /* ── Idle / selected ────────────────────────────────────────────────── */
  /*
   * The motion.div below handles lift (y), scale, and flush-glow (filter).
   * It is purely visual — no onClick, no whileTap, no gesture props.
   *
   * For selectable hero cards: this motion.div sits INSIDE a plain <button>.
   * The button owns the onClick. framer-motion never sees the pointer event,
   * so it cannot swallow the tap on Android Chrome.
   *
   * For non-selectable cards: a plain motion.div wrapper applies fan rotation.
   */
  const selectedLift = isSelected ? -28 : 0;

  const filterValue = isSelected
    ? 'drop-shadow(0 0 12px rgba(168,85,247,0.95)) drop-shadow(0 0 6px rgba(168,85,247,0.7))'
    : glowColor
    ? `drop-shadow(0 0 10px ${glowColor}) drop-shadow(0 0 4px ${glowColor})`
    : 'none';

  const animatedVisual = (
    <motion.div
      style={{ width: '100%', height: '100%', position: 'relative', willChange: 'transform' }}
      animate={{
        y: selectedLift + fanY,
        scale: isSelected ? 1.06 : 1,
        filter: filterValue,
      }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      {isSelected ? (
        /* Selected — static card with red glow from animate.filter above */
        cardEl
      ) : (
        /* Idle — gentle float */
        <motion.div
          style={{ width: '100%', height: '100%' }}
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatType: 'loop' }}
        >
          {cardEl}
        </motion.div>
      )}

      {/* Selection badge */}
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
    </motion.div>
  );

  /* FIX 1: Selectable hero cards → plain <button> owns the click */
  if (isSelectable && onSelect) {
    return (
      <button
        className={className}
        onClick={onSelect}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          outline: 'none',
          cursor: 'pointer',
          display: 'block',
          flexShrink: 0,
          width,
          height,
          /* Fan rotation lives here on a static CSS transform — no framer-motion */
          transform: `rotate(${fanRotation}deg)`,
          transformOrigin: 'center bottom',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        } as React.CSSProperties}
      >
        {animatedVisual}
      </button>
    );
  }

  /* Non-selectable — motion.div handles fan rotation and y */
  return (
    <motion.div
      className={className}
      style={{
        width,
        height,
        flexShrink: 0,
        rotate: fanRotation,
        transformOrigin: 'center bottom',
        willChange: 'transform',
        position: 'relative',
        cursor: 'default',
      }}
      animate={{ y: fanY }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      {animatedVisual}
    </motion.div>
  );
}
