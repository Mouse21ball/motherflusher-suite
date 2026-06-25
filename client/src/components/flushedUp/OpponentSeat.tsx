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
  cardWidth = 22,
  cardHeight = 31,
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

  /* Border: always gold, brighter when active/winner */
  const seatBorder = isActive
    ? '1.5px solid rgba(201,162,39,0.75)'
    : isWinner
    ? '1.5px solid rgba(201,162,39,0.6)'
    : '1px solid rgba(201,162,39,0.22)';

  const seatGlow = isActive
    ? '0 0 18px rgba(201,162,39,0.3), 0 4px 14px rgba(0,0,0,0.5)'
    : isWinner
    ? '0 0 22px rgba(201,162,39,0.4), 0 4px 14px rgba(0,0,0,0.5)'
    : '0 3px 12px rgba(0,0,0,0.45)';

  return (
    <motion.div
      animate={{
        opacity: isFolded ? 0.35 : 1,
        scale: isWinner ? 1.04 : 1,
      }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '6px 8px',
        borderRadius: '12px',
        background: 'rgba(0,0,0,0.4)',
        border: seatBorder,
        boxShadow: seatGlow,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        position: 'relative',
        minWidth: 0,
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
              fontSize: '8px',
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
          position: 'absolute', top: -7, right: -7,
          width: 16, height: 16, borderRadius: '50%',
          background: 'linear-gradient(135deg, #C9A227, #A07C10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '7px', fontWeight: 700, color: '#000',
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
            position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)',
            width: 5, height: 5, borderRadius: '50%',
            background: '#C9A227',
            boxShadow: '0 0 8px rgba(201,162,39,0.9)',
          }}
        />
      )}

      {/* Player name */}
      <div style={{
        fontSize: '9px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.82)',
        fontWeight: 600, letterSpacing: '0.04em',
        maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </div>

      {/* Cards row */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {cards.length === 0 && (
          <div style={{
            width: cardWidth, height: cardHeight, borderRadius: '4px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px dashed rgba(255,255,255,0.08)',
          }} />
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
          fontSize: '9px', fontFamily: 'monospace',
          color: 'rgba(201,162,39,0.85)', letterSpacing: '0.04em',
          fontWeight: 600,
        }}>
          {chips.toLocaleString()}
        </div>
      )}
    </motion.div>
  );
}
