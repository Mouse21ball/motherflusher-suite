/**
 * BadugiTable — VERBATIM prototype presentation with live server state (Detroit 2026-10-15).
 *
 * Ripped from the UNO prototype (client/src/proto/unoBadugi.tsx).
 * Same layout, same flights, same sounds, same timing — driven by live GameState.
 * The prototype's scripted game driver is GONE. No fake players, no timers, no script.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PlayingCard } from '@/components/game/Card';
import { sfx } from '@/lib/sounds';
import { getSelectedBackground } from '@/lib/tableBackgrounds';
import { AvatarWithFrame } from '@/components/ui/AvatarWithFrame';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { getAvatarInitials } from '@/lib/persistence';
import type { CardType } from '@shared/gameTypes';
import type { GameState } from '@/lib/poker/types';
import { evaluateBadugi } from '@shared/modes/badugi';

// ── Types ────────────────────────────────────────────────────────────────────

type ProtoPhase =
  | 'ante'
  | 'dealing'
  | 'draw1' | 'bet1'
  | 'draw2' | 'bet2'
  | 'draw3' | 'bet3'
  | 'bet4'
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
}

const DEALER_POS = { x: 50, y: 4 };
const POT_POS = { x: 50, y: 42 }; // Detroit 2026-10-19: center of shorter oval
const MUCK_POS = { x: 63, y: 36 };

// ── Seat positioning ─────────────────────────────────────────────────────────
// Detroit 2026-10-19: 5-seat asymmetric layout (1 hero + 4 opponents).
// Geometry validated via mockups at 360×740, 375×667, 393×852.
// - Opponents pulled inward (22%/78%) to prevent edge clipping
// - Cards tuck below avatars, facing table center
// - Slim at lower-right, clear of hero cards
// - Hero has no avatar circle (matches concept)

function seatPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 50, y: 78 }; // hero — below oval, above action bar
  // Detroit 2026-10-19: 4 opponents ring the oval edge.
  // Oval spans y 8-68%; pot at (50, 42). Seats sit on the rail.
  const spots = [
    { x: 50, y: 14 }, // Opp 1: top-center (dealer) — top rail
    { x: 16, y: 34 }, // Opp 2: mid-left — left rail
    { x: 84, y: 34 }, // Opp 3: mid-right — right rail
    { x: 84, y: 54 }, // Opp 4: lower-right — right rail, clear of pot
  ];
  return spots[(index - 1) % spots.length];
}

// ── Live state driver ────────────────────────────────────────────────────────
// Maps live GameState to prototype visual state. Drives flights from real
// state diffs using the prototype's EXACT timing. No script, no fake data.

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
  if (livePhase === 'DECLARE') return 'declare'; // Detroit 2026-10-16: was missing — players blind during declare.
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
      // NEW HAND → 16-card deal (prototype: 160ms apart, 0.32s flight each).
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
        // 16 cards, one every 160ms, seat order 0→1→2→3 repeating
        for (let i = 0; i < 16; i++) {
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
                [player.id]: Math.min((prevLanded[player.id] ?? 0) + 1, 4),
              }));
            });
          });
        }
      }

      // BETS + ANTES → chips fly (prototype: 0.45s duration)
      // Detroit 2026-10-15: antes now fly too — they were popping into the pot silently.
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
          // Detroit 2026-10-15: stage replacement cards — hide the drawn slots
          // until their flights land (was showing new cards instantly).
          const keptCount = 4 - currCount;
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
              // Replacement card lands in hand when its flight completes
              later(d * 120 + 320, () => {
                removeFlight(dfid);
                setLanded(prevLanded => ({
                  ...prevLanded,
                  [p.id]: Math.min((prevLanded[p.id] ?? keptCount) + 1, 4),
                }));
              });
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
          // Evaluate the winning hand for display
          let handLabel = '';
          let winCards: { rank: string; suit: string }[] = [];
          try {
            const cards = (winner.cards ?? []).map(c => ({ ...c, isHidden: false }));
            winCards = cards.map(c => ({ rank: c.rank, suit: c.suit }));
            handLabel = evaluateBadugi(cards as Parameters<typeof evaluateBadugi>[0])?.description ?? '';
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
  // Detroit 2026-10-19: support 5 seats (hero + 4 opponents), was hard-coded to 3
  const me = liveState.players.find(p => p.id === myId);
  const others = liveState.players.filter(p => p.id !== myId).slice(0, 4);
  const ordered = me ? [me, ...others] : others;

  const players: ProtoPlayer[] = ordered.map((p, i) => ({
    id: p.id,
    name: p.name,
    chips: p.chips,
    bet: p.bet,
    // Staging: only show cards that have landed from deal flights.
    // Falls back to all cards if staging didn't run (e.g. reconnect mid-hand).
    // Detroit 2026-10-15: opponents reveal at showdown if they didn't fold.
    // Detroit 2026-10-16: folded hero hides too (was showing face-up).
    cards: p.cards.slice(0, landed[p.id] ?? p.cards.length).map(c => ({
      ...c,
      isHidden: p.status === 'folded' ? true : (i === 0 ? c.isHidden : (mapPhase(liveState.phase) === 'showdown' ? false : true)),
    })),
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
  };
}

// ── Flight rendering ─────────────────────────────────────────────────────────

// ── Flight rendering ─────────────────────────────────────────────────────────

/**
 * PotStack — visual chip pile that grows in tiers with the pot amount.
 * Like a meter: each tier adds chips. Capped so ridiculous amounts don't
 * render a mountain (Detroit 2026-10-13).
 */
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
        // Stack chips in a pyramid-ish pile with slight random-ish offsets
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
        // Lift beat: card pops up and enlarges first, then flies and straightens
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

