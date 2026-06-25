import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { CardType } from '@/lib/poker/types';

/* ── Suit icon SVGs (self-contained) ─────────────────────────────────────── */

function SuitIcon({ suit, size = 24 }: { suit: string; size?: number }) {
  const red = '#CC1122';
  const blk = '#18181E';
  if (suit === 'hearts') return (
    <svg width={size} height={size} viewBox="0 0 100 90" fill={red} aria-hidden="true">
      <path d="M50,83 C50,83 4,51 4,27 C4,10 17,2 31,7 C40,10 50,22 50,22 C50,22 60,10 69,7 C83,2 96,10 96,27 C96,51 50,83 50,83Z" />
    </svg>
  );
  if (suit === 'diamonds') return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill={red} aria-hidden="true">
      <path d="M50,4 L96,50 L50,96 L4,50Z" />
    </svg>
  );
  if (suit === 'clubs') return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill={blk} aria-hidden="true">
      <circle cx="50" cy="32" r="22" />
      <circle cx="26" cy="62" r="22" />
      <circle cx="74" cy="62" r="22" />
      <rect x="43" y="70" width="14" height="20" rx="2" />
      <rect x="32" y="86" width="36" height="10" rx="5" />
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill={blk} aria-hidden="true">
      <path d="M50,5 L80,44 C87,53 83,65 73,65 C65,65 58,59 55,52 C58,64 54,73 50,73 C46,73 42,64 45,52 C42,59 35,65 27,65 C17,65 13,53 20,44 Z" />
      <rect x="43" y="73" width="14" height="20" rx="2" />
      <rect x="32" y="89" width="36" height="10" rx="5" />
    </svg>
  );
}

const isRedSuit = (s: string) => s === 'hearts' || s === 'diamonds';

/* ── Card face ──────────────────────────────────────────────────────────── */

function CardFace({ card, dimmed, glowColor }: { card: CardType; dimmed?: boolean; glowColor?: string }) {
  const isRed = isRedSuit(card.suit);
  const rankColor = isRed ? '#CC1122' : '#18181E';
  return (
    <div
      style={{
        width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
        borderRadius: '10px',
        background: 'linear-gradient(160deg, #ffffff 0%, #f4f0e8 60%, #ede8de 100%)',
        opacity: dimmed ? 0.5 : 1,
        boxShadow: glowColor
          ? `0 0 18px 6px ${glowColor}, 0 0 6px 2px ${glowColor}`
          : '0 2px 8px rgba(0,0,0,0.4)',
        transition: 'box-shadow 0.4s, opacity 0.4s',
        willChange: 'transform',
      }}
    >
      <div style={{ position: 'absolute', top: 3, left: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, lineHeight: 1 }}>
        <span style={{ color: rankColor, fontSize: '13px', fontWeight: 700, fontFamily: 'Georgia, serif', lineHeight: 1 }}>{card.rank}</span>
        <SuitIcon suit={card.suit} size={12} />
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SuitIcon suit={card.suit} size={52} />
      </div>
      <div style={{ position: 'absolute', bottom: 3, right: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, transform: 'rotate(180deg)', lineHeight: 1 }}>
        <span style={{ color: rankColor, fontSize: '13px', fontWeight: 700, fontFamily: 'Georgia, serif', lineHeight: 1 }}>{card.rank}</span>
        <SuitIcon suit={card.suit} size={12} />
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '35%', background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, transparent 100%)', pointerEvents: 'none', borderRadius: '10px 10px 0 0' }} />
    </div>
  );
}

/* ── Card back ──────────────────────────────────────────────────────────── */

function CardBack() {
  return (
    <div className="w-full h-full rounded-[10px] overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.55)', border: '1px solid rgba(201,162,39,0.2)' }}>
      <img src="/ladyluck/card-back-cgp.png" alt="" className="w-full h-full object-cover" />
    </div>
  );
}

/* ── Suit glow colours ───────────────────────────────────────────────────── */

function suitGlowColor(suit: string): string {
  if (suit === 'hearts' || suit === 'diamonds') return 'rgba(220, 50, 60, 0.75)';
  if (suit === 'spades') return 'rgba(120, 140, 200, 0.75)';
  return 'rgba(40, 160, 80, 0.75)';
}

/* ── AnimatedCard ────────────────────────────────────────────────────────── */

export interface AnimatedCardProps {
  card?: CardType;
  isHidden?: boolean;

  /* Fan layout */
  fanRotation?: number;
  fanY?: number;

  /* Interaction */
  isSelected?: boolean;
  isSelectable?: boolean;
  onSelect?: () => void;

  /* Deal / draw animations */
  isDeal?: boolean;
  dealDelay?: number;
  isDraw?: boolean;
  drawDelay?: number;

  /* Discard animation */
  isDiscarding?: boolean;
  discardDelay?: number;

  /* Showdown reveal */
  isShowdown?: boolean;
  wasHiddenBeforeShowdown?: boolean;

  /* Flush highlight */
  isFlushCard?: boolean;
  isNonFlushCard?: boolean;

  /* Size override */
  width?: number;
  height?: number;

