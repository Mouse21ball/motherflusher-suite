import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { AnimatedCard } from './AnimatedCard';
import type { CardType } from '@/lib/poker/types';

/* ── Flush detection ─────────────────────────────────────────────────────── */

function detectFlushCards(cards: CardType[]): Set<number> {
  const counts: Record<string, number> = {};
  for (const c of cards) {
    if (!c.isHidden) counts[c.suit] = (counts[c.suit] ?? 0) + 1;
  }
  const flushSuit = Object.entries(counts).find(([, n]) => n >= 5)?.[0];
  if (!flushSuit) return new Set();
  return new Set(cards.map((c, i) => (c.suit === flushSuit ? i : -1)).filter(i => i >= 0));
}

/* ── Badge ───────────────────────────────────────────────────────────────── */

type DiscardBadge = { type: 'discard'; count: number } | { type: 'pat' } | null;
const badgeLabel = (b: DiscardBadge) => (!b ? '' : b.type === 'pat' ? 'STOOD PAT' : `DISCARDED ${b.count}`);

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
  cardWidth = 28,
  cardHeight = 39,
}: OpponentSeatProps) {
  const prevCountRef = useRef(cards.length);
  const [badge, setBadge] = useState<DiscardBadge>(null);
  const [discardingIndices, setDiscardingIndices] = useState<number[]>([]);
  const [drawingIndices] = useState<number[]>([]);

  useEffect(() => {
    const prev = prevCountRef.current;
    const curr = cards.length;
    prevCountRef.current = curr;
    if (prev > curr) {
      const discarded = prev - curr;
      const indices = Array.from({ length: discarded }, (_, i) => curr + i);
      setDiscardingIndices(indices);
      setBadge({ type: 'discard', count: discarded });
      setTimeout(() => { setDiscardingIndices([]); setBadge(null); }, 1800);
    }
  }, [cards.length]);

  const flushIndices = isShowdown ? detectFlushCards(cards) : new Set<number>();
  const hasFlush = flushIndices.size > 0;

  /* FIX 3 — Frosted glass styling ─────────────────────────────────────── */
  /*
   * Always gold border (brighter when active/winner).
   * Explicit WebkitBackdropFilter for Safari / iOS compatibility.
   * borderRadius: 16px, background rgba(0,0,0,0.35), blur 14px.
   */
  const border = isActive
    ? '1.5px solid rgba(255,215,0,0.65)'
    : isWinner
    ? '1.5px solid rgba(255,215,0,0.5)'
    : '1px solid rgba(255,215,0,0.15)';

  const glow = isActive
    ? '0 0 16px rgba(201,162,39,0.28), 0 4px 14px rgba(0,0,0,0.5)'
    : isWinner
    ? '0 0 20px rgba(201,162,39,0.38), 0 4px 14px rgba(0,0,0,0.5)'
    : '0 3px 12px rgba(0,0,0,0.45)';

  return (
    <motion.div
      animate={{ opacity: isFolded ? 0.3 : 1, scale: isWinner ? 1.04 : 1 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '6px 8px',
        borderRadius: '16px',
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border,
        boxShadow: glow,
        minWidth: 0,
      }}
    >
      {/* Discard badge */}
      <AnimatePresence>
        {badge && (
          <motion.div
            key="badge"
            initial={{ opacity: 0, y: -10, scale: 0.8 }}
            animate={{ opacity: 1, y: -4, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.7 }}
            transition={{ duration: 0.22 }}
            style={{
              position: 'absolute', top: -26, left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(201,162,39,0.16)',
              border: '1px solid rgba(201,162,39,0.45)',
              borderRadius: '6px',
              padding: '2px 7px',
              fontSize: '8px', fontFamily: 'monospace',
              letterSpacing: '0.1em', color: '#C9A227',
              whiteSpace: 'nowrap', zIndex: 30,
            }}
          >
            {badgeLabel(badge)}
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
          fontSize: '7px', fontWeight: 700, color: '#000', fontFamily: 'monospace',
          border: '1px solid rgba(255,220,100,0.5)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
        }}>D</div>
      )}

      {/* Active pulse */}
      {isActive && (
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
          style={{
            position: 'absolute', top: -5, left: '50%',
            transform: 'translateX(-50%)',
            width: 5, height: 5, borderRadius: '50%',
            background: '#C9A227',
            boxShadow: '0 0 8px rgba(201,162,39,0.9)',
          }}
        />
      )}

      {/* Name */}
      <div style={{
        fontSize: '9px', fontFamily: 'monospace',
        color: 'rgba(255,255,255,0.82)',
        fontWeight: 600, letterSpacing: '0.04em',
        maxWidth: 80, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </div>

      {/* Cards — 28–32 px wide each so all 5 fit without wrapping */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'nowrap' }}>
        {cards.length === 0 && (
          <div style={{
            width: cardWidth, height: cardHeight, borderRadius: '4px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px dashed rgba(255,255,255,0.07)',
          }} />
        )}
        {cards.map((card, i) => (
          <AnimatedCard
            key={i}
            card={card}
            isHidden={card.isHidden}
            isDraw={drawingIndices.includes(i)}
            drawDelay={drawingIndices.indexOf(i) * 100}
            isDiscarding={discardingIndices.includes(i)}
            discardDelay={discardingIndices.indexOf(i) * 50}
            isShowdown={isShowdown}
            wasHiddenBeforeShowdown={isShowdown && card.isHidden !== true}
            isFlushCard={hasFlush && flushIndices.has(i)}
            isNonFlushCard={hasFlush && !flushIndices.has(i)}
            width={cardWidth}
            height={cardHeight}
          />
        ))}
      </div>

      {/* Chip count */}
      {status !== 'sitting_out' && (
        <div style={{
          fontSize: '9px', fontFamily: 'monospace',
          color: 'rgba(201,162,39,0.85)',
          fontWeight: 600, letterSpacing: '0.04em',
        }}>
          {chips.toLocaleString()}
        </div>
      )}
    </motion.div>
  );
}
