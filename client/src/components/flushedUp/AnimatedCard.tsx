import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import type { CardType } from '@/lib/poker/types';

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Suit SVG paths + colour helpers                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

const HEART_PATH  = 'M50,83 C50,83 4,51 4,27 C4,10 17,2 31,7 C40,10 50,22 50,22 C50,22 60,10 69,7 C83,2 96,10 96,27 C96,51 50,83 50,83Z';
const DIAMOND_PATH = 'M50,4 L96,50 L50,96 L4,50Z';
const CLUB_PATH   = 'M50,8 a22,22 0 1,0 0.01,0Z M26,58 a22,22 0 1,0 0.01,0Z M74,58 a22,22 0 1,0 0.01,0Z M43,70 l14,0 l0,22 l-14,0Z M32,88 l36,0 l0,10 l-36,0Z';
const SPADE_PATH  = 'M50,5 L80,44 C87,53 83,65 73,65 C65,65 58,59 55,52 C58,64 54,73 50,73 C46,73 42,64 45,52 C42,59 35,65 27,65 C17,65 13,53 20,44Z M43,73 l14,0 l0,22 l-14,0Z M32,89 l36,0 l0,10 l-36,0Z';

const SUIT_VIEWBOX: Record<string, string> = {
  hearts:   '0 0 100 90',
  diamonds: '2 2 96 96',
  clubs:    '4 6 92 92',
  spades:   '13 4 74 96',
};

function isRedSuit(s: string) { return s === 'hearts' || s === 'diamonds'; }

