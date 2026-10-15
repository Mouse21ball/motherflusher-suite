/**
 * FlushedUpTable — VERBATIM Badugi-style presentation with live server state (Detroit 2026-10-15).
 *
 * Rebuilt on BadugiTable's structure (option A — full rebuild).
 * Same flight engine, same staging, same premium touches — driven by live GameState.
 * 5 cards per hand (20 deal flights), Flushed Up evaluation, community cards near pot.
 * Single animation/sound system — no duplicates (no usePhaseSounds, no useCardAnimations).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PlayingCard } from '@/components/game/Card';
import { sfx } from '@/lib/sounds';
import { getSelectedBackground } from '@/lib/tableBackgrounds';
import type { CardType, Rank, Suit } from '@shared/gameTypes';
import type { GameState } from '@/lib/poker/types';
import type { Player } from '@shared/gameTypes';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { evaluateFlushedUpHand } from '@shared/modes/flushedUp';

// ── Types ────────────────────────────────────────────────────────────────────

type ProtoPhase =
  | 'ante'
  | 'dealing'
  | 'draw1' | 'bet1'
  | 'draw2' | 'bet2'
  | 'draw3' | 'bet3'
  | 'bet4'
  | 'showdown'
  | 'settling';

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
  toHero: boolean; // size the flying card for its destination
}

interface RakeState {
  active: boolean;
  winnerIndex: number;
  amount: number;
}

interface CelebrationState {
  active: boolean;
  winnerName: string;
  amount: number;
  // Winning hand shown WITH the celebration (Detroit 2026-10-15)
  cards: { rank: string; suit: string }[];
  handLabel: string;
}

interface ProtoState {
  phase: ProtoPhase;
  players: ProtoPlayer[];
  pot: number;
  dealerSeat: number;
  activeSeat: number;
  handNumber: number;
  flights: Flight[];
  rake: RakeState;
  celebration: CelebrationState;
  communityCards: CardType[];
}

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Key table positions (percentages) — same as Badugi
const DEALER_POS = { x: 50, y: 4 };
const POT_POS = { x: 50, y: 52 };
const MUCK_POS = { x: 63, y: 44 };
// Community cards sit above the pot (Flushed Up only — Badugi doesn't have these)
const COMMUNITY_POS = { x: 50, y: 38 };

// Flushed Up card sizes — hero bigger (5 cards need to fit)
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
  if (livePhase === 'BET_4') return 'bet4';
  if (livePhase === 'SHOWDOWN') return 'showdown';
  return 'ante';
}

function useLiveProtoState(liveState: GameState, myId: string): ProtoState {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [rake, setRake] = useState<RakeState>({ active: false, winnerIndex: -1, amount: 0 });
  const [celebration, setCelebration] = useState<CelebrationState>({ active: false, winnerName: "", amount: 0, cards: [], handLabel: "" });
  // Staging: how many cards have visually landed per player this hand.
  // Cards from liveState are held back and revealed as deal flights land (prototype behavior).
  const [landed, setLanded] = useState<Record<string, number>>({});
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

  // Drive flights from live state diffs (prototype timing, verbatim)
  useEffect(() => {
    if (reduced) return;
    const prev = prevRef.current;
    const curr = {
      handId: liveState.handId,
      phase: liveState.phase,
      bets: Object.fromEntries(liveState.players.map(p => [p.id, p.bet])),
      // Key draws by phase+count so same-count draws in different rounds still animate
      draws: Object.fromEntries(liveState.players.map(p => [p.id, `${liveState.phase}:${(p as any).lastDrawCount ?? 'x'}`])),
    };

    if (prev) {
      // NEW HAND → 20-card deal (5 cards × 4 players, prototype: 160ms apart, 0.32s flight each).
      // Cards are staged: they only appear in the hand when their flight lands.
      const isNewHand = prev.handId !== undefined && curr.handId !== undefined && prev.handId !== curr.handId;
      if (isNewHand) {
        const me = liveState.players.find(p => p.id === myId);
        const others = liveState.players.filter(p => p.id !== myId);
        const ordered = me ? [me, ...others] : others;
        // Reset staging: no cards visible until flights land
        const reset: Record<string, number> = {};
        for (const p of ordered) reset[p.id] = 0;
        setLanded(reset);
        // 20 cards, one every 160ms, seat order 0→1→2→3 repeating
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
            // Card lands in hand when flight completes (prototype: 320ms)
            later(320, () => {
              removeFlight(fid);
              setLanded(prevLanded => ({
                ...prevLanded,
                [player.id]: Math.min((prevLanded[player.id] ?? 0) + 1, 5),
              }));
            });
          });
        }
      }

      // BETS → chips fly (prototype: 0.45s duration)
      for (const p of liveState.players) {
        const betInc = (curr.bets[p.id] ?? 0) - (prev.bets[p.id] ?? 0);
        if (betInc > 0 && curr.phase.startsWith('BET')) {
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

      // DRAWS → discards to muck, replacements from dealer (prototype timing)
      // Keyed by phase+count so repeat same-count draws in later rounds still fire.
      for (const p of liveState.players) {
        const prevD = prev.draws[p.id];
        const currD = curr.draws[p.id];
        const currCount = parseInt(currD.split(':')[1] || '0', 10);
        if (currD !== prevD && !isNaN(currCount) && currCount > 0) {
          const isHero = p.id === myId;
          const seatIdx = isHero ? 0 : liveState.players.filter(x => x.id !== myId).findIndex(x => x.id === p.id) + 1;
          const pos = seatPosition(Math.max(0, seatIdx));
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
              later(d * 120 + 320, () => removeFlight(dfid));
            }
          });
        }
      }

      // SHOWDOWN → rake, celebration with winning hand (prototype: 2500ms, 3700ms, 9200ms)
      if (curr.phase === 'SHOWDOWN' && prev.phase !== 'SHOWDOWN') {
        const winner = liveState.players.find(p => (p as any).isWinner);
        if (winner) {
          const isHero = winner.id === myId;
          const seatIdx = isHero ? 0 : liveState.players.filter(x => x.id !== myId).findIndex(x => x.id === winner.id) + 1;
          // Evaluate the winning hand for display (Flushed Up)
          let handLabel = '';
          let winCards: { rank: string; suit: string }[] = [];
          try {
            const cards = (winner.cards ?? []).map(c => ({ ...c, isHidden: false }));
            winCards = cards.map(c => ({ rank: c.rank, suit: c.suit }));
            handLabel = evaluateFlushedUpHand(cards as Parameters<typeof evaluateFlushedUpHand>[0])?.description ?? '';
          } catch { /* evaluation failed, show cards without label */ }
          later(2500, () => {
            setRake({ active: true, winnerIndex: Math.max(0, seatIdx), amount: liveState.pot });
            sfx.chipRake();
          });
          later(3700, () => {
            setRake({ active: false, winnerIndex: -1, amount: 0 });
            setCelebration({ active: true, winnerName: winner.name, amount: liveState.pot, cards: winCards, handLabel });
            sfx.bigWin();
          });
          later(9200, () => {
            setCelebration({ active: false, winnerName: "", amount: 0, cards: [], handLabel: "" });
          });
        }
      }
    }
    prevRef.current = curr;
  }, [liveState, myId, reduced, later, addFlight, removeFlight]);

  // Map live players to proto shape (hero first)
  const me = liveState.players.find(p => p.id === myId);
  const others = liveState.players.filter(p => p.id !== myId).slice(0, 3);
  const ordered = me ? [me, ...others] : others;

  const players: ProtoPlayer[] = ordered.map((p, i) => ({
    id: p.id,
    name: p.name,
    chips: p.chips,
    bet: p.bet,
    // Staging: only show cards that have landed from deal flights.
    // Falls back to all cards if staging didn't run (e.g. reconnect mid-hand).
    cards: p.cards.slice(0, landed[p.id] ?? p.cards.length).map(c => ({ ...c, isHidden: i === 0 ? c.isHidden : true })),
    isHero: i === 0,
    folded: p.status === 'folded',
    drewCount: (p as any).lastDrawCount ?? null,
    isWinner: !!(p as any).isWinner,
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
    handNumber: liveState.handId ?? 1,
    flights,
    rake,
    celebration,
    communityCards: (liveState.communityCards ?? []).map(c => ({ ...c, isHidden: false })),
  };
}

// ── Seat positioning ─────────────────────────────────────────────────────────
// Same as Badugi: opponents hug the top in a shallow arc, hero at bottom,
// pot gets clear center space.

function seatPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 50, y: 88 }; // hero
  // 3 opponents spread across the top
  const spots = [
    { x: 14, y: 28 },
    { x: 50, y: 14 },
    { x: 86, y: 28 },
  ];
  return spots[(index - 1) % spots.length];
}

