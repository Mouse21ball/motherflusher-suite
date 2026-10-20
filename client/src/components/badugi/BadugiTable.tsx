/**
 * BadugiTable — VERBATIM prototype presentation with live server state (Detroit 2026-10-15).
 *
 * Ripped from the UNO prototype (client/src/proto/unoBadugi.tsx).
 * Same layout, same flights, same sounds, same timing — driven by live GameState.
 * The prototype's scripted game driver is GONE. No fake players, no timers, no script.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCelebrationMotion } from '../../lib/celebrationPreferences';
import { PlayingCard } from '@/components/game/Card';
import { sfx } from '@/lib/sounds';
import { getSelectedBackground } from '@/lib/tableBackgrounds';
import { AvatarWithFrame } from '@/components/ui/AvatarWithFrame';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { getAvatarInitials } from '@/lib/persistence';
import type { CardType } from '@shared/gameTypes';
import type { GameState } from '@/lib/poker/types';
import { evaluateBadugi } from '@shared/modes/badugi';
import { serverNowMs } from '@/lib/clockSync';

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
  /** Human seat with no live socket (server `connected` wire field). */
  disconnected: boolean;
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
  // Server-authoritative turn deadline (epoch ms) from GameState.turnDeadline.
  // Null when the server has no timer armed (bot turns, non-interactive phases).
  turnDeadline: number | null;
  // Display-only side-pot tiers from the server (null when a single pot).
  sidePots: { amount: number; eligiblePlayerIds: string[] }[] | null;
  handNumber: number;
  flights: Flight[];
  rake: RakeState;
  celebration: CelebrationState;
  showdownBeat: 'winner' | 'all' | null;
  setShowdownBeat: (beat: 'winner' | 'all' | null) => void;
  motionMode: 'full' | 'reduced' | 'off';
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
  if (index === 0) return { x: 50, y: 75.2 }; // hero — pulled up 0.8% (Detroit 2026-10-20 UI pass: tighter hero/instructions/controls stack; the full 1.5% was trimmed on collision-check evidence — at compact container heights it squeezed the taller two-line lower-right pod into the hero name row)
  // Detroit 2026-10-19: 4 opponents ring the oval edge.
  // Oval spans y 8-68%; pot at (50, 42). Seats sit on the rail.
  // Detroit 2026-10-20 UI pass: side seats pulled inward (16/80 ->
  // 18.5/81.5) so the ~118px pods AND their turn/winner glows stay
  // inside the Galaxy safe width at ~360px CSS — the mid-left pod
  // previously landed its panel edge at ~0px and clipped.
  const spots = [
    { x: 50, y: 14 }, // Opp 1: top-center (dealer) — top rail
    { x: 18.5, y: 34 }, // Opp 2: mid-left — left rail
    { x: 81.5, y: 34 }, // Opp 3: mid-right — right rail
    { x: 81.5, y: 54 }, // Opp 4: lower-right — nudged inward for safe area
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
  // Detroit 2026-10-19 Stage 3: two-beat winner-first reveal.
  // 'winner' = only the winner's hand revealed; 'all' = all non-folded hands.
  const [showdownBeat, setShowdownBeat] = useState<'winner' | 'all' | null>(null);
  // Guard against duplicate celebrations if the effect re-fires for the same hand.
  const celebrationHandId = useRef<number | undefined>(undefined);
  const motionMode = useCelebrationMotion();
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

      // Detroit 2026-10-19 Stage 3: two-beat winner-first reveal with complete
      // lifecycle (reveal → celebration → return). Beat 1 shows the winner's
      // hand first; Beat 2 reveals all non-folded hands (or via SHOW ALL HANDS).
      // Guarded by handId — re-fires for the same hand never double-celebrate.
      // Motion: full = rake + coins + celebration; reduced = banner only;
      // off = static panel, no timers.
      if (curr.phase === 'SHOWDOWN' && prev.phase !== 'SHOWDOWN') {
        if (liveState.handId !== celebrationHandId.current) {
          celebrationHandId.current = liveState.handId;
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
            // Beat 1: winner-first reveal (immediate, all motion modes)
            setShowdownBeat('winner');
            if (motionMode === 'off') {
              // Static: no rake, no celebration timers — panel shows everything.
              setShowdownBeat('all');
            } else if (motionMode === 'reduced') {
              // Reduced: no rake flight, no coins — short banner beat.
              later(1200, () => setShowdownBeat('all'));
              later(1800, () => {
                setCelebration({ active: true, winnerName: winner.name, amount: liveState.pot, cards: winCards, handLabel });
              });
              later(5000, () => {
                setCelebration({ active: false, winnerName: "", amount: 0, cards: [], handLabel: "" });
                setShowdownBeat(null);
              });
            } else {
              // Full: rake → celebration → return (prototype timings).
              later(2500, () => {
                setRake({ active: true, winnerIndex: Math.max(0, seatIdx), amount: liveState.pot });
                sfx.chipRake();
              });
              later(3700, () => {
                setRake({ active: false, winnerIndex: -1, amount: 0 });
                setShowdownBeat('all');
                setCelebration({ active: true, winnerName: winner.name, amount: liveState.pot, cards: winCards, handLabel });
                sfx.bigWin();
              });
              later(9200, () => {
                setCelebration({ active: false, winnerName: "", amount: 0, cards: [], handLabel: "" });
                setShowdownBeat(null);
              });
            }
          }
        }
      }
      // Leaving SHOWDOWN: return to gameplay — clear all showdown state so a
      // stale celebration can never linger or collide with the next hand.
      if (curr.phase !== 'SHOWDOWN' && prev.phase === 'SHOWDOWN') {
        timers.current.forEach(clearTimeout); timers.current = [];
        setRake({ active: false, winnerIndex: -1, amount: 0 });
        setCelebration({ active: false, winnerName: "", amount: 0, cards: [], handLabel: "" });
        setShowdownBeat(null);
      }
    }
    prevRef.current = curr;
  }, [liveState, myId, reduced, motionMode, later, addFlight, removeFlight]);

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
    disconnected: (p as any).presence === 'human' && (p as any).connected === false,
  }));

  const dealerPlayerIdx = liveState.players.findIndex(p => (p as any).isDealer);
  const activePlayer = liveState.players.find(p => p.id === liveState.activePlayerId);
  const activeIdx = activePlayer ? ordered.findIndex(p => p.id === activePlayer.id) : -1;

  return {
    phase: mapPhase(liveState.phase),
    players,
    pot: liveState.pot,
    sidePots: liveState.sidePots ?? null,
    dealerSeat: dealerPlayerIdx >= 0 ? ordered.findIndex(p => p.id === liveState.players[dealerPlayerIdx].id) : 0,
    activeSeat: activeIdx,
    turnDeadline: liveState.turnDeadline ?? null,
    handNumber: liveState.handId ?? 1,
    flights,
    rake,
    celebration,
    showdownBeat,
    setShowdownBeat,
    motionMode,
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
  /** Dev-preview only: pin the showdown beat for deterministic screenshots.
   *  Never passed in production. */
  showdownBeatOverride?: 'winner' | 'all';
}

