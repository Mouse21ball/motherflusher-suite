/**
 * UNO-structured Badugi prototype (Detroit 2026-10-13).
 * PROTOTYPE ONLY — does not touch the live game.
 *
 * Takes UNO's table structure and applies it to Badugi rules:
 * - Dealer position at top; cards FLY from dealer to seats on the deal
 * - Chips FLY from bettor to pot on every bet — the pot visibly grows
 * - Discards FLY face-down to the muck on the draw; fresh cards fly from dealer
 * - Pot FLIES to the winner at showdown (the rake-in)
 * - Camera pulse accompanies the movement (UNO's signature feel)
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

// A transient animated element flying across the table
interface Flight {
  id: string;
  kind: 'card' | 'chip' | 'muck';
  fromX: number; fromY: number;
  toX: number; toY: number;
  label: string; // chip amount, e.g. "$50"
  faceDown: boolean;
  duration: number; // seconds
}

interface RakeState {
  active: boolean;
  winnerIndex: number;
  amount: number;
}

interface ProtoState {
  phase: ProtoPhase;
  players: ProtoPlayer[];
  pot: number;
  dealerSeat: number;
  activeSeat: number;
  pulseKey: number;
  handNumber: number;
  flights: Flight[];
  rake: RakeState;
}

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Key table positions (percentages)
const DEALER_POS = { x: 50, y: 4 };
const POT_POS = { x: 50, y: 52 };
const MUCK_POS = { x: 63, y: 44 };

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
    pulseKey: 0,
    handNumber,
    flights: [],
    rake: { active: false, winnerIndex: -1, amount: 0 },
  };
}

// ── Seat positioning ─────────────────────────────────────────────────────────
// Landscape-first (Detroit 2026-10-13): opponents hug the top in a shallow arc,
// hero at bottom, pot gets clear center space.

function seatPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 50, y: 88 }; // hero
  const spots = [
    { x: 10, y: 32 },
    { x: 30, y: 16 },
    { x: 70, y: 16 },
    { x: 90, y: 32 },
  ];
  return spots[(index - 1) % spots.length];
}

let flightId = 0;
function nextFlightId() { return `f${++flightId}`; }

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

  const addFlight = useCallback((f: Omit<Flight, 'id'>) => {
    const id = nextFlightId();
    setState(s => ({ ...s, flights: [...s.flights, { ...f, id }] }));
    return id;
  }, []);

  const removeFlight = useCallback((id: string) => {
    setState(s => ({ ...s, flights: s.flights.filter(f => f.id !== id) }));
  }, []);

  // ── DEAL: cards fly from dealer to each seat ──
  const runDeal = useCallback(() => {
    const totalCards = 5 * 4;
    for (let i = 0; i < totalCards; i++) {
      const seatIdx = i % 5;
      const seat = seatPosition(seatIdx);
      const t0 = i * 160;
      // Flight out from dealer
      later(t0, () => {
        const fid = addFlight({
          kind: 'card',
          fromX: DEALER_POS.x, fromY: DEALER_POS.y,
          toX: seat.x, toY: seat.y - 6,
          label: '',
          faceDown: seatIdx !== 0,
          duration: 0.32,
        });
        const isHeroCard = seatIdx === 0;
        if (isHeroCard) sfx.dealSelf(); else sfx.dealSingle();
        // Card lands in hand when flight completes
        later(320, () => {
          removeFlight(fid);
          setState(s => {
            const players = s.players.map(p => ({ ...p }));
            const card = randomCard();
            if (seatIdx !== 0) card.isHidden = true;
            players[seatIdx].cards = [...players[seatIdx].cards, card];
            return { ...s, players };
          });
        });
      });
    }
    later(totalCards * 160 + 500, () => {
      setState(s => {
        const players = s.players.map(p => ({ ...p, bet: 25, chips: p.chips - 25 }));
        return { ...s, players, pot: 125, phase: 'betting', activeSeat: (s.dealerSeat + 1) % 5 };
      });
      pulse();
    });
  }, [later, pulse, addFlight, removeFlight]);

  // ── BETTING: chips fly from bettor to pot ──
  const runBetting = useCallback(() => {
    const order = [0, 1, 2, 3, 4];
    order.forEach((seatIdx, i) => {
      const t0 = 700 + i * 1100;
      later(t0, () => {
        const seat = seatPosition(seatIdx);
        setState(s => ({ ...s, activeSeat: seatIdx }));
        // Decide action first
        const willFold = seatIdx !== 0 && Math.random() < 0.2;
        if (willFold) {
          setState(s => {
            const players = s.players.map(p => ({ ...p }));
            players[seatIdx].folded = true;
            return { ...s, players };
          });
          pulse();
          return;
        }
        const betAmt = 50 + Math.floor(Math.random() * 3) * 25;
        // Chip flies from seat to pot
        const fid = addFlight({
          kind: 'chip',
          fromX: seat.x, fromY: seat.y - 4,
          toX: POT_POS.x, toY: POT_POS.y,
          label: `$${betAmt}`,
          faceDown: false,
          duration: 0.45,
        });
        sfx.betPlace();
        // Pot grows when chip lands
        later(450, () => {
          removeFlight(fid);
          setState(s => {
            const players = s.players.map(p => ({ ...p }));
            players[seatIdx].bet += betAmt;
            players[seatIdx].chips -= betAmt;
            const pot = players.reduce((sum, pl) => sum + pl.bet, 0);
            return { ...s, players, pot };
          });
          pulse();
        });
      });
    });
    later(700 + order.length * 1100 + 600, () => {
      setState(s => ({ ...s, phase: 'draw', activeSeat: 0 }));
    });
  }, [later, pulse, addFlight, removeFlight]);

  // ── DRAW: discards fly face-down to muck, fresh cards fly from dealer ──
  const runDraw = useCallback(() => {
    const order = [0, 1, 2, 3, 4];
    order.forEach((seatIdx, i) => {
      const t0 = 600 + i * 1400;
      later(t0, () => {
        setState(s => ({ ...s, activeSeat: seatIdx }));
        const seat = seatPosition(seatIdx);
        let drewCount = 0;
        setState(s => {
          const p = s.players[seatIdx];
          if (p.folded) return s;
          drewCount = seatIdx === 0 ? 2 : Math.floor(Math.random() * 3);
          return s;
        });
        if (drewCount === 0) {
          setState(s => {
            const players = s.players.map(pl => ({ ...pl }));
            if (!players[seatIdx].folded) players[seatIdx].drewCount = 0;
            return { ...s, players };
          });
          return;
        }
        // Discards fly face-down to the muck
        for (let d = 0; d < drewCount; d++) {
          const fid = addFlight({
            kind: 'muck',
            fromX: seat.x, fromY: seat.y - 6,
            toX: MUCK_POS.x + d * 1.5, toY: MUCK_POS.y,
            label: '',
            faceDown: true,
            duration: 0.35,
          });
          later(d * 120 + 350, () => removeFlight(fid));
        }
        sfx.dealSingle();
        pulse();
        // Fresh cards fly from dealer to seat
        later(drewCount * 120 + 400, () => {
          for (let d = 0; d < drewCount; d++) {
            const dfid = addFlight({
              kind: 'card',
              fromX: DEALER_POS.x, fromY: DEALER_POS.y,
              toX: seat.x, toY: seat.y - 6,
              label: '',
              faceDown: seatIdx !== 0,
              duration: 0.32,
            });
            if (seatIdx === 0) sfx.dealSelf(); else sfx.dealSingle();
            later(d * 120 + 320, () => removeFlight(dfid));
          }
          // Hand updates when new cards land
          later(drewCount * 120 + 350, () => {
            setState(s => {
              const players = s.players.map(p => ({ ...p }));
              const p = players[seatIdx];
              if (p.folded) return s;
              p.drewCount = drewCount;
              const kept = p.cards.slice(drewCount);
              const fresh = Array.from({ length: drewCount }, () => {
                const c = randomCard();
                if (seatIdx !== 0) c.isHidden = true;
                return c;
              });
              p.cards = [...kept, ...fresh];
              return { ...s, players };
            });
          });
        });
      });
    });
    later(600 + order.length * 1400 + 800, () => {
      setState(s => {
        const contenders = s.players.filter(p => !p.folded);
        const winner = contenders[Math.floor(Math.random() * contenders.length)];
        const players = s.players.map(p => ({
          ...p,
          isWinner: p.id === winner.id,
          cards: p.cards.map(c => ({ ...c, isHidden: false })),
        }));
        return { ...s, players, phase: 'showdown', flights: [] };
      });
      pulse();
    });
  }, [later, pulse, addFlight, removeFlight]);

  // ── SHOWDOWN → rake-in → settle → next hand ──
  const runShowdown = useCallback(() => {
    later(2500, () => {
      setState(s => {
        const winnerIdx = s.players.findIndex(p => p.isWinner);
        return { ...s, phase: 'settling', rake: { active: true, winnerIndex: winnerIdx, amount: s.pot } };
      });
      sfx.chipRake();
      pulse();
    });
    later(3700, () => {
      setState(s => {
        const players = s.players.map(p => {
          if (p.isWinner) return { ...p, chips: p.chips + s.pot, bet: 0 };
          return { ...p, bet: 0, cards: [], drewCount: null, isWinner: false, folded: false };
        });
        return { ...s, players, pot: 0, rake: { active: false, winnerIndex: -1, amount: 0 } };
      });
      sfx.bigWin();
      pulse();
    });
    later(5400, () => {
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

// ── Flight rendering ─────────────────────────────────────────────────────────

function FlightView({ flight }: { flight: Flight }) {
  return (
    <motion.div
      className="absolute z-30 pointer-events-none"
      style={{ left: `${flight.fromX}%`, top: `${flight.fromY}%` }}
      initial={{ x: '-50%', y: '-50%', opacity: 1, scale: 1 }}
      animate={{
        left: `${flight.toX}%`,
        top: `${flight.toY}%`,
        opacity: 1,
        scale: flight.kind === 'chip' ? 0.85 : 1,
      }}
      transition={{ duration: flight.duration, ease: [0.3, 0.7, 0.4, 1] }}
    >
      {flight.kind === 'chip' ? (
        <div
          className="rounded-full px-3 py-1.5 font-mono font-bold text-xs text-amber-200 whitespace-nowrap"
          style={{
            background: 'rgba(20,10,40,0.95)',
            border: '2px solid rgba(240,184,41,0.8)',
            boxShadow: '0 0 16px rgba(240,184,41,0.5)',
          }}
        >
          {flight.label}
        </div>
      ) : (
        <div
          className="rounded"
          style={{
            width: 30, height: 42,
            background: flight.faceDown
              ? 'linear-gradient(135deg, #2d1b69, #1a0f2e)'
              : 'linear-gradient(135deg, #f5f0ff, #d9ccff)',
            border: '1px solid rgba(139,92,246,0.6)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        />
      )}
    </motion.div>
  );
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

      {/* Rotate hint — shows only in portrait */}
      <div className="landscape:hidden text-center pb-2">
        <span className="text-amber-300/70 text-[11px] font-mono bg-amber-400/10 border border-amber-400/30 rounded-full px-3 py-1">
          ⟳ ROTATE FOR FULL TABLE
        </span>
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
        <div className="absolute left-1/2 -translate-x-1/2 top-1 flex flex-col items-center">
          <motion.div
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
            style={{ background: 'rgba(240,184,41,0.15)', border: '2px solid rgba(240,184,41,0.5)' }}
            animate={{ rotate: state.phase === 'dealing' ? 360 : 0 }}
            transition={{ duration: 2, ease: 'linear' }}
          >
            <span className="text-amber-300 text-[10px] font-mono">D</span>
          </motion.div>
        </div>

        {/* Center staging — pot as the centerpiece (UNO's pile position) */}
        <div className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
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
          {/* Muck pile — face-down discards stack here */}
          {state.phase === 'draw' && (
            <div className="mt-1 text-white/30 text-[10px] font-mono">🂠 muck</div>
          )}
        </div>

        {/* Flights: cards and chips moving across the table */}
        {state.flights.map(f => <FlightView key={f.id} flight={f} />)}

        {/* Rake-in: pot chips fly to the winner's seat */}
        {state.rake.active && state.rake.winnerIndex >= 0 && (() => {
          const wpos = seatPosition(state.rake.winnerIndex);
          return (
            <motion.div
              className="absolute z-20 flex flex-col items-center pointer-events-none"
              style={{ left: '50%', top: '52%' }}
              initial={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
              animate={{
                x: `calc(-50% + ${(wpos.x - 50) * 3.5}px)`,
                y: `calc(-50% + ${(wpos.y - 52) * 3.5}px)`,
                scale: 0.7,
                opacity: 0.9,
              }}
              transition={{ duration: 1.0, ease: [0.3, 0.7, 0.4, 1] }}
            >
              <div
                className="rounded-full px-4 py-2 font-mono font-bold text-amber-200 whitespace-nowrap"
                style={{
                  background: 'rgba(20,10,40,0.9)',
                  border: '2px solid rgba(240,184,41,0.7)',
                  boxShadow: '0 0 24px rgba(240,184,41,0.4)',
                }}
              >
                ${state.rake.amount.toLocaleString()}
              </div>
              <div className="text-amber-300/80 text-[10px] font-mono mt-1">◀◀ RAKING IT IN</div>
            </motion.div>
          );
        })()}

        {/* Seats */}
        {state.players.map((p, i) => {
          const pos = seatPosition(i);
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
                  className="absolute -inset-2 rounded-xl pointer-events-none"
                  style={{ border: '2px solid rgba(240,184,41,0.6)' }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}
              {/* Winner glow */}
              {p.isWinner && state.phase === 'showdown' && (
                <motion.div
                  className="absolute -inset-3 rounded-2xl pointer-events-none"
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
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{
                        duration: state.phase === 'showdown' ? 0.15 : 0.2,
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
        {state.phase === 'betting' && 'Chips flying to the pot…'}
        {state.phase === 'draw' && 'Discards to the muck — fresh cards from the dealer'}
        {state.phase === 'showdown' && 'Showdown — fast reveal'}
        {state.phase === 'settling' && 'Raking it in…'}
      </div>
    </div>
  );
}
