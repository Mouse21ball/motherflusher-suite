/**
 * ShowdownScreen — full-screen showdown overlay for Flushed Up.
 * Replaces the normal table + ActionControls during SHOWDOWN phase.
 *
 * Hero WIN:  gold WINNER banner, hero's revealed hand with suit glow,
 *            animated chip counter, confetti burst, 6-second countdown bar.
 * Hero LOSS: winner's revealed hand at top (gold), hero's revealed hand
 *            below with "YOU HAD" label (grey), same countdown bar.
 *
 * FIX 1 — only winner cards shown face-up (loser cards are card backs,
 *          but hero always sees their OWN hand in the YOU HAD section).
 * FIX 7 — 6-second countdown bar depletes at the bottom; server auto-
 *          advances after ~6 s so no manual action is needed.
 */

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { PlayingCard } from '@/components/game/Card';
import { ChipBurst } from './ChipBurst';
import { evaluateFlushedUpHand } from '@shared/modes/flushedUp';
import type { FlushedUpEval } from '@shared/modes/flushedUp';
import type { GameState } from '@shared/gameTypes';

const HOLD_MS       = 6000;
const WIN_CARD_W    = 58;                            // winner panel & hero win view
const WIN_CARD_H    = Math.round(WIN_CARD_W / 0.714); // ≈ 81 px
const YOU_CARD_W    = 52;                            // YOU HAD panel
const YOU_CARD_H    = Math.round(YOU_CARD_W / 0.714); // ≈ 73 px

/* ── helpers ────────────────────────────────────────────────────────────── */

function suitGlowColor(suit: string): string {
  if (suit === 'hearts'   || suit === 'diamonds') return 'rgba(196,30,58,0.85)';
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

function handLabel(ev: FlushedUpEval): string {
  const SYM: Record<string, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  };
  const sym = SYM[ev.bestSuit] ?? '';
  if (ev.isFlush) {
    return `5-Card Flush ${sym} ${rankLabel(ev.rankValues[0] ?? 14)}-high`;
  }
  if (ev.suitCount <= 1) return 'No Flush';
  return `${ev.suitCount}-Card ${sym} ${rankLabel(ev.rankValues[0] ?? 14)}-high`;
}

/* ── AnimatedCounter ─────────────────────────────────────────────────────── */

function AnimatedCounter({ target }: { target: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start    = Date.now();
    const duration = 1800;
    let   raf: number;
    const tick = () => {
      const t     = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);   // cubic ease-out
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{value.toLocaleString()}</>;
}

/* ── CardRow ─────────────────────────────────────────────────────────────── */

type AnyCard = { rank: string | null; suit: string | null; isHidden: boolean };

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
            card={{ ...card, isHidden: false } as any}
            className="!w-full !h-full !rounded-none !shrink-0"
          />
        </div>
      ))}
    </div>
  );
}

/* ── CountdownBar ────────────────────────────────────────────────────────── */

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

/* ── ShowdownScreen ──────────────────────────────────────────────────────── */

interface ShowdownScreenProps {
  state: GameState;
  myId: string;
}