export interface BadugiTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  heroAvatarSrc?: string | null;
  heroFrameSrc?: string | null;
}

export function BadugiTable({ state: liveState, myId, selectedCardIndices, onCardClick, isDrawPhase, heroAvatarSrc, heroFrameSrc }: BadugiTableProps) {
  const reduced = useReducedMotion();
  // Map live GameState to prototype visual state, drive flights from diffs
  const state = useLiveProtoState(liveState, myId);
  // Detroit 2026-10-15: coin fountain values computed once per celebration —
  // Math.random() during render teleported coins on every re-render.
  const coins = useMemo(() => Array.from({ length: 24 }).map((_, i) => ({
    angle: (i / 24) * Math.PI * 2,
    dist: 120 + Math.random() * 80,
    duration: 1.2 + Math.random() * 0.6,
    delay: Math.random() * 0.3,
  })), [state.celebration.active]);
  // Detroit 2026-10-15: use the selected table background (Yard at Dusk default)
  const bg = getSelectedBackground();

  return (
    <div className="h-full flex flex-col relative" style={{
      backgroundImage: `url(${bg.url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      {/* Detroit 2026-10-16: dark overlay removed for uniformity with Box Chevy */}
      {/* Table — fixed camera (UNO keeps it still, cards do the dancing) — fills parent <main> */}
      <div
        className="flex-1 relative"
        style={{
          perspective: '1200px', // UNO-style 3D depth (Detroit 2026-10-13)
        }}
      >
        {/* Detroit 2026-10-19: wide purple-and-gold oval table — anchors all seats.
            Wide and short: opponents ring the edge, pot at center, hero below.
            v2: widened (2% margins), shortened (bottom 32%) per review. */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '2%', right: '2%', top: '8%', bottom: '32%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at 50% 35%, #4c2a8a 0%, #3b1f6e 45%, #2a154f 100%)',
            border: '6px solid transparent',
            backgroundClip: 'padding-box',
            boxShadow: '0 0 0 6px rgba(201,162,39,0.85), 0 0 40px rgba(201,162,39,0.25), inset 0 0 60px rgba(0,0,0,0.5)',
          }}
        />
        {/* Inner gold trim line */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '5%', right: '5%', top: '11.5%', bottom: '35.5%',
            borderRadius: '50%',
            border: '2px solid rgba(201,162,39,0.35)',
          }}
        />

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
        <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <AnimatePresence>
            <motion.div
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <div className="text-amber-300/70 text-[10px] font-mono tracking-widest">POT</div>
              {/* Visual chip stack — grows in tiers with the pot, capped (Detroit 2026-10-13) */}
              <PotStack amount={state.pot} />
              <div className="text-amber-200 text-2xl font-bold font-mono mt-1" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>${state.pot.toLocaleString()}</div>
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
          // Chip count scales with pot, capped at 8 flying chips (Detroit 2026-10-13)
          const amt = state.rake.amount;
          const flyCount = amt < 500 ? 3 : amt < 2000 ? 5 : amt < 10000 ? 7 : 8;
          // Detroit 2026-10-15: fly to percentage targets directly — the old
          // px-per-percent calc (* 3.5) mis-targeted on non-~350px screens.
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
                    scale: 0.6,
                    opacity: 0.9,
                  }}
                  transition={{ duration: 0.9, ease: [0.3, 0.7, 0.4, 1], delay: i * 0.06 }}
                />
              ))}
              <motion.div
                className="absolute z-20 flex flex-col items-center pointer-events-none"
                initial={{ left: '50%', top: '52%', x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
                animate={{
                  left: `${wpos.x}%`, top: `${wpos.y}%`,
                  x: '-50%', y: '-50%',
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

        {/* Seats */}
        {state.players.map((p, i) => {
          const pos = seatPosition(i);
          const isActive = i === state.activeSeat && (state.phase.startsWith('bet') || state.phase.startsWith('draw') || state.phase === 'declare');
          const isDealer = i === state.dealerSeat;
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: p.folded ? 0.55 : 1 }}
            >
              {/* Active turn — premium layered glow (not just a border) */}
              {isActive && (
                <>
                  {/* Soft breathing glow behind */}
                  <motion.div
                    className="absolute -inset-4 rounded-2xl pointer-events-none"
                    style={{
                      background: 'radial-gradient(ellipse at center, rgba(240,184,41,0.25) 0%, transparent 70%)',
                      filter: 'blur(8px)',
                    }}
                    animate={{ opacity: [0.5, 1, 0.5], scale: [0.95, 1.05, 0.95] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  {/* Thin animated gradient ring */}
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
              <div className="flex items-center gap-1.5" style={{ maxWidth: p.isHero ? 'none' : '110px' }}>
                {/* Detroit 2026-10-16: avatar with cosmetic border */}
                <AvatarWithFrame
                  avatarSrc={p.isHero ? (heroAvatarSrc || getAvatarForSeat(0)) : ((p as any).avatarUrl || getAvatarForSeat(i + 1))}
                  frameSrc={p.isHero ? heroFrameSrc : null}
                  initials={getAvatarInitials(p.name)}
                  initialsColor="#FDE68A"
                  size={p.isHero ? 52 : 40} // Detroit 2026-10-19: slightly smaller for 5-seat fit
                />
                {isDealer && <span className="text-amber-300 text-[10px] font-mono shrink-0">D</span>}
                {/* Detroit 2026-10-19: constrained label — ellipsis, chip count always visible below */}
                <span
                  className={`text-xs font-mono ${p.isHero ? 'text-amber-200 font-bold' : 'text-white/80'} ${p.isHero ? '' : 'truncate'}`}
                  style={p.isHero ? undefined : { maxWidth: '64px' }}
                  title={p.name}
                >
                  {p.name}
                </span>
                {/* Detroit 2026-10-19: clear folded indicator — pill badge, cards stay hidden */}
                {p.folded && (
                  <span
                    className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{
                      color: '#fca5a5',
                      background: 'rgba(127,29,29,0.6)',
                      border: '1px solid rgba(248,113,113,0.5)',
                    }}
                  >
                    FOLD
                  </span>
                )}
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
              {/* Cards — UNO ratio: opponents tiny tight fan, hero big */}
              <div
                className="flex mt-1"
                style={!p.isHero
                  ? { transform: 'rotateX(18deg)', transformStyle: 'preserve-3d', gap: '-8px' }
                  : { gap: '2px' }
                }
              >
                <AnimatePresence>
                  {p.cards.map((card, ci) => {
                    // Fan rotation for opponents (UNO-style tight fan)
                    const fanAngle = !p.isHero && p.cards.length > 1
                      ? (ci - (p.cards.length - 1) / 2) * 10
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
                            width: p.isHero ? 56 : 20,
                            height: p.isHero ? 80 : 30,
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
                            // Neon glow when selected — premium discard highlight
                            boxShadow: p.isHero && selectedCardIndices.includes(ci)
                              ? '0 0 16px rgba(255,215,0,0.9), 0 0 32px rgba(255,180,0,0.5), 0 -4px 12px rgba(255,220,100,0.4)'
                              : 'none',
                            borderRadius: '6px',
                            // Detroit 2026-10-19: ensure selected cards don't clip
                            // 14px raise + 6% scale needs 20px clearance above
                            marginTop: p.isHero ? '20px' : '0',
                          }}
                        >
                          <PlayingCard
                            card={card}
                            className={p.isHero ? '!w-[56px] !h-[80px]' : '!w-[20px] !h-[30px]'}
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

        {/* Detroit 2026-10-19: showdown hand-reveal overlay — compact focused panel.
            v2: reduced footprint (top 12%, max 40% height), smaller cards (32×46)
            still readable. Folded players excluded — cards never revealed. */}
        {state.phase === 'showdown' && (
          <motion.div
            className="absolute inset-x-3 top-[12%] z-30 rounded-xl p-2"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{
              background: 'rgba(15,8,30,0.94)',
              border: '2px solid rgba(201,162,39,0.6)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 24px rgba(201,162,39,0.2)',
              backdropFilter: 'blur(8px)',
              maxHeight: '40%',
              overflowY: 'auto',
            }}
          >
            <div className="text-center text-amber-300 text-[11px] font-mono font-bold tracking-widest mb-1.5">
              SHOWDOWN — ${state.pot.toLocaleString()}
            </div>
            <div className="flex flex-col gap-1.5">
              {state.players.filter(p => !p.folded).map((p) => (
                <div
                  key={`reveal-${p.id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1"
                  style={{
                    background: p.isWinner ? 'rgba(201,162,39,0.15)' : 'rgba(255,255,255,0.04)',
                    border: p.isWinner ? '1px solid rgba(201,162,39,0.7)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="flex flex-col items-start shrink-0" style={{ minWidth: '58px', maxWidth: '68px' }}>
                    <span className="text-[10px] font-mono font-bold text-white/90 truncate w-full" title={p.name}>
                      {p.name}{p.isHero ? ' (YOU)' : ''}
                    </span>
                    {p.isWinner && (
                      <span className="text-[8px] font-mono font-bold text-amber-300">★ WINNER</span>
                    )}
                  </div>
                  <div className="flex gap-1 flex-1 justify-center">
                    {p.cards.filter(c => !c.isHidden).map((card, ci) => (
                      <PlayingCard key={ci} card={card} className="!w-[32px] !h-[46px]" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Win celebration — full-screen UNO-style moment */}
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
              {/* Coin fountain particles — values memoized so re-renders don't teleport coins */}
              {coins.map((coin, i) => {
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
                      x: Math.cos(coin.angle) * coin.dist,
                      y: Math.sin(coin.angle) * coin.dist - 40,
                      opacity: 0,
                      scale: 0.4,
                    }}
                    transition={{ duration: coin.duration, ease: 'easeOut', delay: coin.delay }}
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
                {/* Winning hand — shown with the celebration (Detroit 2026-10-15) */}
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
                            width: 56, height: 78,
                            boxShadow: '0 0 20px rgba(253,230,138,0.6), 0 8px 24px rgba(0,0,0,0.5)',
                            border: '2px solid rgba(253,230,138,0.8)',
                          }}
                        >
                          <span className="text-lg font-black" style={{ color: (card.suit === 'hearts' || card.suit === 'diamonds') ? '#DC2626' : '#111' }}>
                            {card.rank}
                          </span>
                          <span className="text-2xl" style={{ color: (card.suit === 'hearts' || card.suit === 'diamonds') ? '#DC2626' : '#111' }}>
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
        {state.phase === 'declare' && 'Declare — HIGH or LOW?'}
        {state.phase === 'showdown' && !state.rake.active && !state.celebration.active && 'Showdown — fast reveal'}
        {state.phase === 'showdown' && state.rake.active && 'Raking it in…'}
        {state.phase === 'showdown' && state.celebration.active && `${state.celebration.winnerName} takes it down!`}
      </div>
    </div>
  );
}
