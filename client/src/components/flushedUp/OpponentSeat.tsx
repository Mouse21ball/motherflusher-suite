import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { PlayingCard } from '@/components/game/Card';
import type { CardType } from '@/lib/poker/types';
import { evaluateFlushedUpHand } from '@shared/modes/flushedUp';
import type { FlushedUpEval } from '@shared/modes/flushedUp';

/* ── Badge ───────────────────────────────────────────────────────────────── */

type DiscardBadge = { type: 'discard'; count: number } | { type: 'pat' } | null;
const badgeLabel = (b: DiscardBadge) =>
  !b ? '' : b.type === 'pat' ? 'STOOD PAT' : `DISCARDED ${b.count}`;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function suitGlowColor(suit: string): string {
  if (suit === 'hearts' || suit === 'diamonds') return 'rgba(196,30,58,0.85)';
  if (suit === 'spades') return 'rgba(100,130,210,0.85)';
  return 'rgba(30,150,70,0.85)';
}

function rankLabel(v: number): string {
  if (v === 14) return 'A';
  if (v === 13) return 'K';
  if (v === 12) return 'Q';
  if (v === 11) return 'J';
  return String(v);
}

function showdownLabel(ev: FlushedUpEval): string {
  const SYM: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const sym = SYM[ev.bestSuit] ?? '';
  if (ev.isFlush) {
    const top = rankLabel(ev.rankValues[0] ?? 14);
    return `5-Card Flush ${sym} ${top}-high`;
  }
  if (ev.suitCount <= 1) return 'No Flush';
  const top = rankLabel(ev.rankValues[0] ?? 14);
  return `${ev.suitCount}-Card ${sym} ${top}-high`;
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

  /* Showdown hand evaluation ─────────────────────────────────────────────── */
  const handEval: FlushedUpEval | null = isShowdown && cards.length > 0
    ? evaluateFlushedUpHand(cards.map(c => ({ ...c, isHidden: false })))
    : null;

  const isLoser = isShowdown && !isWinner && !isFolded;
  const glowColor = isWinner && handEval ? suitGlowColor(handEval.bestSuit) : null;

  /* Card dimensions — larger at showdown for full legibility */
  const CARD_W = isShowdown ? 34 : 24;
  const CARD_H = isShowdown ? 48 : 36;

  /* Panel border */
  const border = isActive
    ? '1.5px solid rgba(255,215,0,0.65)'
    : (isWinner && isShowdown)
    ? '2px solid rgba(201,162,39,0.92)'
    : isWinner
    ? '1.5px solid rgba(255,215,0,0.5)'
    : '1px solid rgba(255,215,0,0.15)';

  /* Box-shadow strings for winner pulse */
  const baseGlow = isActive
    ? '0 0 16px rgba(201,162,39,0.28), 0 4px 14px rgba(0,0,0,0.5)'
    : isWinner
    ? '0 0 20px rgba(201,162,39,0.38), 0 4px 14px rgba(0,0,0,0.5)'
    : '0 3px 12px rgba(0,0,0,0.45)';

  const winnerGlowDim  = '0 0 20px rgba(201,162,39,0.38), 0 4px 14px rgba(0,0,0,0.5)';
  const winnerGlowBrgt = '0 0 48px rgba(201,162,39,0.85), 0 0 18px rgba(201,162,39,0.4), 0 4px 18px rgba(0,0,0,0.5)';

  return (
    <motion.div
      animate={{
        opacity: isFolded ? 0.3 : isLoser ? 0.6 : 1,
        scale: isWinner && isShowdown ? 1.04 : 1,
        boxShadow: isWinner && isShowdown
          ? [winnerGlowDim, winnerGlowBrgt, winnerGlowDim]
          : baseGlow,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: { duration: 0.35 },
        boxShadow: isWinner && isShowdown
          ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.35 },
      }}
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
        minWidth: 0,
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

      {/* Card thumbnails */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'nowrap' }}>
        {cards.length === 0 ? (
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
            if (showFace) {
              return (
                <div
                  key={i}
                  style={{
                    width: CARD_W,
                    height: CARD_H,
                    flexShrink: 0,
                    overflow: 'hidden',
                    borderRadius: '4px',
                    /* Gold hairline border on all revealed cards */
                    border: '1px solid rgba(201,162,39,0.38)',
                    /* Winner: suit-color glow; otherwise: standard shadow */
                    boxShadow: glowColor
                      ? `0 0 12px ${glowColor}, 0 0 5px ${glowColor}`
                      : '0 1px 4px rgba(0,0,0,0.55)',
                    /* Non-winner: desaturate + darken */
                    filter: isLoser ? 'brightness(0.62) saturate(0.45)' : 'none',
                    transition: 'filter 0.4s, box-shadow 0.4s',
                  }}
                >
                  <PlayingCard
                    card={card}
                    className="!w-full !h-full !rounded-[4px] !shrink-0"
                  />
                </div>
              );
            }
            /* Hidden (during play) — card-back thumbnail */
            return (
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

      {/* Hand rank label — showdown only, non-folded players */}
      {isShowdown && handEval && !isFolded && (
        <div style={{
          fontSize: '8px',
          fontFamily: 'monospace',
          color: isWinner ? '#C9A227' : 'rgba(255,255,255,0.36)',
          fontWeight: isWinner ? 700 : 400,
          letterSpacing: '0.05em',
          textAlign: 'center',
          maxWidth: CARD_W * 5 + 8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.2,
          textShadow: isWinner ? '0 0 8px rgba(201,162,39,0.6)' : 'none',
        }}>
          {showdownLabel(handEval)}
        </div>
      )}

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
