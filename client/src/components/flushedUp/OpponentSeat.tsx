import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { AnimatedCard } from './AnimatedCard';
import type { CardType } from '@/lib/poker/types';

/* ── Flush detection for opponent ────────────────────────────────────────── */

function detectFlushCards(cards: CardType[]): Set<number> {
  const suitCount: Record<string, number> = {};
  for (const c of cards) {
    if (!c.isHidden) suitCount[c.suit] = (suitCount[c.suit] ?? 0) + 1;
  }
  const flushSuit = Object.entries(suitCount).find(([, n]) => n >= 5)?.[0];
  if (!flushSuit) return new Set();
  return new Set(cards.map((c, i) => c.suit === flushSuit ? i : -1).filter(i => i >= 0));
}

/* ── Badge types ─────────────────────────────────────────────────────────── */

type DiscardBadge = { type: 'discard'; count: number } | { type: 'pat' } | null;

function discardLabel(badge: DiscardBadge): string {
  if (!badge) return '';
  if (badge.type === 'pat') return 'STOOD PAT';
  return `DISCARDED ${badge.count}`;
}

/* ── Props ───────────────────────────────────────────────────────────────── */

interface OpponentSeatProps {
  name: string;
  chips: number;
  cards: CardType[];
  status: string;
  isDealer: boolean;
  isActive: boolean;
  isWinner?: boolean;
  isFolded?: boolean;
  isShowdown: boolean;
  cardWidth?: number;
  cardHeight?: number;
}

/* ── OpponentSeat ────────────────────────────────────────────────────────── */

export function OpponentSeat({
  name,
  chips,
  cards,
  status,
  isDealer,
  isActive,
  isWinner = false,
  isFolded = false,
  isShowdown,
  cardWidth = 32,
  cardHeight = 46,
}: OpponentSeatProps) {
  const prevCardCountRef = useRef(cards.length);
  const [badge, setBadge] = useState<DiscardBadge>(null);
  const [drawingIndices, setDrawingIndices] = useState<number[]>([]);
  const [discardingIndices, setDiscardingIndices] = useState<number[]>([]);

  /* Detect discard / draw events from card count changes */
  useEffect(() => {
    const prev = prevCardCountRef.current;
    const curr = cards.length;
    if (prev === curr && curr > 0) {
      prevCardCountRef.current = curr;
      return;
    }
    prevCardCountRef.current = curr;
  }, [cards.length]);

  /* Show discard badge when opponent card count changes */
  useEffect(() => {
    const prev = prevCardCountRef.current;
    const curr = cards.length;
    if (prev === curr) return;
    if (prev > curr) {
      const discarded = prev - curr;
      const indices = Array.from({ length: discarded }, (_, i) => curr + i);
      setDiscardingIndices(indices);
      setBadge({ type: 'discard', count: discarded });
      setTimeout(() => {
        setDiscardingIndices([]);
        setBadge(null);
      }, 1800);
    }
  }, [cards.length]);

  const isShowdownPhase = isShowdown;
  const flushIndices = isShowdownPhase ? detectFlushCards(cards) : new Set<number>();
  const hasFlush = flushIndices.size > 0;

  const seatBorder = isActive
    ? '1.5px solid rgba(201,162,39,0.8)'
    : isWinner
    ? '1.5px solid rgba(201,162,39,0.6)'
    : '1px solid rgba(255,255,255,0.1)';

  const seatGlow = isActive
    ? '0 0 16px rgba(201,162,39,0.4)'
    : isWinner
    ? '0 0 20px rgba(201,162,39,0.5)'
    : 'none';

  return (
    <motion.div
      animate={{
        opacity: isFolded ? 0.4 : 1,
        scale: isWinner ? 1.04 : 1,
      }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 10px',
        borderRadius: '12px',
        background: 'rgba(0,0,0,0.5)',
        border: seatBorder,
        boxShadow: seatGlow,
        backdropFilter: 'blur(6px)',
        minWidth: 80,
        position: 'relative',
      }}
    >
      {/* Discard / stood-pat badge */}
      <AnimatePresence>
        {badge && (
          <motion.div
            key="badge"
            initial={{ opacity: 0, y: -12, scale: 0.8 }}
            animate={{ opacity: 1, y: -4, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.7 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'absolute',
              top: -28,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(201,162,39,0.18)',
              border: '1px solid rgba(201,162,39,0.5)',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '9px',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: '#C9A227',
              whiteSpace: 'nowrap',
              zIndex: 30,
            }}
          >
            {discardLabel(badge)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dealer chip */}
      {isDealer && (
        <div style={{
          position: 'absolute', top: -8, right: -8,
          width: 18, height: 18, borderRadius: '50%',
          background: 'linear-gradient(135deg, #C9A227, #A07C10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '8px', fontWeight: 700, color: '#000',
          border: '1px solid rgba(255,220,100,0.6)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
          fontFamily: 'monospace',
        }}>D</div>
      )}

      {/* Active indicator */}
      {isActive && (
        <motion.div
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
          style={{
            position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
            width: 6, height: 6, borderRadius: '50%',
            background: '#C9A227',
            boxShadow: '0 0 8px rgba(201,162,39,0.9)',
          }}
        />
      )}

      {/* Player name */}
      <div style={{
        fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.85)',
        fontWeight: 600, letterSpacing: '0.05em', maxWidth: 72,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </div>

      {/* Cards row */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', paddingTop: 2 }}>
        {cards.length === 0 && (
          <div style={{ width: cardWidth, height: cardHeight, borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.1)' }} />
        )}
        {cards.map((card, i) => {
          const isDraw = drawingIndices.includes(i);
          const isDiscard = discardingIndices.includes(i);
          const isFlushCard = hasFlush && flushIndices.has(i);
          const isNonFlushCard = hasFlush && !flushIndices.has(i);
          return (
            <AnimatedCard
              key={i}
              card={card}
              isHidden={card.isHidden}
              isDraw={isDraw}
              drawDelay={drawingIndices.indexOf(i) * 100}
              isDiscarding={isDiscard}
              discardDelay={discardingIndices.indexOf(i) * 50}
              isShowdown={isShowdownPhase}
              wasHiddenBeforeShowdown={isShowdownPhase && card.isHidden !== true}
              isFlushCard={isFlushCard}
              isNonFlushCard={isNonFlushCard}
              width={cardWidth}
              height={cardHeight}
            />
          );
        })}
      </div>

      {/* Chip count */}
      {status !== 'sitting_out' && (
        <div style={{
          fontSize: '10px', fontFamily: 'monospace',
          color: 'rgba(201,162,39,0.9)', letterSpacing: '0.05em',
          fontWeight: 600,
        }}>
          {chips.toLocaleString()}
        </div>
      )}
    </motion.div>
  );
}
