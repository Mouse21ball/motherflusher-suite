import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { PlayingCard } from '@/components/game/Card';
import type { CardType } from '@/lib/poker/types';

/* ── Badge ───────────────────────────────────────────────────────────────── */

type DiscardBadge = { type: 'discard'; count: number } | { type: 'pat' } | null;
const badgeLabel = (b: DiscardBadge) =>
  !b ? '' : b.type === 'pat' ? 'STOOD PAT' : `DISCARDED ${b.count}`;

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
}

/* ── OpponentSeat ────────────────────────────────────────────────────────── */
/*
 * FIX 3 — Opponent card thumbnails:
 * Cards are rendered as small 24×36 px thumbnails — plain card-back images
 * during play, shared PlayingCard at showdown. This avoids the AnimatedCard
 * overhead and the size distortion from the old 28–32 px animated approach.
 */

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
}: OpponentSeatProps) {
  const prevCountRef = useRef(cards.length);
  const [badge, setBadge] = useState<DiscardBadge>(null);

  useEffect(() => {
    const prev = prevCountRef.current;
    const curr = cards.length;
    prevCountRef.current = curr;
    if (prev > curr) {
      const discarded = prev - curr;
      setBadge({ type: 'discard', count: discarded });
      setTimeout(() => setBadge(null), 1800);
    }
  }, [cards.length]);

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

  /* Card thumbnail: 24 px wide, 36 px tall (2:3 ratio) */
  const CARD_W = 24;
  const CARD_H = 36;

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
        padding: '5px 7px',
        borderRadius: '14px',
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border,
        boxShadow: glow,
        minWidth: 0,
        /* Fixed width so all 5 thumbnails + name always fit without overflow */
        width: CARD_W * 5 + 2 * 4 + 14,
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
        maxWidth: CARD_W * 5 + 2 * 4,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </div>

      {/* Card thumbnails — 24 px wide, single row */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'nowrap' }}>
        {cards.length === 0 ? (
          /* Placeholder row when no cards yet */
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: CARD_W, height: CARD_H, borderRadius: '3px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px dashed rgba(255,255,255,0.08)',
                flexShrink: 0,
              }}
            />
          ))
        ) : (
          cards.map((card, i) => {
            const showFace = isShowdown && !card.isHidden && card.rank != null;
            return showFace ? (
              /* Revealed at showdown — use shared PlayingCard */
              <div
                key={i}
                style={{ width: CARD_W, height: CARD_H, flexShrink: 0, overflow: 'hidden', borderRadius: '3px' }}
              >
                <PlayingCard
                  card={card}
                  className="!w-full !h-full !rounded-[3px] !shrink-0"
                />
              </div>
            ) : (
              /* Hidden (normal play) — plain card-back image, no animation overhead */
              <img
                key={i}
                src="/card-back.png"
                alt=""
                style={{
                  width: CARD_W,
                  height: CARD_H,
                  objectFit: 'cover',
                  borderRadius: '3px',
                  flexShrink: 0,
                  display: 'block',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }}
              />
            );
          })
        )}
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