export function ShowdownScreen({ state, myId }: ShowdownScreenProps) {
  const me         = state.players.find(p => p.id === myId);
  const winners    = state.players.filter(p => (p as any).isWinner);
  const heroIsWinner = winners.some(w => w.id === myId);
  const isSplitPot   = winners.length > 1;

  // The opponent who beat us (first winner who isn't us)
  const primaryWinner = heroIsWinner
    ? me            // hero's own seat for win view
    : (winners[0] ?? null);

  // Parse pot won from resolution messages  (format: "Name wins $1234 with …")
  const resMsg = state.messages.find(m => (m as any).isResolution);
  const amountMatch = resMsg?.text?.match(/\$(\d+)/);
  const potAmount   = amountMatch ? parseInt(amountMatch[1], 10) : 0;

  // Hand evals — cards at SHOWDOWN have rank/suit set by server even when isHidden
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evalCards = (cards: AnyCard[]) =>
    cards.every(c => c.rank !== null && c.suit !== null)
      ? evaluateFlushedUpHand(cards.map(c => ({ ...c, isHidden: false })) as any)
      : null;

  const heroEval: FlushedUpEval | null = me?.cards?.length ? evalCards(me.cards as AnyCard[]) : null;
  const externalWinnerEval: FlushedUpEval | null =
    !heroIsWinner && primaryWinner?.cards?.length
      ? evalCards(primaryWinner.cards as AnyCard[])
      : null;

  // Glow colours
  const heroGlowColor   = heroIsWinner && heroEval ? suitGlowColor(heroEval.bestSuit)           : null;
  const winnerGlowColor = !heroIsWinner && externalWinnerEval ? suitGlowColor(externalWinnerEval.bestSuit) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: heroIsWinner
          ? 'radial-gradient(ellipse at 50% 42%, rgba(34,24,0,0.98) 0%, rgba(7,5,0,0.99) 100%)'
          : 'rgba(7,7,9,0.98)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '12px 12px 16px',
        overflowY: 'hidden',
      }}
    >
      {heroIsWinner ? (

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
              {isSplitPot ? '⚡  SPLIT POT  ⚡' : '★    WINNER    ★'}
            </div>
            <div style={{
              fontSize: 30, fontFamily: 'monospace', fontWeight: 900,
              color: '#FFFFFF', letterSpacing: '0.05em',
              textShadow: '0 0 24px rgba(255,255,255,0.12), 0 2px 14px rgba(0,0,0,0.9)',
            }}>
              {me?.name ?? 'You'}
            </div>
          </motion.div>

          {/* Hero's winning cards */}
          {me?.cards?.length ? (
            <CardRow
              cards={(me.cards as AnyCard[])}
              glowColor={heroGlowColor}
              cardW={WIN_CARD_W}
              cardH={WIN_CARD_H}
            />
          ) : null}

          {/* Hand rank label */}
          {heroEval && (
            <div style={{
              fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
              color: '#C9A227', letterSpacing: '0.1em',
              textShadow: '0 0 14px rgba(201,162,39,0.55)',
            }}>
              {handLabel(heroEval)}
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
                fontSize: 11, fontFamily: 'monospace', fontWeight: 800,
                color: 'rgba(201,162,39,0.75)', letterSpacing: '0.14em',
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

              {/* Winner's cards — face-up because isHidden:false from server */}
              {primaryWinner.cards?.length ? (
                <CardRow
                  cards={(primaryWinner.cards as AnyCard[])}
                  glowColor={winnerGlowColor}
                  cardW={WIN_CARD_W}
                  cardH={WIN_CARD_H}
                />
              ) : null}

              {externalWinnerEval && (
                <div style={{
                  fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
                  color: '#C9A227', letterSpacing: '0.09em',
                  textShadow: '0 0 10px rgba(201,162,39,0.45)',
                }}>
                  {handLabel(externalWinnerEval)}
                </div>
              )}
            </div>
          )}

          {/* ── Hero hand panel ───────────────────────────────────────── */}
          {me?.cards?.length ? (
            <div style={{
              width: '100%', padding: '10px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.09)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8,
            }}>
              <div style={{
                fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
                color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em',
              }}>
                YOU HAD
              </div>

              {/* Hero's own cards — always face-up (hero's own hand) */}
              <CardRow
                cards={(me.cards as AnyCard[])}
                glowColor={null}
                dim={true}
                cardW={YOU_CARD_W}
                cardH={YOU_CARD_H}
              />

              {heroEval && (
                <div style={{
                  fontSize: 12, fontFamily: 'monospace', fontWeight: 400,
                  color: 'rgba(255,255,255,0.6)', letterSpacing: '0.09em',
                }}>
                  {handLabel(heroEval)}
                </div>
              )}
            </div>
          ) : null}
        </div>

      )}

      {/* Countdown bar — depletes over 6 s */}
      <CountdownBar />
    </motion.div>
  );
}