// ── Flight rendering ─────────────────────────────────────────────────────────

function PotStack({ amount }: { amount: number }) {
  // Tier thresholds → chip count. Cap at 14 chips + glow.
  const chips = amount <= 0 ? 0
    : amount < 500 ? 3
    : amount < 2000 ? 6
    : amount < 10000 ? 10
    : 14;
  const isMax = amount >= 10000;

  if (chips === 0) return null;

  return (
    <div className="relative flex items-end justify-center my-2" style={{ height: 44 }}>
      {Array.from({ length: chips }).map((_, i) => {
        const layer = Math.floor(i / 4);
        const posInLayer = i % 4;
        const xOff = (posInLayer - 1.5) * 10 + (layer % 2 === 0 ? 3 : -3);
        const yOff = -layer * 9;
        const colors = ['#F59E0B', '#FBBF24', '#D97706', '#FCD34D'];
        return (
          <motion.div
            key={`potchip-${i}`}
            initial={{ scale: 0, y: -20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22, delay: i * 0.03 }}
            className="absolute rounded-full"
            style={{
              width: 30,
              height: 30,
              left: `calc(50% - 15px + ${xOff}px)`,
              bottom: `${6 + yOff * -1}px`,
              background: `radial-gradient(circle at 35% 30%, ${colors[i % 4]}, #92400E)`,
              border: '2px dashed rgba(255,255,255,0.5)',
              boxShadow: isMax
                ? '0 0 16px rgba(245,158,11,0.9), 0 3px 6px rgba(0,0,0,0.5)'
                : '0 3px 6px rgba(0,0,0,0.5)',
              zIndex: i,
            }}
          />
        );
      })}
      {isMax && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.35) 0%, transparent 70%)' }}
        />
      )}
    </div>
  );
}

