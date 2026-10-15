/**
 * BoxChevyTable — VERBATIM Badugi-style presentation with live server state (Detroit 2026-10-15).
 *
 * Rebuilt on Badugi/Flushed Up's flight engine (option A — full rebuild).
 * Same flight engine, same staging, same premium touches — driven by live GameState.
 * 5 hole cards per hand (20 deal flights), THEN 5 community cards dealt the same
 * way as a hand — from the dealer, staggered flights, staged until they land.
 * Single animation/sound system — no duplicates.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PlayingCard } from '@/components/game/Card';
import { sfx } from '@/lib/sounds';
import { getSelectedBackground } from '@/lib/tableBackgrounds';
import type { CardType } from '@shared/gameTypes';
import type { GameState } from '@/lib/poker/types';
import { evaluateBoxChevy10, compareBoxChevyHigh, compareBoxChevyLow } from '@shared/modes/boxchevy';

// ── Types ────────────────────────────────────────────────────────────────────

type ProtoPhase =
  | 'ante'
  | 'dealing'
  | 'draw1' | 'bet1'
  | 'draw2' | 'bet2'
  | 'draw3' | 'bet3'
  | 'declare'
  | 'showdown';

interface ProtoPlayer {
  id: string;
  name: string;
  chips: number;
  bet: number;
  cards: CardType[];
  isHero: boolean;
  folded: boolean;
  drewCount: number | null;
  isWinner: boolean;
  declaration: string | null;
}

// A transient animated element flying across the table
interface Flight {
  id: string;
  kind: 'card' | 'chip' | 'muck';
  fromX: number; fromY: number;
  toX: number; toY: number;
  label: string;
  faceDown: boolean;
  duration: number;
  toHero: boolean;
}

interface RakeState {
  active: boolean;
  winnerIndex: number;
  amount: number;
}

interface WinnerInfo {
  name: string;
  amount: number;
  cards: { rank: string; suit: string }[];
  handLabel: string;
  side: 'HIGH' | 'LOW' | 'SWING' | 'SOLE';
}

interface CelebrationState {
  active: boolean;
  // Two-winner support: high and low celebrated separately (Detroit 2026-10-15)
  highWinner: WinnerInfo | null;
  lowWinner: WinnerInfo | null;
  // Single winner (swing or sole survivor)
  soleWinner: WinnerInfo | null;
}

interface ProtoState {
  phase: ProtoPhase;
  players: ProtoPlayer[];
  pot: number;
  dealerSeat: number;
  activeSeat: number;
  flights: Flight[];
  rake: RakeState;
  celebration: CelebrationState;
  communityCards: CardType[];
}

// Key table positions (percentages) — same as Badugi/Flushed Up
const DEALER_POS = { x: 50, y: 4 };
const POT_POS = { x: 50, y: 52 };
const MUCK_POS = { x: 63, y: 44 };
const COMMUNITY_POS = { x: 50, y: 38 };

// Card sizes — hero bigger (5 cards need to fit)
const HERO_CARD_W = 56;
const HERO_CARD_H = 78;
const OPP_CARD_W = 20;
const OPP_CARD_H = 30;

function mapPhase(livePhase: string): ProtoPhase {
  if (livePhase === 'ANTE') return 'ante';
  if (livePhase === 'DEAL') return 'dealing';
  if (livePhase === 'DRAW_1') return 'draw1';
  if (livePhase === 'DRAW_2') return 'draw2';
  if (livePhase === 'DRAW_3') return 'draw3';
  if (livePhase === 'BET_1') return 'bet1';
  if (livePhase === 'BET_2') return 'bet2';
  if (livePhase === 'BET_3') return 'bet3';
  if (livePhase === 'DECLARE') return 'declare';
  if (livePhase === 'SHOWDOWN') return 'showdown';
  return 'ante';
}

function emptyCelebration(): CelebrationState {
  return { active: false, highWinner: null, lowWinner: null, soleWinner: null };
}

function useLiveProtoState(liveState: GameState, myId: string): ProtoState {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [rake, setRake] = useState<RakeState>({ active: false, winnerIndex: -1, amount: 0 });
  const [celebration, setCelebration] = useState<CelebrationState>(emptyCelebration);
  const [landed, setLanded] = useState<Record<string, number>>({});
  const [commLanded, setCommLanded] = useState(0);
  const reduced = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flightId = useRef(0);
  const prevRef = useRef<{ handId?: number; phase: string; bets: Record<string, number>; draws: Record<string, string | undefined> } | null>(null);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  const addFlight = useCallback((f: Omit<Flight, 'id'>) => {
    const id = `f${++flightId.current}`;
    setFlights(s => [...s, { ...f, id }]);
    return id;
  }, []);

  const removeFlight = useCallback((id: string) => {
    setFlights(s => s.filter(f => f.id !== id));
  }, []);

  useEffect(() => {
    if (reduced) return;
    const prev = prevRef.current;
    const curr = {
      handId: liveState.handId,
      phase: liveState.phase,
      bets: Object.fromEntries(liveState.players.map(p => [p.id, p.bet])),
      draws: Object.fromEntries(liveState.players.map(p => [p.id, `${liveState.phase}:${(p as any).lastDrawCount ?? 'x'}`])),
    };

    if (prev) {
      // NEW HAND → 20 hole cards, THEN 5 community cards (Detroit 2026-10-15:
      // community dealt the same way as a hand — staggered flights from dealer).
      const isNewHand = prev.handId !== undefined && curr.handId !== undefined && prev.handId !== curr.handId;
      if (isNewHand) {
        const me = liveState.players.find(p => p.id === myId);
        const others = liveState.players.filter(p => p.id !== myId).slice(0, 3);
        const ordered = me ? [me, ...others] : others;
        const reset: Record<string, number> = {};
        for (const p of ordered) reset[p.id] = 0;
        setLanded(reset);
        setCommLanded(0);
        for (let i = 0; i < 20; i++) {
          const seatIdx = i % 4;
          const player = ordered[seatIdx];
          if (!player) continue;
          const isHero = seatIdx === 0;
          later(i * 160, () => {
            const pos = seatPosition(seatIdx);
            const fid = addFlight({
              kind: 'card',
              fromX: DEALER_POS.x, fromY: DEALER_POS.y,
              toX: pos.x, toY: pos.y - 6,
              label: '', faceDown: !isHero, duration: 0.32, toHero: isHero,
            });
            if (isHero) sfx.dealSelf(); else sfx.dealSingle();
            later(320, () => {
              removeFlight(fid);
              setLanded(prevLanded => ({
                ...prevLanded,
                [player.id]: Math.min((prevLanded[player.id] ?? 0) + 1, 5),
              }));
            });
          });
        }
        const commStart = 20 * 160 + 400;
        for (let c = 0; c < 5; c++) {
          later(commStart + c * 160, () => {
            const fid = addFlight({
              kind: 'card',
              fromX: DEALER_POS.x, fromY: DEALER_POS.y,
              toX: COMMUNITY_POS.x + (c - 2) * 11, toY: COMMUNITY_POS.y,
              label: '', faceDown: false, duration: 0.32, toHero: false,
            });
            sfx.dealSingle();
            later(320, () => {
              removeFlight(fid);
              setCommLanded(prev => Math.min(prev + 1, 5));
            });
          });
        }
      }

      // BETS + ANTES → chips fly
      for (const p of liveState.players) {
        const betInc = (curr.bets[p.id] ?? 0) - (prev.bets[p.id] ?? 0);
        if (betInc > 0 && (curr.phase.startsWith('BET') || curr.phase === 'ANTE')) {
          const isHero = p.id === myId;
          const seatIdx = isHero ? 0 : liveState.players.filter(x => x.id !== myId).findIndex(x => x.id === p.id) + 1;
          const pos = seatPosition(Math.max(0, seatIdx));
          const fid = addFlight({
            kind: 'chip',
            fromX: pos.x, fromY: pos.y - 4,
            toX: POT_POS.x, toY: POT_POS.y,
            label: `$${betInc}`, faceDown: false, duration: 0.45, toHero: false,
          });
          sfx.betPlace();
          later(450, () => removeFlight(fid));
        }
      }

      // DRAWS → discards to muck, replacements from dealer
      for (const p of liveState.players) {
        const prevD = prev.draws[p.id];
        const currD = curr.draws[p.id];
        const currCount = parseInt(currD.split(':')[1] || '0', 10);
        if (currD !== prevD && !isNaN(currCount) && currCount > 0) {
          const isHero = p.id === myId;
          const seatIdx = isHero ? 0 : liveState.players.filter(x => x.id !== myId).findIndex(x => x.id === p.id) + 1;
          const pos = seatPosition(Math.max(0, seatIdx));
          const keptCount = 5 - currCount;
          setLanded(prevLanded => ({ ...prevLanded, [p.id]: keptCount }));
          for (let d = 0; d < currCount; d++) {
            const fid = addFlight({
              kind: 'muck',
              fromX: pos.x, fromY: pos.y - 6,
              toX: MUCK_POS.x + d * 1.5, toY: MUCK_POS.y,
              label: '', faceDown: true, duration: 0.35, toHero: false,
            });
            later(d * 120 + 350, () => removeFlight(fid));
          }
          sfx.dealSingle();
          later(currCount * 120 + 400, () => {
            for (let d = 0; d < currCount; d++) {
              const dfid = addFlight({
                kind: 'card',
                fromX: DEALER_POS.x, fromY: DEALER_POS.y,
                toX: pos.x, toY: pos.y - 6,
                label: '', faceDown: !isHero, duration: 0.32, toHero: isHero,
              });
              if (isHero) sfx.dealSelf(); else sfx.dealSingle();
              later(d * 120 + 320, () => {
                removeFlight(dfid);
                setLanded(prevLanded => ({
                  ...prevLanded,
                  [p.id]: Math.min((prevLanded[p.id] ?? keptCount) + 1, 5),
                }));
              });
            }
          });
        }
      }

      // SHOWDOWN → rake, two-winner celebration
      if (curr.phase === 'SHOWDOWN' && prev.phase !== 'SHOWDOWN') {
        const winners = liveState.players.filter(p => (p as any).isWinner);
        const comm = (liveState.communityCards ?? []).map(c => ({ ...c, isHidden: false }));
        if (winners.length > 0) {
          const evals = new Map(winners.map(w => {
            const hole = (w.cards ?? []).map(c => ({ ...c, isHidden: false }));
            return [w.id, evaluateBoxChevy10(hole as any, comm as any)];
          }));
          const decl = (w: any) => (w as any).declaration as string | null;
          const highPool = winners.filter(w => decl(w) === 'HIGH' || decl(w) === 'SWING');
          const lowPool = winners.filter(w => decl(w) === 'LOW' || decl(w) === 'SWING');
          let bestHigh: any = null, bestLow: any = null;
          for (const w of highPool) {
            const e = evals.get(w.id)!;
            if (!bestHigh || compareBoxChevyHigh(e, evals.get(bestHigh.id)!) > 0) bestHigh = w;
          }
          for (const w of lowPool) {
            const e = evals.get(w.id)!;
            if (!bestLow || compareBoxChevyLow(e, evals.get(bestLow.id)!) > 0) bestLow = w;
          }
          const buildInfo = (w: any, side: WinnerInfo['side']): WinnerInfo => {
            const hole = (w.cards ?? []).map((c: any) => ({ rank: c.rank, suit: c.suit }));
            const e = evals.get(w.id)!;
            return {
              name: w.name,
              amount: Math.floor(liveState.pot / winners.length),
              cards: hole,
              handLabel: e.desc,
              side,
            };
          };
          let highWinner: WinnerInfo | null = null;
          let lowWinner: WinnerInfo | null = null;
          let soleWinner: WinnerInfo | null = null;
          if (bestHigh && bestLow && bestHigh.id === bestLow.id) {
            soleWinner = buildInfo(bestHigh, 'SWING');
          } else {
            if (bestHigh) highWinner = buildInfo(bestHigh, 'HIGH');
            if (bestLow) lowWinner = buildInfo(bestLow, 'LOW');
            if (!highWinner && !lowWinner && winners.length > 0) {
              soleWinner = buildInfo(winners[0], 'SOLE');
            }
          }
          const firstWinner = bestHigh ?? bestLow ?? winners[0];
          const isHero = firstWinner.id === myId;
          const seatIdx = isHero ? 0 : liveState.players.filter(x => x.id !== myId).findIndex(x => x.id === firstWinner.id) + 1;
          later(2500, () => {
            setRake({ active: true, winnerIndex: Math.max(0, seatIdx), amount: liveState.pot });
            sfx.chipRake();
          });
          later(3700, () => {
            setRake({ active: false, winnerIndex: -1, amount: 0 });
            setCelebration({ active: true, highWinner, lowWinner, soleWinner });
            sfx.bigWin();
          });
          later(12000, () => {
            setCelebration(emptyCelebration());
          });
        }
      }
    }
    prevRef.current = curr;
  }, [liveState, myId, reduced, later, addFlight, removeFlight]);

  const me = liveState.players.find(p => p.id === myId);
  const others = liveState.players.filter(p => p.id !== myId).slice(0, 3);
  const ordered = me ? [me, ...others] : others;

  const showdownPhase = mapPhase(liveState.phase) === 'showdown';
  const players: ProtoPlayer[] = ordered.map((p, i) => ({
    id: p.id,
    name: p.name,
    chips: p.chips,
    bet: p.bet,
    cards: p.cards.slice(0, landed[p.id] ?? p.cards.length).map(c => ({
      ...c,
      isHidden: i === 0 ? c.isHidden : (showdownPhase && p.status !== 'folded' ? false : true),
    })),
    isHero: i === 0,
    folded: p.status === 'folded',
    drewCount: (p as any).lastDrawCount ?? null,
    isWinner: !!(p as any).isWinner,
    declaration: (p as any).declaration ?? null,
  }));

  const dealerPlayerIdx = liveState.players.findIndex(p => (p as any).isDealer);
  const activePlayer = liveState.players.find(p => p.id === liveState.activePlayerId);
  const activeIdx = activePlayer ? ordered.findIndex(p => p.id === activePlayer.id) : -1;

  return {
    phase: mapPhase(liveState.phase),
    players,
    pot: liveState.pot,
    dealerSeat: dealerPlayerIdx >= 0 ? ordered.findIndex(p => p.id === liveState.players[dealerPlayerIdx].id) : 0,
    activeSeat: activeIdx,
    flights,
    rake,
    celebration,
    communityCards: (liveState.communityCards ?? []).slice(0, commLanded).map(c => ({ ...c, isHidden: false })),
  };
}

function seatPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 50, y: 88 };
  const spots = [
    { x: 14, y: 28 },
    { x: 50, y: 14 },
    { x: 86, y: 28 },
  ];
  return spots[(index - 1) % spots.length];
}

function FlightView({ flight }: { flight: Flight }) {
  const size = flight.kind === 'card'
    ? (flight.toHero ? { w: HERO_CARD_W, h: HERO_CARD_H } : { w: 20, h: 30 })
    : { w: 26, h: 26 };
  return (
    <motion.div
      className="absolute z-30 pointer-events-none"
      style={{ left: `${flight.fromX}%`, top: `${flight.fromY}%`, width: size.w, height: size.h }}
      initial={{ x: '-50%', y: '-50%' }}
      animate={{ left: `${flight.toX}%`, top: `${flight.toY}%` }}
      transition={{ duration: flight.duration, ease: [0.3, 0.7, 0.4, 1] }}
    >
      {flight.kind === 'card' ? (
        <div
          className="rounded"
          style={{
            width: '100%', height: '100%',
            background: flight.faceDown ? 'linear-gradient(135deg, #2d1b69, #1a0f2e)' : '#fff',
            border: '1px solid rgba(139,92,246,0.4)',
          }}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center text-[8px] font-mono text-amber-200"
          style={{
            width: '100%', height: '100%',
            background: 'radial-gradient(circle at 35% 30%, #FBBF24, #92400E)',
            border: '2px dashed rgba(255,255,255,0.5)',
          }}
        >
          {flight.label}
        </div>
      )}
    </motion.div>
  );
}

interface BoxChevyTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
}

export function BoxChevyTable({ state: liveState, myId, selectedCardIndices, onCardClick, isDrawPhase }: BoxChevyTableProps) {
  const reduced = useReducedMotion();
  const state = useLiveProtoState(liveState, myId);
  const coins = useMemo(() => Array.from({ length: 24 }).map((_, i) => ({
    angle: (i / 24) * Math.PI * 2,
    dist: 120 + Math.random() * 80,
    duration: 1.2 + Math.random() * 0.6,
    delay: Math.random() * 0.3,
  })), [state.celebration.active]);
  const bg = getSelectedBackground();

  return (
    <div className="h-full flex flex-col relative" style={{
      backgroundImage: `url(${bg.url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(10,6,24,0.55)' }} />
      <div className="flex-1 relative" style={{ perspective: '1200px' }}>
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

        <div className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <AnimatePresence>
            <motion.div
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl px-6 py-3 text-center"
              style={{
                background: 'rgba(240,184,41,0.08)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              }}
            >
              <div className="text-amber-300/70 text-[10px] font-mono tracking-widest">POT</div>
              <div className="text-amber-200 text-2xl font-bold font-mono mt-1">${state.pot.toLocaleString()}</div>
            </motion.div>
          </AnimatePresence>
          {(state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && (
            <div className="mt-1 text-white/30 text-[10px] font-mono">🂠 muck</div>
          )}
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex gap-1.5" style={{ top: '38%' }}>
          <AnimatePresence>
            {state.communityCards.map((card, i) => (
              <motion.div
                key={`comm-${i}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <PlayingCard card={card} className="!w-[44px] !h-[62px]" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {state.communityCards.length > 0 && (
          <div className="absolute left-1/2 -translate-x-1/2 text-white/40 text-[9px] font-mono tracking-widest" style={{ top: 'calc(38% + 68px)' }}>
            COMMUNITY
          </div>
        )}

        {state.flights.map(f => <FlightView key={f.id} flight={f} />)}

        {state.rake.active && state.rake.winnerIndex >= 0 && (() => {
          const wpos = seatPosition(state.rake.winnerIndex);
          const amt = state.rake.amount;
          const flyCount = amt < 500 ? 3 : amt < 2000 ? 5 : amt < 10000 ? 7 : 8;
          return (
            <>
              {Array.from({ length: flyCount }).map((_, i) => (
                <motion.div
                  key={`rakechip-${i}`}
                  className="absolute z-20 rounded-full pointer-events-none"
                  style={{
                    width: 26, height: 26,
                    background: 'radial-gradient(circle at 35% 30%, #FBBF24, #92400E)',
                    border: '2px dashed rgba(255,255,255,0.5)',
                    boxShadow: '0 0 12px rgba(245,158,11,0.6)',
                  }}
                  initial={{ left: '50%', top: '52%', x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
                  animate={{
                    left: `${wpos.x}%`, top: `${wpos.y}%`,
                    x: `calc(-50% + ${(i - flyCount / 2) * 8}px)`,
                    y: `calc(-50% + ${(i % 3) * 6}px)`,
                    scale: 0.6, opacity: 0.9,
                  }}
                  transition={{ duration: 0.9, ease: [0.3, 0.7, 0.4, 1], delay: i * 0.06 }}
                />
              ))}
            </>
          );
        })()}

        {state.players.map((p, i) => {
          const pos = seatPosition(i);
          const isActive = state.activeSeat === i && !p.folded;
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {isActive && (
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 90, height: 90,
                    background: 'radial-gradient(circle, rgba(240,184,41,0.25) 0%, transparent 70%)',
                  }}
                  animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <div className="flex items-center gap-1">
                {state.dealerSeat === i && (
                  <span className="text-amber-300 text-[10px] font-mono font-bold">D</span>
                )}
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
              {p.declaration && state.phase !== 'showdown' && (
                <div className={`text-[10px] font-mono font-bold mt-0.5 px-1.5 py-0.5 rounded ${
                  p.declaration === 'HIGH' ? 'text-blue-300 bg-blue-500/20' :
                  p.declaration === 'LOW' ? 'text-green-300 bg-green-500/20' :
                  p.declaration === 'SWING' ? 'text-purple-300 bg-purple-500/20' :
                  'text-white/40'
                }`}>
                  {p.declaration}
                </div>
              )}
              <div
                className="flex mt-1"
                style={!p.isHero
                  ? { transform: 'rotateX(18deg)', transformStyle: 'preserve-3d', gap: '-8px' }
                  : { gap: '2px' }
                }
              >
                <AnimatePresence>
                  {p.cards.map((card, ci) => {
                    const fanAngle = !p.isHero && p.cards.length > 1
                      ? (ci - (p.cards.length - 1) / 2) * 8
                      : 0;
                    return (
                    <motion.div
                      key={`${p.id}-c${ci}`}
                      initial={false}
                      animate={{ opacity: 1, scale: 1, rotate: fanAngle }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      style={{ transformOrigin: 'bottom center' }}
                    >
                      {card.isHidden ? (
                        <div
                          className="rounded"
                          style={{
                            width: p.isHero ? HERO_CARD_W : OPP_CARD_W,
                            height: p.isHero ? HERO_CARD_H : OPP_CARD_H,
                            background: 'linear-gradient(135deg, #2d1b69, #1a0f2e)',
                            border: '1px solid rgba(139,92,246,0.4)',
                          }}
                        />
                      ) : (
                        <div
                          onClick={p.isHero && isDrawPhase ? () => onCardClick(ci) : undefined}
                          style={{
                            cursor: p.isHero && isDrawPhase ? 'pointer' : 'default',
                            transform: p.isHero && selectedCardIndices.includes(ci)
                              ? 'translateY(-14px) scale(1.06)'
                              : 'none',
                            transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            boxShadow: p.isHero && selectedCardIndices.includes(ci)
                              ? '0 0 16px rgba(255,215,0,0.9), 0 0 32px rgba(255,180,0,0.5), 0 -4px 12px rgba(255,220,100,0.4)'
                              : 'none',
                            borderRadius: '6px',
                          }}
                        >
                          <PlayingCard
                            card={card}
                            className={p.isHero ? '!w-[56px] !h-[78px]' : '!w-[20px] !h-[30px]'}
                          />
                        </div>
                      )}
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              {p.drewCount !== null && (state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && !p.folded && (
                <div className="text-purple-300 text-[10px] font-mono mt-1">
                  {p.drewCount === 0 ? 'KEPT CARDS' : `DREW ${p.drewCount}`}
                </div>
              )}
            </div>
          );
        })}

        {/* Two-winner celebration with clear separation (Detroit 2026-10-15) */}
        <AnimatePresence>
          {state.celebration.active && (
            <motion.div
              className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ background: 'radial-gradient(ellipse at center, rgba(240,184,41,0.15) 0%, transparent 70%)' }}
            >
              {coins.map((coin, i) => (
                <motion.div
                  key={`coin-${i}`}
                  className="absolute rounded-full"
                  style={{
                    width: 10, height: 10,
                    background: 'radial-gradient(circle at 30% 30%, #FDE68A, #F59E0B)',
                    boxShadow: '0 0 8px rgba(245,158,11,0.8)',
                    left: '50%', top: '45%',
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: Math.cos(coin.angle) * coin.dist,
                    y: Math.sin(coin.angle) * coin.dist - 40,
                    opacity: 0, scale: 0.4,
                  }}
                  transition={{ duration: coin.duration, ease: 'easeOut', delay: coin.delay }}
                />
              ))}
              <motion.div
                initial={{ scale: 0.5, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.2, 1.4, 0.4, 1] }}
                className="text-center max-h-full overflow-y-auto px-4"
              >
                <div
                  className="font-black tracking-wider"
                  style={{
                    fontSize: 'clamp(40px, 10vw, 72px)',
                    color: '#FDE68A',
                    textShadow: '0 0 40px rgba(245,158,11,0.8), 0 4px 0 #92400E, 0 8px 24px rgba(0,0,0,0.6)',
                    WebkitTextStroke: '2px #92400E',
                  }}
                >
                  WINNER
                </div>

                {state.celebration.soleWinner && (
                  <WinnerBlock winner={state.celebration.soleWinner} />
                )}

                {state.celebration.highWinner && (
                  <div className="mt-6">
                    <div className="text-blue-300 text-sm font-mono font-bold tracking-widest mb-2">
                      ★ HIGH WINNER ★
                    </div>
                    <WinnerBlock winner={state.celebration.highWinner} />
                  </div>
                )}
                {state.celebration.highWinner && state.celebration.lowWinner && (
                  <div className="my-6 flex items-center gap-3 px-8">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-amber-400/50" />
                    <span className="text-amber-300/70 text-xs font-mono">SPLIT POT</span>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent via-amber-400/50 to-amber-400/50" />
                  </div>
                )}
                {state.celebration.lowWinner && (
                  <div className="mt-2">
                    <div className="text-green-300 text-sm font-mono font-bold tracking-widest mb-2">
                      ★ LOW WINNER ★
                    </div>
                    <WinnerBlock winner={state.celebration.lowWinner} />
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pb-6 text-center text-white/40 text-xs font-mono">
        {state.phase === 'ante' && 'Ante up — $25 each…'}
        {state.phase === 'dealing' && 'Dealing hands… then community cards…'}
        {(state.phase === 'bet1' || state.phase === 'bet2' || state.phase === 'bet3') && 'Chips flying to the pot…'}
        {(state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && 'Discards to the muck — fresh cards from the dealer'}
        {state.phase === 'declare' && 'Declare HIGH, LOW, or SWING…'}
        {state.phase === 'showdown' && !state.rake.active && !state.celebration.active && 'Showdown — high vs low'}
        {state.phase === 'showdown' && state.rake.active && 'Raking it in…'}
        {state.phase === 'showdown' && state.celebration.active && 'Takes it down!'}
      </div>
    </div>
  );
}

function WinnerBlock({ winner }: { winner: WinnerInfo }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="flex flex-col items-center"
    >
      <div>
        <span className="text-white text-xl font-bold font-mono">{winner.name}</span>
        <span className="text-amber-300 text-xl font-mono ml-3">+${winner.amount.toLocaleString()}</span>
      </div>
      {winner.side !== 'SOLE' && (
        <div className={`text-xs font-mono tracking-widest mt-1 ${
          winner.side === 'HIGH' ? 'text-blue-300' :
          winner.side === 'LOW' ? 'text-green-300' :
          'text-purple-300'
        }`}>
          {winner.side === 'SWING' ? 'SWING — TAKES BOTH' : `${winner.side} HAND`}
        </div>
      )}
      {winner.cards.length > 0 && (
        <div className="mt-3 flex gap-1.5">
          {winner.cards.map((card, i) => (
            <div
              key={`wincard-${winner.side}-${i}`}
              style={{
                boxShadow: '0 0 20px rgba(253,230,138,0.6), 0 8px 24px rgba(0,0,0,0.5)',
                borderRadius: '6px',
                border: '2px solid rgba(253,230,138,0.8)',
              }}
            >
              <PlayingCard
                card={{ rank: card.rank as any, suit: card.suit as any, isHidden: false }}
                className="!w-[44px] !h-[62px]"
              />
            </div>
          ))}
        </div>
      )}
      {winner.handLabel && (
        <div className="mt-2 text-amber-200 text-sm font-mono tracking-widest">
          {winner.handLabel}
        </div>
      )}
    </motion.div>
  );
}