export function BadugiTable({ state: liveState, myId, selectedCardIndices, onCardClick, isDrawPhase, heroAvatarSrc, heroFrameSrc, showdownBeatOverride }: BadugiTableProps) {
  const reduced = useReducedMotion();
  // Map live GameState to prototype visual state, drive flights from diffs
  const protoState = useLiveProtoState(liveState, myId);
  const state = showdownBeatOverride && protoState.phase === 'showdown'
    ? { ...protoState, showdownBeat: showdownBeatOverride }
    : protoState;
  // Detroit 2026-10-20: full-name reveal for truncated player names.
  // A truncated name carries a dotted-underline cue; tapping it plates the
  // complete username at the top-center of the table (see render below).
  // Auto-dismisses after ~2.6s and clears whenever the phase changes, so a
  // stale plate never hangs over a new hand.
  const [nameReveal, setNameReveal] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!nameReveal) return;
    const t = setTimeout(() => setNameReveal(null), 2600);
    return () => clearTimeout(t);
  }, [nameReveal]);
  useEffect(() => { setNameReveal(null); }, [state.phase]);
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
      {/* Detroit 2026-10-19 Stage 4: cinematic lighting grade — unifies the
          background, felt, and UI in the same dusk light. Vignette focuses the
          table; warm gold wash from top (setting sun); cool purple lift at the
          bottom. All CSS gradients, no blur filters (mobile perf). */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(10,4,24,0.42) 100%),
            linear-gradient(to bottom, rgba(255,190,90,0.06) 0%, transparent 28%, transparent 72%, rgba(40,16,80,0.10) 100%)
          `,
        }}
      />
      {/* Table — fixed camera (UNO keeps it still, cards do the dancing) — fills parent <main> */}
      <div
        className="flex-1 relative"
        style={{
          perspective: '1200px', // UNO-style 3D depth (Detroit 2026-10-13)
        }}
      >
        {/* Detroit 2026-10-19 Stage 4: cinematic dusk lighting grade.
            Warm gold from top (setting sun), cool purple from below.
            pointer-events none, low opacity, no blur (mobile perf). */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(255,180,80,0.10) 0%, transparent 35%, transparent 65%, rgba(76,42,138,0.14) 100%)',
            zIndex: 1,
          }}
        />
        {/* Detroit 2026-10-19 Hybrid A+B: perspective table SURFACE only.
            Dimensional feel from silhouette + layered edge + lighting —
            NEVER transforms on pods, cards, text, or buttons (they stay flat).
            The offset dark ellipse below reads as the table's near edge/side,
            giving a viewed-from-above-at-angle feel without touching children. */}
        {/* Table side/edge — offset dark ellipse = near-edge thickness */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '3%', right: '3%', top: '12%', bottom: '30%',
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #160b2b 0%, #0f0721 100%)',
            boxShadow: '0 10px 32px rgba(0,0,0,0.7), 0 0 0 2px rgba(120,90,20,0.36)',
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            // Detroit 2026-10-19 refinement: slightly smaller footprint so the
            // table frames the seats instead of dominating them. Seat %
            // positions are on the container, so spacing is unchanged.
            left: '3.5%', right: '3.5%', top: '10%', bottom: '34%',
            borderRadius: '50%',
            // Layered felt: base purple + subtle woven texture via repeating gradient
            // Perspective light: brighter at near edge (bottom), dimmer far (top)
            background: `
              repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px),
              repeating-linear-gradient(-45deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 3px),
              radial-gradient(ellipse at 50% 78%, #483184 0%, #372664 38%, #241544 68%, #190d2c 100%)
            `,
            // Dimensional: near-edge highlight, far-edge falloff.
            // Detroit 2026-10-20 UI pass: felt gradient stops darkened
            // ~15% and the near-edge highlight eased (0.14 -> 0.11) to
            // reduce the table's visual dominance WITHOUT shrinking
            // the footprint — seats sit on the container, so a smaller
            // felt would leave pods floating off the surface (the look
            // rejected 2026-10-19). Same geometry, quieter surface.
            boxShadow: `
              inset 0 -3px 14px rgba(255,220,150,0.11),
              inset 0 14px 28px rgba(0,0,0,0.4),
              inset 0 0 60px rgba(0,0,0,0.3)
            `,
            // Restrained gold rail: thin solid + inner pinline
            border: '3px solid rgba(201,162,39,0.75)',
            outline: '1px solid rgba(120,90,20,0.6)',
            outlineOffset: '3px',
          }}
        />

        {/* Detroit 2026-10-20: floating dealer "D" marker REMOVED — the
            avatar-attached pod badge is the single dealer indicator.
            DEALER_POS remains only as the deal-flight origin point. */}

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
              {state.sidePots && state.sidePots.length > 1 && (
                <div className="text-amber-200/70 text-[11px] font-mono mt-0.5" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                  {state.sidePots.map((t, i) => `${i === 0 ? 'MAIN' : state.sidePots!.length > 2 ? `SIDE ${i}` : 'SIDE'} $${t.amount.toLocaleString()}`).join(' · ')}
                </div>
              )}
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
          // Time left on the SERVER's turn clock for this seat. Null when no
          // deadline is armed (bot turn / non-interactive phase) — no bar is
          // shown rather than animating a fabricated duration.
          const turnRemainingMs = isActive && state.turnDeadline != null
            ? Math.max(0, Math.min(30_000, state.turnDeadline - serverNowMs()))
            : null;
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
              {p.isHero ? (
                <>
                  {/* HERO — vertical: avatar+name row, chips, big cards below.
                      Dealer badge integrated on the avatar corner (same as pods). */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative shrink-0">
                      <AvatarWithFrame
                        avatarSrc={heroAvatarSrc || getAvatarForSeat(0)}
                        frameSrc={heroFrameSrc}
                        initials={getAvatarInitials(p.name)}
                        initialsColor="#FDE68A"
                        size={52}
                      />
                      {isDealer && (
                        <span
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                          style={{ background: '#C9A227', color: '#1a0f2e', border: '1px solid rgba(0,0,0,0.4)' }}
                        >
                          D
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-amber-200 font-bold">
                      {p.name}
                    </span>
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
                  {/* Hero turn timer — Detroit 2026-10-20: the hero previously had
                      NO countdown anywhere while the server auto-acts at the
                      deadline. Same server-deadline bar as the opponent pods. */}
                  {turnRemainingMs != null && (
                    <div
                      className="mt-0.5 h-[3px] w-[120px] rounded-full overflow-hidden"
                      style={{ background: 'rgba(255,255,255,0.12)' }}
                    >
                      {state.motionMode === 'full' && !reduced ? (
                        <motion.div
                          key={state.turnDeadline}
                          className="h-full rounded-full"
                          style={{ background: '#F0B829', transformOrigin: 'left' }}
                          initial={{ scaleX: turnRemainingMs / 30_000 }}
                          animate={{ scaleX: 0 }}
                          transition={{ duration: turnRemainingMs / 1000, ease: 'linear' }}
                        />
                      ) : (
                        <div className="h-full w-full" style={{ background: '#F0B829' }} />
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* OPPONENT POD — Detroit 2026-10-19 refinement: ONE contained
                      panel per opponent. Everything lives inside: avatar with
                      dealer badge on its corner, tucked card backs (brighter,
                      gold-marked), name + stack + FOLD plate, bet chip, and the
                      active-turn timer bar along the pod's bottom edge.
                      Flat — no transforms on pod/cards/text. */}
                  <div
                    className="relative flex flex-col items-center rounded-xl px-2 pt-1.5 pb-1"
                    style={{
                      background: 'rgba(10,5,25,0.55)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      minWidth: '92px',
                    }}
                  >
                    <div className="flex items-center gap-1">
                      {/* Avatar with integrated dealer badge */}
                      <div className="relative shrink-0">
                        <AvatarWithFrame
                          avatarSrc={(p as any).avatarUrl || getAvatarForSeat(i + 1)}
                          frameSrc={null}
                          initials={getAvatarInitials(p.name)}
                          initialsColor="#FDE68A"
                          size={36}
                        />
                        {isDealer && (
                          <span
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                            style={{ background: '#C9A227', color: '#1a0f2e', border: '1px solid rgba(0,0,0,0.4)' }}
                          >
                            D
                          </span>
                        )}
                      </div>
                      {/* Card backs — brighter felt purple, gold border, gold ◆ mark.
                          Face-up cards show rank/suit mini. Never a folded reveal. */}
                      <div className="flex" style={{ marginLeft: 3 }}>
                        {p.cards.map((card, ci) => (
                          <div
                            key={`${p.id}-tuck${ci}`}
                            className="rounded-sm"
                            style={{
                              width: 17, height: 24,
                              marginLeft: ci > 0 ? -6 : 0,
                              background: card.isHidden
                                ? 'linear-gradient(150deg, #4b2a8f 0%, #2c1660 100%)'
                                : '#fffdf7',
                              border: '1px solid rgba(201,162,39,0.6)',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
                              color: '#1e293b',
                              fontSize: 8, fontWeight: 800,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {card.isHidden
                              ? <span style={{ color: 'rgba(240,184,41,0.9)', fontSize: 7 }}>◆</span>
                              : card.rank}
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Name on its own line across the full pod width;
                        chips + FOLD/DC plates on a second line below.
                        Detroit 2026-10-20 UI pass: the old single row
                        capped the name at 56px alongside unshrinkable
                        chips + plates, crushing long names to ~8 chars
                        and crowding the FOLD plate. Compact two-line
                        treatment — name room nearly doubles (~100px)
                        without widening the pod (widening would push
                        the side pods back off the safe width). */}
                    <div className="flex flex-col items-center mt-1" style={{ maxWidth: '100px' }}>
                      {/* Detroit 2026-10-20: intentional truncation — when the
                          name overflows (~16 chars at this size), it truncates
                          with an ellipsis AND a dotted-underline cue; tapping
                          it plates the full username at the top of the table.
                          The FOLD/DC plates stay on their own line below,
                          untouched by the reveal. */}
                      <span
                        className="text-[10px] leading-tight font-mono text-white/85 truncate"
                        style={{
                          maxWidth: '100px',
                          ...(p.name.length > 16
                            ? { textDecoration: 'underline dotted rgba(255,255,255,0.5)', textUnderlineOffset: '2px', cursor: 'pointer' }
                            : {}),
                        }}
                        title={p.name}
                        onClick={p.name.length > 16
                          ? () => setNameReveal(r => (r?.id === p.id ? null : { id: p.id, name: p.name }))
                          : undefined}
                      >
                        {p.name}
                      </span>
                      <div className="flex items-center gap-1 mt-px">
                        <span className="text-[10px] leading-tight font-mono text-amber-200/90 shrink-0">
                          {p.chips.toLocaleString()}
                        </span>
                        {p.folded && (
                          <span
                            className="text-[8px] font-mono font-bold px-1 py-px rounded-full shrink-0"
                            style={{
                              color: '#fca5a5',
                              background: 'rgba(127,29,29,0.6)',
                              border: '1px solid rgba(248,113,113,0.5)',
                            }}
                          >
                            FOLD
                          </span>
                        )}
                        {p.disconnected && (
                          <span
                            className="text-[8px] font-mono font-bold px-1 py-px rounded-full shrink-0"
                            style={{
                              color: '#cbd5e1',
                              background: 'rgba(51,65,85,0.65)',
                              border: '1px solid rgba(148,163,184,0.5)',
                            }}
                          >
                            DC
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Bet — inside the pod */}
                    {p.bet > 0 && (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-amber-300 text-[10px] font-mono"
                      >
                        ${p.bet}
                      </motion.div>
                    )}
                    {/* Active-turn timer — depleting gold bar on the pod's bottom
                        edge, driven by the SERVER's turnDeadline (epoch ms), not
                        a fixed client duration: it starts at the true remaining
                        fraction, and keying on the deadline restarts it correctly
                        on a new turn or a time-bank extension. Rendered only when
                        the server has a timer armed for this seat. Full motion:
                        animated depletion; reduced/off: static bar (no motion). */}
                    {turnRemainingMs != null && (
                      <div
                        className="absolute left-2 right-2 bottom-0.5 h-[3px] rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.12)' }}
                      >
                        {state.motionMode === 'full' && !reduced ? (
                          <motion.div
                            key={state.turnDeadline}
                            className="h-full rounded-full"
                            style={{ background: '#F0B829', transformOrigin: 'left' }}
                            initial={{ scaleX: turnRemainingMs / 30_000 }}
                            animate={{ scaleX: 0 }}
                            transition={{ duration: turnRemainingMs / 1000, ease: 'linear' }}
                          />
                        ) : (
                          <div className="h-full w-full" style={{ background: '#F0B829' }} />
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
              {/* Cards — hero big below; opponents handled in pod above */}
              {p.isHero && (
              <div
                className="flex mt-0.5"
                style={{ gap: '2px' }}
              >
                <AnimatePresence>
                  {p.cards.map((card, ci) => {
                    // Hero cards only (opponents render in the pod above)
                    const fanAngle = 0;
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
                            width: 56,
                            height: 80,
                            background: 'linear-gradient(135deg, #2d1b69, #1a0f2e)',
                            border: '1px solid rgba(139,92,246,0.4)',
                          }}
                        />
                      ) : (
                        <div
                          onClick={isDrawPhase ? () => onCardClick(ci) : undefined}
                          style={{
                            cursor: isDrawPhase ? 'pointer' : 'default',
                            transform: selectedCardIndices.includes(ci)
                              ? 'translateY(-14px) scale(1.06)'
                              : 'none',
                            transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            // Neon glow when selected — premium discard highlight
                            boxShadow: selectedCardIndices.includes(ci)
                              ? '0 0 16px rgba(255,215,0,0.9), 0 0 32px rgba(255,180,0,0.5), 0 -4px 12px rgba(255,220,100,0.4)'
                              : 'none',
                            borderRadius: '6px',
                            // Detroit 2026-10-19: 18px clearance for the 14px
                            // raise + 6% scale on selected cards
                            marginTop: '18px',
                          }}
                        >
                          <PlayingCard
                            card={card}
                            variant="premium"
                            className="!w-[56px] !h-[80px]"
                          />
                        </div>
                      )}
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              )}
              {/* Draw badge */}
              {p.drewCount !== null && (state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && !p.folded && (
                <div className="text-purple-300 text-[10px] font-mono mt-1">
                  {p.drewCount === 0 ? 'KEPT CARDS' : `DREW ${p.drewCount}`}
                </div>
              )}
            </div>
          );
        })}

        {/* Full-name plate — Detroit 2026-10-20: tapping a truncated name
            (pod or showdown-comparison row) shows the complete username
            here, top-center, where it can never clip off a screen edge the
            way a pod-anchored bubble would at 360px. Pointer-events none:
            it never blocks a game tap. */}
        <AnimatePresence>
          {nameReveal && (
            <motion.div
              key={nameReveal.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="absolute left-1/2 top-[6px] z-50 pointer-events-none"
              style={{
                x: '-50%',
                background: 'rgba(10,5,25,0.92)',
                border: '1px solid rgba(201,162,39,0.55)',
                borderRadius: 999,
                padding: '3px 12px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="text-[11px] font-mono font-bold text-white/95">{nameReveal.name}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detroit 2026-10-19 refinement: two-beat winner-first reveal.
            Beat 1 ('winner'): CINEMATIC SPOTLIGHT — the winner alone, large
            cards, gold radiance, hand label. This is the primary presentation.
            Beat 2 ('all' or resting): compact comparison panel (secondary).
            Folded players never appear in either beat (masking preserved). */}
        {state.phase === 'showdown' && state.showdownBeat === 'winner' && (() => {
          const winner = state.players.find(p => p.isWinner && !p.folded);
          if (!winner) return null;
          let handLabel = '';
          try {
            handLabel = evaluateBadugi(winner.cards.filter(c => !c.isHidden) as any)?.description ?? '';
          } catch { /* no label */ }
          const noMotion = state.motionMode === 'off' || reduced;
          return (
            <motion.div
              className="absolute inset-x-3 top-[16%] z-30 rounded-2xl px-3 py-3 flex flex-col items-center"
              initial={noMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: noMotion ? 0.15 : 0.4, ease: [0.2, 1.2, 0.4, 1] }}
              style={{
                background: 'radial-gradient(ellipse at 50% 30%, rgba(80,55,10,0.55) 0%, rgba(15,8,30,0.96) 65%)',
                border: '2px solid rgba(240,184,41,0.85)',
                boxShadow: '0 0 44px rgba(240,184,41,0.35), 0 12px 40px rgba(0,0,0,0.7)',
              }}
            >
              <div className="text-amber-300 text-[10px] font-mono font-bold tracking-[0.3em]">
                ★ WINNER ★
              </div>
              <div className="text-white text-xl font-black tracking-wide mt-1 text-center" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
                {winner.name}{winner.isHero ? ' (YOU)' : ''}
              </div>
              <div className="flex gap-1.5 mt-2.5">
                {winner.cards.filter(c => !c.isHidden).map((card, ci) => (
                  <motion.div
                    key={ci}
                    initial={noMotion ? { opacity: 0 } : { opacity: 0, y: 14, rotateY: 70 }}
                    animate={{ opacity: 1, y: 0, rotateY: 0 }}
                    transition={{ delay: noMotion ? 0 : 0.12 + ci * 0.1, duration: 0.3, ease: 'easeOut' }}
                    style={{ boxShadow: '0 0 18px rgba(240,184,41,0.45)', borderRadius: 7 }}
                  >
                    <PlayingCard card={card} variant="premium" className="!w-[46px] !h-[66px]" />
                  </motion.div>
                ))}
              </div>
              <div className="text-amber-200 text-sm font-mono font-bold mt-2.5">
                WINS ${state.pot.toLocaleString()}
              </div>
              {handLabel && (
                <div className="text-white/60 text-[11px] font-mono mt-0.5">{handLabel}</div>
              )}
              <button
                onClick={() => state.setShowdownBeat('all')}
                data-testid="button-show-all-hands"
                style={{
                  width: '100%', marginTop: 10, padding: '10px 8px', borderRadius: 12,
                  fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
                  background: 'rgba(20,14,0,0.9)', color: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(201,162,39,0.3)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                SHOW ALL HANDS
              </button>
            </motion.div>
          );
        })()}
        {state.phase === 'showdown' && state.showdownBeat !== 'winner' && (
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
                    <span
                      className="text-[10px] font-mono font-bold text-white/90 truncate w-full"
                      title={p.name}
                      style={p.name.length > 11
                        ? { textDecoration: 'underline dotted rgba(255,255,255,0.5)', textUnderlineOffset: '2px', cursor: 'pointer' }
                        : undefined}
                      onClick={p.name.length > 11
                        ? () => setNameReveal(r => (r?.id === p.id ? null : { id: p.id, name: p.name }))
                        : undefined}
                    >
                      {p.name}{p.isHero ? ' (YOU)' : ''}
                    </span>
                    {p.isWinner && (
                      <span className="text-[8px] font-mono font-bold text-amber-300">★ WINNER</span>
                    )}
                  </div>
                  <div className="flex gap-1 flex-1 justify-center">
                    {p.cards.filter(c => !c.isHidden).map((card, ci) => (
                      <PlayingCard key={ci} card={card} variant="premium" density="mini" className="!w-[32px] !h-[46px]" />
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
              style={{
                // Detroit 2026-10-20 UI pass: dark scrim under the gold
                // glow so table information (pot, pods, text) stops
                // competing with the winning hand. Static layer — safe
                // for reduced motion; overlay is pointer-events-none.
                background: 'radial-gradient(ellipse at center, rgba(240,184,41,0.15) 0%, transparent 70%), linear-gradient(rgba(5,2,15,0.55), rgba(5,2,15,0.55))',
                backdropFilter: 'blur(2px)',
                WebkitBackdropFilter: 'blur(2px)',
              }}
            >
              {/* Coin fountain particles — full motion only (Detroit 2026-10-19 Stage 3).
                  Reduced/off skip the particle storm; the banner still shows. */}
              {state.motionMode === 'full' && coins.map((coin, i) => {
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

      {/* Phase hint — specific to the round, never a stale default */}
      <div className="pb-3 text-center text-white/40 text-xs font-mono">
        {state.phase === 'ante' && 'Ante up — $25 each…'}
        {state.phase === 'dealing' && 'Dealing from the dealer…'}
        {state.phase === 'bet1' && 'Betting — round 1 of 4'}
        {state.phase === 'bet2' && 'Betting — round 2 of 4'}
        {state.phase === 'bet3' && 'Betting — round 3 of 4'}
        {state.phase === 'bet4' && 'Betting — final round'}
        {state.phase === 'draw1' && 'Draw 1 of 3 — tap cards to swap, then SWAP'}
        {state.phase === 'draw2' && 'Draw 2 of 3 — tap cards to swap, then SWAP'}
        {state.phase === 'draw3' && 'Draw 3 of 3 — last chance to swap'}
        {state.phase === 'declare' && 'Declare — HIGH or LOW?'}
        {state.phase === 'showdown' && !state.rake.active && !state.celebration.active && 'Showdown — fast reveal'}
        {state.phase === 'showdown' && state.rake.active && 'Raking it in…'}
        {state.phase === 'showdown' && state.celebration.active && `${state.celebration.winnerName} takes it down!`}
      </div>
    </div>
  );
}