function FlightView({ flight }: { flight: Flight }) {
  const isCard = flight.kind !== 'chip';
  const liftTime = isCard ? 0.18 : 0; // cards lift before flying (UNO two-beat)
  return (
    <motion.div
      className="absolute z-30 pointer-events-none"
      style={{
        left: `${flight.fromX}%`,
        top: `${flight.fromY}%`,
        transformStyle: 'preserve-3d',
      }}
      initial={{ x: '-50%', y: '-50%', opacity: 1, scale: 1, rotateY: isCard ? -70 : 0, rotateX: isCard ? 12 : 0 }}
      animate={{
        left: `${flight.toX}%`,
        top: `${flight.toY}%`,
        opacity: 1,
        scale: isCard ? [1, 1.35, 1] : 0.85,
        y: isCard ? ['-50%', '-80%', '-50%'] : '-50%',
        rotateY: 0,
        rotateX: 0,
      }}
      transition={{
        duration: flight.duration + liftTime,
        ease: [0.3, 0.7, 0.4, 1],
        times: isCard ? [0, liftTime / (flight.duration + liftTime), 1] : undefined,
      }}
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
            width: flight.toHero ? 44 : 20,
            height: flight.toHero ? 62 : 30,
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

export interface FlushedUpTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  // NOTE: animState removed (Detroit 2026-10-15) — flight system owns all animations.
  // No usePhaseSounds, no useCardAnimations. Single system, no duplicates.
}

export function FlushedUpTable({ state: liveState, myId, selectedCardIndices, onCardClick, isDrawPhase }: FlushedUpTableProps) {
  const reduced = useReducedMotion();
  const state = useLiveProtoState(liveState, myId);
  // Detroit 2026-10-15: use the selected table background (Yard at Dusk default)
  const bg = getSelectedBackground();

  return (
    <div className="h-full flex flex-col relative" style={{
      backgroundImage: `url(${bg.url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      {/* Dark overlay for card/UI readability over the background image */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(10,6,24,0.55)' }} />
      {/* Table — fixed camera (UNO keeps it still, cards do the dancing) */}
      <div
        className="flex-1 relative"
        style={{
          perspective: '1200px',
        }}
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

        {/* Community cards — Flushed Up shared cards, above the pot */}
        {state.communityCards.length > 0 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5"
            style={{ left: `${COMMUNITY_POS.x}%`, top: `${COMMUNITY_POS.y}%` }}
          >
            <AnimatePresence>
              {state.communityCards.map((card, i) => (
                <motion.div
                  key={`comm-${i}-${card.rank}-${card.suit}`}
                  initial={{ opacity: 0, y: -22, rotateY: 90, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.32, ease: 'easeOut', delay: i * 0.15 }}
                  style={{ transformOrigin: 'top center' }}
                >
                  <PlayingCard card={card} className="!w-[44px] !h-[62px]" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        {state.communityCards.length > 0 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-center text-purple-300/60 text-[10px] font-mono tracking-widest"
            style={{ left: `${COMMUNITY_POS.x}%`, top: `calc(${COMMUNITY_POS.y}% + 42px)` }}
          >
            COMMUNITY
          </div>
        )}

        {/* Center staging — pot as the centerpiece */}
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
                backdropFilter: 'blur(8px)',
                transform: 'rotateX(8deg)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              }}
            >
              <div className="text-amber-300/70 text-[10px] font-mono tracking-widest">POT</div>
              <PotStack amount={state.pot} />
              <div className="text-amber-200 text-2xl font-bold font-mono mt-1">${state.pot.toLocaleString()}</div>
            </motion.div>
          </AnimatePresence>
          {/* Muck pile — face-down discards stack here */}
          {(state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && (
            <div className="mt-1 text-white/30 text-[10px] font-mono">🂠 muck</div>
          )}
        </div>

        {/* Flights: cards and chips moving across the table */}
        {state.flights.map(f => <FlightView key={f.id} flight={f} />)}

        {/* Rake-in: the visual pot stack collapses and flies to the winner */}
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
                    left: '50%', top: '52%',
                    width: 26, height: 26,
                    background: 'radial-gradient(circle at 35% 30%, #FBBF24, #92400E)',
                    border: '2px dashed rgba(255,255,255,0.5)',
                    boxShadow: '0 0 12px rgba(245,158,11,0.6)',
                  }}
                  initial={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
                  animate={{
                    x: `calc(-50% + ${(wpos.x - 50) * 3.5 + (i - flyCount / 2) * 8}px)`,
                    y: `calc(-50% + ${(wpos.y - 52) * 3.5 + (i % 3) * 6}px)`,
                    scale: 0.6,
                    opacity: 0.9,
                  }}
                  transition={{ duration: 0.9, ease: [0.3, 0.7, 0.4, 1], delay: i * 0.06 }}
                />
              ))}
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
            </>
          );
        })()}

        {/* Seats — 5-card hands */}
        {state.players.map((p, i) => {
          const pos = seatPosition(i);
          const isActive = i === state.activeSeat && (state.phase.startsWith('bet') || state.phase.startsWith('draw'));
          const isDealer = i === state.dealerSeat;
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {/* Active turn — premium layered glow */}
              {isActive && (
                <>
                  <motion.div
                    className="absolute -inset-4 rounded-2xl pointer-events-none"
                    style={{
                      background: 'radial-gradient(ellipse at center, rgba(240,184,41,0.25) 0%, transparent 70%)',
                      filter: 'blur(8px)',
                    }}
                    animate={{ opacity: [0.5, 1, 0.5], scale: [0.95, 1.05, 0.95] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className="absolute -inset-2 rounded-xl pointer-events-none"
                    style={{
                      border: '1.5px solid transparent',
                      background: 'linear-gradient(135deg, rgba(240,184,41,0.8), rgba(240,184,41,0.1), rgba(255,220,100,0.8)) border-box',
                      WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
                      WebkitMaskComposite: 'xor',
                      maskComposite: 'exclude',
                    }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </>
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
              {/* Cards — 5-card hands, opponents tiny tight fan, hero big */}
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
                      transition={{
                        duration: state.phase === 'showdown' ? 0.15 : 0.2,
                        ease: 'easeOut',
                      }}
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
                            className={p.isHero ? `!w-[${HERO_CARD_W}px] !h-[${HERO_CARD_H}px]` : `!w-[${OPP_CARD_W}px] !h-[${OPP_CARD_H}px]`}
                          />
                        </div>
                      )}
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              {/* Draw badge */}
              {p.drewCount !== null && (state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && !p.folded && (
                <div className="text-purple-300 text-[10px] font-mono mt-1">
                  {p.drewCount === 0 ? 'KEPT CARDS' : `DREW ${p.drewCount}`}
                </div>
              )}
            </div>
          );
        })}

        {/* Win celebration — full-screen moment with winning hand */}
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
              {/* Coin fountain particles */}
              {Array.from({ length: 24 }).map((_, i) => {
                const angle = (i / 24) * Math.PI * 2;
                const dist = 120 + Math.random() * 80;
                return (
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
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist - 40,
                      opacity: 0,
                      scale: 0.4,
                    }}
                    transition={{ duration: 1.2 + Math.random() * 0.6, ease: 'easeOut', delay: Math.random() * 0.3 }}
                  />
                );
              })}
              <motion.div
                initial={{ scale: 0.5, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.2, 1.4, 0.4, 1] }}
                className="text-center"
              >
                <div
                  className="font-black tracking-wider"
                  style={{
                    fontSize: 'clamp(48px, 12vw, 96px)',
                    color: '#FDE68A',
                    textShadow: '0 0 40px rgba(245,158,11,0.8), 0 4px 0 #92400E, 0 8px 24px rgba(0,0,0,0.6)',
                    WebkitTextStroke: '2px #92400E',
                  }}
                >
                  WINNER
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="mt-2"
                >
                  <span className="text-white text-2xl font-bold font-mono">{state.celebration.winnerName}</span>
                  <span className="text-amber-300 text-2xl font-mono ml-3">+${state.celebration.amount.toLocaleString()}</span>
                </motion.div>
                {/* Winning hand — 5 cards */}
                {state.celebration.cards.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 16, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.45, duration: 0.35, ease: 'easeOut' }}
                    className="mt-4 flex flex-col items-center"
                  >
                    <div className="flex gap-2">
                      {state.celebration.cards.map((card, i) => (
                        <div
                          key={`wincard-${i}`}
                          className="rounded-md bg-white flex flex-col items-center justify-center"
                          style={{
                            width: 52, height: 72,
                            boxShadow: '0 0 20px rgba(253,230,138,0.6), 0 8px 24px rgba(0,0,0,0.5)',
                            border: '2px solid rgba(253,230,138,0.8)',
                          }}
                        >
                          <span className="text-base font-black" style={{ color: (card.suit === 'hearts' || card.suit === 'diamonds') ? '#DC2626' : '#111' }}>
                            {card.rank}
                          </span>
                          <span className="text-xl" style={{ color: (card.suit === 'hearts' || card.suit === 'diamonds') ? '#DC2626' : '#111' }}>
                            {card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {state.celebration.handLabel && (
                      <div className="mt-2 text-amber-200 text-sm font-mono tracking-widest">
                        {state.celebration.handLabel}
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Phase hint */}
      <div className="pb-6 text-center text-white/40 text-xs font-mono">
        {state.phase === 'ante' && 'Ante up — $25 each…'}
        {state.phase === 'dealing' && 'Dealing from the dealer…'}
        {(state.phase === 'bet1' || state.phase === 'bet2' || state.phase === 'bet3' || state.phase === 'bet4') && 'Chips flying to the pot…'}
        {(state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && 'Discards to the muck — fresh cards from the dealer'}
        {state.phase === 'showdown' && !state.rake.active && !state.celebration.active && 'Showdown — fast reveal'}
        {state.phase === 'showdown' && state.rake.active && 'Raking it in…'}
        {state.phase === 'showdown' && state.celebration.active && `${state.celebration.winnerName} takes it down!`}
      </div>
    </div>
  );
}
