/**
 * ShowdownReveal — premium showdown card-reveal overlay shared by
 * Badugi, Dead 7, and Suits Poker.
 *
 * Caller supplies pre-computed winner data and hero data so this
 * component has zero knowledge of the mode-specific evaluators.
 *
 * Behaviour:
 *  Hero WIN  — gold WINNER banner, hero cards with suit glow, animated
 *              chip counter, gold particle burst, 6 s countdown bar,
 *              auto-fires onComplete after 6 s.
 *  Hero LOSS — winner panel (gold border) with their revealed cards +
 *              hand label; YOU HAD panel (grey) with hero's own cards;
 *              same 6 s countdown bar, auto-fires onComplete.
 *
 * Only winner cards are shown face-up. Loser cards are never shown.
 * Hero always sees their own hand in the YOU HAD section.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PlayingCard } from '@/components/game/Card';
import { ChipBurst } from '@/components/flushedUp/ChipBurst';
import type { CardType } from '@shared/gameTypes';

const HOLD_MS    = 6000;
const WIN_CARD_W = 58;
const WIN_CARD_H = Math.round(WIN_CARD_W / 0.714);
const YOU_CARD_W = 52;
const YOU_CARD_H = Math.round(YOU_CARD_W / 0.714);

// ── Types ──────────────────────────────────────────────────────────────────

export interface WinnerData {
  id: string;
  name: string;
  cards: CardType[];
  handRankLabel: string;
  potShare: number;
}

export interface HeroRevealData {
  id: string;
  cards: CardType[];
  handRankLabel: string;
}

export interface ShowdownRevealProps {
  cardsPerHand: number;
  winners: WinnerData[];
  heroData: HeroRevealData;
  heroWon: boolean;
  potAmount: number;
  onComplete: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function suitGlowColor(suit: string): string {
  if (suit === 'hearts' || suit === 'diamonds') return 'rgba(196,30,58,0.85)';
  if (suit === 'spades') return 'rgba(100,130,210,0.85)';
  return 'rgba(30,150,70,0.85)';
}

/** Pick the most-common suit among a set of face-up cards, or null. */
function dominantSuit(cards: CardType[]): string | null {
  const visible = cards.filter(c => c.suit);
  if (visible.length === 0) return null;
  const freq: Record<string, number> = {};
  for (const c of visible) freq[c.suit] = (freq[c.suit] ?? 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// ── AnimatedCounter ────────────────────────────────────────────────────────

function AnimatedCounter({ target }: { target: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start    = Date.now();
    const duration = 1800;
    let   raf: number;
    const tick = () => {
      const t     = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{value.toLocaleString()}</>;
}

// ── CardRow ────────────────────────────────────────────────────────────────

type AnyCard = { rank: string | null; suit: string | null; isHidden?: boolean };

function CardRow({
  cards,
  glowColor,
  dim = false,
  cardW,
  cardH,
}: {
  cards: AnyCard[];
  glowColor?: string | null;
  dim?: boolean;
  cardW: number;
  cardH: number;
}) {
  return (
    <div style={{
      display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'nowrap',
      filter: dim ? 'brightness(0.65) saturate(0.4)' : 'none',
    }}>
      {cards.map((card, i) => (
        <div
          key={i}
          style={{
            width: cardW, height: cardH, flexShrink: 0,
            borderRadius: 6, overflow: 'hidden',
            border: '1px solid rgba(201,162,39,0.4)',
            boxShadow: glowColor
              ? `0 0 18px ${glowColor}, 0 0 7px ${glowColor}, 0 2px 8px rgba(0,0,0,0.7)`
              : '0 2px 8px rgba(0,0,0,0.7)',
          }}
        >
          <PlayingCard
            card={{ ...card, isHidden: false } as CardType}
            className="!w-full !h-full !rounded-none !shrink-0"
          />
        </div>
      ))}
    </div>
  );
}

// ── CountdownBar ───────────────────────────────────────────────────────────

function CountdownBar() {
  const [progress, setProgress] = useState(1);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const startTime = Date.now();
    const tick = () => {
      const p = Math.max(0, 1 - (Date.now() - startTime) / HOLD_MS);
      setProgress(p);
      if (p > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
      background: 'rgba(255,255,255,0.06)',
    }}>
      <div style={{
        height: '100%',
        width: `${progress * 100}%`,
        background: 'linear-gradient(90deg, #A07C10, #C9A227, #E8C96B)',
        borderRadius: '0 2px 2px 0',
        transition: 'width 0.1s linear',
      }} />
    </div>
  );
}

// ── ShowdownReveal ─────────────────────────────────────────────────────────

export function ShowdownReveal({
  winners,
  heroData,
  heroWon,
  potAmount,
  onComplete,
}: ShowdownRevealProps) {
  const calledRef = useRef(false);

  useEffect(() => {
    calledRef.current = false;
    const t = setTimeout(() => {
      if (!calledRef.current) { calledRef.current = true; onComplete(); }
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [onComplete]);

  const isSplit       = winners.length > 1;
  const primaryWinner = winners[0] ?? null;

  const heroGlowColor = heroWon
    ? (dominantSuit(heroData.cards) ? suitGlowColor(dominantSuit(heroData.cards)!) : 'rgba(201,162,39,0.7)')
    : null;

  const winnerGlowColor = !heroWon && primaryWinner
    ? (dominantSuit(primaryWinner.cards) ? suitGlowColor(dominantSuit(primaryWinner.cards)!) : null)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: heroWon
          ? 'radial-gradient(ellipse at 50% 42%, rgba(34,24,0,0.98) 0%, rgba(7,5,0,0.99) 100%)'
          : 'rgba(7,7,9,0.98)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '12px 12px 16px',
        overflowY: 'hidden',
      }}
    >
      {heroWon ? (

        /* ══════════════ HERO WIN ══════════════════════════════════════════ */
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 18, textAlign: 'center',
        }}>
          <ChipBurst active={true} originX={0.5} originY={0.42} />

          {/* Banner */}
          <motion.div
            animate={{ scale: [1, 1.05, 1], opacity: [0.88, 1, 0.88] }}
            transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
          >
            <div style={{
              fontSize: 11, fontFamily: 'monospace', fontWeight: 800,
              color: '#C9A227', letterSpacing: '0.28em',
              textShadow: '0 0 32px rgba(201,162,39,0.55), 0 2px 10px rgba(0,0,0,0.9)',
            }}>
              {isSplit ? '⚡  SPLIT POT  ⚡' : '★    WINNER    ★'}
            </div>
            <div style={{
              fontSize: 30, fontFamily: 'monospace', fontWeight: 900,
              color: '#FFFFFF', letterSpacing: '0.05em',
              textShadow: '0 0 24px rgba(255,255,255,0.12), 0 2px 14px rgba(0,0,0,0.9)',
            }}>
              {heroData.id === winners[0]?.id ? (winners[0]?.name ?? 'You') : 'You'}
            </div>
          </motion.div>

          {/* Hero's winning cards */}
          {heroData.cards.length > 0 && (
            <CardRow
              cards={heroData.cards as AnyCard[]}
              glowColor={heroGlowColor}
              cardW={WIN_CARD_W}
              cardH={WIN_CARD_H}
            />
          )}

          {/* Hand rank label */}
          {heroData.handRankLabel && (
            <div style={{
              fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
              color: '#C9A227', letterSpacing: '0.1em',
              textShadow: '0 0 14px rgba(201,162,39,0.55)',
            }}>
              {heroData.handRankLabel}
            </div>
          )}

          {/* Animated chip counter */}
          {potAmount > 0 && (
            <div style={{
              fontSize: 21, fontFamily: 'monospace', fontWeight: 800,
              color: '#C9A227', letterSpacing: '0.08em',
              textShadow: '0 0 18px rgba(201,162,39,0.4)',
            }}>
              +<AnimatedCounter target={potAmount} /> chips
            </div>
          )}
        </div>

      ) : (

        /* ══════════════ HERO LOSS ═════════════════════════════════════════ */
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 14, textAlign: 'center',
          width: '100%', maxWidth: 420,
        }}>

          {/* ── Winner panel ──────────────────────────────────────────── */}
          {primaryWinner && (
            <div style={{
              width: '100%', padding: '12px',
              borderRadius: 14,
              background: 'rgba(201,162,39,0.07)',
              border: '1.5px solid rgba(201,162,39,0.38)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8,
            }}>
              <div style={{
                fontSize: 10, fontFamily: 'monospace', fontWeight: 800,
                color: 'rgba(201,162,39,0.75)', letterSpacing: '0.24em',
              }}>
                WINNER
              </div>
              <div style={{
                fontSize: 20, fontFamily: 'monospace', fontWeight: 800,
                color: '#FFFFFF', letterSpacing: '0.05em',
                textShadow: '0 2px 12px rgba(0,0,0,0.8)',
              }}>
                {primaryWinner.name}
              </div>

              {primaryWinner.cards.length > 0 && (
                <CardRow
                  cards={primaryWinner.cards as AnyCard[]}
                  glowColor={winnerGlowColor}
                  cardW={WIN_CARD_W}
                  cardH={WIN_CARD_H}
                />
              )}

              {primaryWinner.handRankLabel && (
                <div style={{
                  fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
                  color: '#C9A227', letterSpacing: '0.09em',
                  textShadow: '0 0 10px rgba(201,162,39,0.45)',
                }}>
                  {primaryWinner.handRankLabel}
                </div>
              )}
            </div>
          )}

          {/* ── Hero hand panel ───────────────────────────────────────── */}
          {heroData.cards.length > 0 && (
            <div style={{
              width: '100%', padding: '10px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.09)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8,
            }}>
              <div style={{
                fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                color: 'rgba(255,255,255,0.6)', letterSpacing: '0.22em',
              }}>
                YOU HAD
              </div>

              <CardRow
                cards={heroData.cards as AnyCard[]}
                glowColor={null}
                dim={true}
                cardW={YOU_CARD_W}
                cardH={YOU_CARD_H}
              />

              {heroData.handRankLabel && (
                <div style={{
                  fontSize: 12, fontFamily: 'monospace', fontWeight: 400,
                  color: 'rgba(255,255,255,0.6)', letterSpacing: '0.09em',
                }}>
                  {heroData.handRankLabel}
                </div>
              )}
            </div>
          )}
        </div>

      )}

      <CountdownBar />
    </motion.div>
  );
}
