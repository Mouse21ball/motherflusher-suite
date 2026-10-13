/**
 * UNO-structured Badugi prototype (Detroit 2026-10-13).
 * PROTOTYPE ONLY — does not touch the live game.
 *
 * Takes UNO's table structure and applies it to Badugi rules:
 * - Dealer position at top; cards fly from dealer to seats on the deal
 * - Center staging: pot as the centerpiece (UNO's pile position)
 * - Seats arranged in an arc around the center (not the pt-table grid)
 * - Camera pulse on bets, draws, showdown (UNO's signature feel)
 * - Per-card deal tick sounds, higher pitch for hero's cards
 * - Fast reveals (0.15s) on showdown
 *
 * Game logic: scripted state machine cycling deal → bet → draw → showdown.
 * Badugi rules themselves are unchanged; this is presentation only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PlayingCard } from '@/components/game/Card';
import { sfx } from '@/lib/sounds';
import type { CardType, Rank, Suit } from '@shared/gameTypes';

// ── Types ────────────────────────────────────────────────────────────────────

type ProtoPhase = 'dealing' | 'betting' | 'draw' | 'showdown' | 'settling';

interface ProtoPlayer {
  id: string;
  name: string;
  chips: number;
  bet: number;
  cards: CardType[];
  isHero: boolean;
  folded: boolean;
  drewCount: number | null; // null = hasn't drawn yet
  isWinner: boolean;
}

interface ProtoState {
  phase: ProtoPhase;
  players: ProtoPlayer[];
  pot: number;
  dealerSeat: number; // index into players
  activeSeat: number;
  dealtCount: number; // cards dealt so far (for stagger)
  pulseKey: number; // bump to trigger camera pulse
  handNumber: number;
}

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function randomCard(): CardType {
  return {
    rank: RANKS[Math.floor(Math.random() * RANKS.length)],
    suit: SUITS[Math.floor(Math.random() * SUITS.length)],
    isHidden: false,
  };
}

function makePlayers(): ProtoPlayer[] {
  const names = ['YOU', 'Marcus', 'T-Bone', 'Silk', 'Reese'];
  return names.map((name, i) => ({
    id: `p${i}`,
    name,
    chips: 1000 + Math.floor(Math.random() * 4000),
    bet: 0,
    cards: [],
    isHero: i === 0,
    folded: false,
    drewCount: null,
    isWinner: false,
  }));
}

function initialState(handNumber: number): ProtoState {
  return {
    phase: 'dealing',
    players: makePlayers(),
    pot: 0,
    dealerSeat: handNumber % 5,
    activeSeat: 0,
    dealtCount: 0,
    pulseKey: 0,
    handNumber,
  };
}

// ── Scripted game driver ─────────────────────────────────────────────────────

function useProtoGame() {
  const [state, setState] = useState<ProtoState>(() => initialState(1));
  const reduced = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const pulse = useCallback(() => {
    if (reduced) return;
    setState(s => ({ ...s, pulseKey: s.pulseKey + 1 }));
  }, [reduced]);

  // Deal one card to each player in turn, with tick sounds
  const runDeal = useCallback(() => {
    const totalCards = 5 * 4; // 5 players × 4 cards
    for (let i = 0; i < totalCards; i++) {
      later(i * 140, () => {
        setState(s => {
          const players = s.players.map(p => ({ ...p }));
          const seatIdx = i % 5;
          const card = randomCard();
          // Hero's cards face up, others face down (hidden info preserved)
          if (seatIdx !== 0) card.isHidden = true;
          players[seatIdx].cards = [...players[seatIdx].cards, card];
          return { ...s, players, dealtCount: s.dealtCount + 1 };
        });
        // Tick sound — higher pitch for hero's cards (UNO: self vs others)
        const isHeroCard = i % 5 === 0;
        if (isHeroCard) sfx.dealSelf();
        else sfx.dealSingle();
      });
    }
    // After deal → antes → betting
    later(totalCards * 140 + 400, () => {
      setState(s => {
        const players = s.players.map(p => ({ ...p, bet: 25, chips: p.chips - 25 }));
        return { ...s, players, pot: 125, phase: 'betting', activeSeat: (s.dealerSeat + 1) % 5 };
      });
      pulse();
    });
  }, [later, pulse]);

  // Betting round: each active player acts with camera pulse + chip flight
  const runBetting = useCallback(() => {
    const order = [0, 1, 2, 3, 4];
    order.forEach((seatIdx, i) => {
      later(600 + i * 900, () => {
        setState(s => {
          const players = s.players.map(p => ({ ...p }));
          const p = players[seatIdx];
          // 20% fold chance for bots
          if (seatIdx !== 0 && Math.random() < 0.2) {
            p.folded = true;
          } else {
            const betAmt = 50 + Math.floor(Math.random() * 3) * 25;
            p.bet += betAmt;
            p.chips -= betAmt;
          }
          const pot = players.reduce((sum, pl) => sum + pl.bet, 0);
          return { ...s, players, pot, activeSeat: seatIdx };
        });
        sfx.betPlace();
        pulse();
      });
    });
    later(600 + order.length * 900 + 500, () => {
      setState(s => ({ ...s, phase: 'draw', activeSeat: 0 }));
    });
  }, [later, pulse]);

  // Draw phase: bots discard face-down (hidden), new cards from dealer
  const runDraw = useCallback(() => {
    const order = [0, 1, 2, 3, 4];
    order.forEach((seatIdx, i) => {
      later(500 + i * 1100, () => {
        setState(s => {
          const players = s.players.map(p => ({ ...p }));
          const p = players[seatIdx];
          if (p.folded) return s;
          const discardCount = seatIdx === 0 ? 2 : Math.floor(Math.random() * 3);
          p.drewCount = discardCount;
          // Replace discarded cards with new ones from dealer
          const kept = p.cards.slice(discardCount);
          const fresh = Array.from({ length: discardCount }, () => {
            const c = randomCard();
            if (seatIdx !== 0) c.isHidden = true;
            return c;
          });
          p.cards = [...kept, ...fresh];
          return { ...s, players, activeSeat: seatIdx };
        });
        sfx.dealSingle();
        pulse();
      });
    });
    later(500 + order.length * 1100 + 600, () => {
      setState(s => {
        // Pick a winner among non-folded (scripted — presentation only)
        const contenders = s.players.filter(p => !p.folded);
        const winner = contenders[Math.floor(Math.random() * contenders.length)];
        const players = s.players.map(p => ({
          ...p,
          isWinner: p.id === winner.id,
          // Reveal all cards at showdown
          cards: p.cards.map(c => ({ ...c, isHidden: false })),
        }));
        return { ...s, players, phase: 'showdown' };
      });
      pulse();
    });
  }, [later, pulse]);

  // Showdown → settle → next hand
  const runShowdown = useCallback(() => {
    later(2500, () => {
      setState(s => {
        const players = s.players.map(p => {
          if (p.isWinner) return { ...p, chips: p.chips + s.pot, bet: 0 };
          return { ...p, bet: 0, cards: [], drewCount: null, isWinner: false, folded: false };
        });
        return { ...s, players, pot: 0, phase: 'settling' };
      });
      sfx.bigWin();
      pulse();
    });
    later(4200, () => {
      setState(s => initialState(s.handNumber + 1));
    });
  }, [later, pulse]);

  // Phase machine
  useEffect(() => {
    clearTimers();
    if (state.phase === 'dealing') runDeal();
    else if (state.phase === 'betting') runBetting();
    else if (state.phase === 'draw') runDraw();
    else if (state.phase === 'showdown') runShowdown();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.handNumber]);

  useEffect(() => clearTimers, [clearTimers]);

  return state;
}

// ── Seat positioning (arc around center) ─────────────────────────────────────

function seatPosition(index: number, total: number): { x: number; y: number } {
  // Hero (index 0) at bottom; others fanned in an arc above
  if (index === 0) return { x: 50, y: 82 };
  const angle = Math.PI * (0.15 + 0.7 * (index / total));
  return {
    x: 50 + 38 * Math.cos(Math.PI - angle),
    y: 42 - 30 * Math.sin(Math.PI - angle),
  };
}

// ── Table component ──────────────────────────────────────────────────────────

export function UnoProtoTable() {
  const state = useProtoGame();
  const reduced = useReducedMotion();

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'radial-gradient(ellipse at 50% 40%, #1a0f2e 0%, #0a0618 70%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-amber-300 font-mono text-xs tracking-widest">PROTOTYPE — UNO STRUCTURE</div>
        <div className="text-white/60 font-mono text-xs">HAND #{state.handNumber} · {state.phase.toUpperCase()}</div>
      </div>

      {/* Camera pulse wrapper — UNO's signature feel */}
      <motion.div
        className="flex-1 relative"
        key={state.pulseKey}
        initial={reduced ? false : { scale: 1 }}
        animate={reduced ? {} : { scale: [1, 0.97, 1] }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{ transformOrigin: '50% 45%' }}
      >
        {/* Dealer position — top center, UNO style */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2 flex flex-col items-center">
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
            style={{ background: 'rgba(240,184,41,0.15)', border: '2px solid rgba(240,184,41,0.5)' }}
            animate={{ rotate: state.phase === 'dealing' ? 360 : 0 }}
            transition={{ duration: 2, ease: 'linear' }}
          >
            <span className="text-amber-300 text-xs font-mono">D</span>
          </motion.div>
          <div className="text-white/40 text-[10px] font-mono mt-1">DEALER</div>
        </div>

        {/* Center staging — pot as the centerpiece (UNO's pile position) */}
        <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <AnimatePresence>
            <motion.div
              key={`pot-${state.pot}`}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl px-6 py-3 text-center"
              style={{
                background: 'rgba(240,184,41,0.08)',
                border: '1px solid rgba(240,184,41,0.25)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="text-amber-300/70 text-[10px] font-mono tracking-widest">POT</div>
              <div className="text-amber-200 text-2xl font-bold font-mono">${state.pot.toLocaleString()}</div>
            </motion.div>
          </AnimatePresence>
          {/* Muck area — face-down discards land here (poker's hidden info preserved) */}
          <div className="mt-2 text-white/30 text-[10px] font-mono">
            {state.phase === 'draw' ? '··· discarding ···' : ''}
          </div>
        </div>

        {/* Seats in arc */}
        {state.players.map((p, i) => {
          const pos = seatPosition(i, state.players.length);
          const isActive = i === state.activeSeat && (state.phase === 'betting' || state.phase === 'draw');
          const isDealer = i === state.dealerSeat;
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {/* Active turn ring */}
              {isActive && (
                <motion.div
                  className="absolute -inset-2 rounded-xl"
                  style={{ border: '2px solid rgba(240,184,41,0.6)' }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}
              {/* Winner glow */}
              {p.isWinner && state.phase === 'showdown' && (
                <motion.div
                  className="absolute -inset-3 rounded-2xl"
                  style={{ border: '3px solid rgba(240,184,41,0.9)', boxShadow: '0 0 30px rgba(240,184,41,0.5)' }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                />
              )}
              <div className="flex items-center gap-1.5">
                {isDealer && <span className="text-amber-300 text-[10px] font-mono">D</span>}
                <span className={`text-xs font-mono ${p.isHero ? 'text-amber-200 font-bold' : 'text-white/80'}`}>
                  {p.name}
                </span>
                {p.folded && <span className="text-red-400/70 text-[10px] font-mono">FOLD</span>}
              </div>
              <div className="text-white/50 text-[10px] font-mono">{p.chips.toLocaleString()}</div>
              {p.bet > 0 && (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-amber-300 text-[10px] font-mono mt-0.5"
                >
                  ${p.bet}
                </motion.div>
              )}
              {/* Cards */}
              <div className="flex gap-0.5 mt-1">
                <AnimatePresence>
                  {p.cards.map((card, ci) => (
                    <motion.div
                      key={`${p.id}-c${ci}`}
                      initial={{ opacity: 0, y: -30, scale: 0.6 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{
                        duration: state.phase === 'showdown' ? 0.15 : 0.25, // UNO speed: fast reveals
                        ease: 'easeOut',
                      }}
                    >
                      {card.isHidden ? (
                        <div
                          className="rounded"
                          style={{
                            width: p.isHero ? 44 : 28,
                            height: p.isHero ? 62 : 40,
                            background: 'linear-gradient(135deg, #2d1b69, #1a0f2e)',
                            border: '1px solid rgba(139,92,246,0.4)',
                          }}
                        />
                      ) : (
                        <PlayingCard
                          card={card}
                          className={p.isHero ? '!w-[44px] !h-[62px]' : '!w-[28px] !h-[40px]'}
                        />
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              {/* Draw badge */}
              {p.drewCount !== null && state.phase === 'draw' && !p.folded && (
                <div className="text-purple-300 text-[10px] font-mono mt-1">
                  {p.drewCount === 0 ? 'STAND PAT' : `DREW ${p.drewCount}`}
                </div>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* Phase hint */}
      <div className="pb-6 text-center text-white/40 text-xs font-mono">
        {state.phase === 'dealing' && 'Dealing from the dealer…'}
        {state.phase === 'betting' && 'Betting round — watch the pulse on every bet'}
        {state.phase === 'draw' && 'Draw phase — discards stay face-down'}
        {state.phase === 'showdown' && 'Showdown — fast reveal'}
        {state.phase === 'settling' && 'Pot to winner…'}
      </div>
    </div>
  );
}