  className?: string;
}

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
  width = 56,
  height = 80,
  className,
}: AnimatedCardProps) {
  /* Whether we're in the "flying in from deck" animation */
  const isFlying = isDeal || isDraw;
  const flyDelay = isDeal ? dealDelay : drawDelay;

  /* Showdown reveal: once isShowdown turns on AND card was hidden, play flip */
  const [revealed, setRevealed] = useState(!wasHiddenBeforeShowdown);
  useEffect(() => {
    if (isShowdown && wasHiddenBeforeShowdown && !revealed) {
      const t = setTimeout(() => setRevealed(true), 300);
      return () => clearTimeout(t);
    }
    if (!isShowdown) setRevealed(!wasHiddenBeforeShowdown);
  }, [isShowdown, wasHiddenBeforeShowdown]);

  /* Selected lift amount */
  const selectedLift = isSelected ? -30 : 0;
  const hoverLift = -20;

  /* Deck origin offset (where cards fly from) */
  const DECK_X = 0;
  const DECK_Y = -420;

  /* Glow for flush cards */
  const glowColor = isFlushCard && card && !isHidden ? suitGlowColor(card.suit) : undefined;
  const cardDimmed = isNonFlushCard;

  /* ─── Discard animation ─────────────────────────────────────────────── */
  if (isDiscarding) {
    const discardRotation = fanRotation + (Math.random() > 0.5 ? 25 : -25);
    return (
      <motion.div
        className={className}
        initial={{ x: 0, y: 0, rotate: fanRotation, scale: 1, opacity: 1 }}
        animate={{ x: (Math.random() - 0.5) * 60, y: -600, rotate: discardRotation, scale: 0.7, opacity: 0 }}
        transition={{ duration: 0.22, delay: discardDelay / 1000, ease: [0.4, 0, 0.8, 0.2] }}
        style={{ width, height, flexShrink: 0, transformOrigin: 'center bottom', willChange: 'transform, opacity' }}
      >
        {isHidden || !card ? <CardBack /> : <CardFace card={card} />}
      </motion.div>
    );
  }

  /* ─── Flying in from deck ───────────────────────────────────────────── */
  if (isFlying) {
    return (
      <motion.div
        className={className}
        initial={{
          x: DECK_X,
          y: DECK_Y,
          scale: 0.6,
          rotate: (Math.random() - 0.5) * 20,
          opacity: 0,
        }}
        animate={{
          x: 0,
          y: [DECK_Y, DECK_Y * 0.3, 0],
          scale: [0.6, 1.08, 1.0],
          rotate: [null, fanRotation * 0.5, fanRotation],
          opacity: [0, 1, 1],
        }}
        transition={{
          duration: 0.38,
          delay: flyDelay / 1000,
          ease: 'easeOut',
          y: { times: [0, 0.55, 1], ease: ['easeOut', 'easeInOut'] },
          scale: { times: [0, 0.65, 1] },
          opacity: { times: [0, 0.1, 1] },
        }}
        style={{
          width, height, flexShrink: 0,
          transformOrigin: 'center center',
          willChange: 'transform, opacity',
          rotate: fanRotation,
          translateY: fanY,
        }}
      >
        {isHidden || !card ? <CardBack /> : <CardFace card={card} dimmed={cardDimmed} glowColor={glowColor} />}
      </motion.div>
    );
  }

  /* ─── Showdown flip ─────────────────────────────────────────────────── */
  if (isShowdown && wasHiddenBeforeShowdown) {
    return (
      <div
        style={{ width, height, flexShrink: 0, perspective: '600px', willChange: 'transform' }}
        className={className}
      >
        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div
              key="back"
              style={{ width: '100%', height: '100%' }}
              initial={{ rotateY: 0 }}
              exit={{ rotateY: 90 }}
              transition={{ duration: 0.15, ease: 'easeIn' }}
            >
              <CardBack />
            </motion.div>
          ) : (
            <motion.div
              key="front"
              style={{ width: '100%', height: '100%' }}
              initial={{ rotateY: -90 }}
              animate={{ rotateY: 0, scale: isFlushCard ? [1, 1.06, 1.0] : 1, y: isFlushCard ? [0, -6, 0] : 0 }}
              transition={{
                rotateY: { duration: 0.15, ease: 'easeOut' },
                scale: { duration: 0.4, delay: 0.15, ease: 'easeOut' },
                y: { duration: 0.4, delay: 0.15, ease: 'easeOut' },
              }}
            >
              {card && !isHidden ? (
                <CardFace card={card} dimmed={cardDimmed} glowColor={glowColor} />
              ) : (
                <CardBack />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  /* ─── Idle / selected ───────────────────────────────────────────────── */
  return (
    <motion.div
      className={cn(isSelectable && 'cursor-pointer', className)}
      style={{
        width, height, flexShrink: 0,
        rotate: fanRotation,
        translateY: fanY,
        transformOrigin: 'center bottom',
        willChange: 'transform',
        position: 'relative',
      }}
      animate={{
        y: selectedLift + fanY,
        scale: isSelected ? 1.06 : 1,
        filter: isSelected ? 'drop-shadow(0 0 12px rgba(220,40,40,0.9))' : 'none',
      }}
      whileHover={isSelectable ? { y: hoverLift + fanY, scale: 1.08, transition: { duration: 0.15 } } : undefined}
      whileTap={isSelectable ? { scale: 0.97 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      onClick={isSelectable ? onSelect : undefined}
    >
      {/* Floating idle for hero non-selected cards */}
      {!isSelected && (
        <motion.div
          style={{ width: '100%', height: '100%' }}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut', repeatType: 'loop' }}
        >
          {isHidden || !card ? <CardBack /> : <CardFace card={card} dimmed={cardDimmed} glowColor={glowColor} />}
        </motion.div>
      )}

      {isSelected && (
        <div style={{ width: '100%', height: '100%' }}>
          {isHidden || !card ? <CardBack /> : <CardFace card={card} dimmed={cardDimmed} glowColor={cardDimmed ? undefined : 'rgba(220,40,40,0.6)'} />}
        </div>
      )}

      {/* X badge for selected */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          style={{
            position: 'absolute', top: -8, right: -8,
            width: 20, height: 20, borderRadius: '50%',
            background: '#dc2020',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 700, color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
            zIndex: 10,
            lineHeight: 1,
          }}
        >
          ✕
        </motion.div>
      )}
    </motion.div>
  );
}