function suitPath(suit: string) {
  if (suit === 'hearts')   return HEART_PATH;
  if (suit === 'diamonds') return DIAMOND_PATH;
  if (suit === 'clubs')    return CLUB_PATH;
  return SPADE_PATH;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Premium card face                                                          */
/*                                                                             */
/*  Design:                                                                    */
/*   • Warm cream background  #FDF6E3                                          */
/*   • Gold hairline border                                                    */
/*   • Rank + mini-suit in top-left / bottom-right (rotated)                  */
/*   • Large centered suit at 60 % of card area                               */
/*   • Hearts/diamonds → deep crimson #C41E3A                                 */
/*   • Spades/clubs    → near-black  #1a1a1a                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function CardFace({
  card,
  dimmed,
  glowColor,
}: {
  card: CardType;
  dimmed?: boolean;
  glowColor?: string;
}) {
  const red  = isRedSuit(card.suit);
  const ink  = red ? '#C41E3A' : '#1a1a1a';
  const vbox = SUIT_VIEWBOX[card.suit] ?? '0 0 100 100';
  const path = suitPath(card.suit);

  const shadow = glowColor
    ? `0 0 16px 5px ${glowColor}, 0 3px 10px rgba(0,0,0,0.38)`
    : '0 3px 10px rgba(0,0,0,0.38)';

  return (
    <div
      style={{
        width: '100%', height: '100%',
        position: 'relative', overflow: 'hidden',
        borderRadius: '8px',
        background: '#FDF6E3',
        border: '1px solid rgba(201,162,39,0.5)',
        boxShadow: shadow,
        opacity: dimmed ? 0.38 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      {/* ── Top-left corner ── */}
      <div style={{
        position: 'absolute', top: 3, left: 4,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        lineHeight: 1,
      }}>
        <span style={{
          color: ink, fontSize: '12px', fontWeight: 800,
          fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1,
        }}>
          {card.rank}
        </span>
        <svg viewBox={vbox} fill={ink} width={10} height={10} aria-hidden="true">
          <path d={path} />
        </svg>
      </div>

      {/* ── Large center suit ── */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox={vbox} fill={ink} style={{ width: '60%', height: '60%' }} aria-hidden="true">
          <path d={path} />
        </svg>
      </div>

      {/* ── Bottom-right corner (rotated 180°) ── */}
      <div style={{
        position: 'absolute', bottom: 3, right: 4,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        transform: 'rotate(180deg)', lineHeight: 1,
      }}>
        <span style={{
          color: ink, fontSize: '12px', fontWeight: 800,
          fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1,
        }}>
          {card.rank}
        </span>
        <svg viewBox={vbox} fill={ink} width={10} height={10} aria-hidden="true">
          <path d={path} />
        </svg>
      </div>

      {/* ── Warm top-shine ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '30%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, transparent 100%)',
        pointerEvents: 'none',
        borderRadius: '8px 8px 0 0',
      }} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Card back                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function CardBack() {
  return (
    <div
      className="w-full h-full rounded-[8px] overflow-hidden"
      style={{
        boxShadow: '0 3px 12px rgba(0,0,0,0.5)',
        border: '1px solid rgba(201,162,39,0.2)',
      }}
    >
      <img src="/ladyluck/card-back-cgp.png" alt="" className="w-full h-full object-cover" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Flush glow colour                                                          */
/* ─────────────────────────────────────────────────────────────────────────── */

function suitGlowColor(suit: string): string {
  if (suit === 'hearts' || suit === 'diamonds') return 'rgba(196, 30, 58, 0.7)';
  if (suit === 'spades') return 'rgba(100, 130, 210, 0.7)';
  return 'rgba(30, 150, 70, 0.7)';
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Props                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────────────────── */
/*  AnimatedCard                                                               */
/*                                                                             */
/*  FIX 1 — Click handling                                                    */
/*  ───────────────────────────────────────────────────────────────────────── */
/*  Problem: `onClick` on a framer-motion `motion.div` that also has           */
/*  `whileTap`/`whileHover` can silently fail on mobile because framer's      */
/*  pointer-gesture detector consumes the touch stream before the synthetic    */
/*  React click event fires.                                                   */
/*                                                                             */
/*  Solution: a transparent "click-catcher" <div> is absolutely positioned    */
/*  inside the motion wrapper at z-index 10. It uses a plain React onClick    */
/*  — no framer-motion involved at all. The motion.div only handles the        */
/*  lift/scale/glow animation (animate prop). No whileTap, no whileHover,     */
/*  no onClick on the motion.div itself.                                       */
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

  const DECK_Y = -380;

  /* ── Discard ────────────────────────────────────────────────────────── */
  if (isDiscarding) {
    return (
      <motion.div
        className={className}
        initial={{ x: 0, y: fanY, rotate: fanRotation, scale: 1, opacity: 1 }}
        animate={{ x: (Math.random() - 0.5) * 60, y: -480, rotate: fanRotation + (Math.random() > 0.5 ? 28 : -28), scale: 0.65, opacity: 0 }}
        transition={{ duration: 0.22, delay: discardDelay / 1000, ease: [0.4, 0, 0.8, 0.2] }}
        style={{ width, height, flexShrink: 0, transformOrigin: 'center bottom', willChange: 'transform, opacity' }}
      >
        {isHidden || !card ? <CardBack /> : <CardFace card={card} />}
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
        {isHidden || !card ? <CardBack /> : <CardFace card={card} dimmed={cardDimmed} glowColor={glowColor} />}
      </motion.div>
    );
  }

  /* ── Showdown flip ──────────────────────────────────────────────────── */
  if (isShowdown && wasHiddenBeforeShowdown) {
    return (
      <div style={{ width, height, flexShrink: 0, perspective: '600px' }} className={className}>
        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div key="back" style={{ width: '100%', height: '100%' }}
              initial={{ rotateY: 0 }} exit={{ rotateY: 90 }}
              transition={{ duration: 0.15, ease: 'easeIn' }}>
              <CardBack />
            </motion.div>
          ) : (
            <motion.div key="front" style={{ width: '100%', height: '100%' }}
              initial={{ rotateY: -90 }}
              animate={{ rotateY: 0, scale: isFlushCard ? [1, 1.06, 1] : 1, y: isFlushCard ? [0, -6, 0] : 0 }}
              transition={{ rotateY: { duration: 0.15, ease: 'easeOut' }, scale: { duration: 0.4, delay: 0.15 }, y: { duration: 0.4, delay: 0.15 } }}>
              {card && !isHidden
                ? <CardFace card={card} dimmed={cardDimmed} glowColor={glowColor} />
                : <CardBack />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  /* ── Idle / selected ────────────────────────────────────────────────── */
  /*
   * The outer motion.div handles lift + glow via `animate`.
   * It has NO onClick, NO whileTap, NO whileHover — these framer-motion
   * gesture props can swallow the touch stream on mobile before the
   * synthetic React click event fires.
   *
   * Instead, a transparent "click-catcher" <div> is absolutely inset at
   * z-index 10 with a plain React onClick.  This fires reliably on both
   * desktop and mobile because it bypasses framer-motion's gesture system.
   */
  const selectedLift = isSelected ? -28 : 0;

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
        cursor: isSelectable ? 'pointer' : 'default',
      }}
      animate={{
        y: selectedLift + fanY,
        scale: isSelected ? 1.06 : 1,
        filter: isSelected
          ? 'drop-shadow(0 0 10px rgba(210,30,30,0.9)) drop-shadow(0 0 4px rgba(210,30,30,0.6))'
          : 'none',
      }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      /* NO onClick / whileTap / whileHover here — see click-catcher below */
    >
      {/*
        ── Transparent click-catcher ──────────────────────────────────────
        Plain <div> with React onClick — no framer-motion, no gestures.
        Sits above the card content (z-index 10).
        touchAction:'manipulation' removes the 300 ms delay on iOS/Android.
        WebkitTapHighlightColor:'transparent' suppresses the grey flash.
      */}
      {isSelectable && onSelect && (
        <div
          onClick={() => {
            console.log('[FlushedUp] card tapped — isSelectable:', isSelectable, 'onSelect fn:', !!onSelect);
            onSelect();
          }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          } as React.CSSProperties}
        />
      )}

      {/* ── Card visual content (pointerEvents:none so catcher wins) ── */}
      <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
        {isSelected ? (
          /* Selected: static, red glow comes from outer animate.filter */
          isHidden || !card
            ? <CardBack />
            : <CardFace card={card} dimmed={cardDimmed} glowColor={glowColor} />
        ) : (
          /* Idle: gentle slow float */
          <motion.div
            style={{ width: '100%', height: '100%' }}
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatType: 'loop' }}
          >
            {isHidden || !card
              ? <CardBack />
              : <CardFace card={card} dimmed={cardDimmed} glowColor={glowColor} />}
          </motion.div>
        )}
      </div>

      {/* ── Selection badge ── */}
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
    </motion.div>
  );
}
