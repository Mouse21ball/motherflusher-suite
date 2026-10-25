/**
 * FlushedUpTable — VERBATIM Badugi-style presentation with live server state (Detroit 2026-10-15).
 *
 * Rebuilt on BadugiTable's structure (option A — full rebuild).
 * Same flight engine, same staging, same premium touches — driven by live GameState.
 * 5 cards per hand (20 deal flights), Flushed Up evaluation, community cards near pot.
 * Single animation/sound system — no duplicates (no usePhaseSounds, no useCardAnimations).
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
import { evaluateFlushedUpHand } from '@shared/modes/flushedUp';
import type { ShowdownSummary } from '@shared/modes/showdownSummary';
import {
  fuSettlementReady, summaryForHand, firstWinnerId, seatIndexOf,
  celebrationFromSummary, celebrationFromWinners,
} from './celebrationPlan';
import { serverNowMs } from '@/lib/clockSync';

// ── Types ────────────────────────────────────────────────────────────────────

type ProtoPhase =
  | 'ante'
  | 'dealing'
  | 'draw1' | 'bet1'
  | 'draw2' | 'bet2'
  | 'draw3' | 'bet3'
  | 'bet4'
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
  // Showdown audit (Detroit 2026-10-22): decisive comparison text +
  // the other eligible revealed hands, from the server summary.
  comparison: string;
  others: { name: string; cards: { rank: string; suit: string }[]; description: string }[];
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
  /** Server turn deadline (epoch ms) for the active seat, from the
   *  snapshot — drives the per-pod timer bars (Badugi pattern). */
  turnDeadline: number | null;
  /** Structured showdown summary from the server's settlement
   *  (Detroit 2026-10-22); null outside a resolved showdown. */
  summary: ShowdownSummary | null;
}

// Key table positions (percentages) — same as Badugi
const DEALER_POS = { x: 50, y: 4 };
const POT_POS = { x: 50, y: 42 };
const MUCK_POS = { x: 63, y: 36 };
// Community cards sit above the pot (Flushed Up only — Badugi doesn't have these)
const COMMUNITY_POS = { x: 50, y: 38 };

// Flushed Up card sizes — hero bigger (5 cards need to fit)
const HERO_CARD_W = 56;
const HERO_CARD_H = 78;
const OPP_CARD_W = 20;
const OPP_CARD_H = 30;
// Opponent cards render as in-pod mini tiles (Badugi pattern, Detroit
// 2026-10-22 correction plan): 17x24 tiles tucked beside the avatar,
// -6px overlap. The old full-size showdown fans (34x48, cascaded) ran
// off the Galaxy screen and across neighbouring pods; tiles keep the
// reveal inside the pod at every width, exactly like approved Badugi.

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
  const [celebration, setCelebration] = useState<CelebrationState>({ active: false, winnerName: "", amount: 0, cards: [], handLabel: "", comparison: "", others: [] });
  // Staging: how many cards have visually landed per player this hand.
  // Cards from liveState are held back and revealed as deal flights land (prototype behavior).
  const [landed, setLanded] = useState<Record<string, number>>({});
  // Slot-faithful hero staging (Detroit 2026-10-21, Phase 3 — the Badugi
  // architecture): slots the hero discarded, held face-down until each
  // replacement flight lands. Kept slots are never touched, so kept cards
  // cannot jump, vanish, or swap places mid-animation.
  const [staged, setStaged] = useState<Record<string, number[]>>({});
  const reduced = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flightId = useRef(0);
  const prevRef = useRef<{ handId?: number; phase: string; bets: Record<string, number>; seqs: Record<string, number>; cards: Record<string, string[]> } | null>(null);
  // Live hand/phase for fire-time guards: celebration timers scheduled at
  // showdown must not activate after the table has moved to the next hand
  // (P1 repair — the winner overlay used to land on the next deal).
  const liveRef = useRef<{ handId?: number; phase: string; players: GameState['players']; pot: number; showdownSummary: ShowdownSummary | null }>({ handId: undefined, phase: '', players: [], pot: 0, showdownSummary: null });
  liveRef.current = {
    handId: liveState.handId,
    phase: liveState.phase,
    players: liveState.players,
    pot: liveState.pot,
    showdownSummary: (liveState as any).showdownSummary ?? null,
  };
  // Hand whose celebration is currently on screen — fences the timed
  // clear so a late timer can never wipe a newer hand's moment.
  const celebHandRef = useRef<number | undefined>(undefined);

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
      // Draw transactions keyed on the server's per-hand monotonic drawSeq
      // (stamped on every accepted draw since the Phase 3 engine fix).
      // The previous phase:lastDrawCount key could never fire for generic
      // modes — the engine never set lastDrawCount — and its phase
      // component made it replay-prone besides.
      seqs: Object.fromEntries(liveState.players.map(p => [p.id, (p as any).drawSeq ?? 0])),
      cards: Object.fromEntries(liveState.players.map(p => [p.id, (p.cards ?? []).map(c => `${c.rank}|${c.suit}`)])),
    };

    if (prev) {
      // Hand over (P1 repair): the winner moment belongs to the hand that
      // produced it — clear celebration, rake, and any leftover draw
      // staging the moment the table leaves showdown, and never let
      // draw staging force hero cards face-down at showdown.
      if (curr.phase !== 'SHOWDOWN' && prev.phase === 'SHOWDOWN') {
        setCelebration({ active: false, winnerName: "", amount: 0, cards: [], handLabel: "", comparison: "", others: [] });
        setRake({ active: false, winnerIndex: -1, amount: 0 });
        setStaged({});
      }
      if (curr.phase === 'SHOWDOWN' && prev.phase !== 'SHOWDOWN') {
        setStaged({});
      }
      // NEW HAND → full deal (5 cards × seated players, prototype: 160ms apart, 0.32s flight each).
      // Cards are staged: they only appear in the hand when their flight lands.
      // The generic engine increments handId TWICE per hand (entering
      // ANTE, then again in dealCards), so a bare handId change fires
      // this block at ANTE — before any cards exist — and again at
      // DEAL: the deal animation played twice (Detroit Galaxy QA,
      // 2026-10-21). Gate on the DEAL phase: exactly one authoritative
      // deal animation per hand, keyed by the dealt hand's id. Works
      // whether or not the ANTE snapshot is coalesced away, and a
      // reconnect mid-hand never replays (no id change into DEAL).
      const isNewHand = prev.handId !== undefined && curr.handId !== undefined && prev.handId !== curr.handId && curr.phase === 'DEAL';
      if (isNewHand) {
        const me = liveState.players.find(p => p.id === myId);
        // Detroit 2026-10-21 (five-seat phase): up to 4 others — the slice
        // and the deal loop below now follow the actual seat count instead
        // of the old hardcoded four-player table.
        const others = liveState.players.filter(p => p.id !== myId).slice(0, 4);
        const ordered = me ? [me, ...others] : others;
        // Reset staging: no cards visible until flights land
        const reset: Record<string, number> = {};
        for (const p of ordered) reset[p.id] = 0;
        setLanded(reset);
        setStaged({});
        // 5 cards per seated player, one every 160ms, round-robin by seat
        const totalCards = ordered.length * 5;
        for (let i = 0; i < totalCards; i++) {
          const seatIdx = i % ordered.length;
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
      // Fires exactly once per accepted draw: only when the player's
      // drawSeq increments by one within the same hand. First snapshot of
      // a hand is the baseline (prev === null or hand changed), so a
      // reconnect never replays a completed draw. Replaced slots come
      // from diffing the player's cards slot-by-slot against the
      // previous snapshot — the hero's kept cards are never re-staged.
      for (const p of liveState.players) {
        const prevSeq = prev.seqs[p.id] ?? 0;
        const currSeq = curr.seqs[p.id] ?? 0;
        if (prev.handId !== curr.handId || currSeq !== prevSeq + 1) continue;
        const count = (p as any).lastDrawCount ?? 0;
        if (count <= 0) continue; // stand-pat: transaction recorded, nothing to fly
        const isHero = p.id === myId;
        const seatIdx = isHero ? 0 : liveState.players.filter(x => x.id !== myId).findIndex(x => x.id === p.id) + 1;
        const pos = seatPosition(Math.max(0, seatIdx));
        const prevCards = prev.cards[p.id] ?? [];
        const currCards = curr.cards[p.id] ?? [];
        const replaced = currCards.map((c, i) => (prevCards[i] !== undefined && prevCards[i] !== c ? i : -1)).filter(i => i >= 0);
        const slots = isHero && replaced.length === count ? replaced : Array.from({ length: count }, (_, d) => d);
        if (isHero) {
          // Stage exactly the discarded slots face-down until they land.
          setStaged(prevStaged => ({ ...prevStaged, [p.id]: slots }));
        } else {
          // Opponent cards are backs — count staging is visually exact.
          setLanded(prevLanded => ({ ...prevLanded, [p.id]: 5 - count }));
        }
        for (let d = 0; d < count; d++) {
          const fid = addFlight({
            kind: 'muck',
            fromX: pos.x, fromY: pos.y - 6,
            toX: MUCK_POS.x + d * 1.5, toY: MUCK_POS.y,
            label: '', faceDown: true, duration: 0.35, toHero: false,
          });
          later(d * 120 + 350, () => removeFlight(fid));
        }
        sfx.dealSingle();
        later(count * 120 + 400, () => {
          for (let d = 0; d < count; d++) {
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
              if (isHero) {
                const slot = slots[d];
                setStaged(prevStaged => ({
                  ...prevStaged,
                  [p.id]: (prevStaged[p.id] ?? []).filter(sIdx => sIdx !== slot),
                }));
              } else {
                setLanded(prevLanded => ({
                  ...prevLanded,
                  [p.id]: Math.min((prevLanded[p.id] ?? 5 - count) + 1, 5),
                }));
              }
            });
          }
        });
      }

      // SHOWDOWN → rake, celebration with winning hand (prototype timing:
      // rake 2500ms, celebration 3700ms, clear 5500ms after build).
      // Detroit 2026-10-25: the celebration is SETTLEMENT-GATED. The old
      // code required winners on the showdown ENTRY snapshot — which the
      // engine sends winnerless by design (phase first, settlement
      // ~650ms later) — so most showdowns never celebrated at all; its
      // summary branch was dead besides (it read the summary off a ref
      // that never carried it). Now: arm at entry, build only when
      // celebrationPlan says settled data for THIS hand exists. Minimum
      // presentation timing is preserved; late settlement delays it.
      if (curr.phase === 'SHOWDOWN' && prev.phase !== 'SHOWDOWN') {
        const entryHandId = liveState.handId;
        let rakeFired = false;
        let built = false;
        const stillThisShowdown = () =>
          liveRef.current.handId === entryHandId && liveRef.current.phase === 'SHOWDOWN';
        const settledNow = () => fuSettlementReady(liveRef.current, entryHandId);
        const fireRake = () => {
          const st = liveRef.current;
          const wid = firstWinnerId(st, entryHandId);
          if (!wid) return;
          rakeFired = true;
          setRake({ active: true, winnerIndex: seatIndexOf(st.players, myId, wid), amount: st.pot });
          sfx.chipRake();
        };
        const build = () => {
          const st = liveRef.current;
          const sum = summaryForHand(st, entryHandId);
          const c = sum
            ? celebrationFromSummary(sum, st.players)
            : celebrationFromWinners(st.players, st.pot);
          if (!c) return;
          built = true;
          celebHandRef.current = entryHandId;
          setRake({ active: false, winnerIndex: -1, amount: 0 });
          setCelebration({ active: true, ...c });
          sfx.bigWin();
          later(5500, () => {
            if (celebHandRef.current === entryHandId) {
              setCelebration({ active: false, winnerName: "", amount: 0, cards: [], handLabel: "", comparison: "", others: [] });
            }
          });
        };
        later(2500, () => {
          if (!stillThisShowdown() || rakeFired) return;
          if (settledNow()) fireRake();
        });
        const attempt = (n: number) => {
          if (!stillThisShowdown() || built) return;
          if (!settledNow()) {
            // Settlement normally lands ~650ms after entry; poll
            // briefly instead of guessing. Cap ≈ 3700 + 14×450 ≈ 10s.
            if (n < 14) later(450, () => attempt(n + 1));
            return;
          }
          if (!rakeFired) {
            fireRake();
            later(900, () => { if (stillThisShowdown() && !built) build(); });
          } else {
            build();
          }
        };
        later(3700, () => attempt(0));
      }
    }
    prevRef.current = curr;
  }, [liveState, myId, reduced, later, addFlight, removeFlight]);

  // Map live players to proto shape (hero first)
  // Detroit 2026-10-21 (five-seat phase): render up to 4 opponents (was 3 —
  // a fifth seated player was previously invisible).
  const me = liveState.players.find(p => p.id === myId);
  const others = liveState.players.filter(p => p.id !== myId).slice(0, 4);
  const ordered = me ? [me, ...others] : others;
  // Detroit 2026-10-16: reveal non-folded opponents at showdown (was hardcoded hidden).
  const showdownPhase = mapPhase(liveState.phase) === 'showdown';

  const players: ProtoPlayer[] = ordered.map((p, i) => ({
    id: p.id,
    name: p.name,
    chips: p.chips,
    bet: p.bet,
    // Staging: only show cards that have landed from deal flights.
    // Falls back to all cards if staging didn't run (e.g. reconnect mid-hand).
    // Detroit 2026-10-16: folded players hide at showdown; non-folded opponents reveal.
    // Phase 3: while the hero's draw flights are in the air, exactly the
    // discarded slots render face-down in place; kept slots stay face-up.
    cards: (i === 0 && (staged[p.id]?.length ?? 0) > 0
      ? p.cards.map((c, slot) => ({
          ...c,
          isHidden: p.status === 'folded' ? true : (staged[p.id].includes(slot) ? true : c.isHidden),
        }))
      : p.cards.slice(0, landed[p.id] ?? p.cards.length).map(c => ({
          ...c,
          isHidden: p.status === 'folded' ? true : (i === 0 ? c.isHidden : (showdownPhase ? false : true)),
        }))),
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
    flights,
    rake,
    celebration,
    communityCards: (liveState.communityCards ?? []).map(c => ({ ...c, isHidden: false })),
    turnDeadline: (liveState as any).turnDeadline ?? null,
    summary: (liveState as any).showdownSummary ?? null,
  };
}

// ── Seat positioning ─────────────────────────────────────────────────────────
// Same as Badugi: opponents hug the top in a shallow arc, hero at bottom,
// pot gets clear center space.

function seatPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 50, y: 75.2 }; // hero — Badugi's anchor
  // Detroit 2026-10-22 (correction plan): the approved Badugi oval ring,
  // verbatim. The top-arc maps (2026-10-21 P1 pass) crammed four pods
  // along one edge: showdown fans overlapped across pods and ran
  // off-screen at Galaxy widths. The ring gives every pod its own
  // territory, and opponent cards now live inside the pod as mini
  // tiles (Badugi pattern), so no fan geometry exists at all.
  const spots = [
    { x: 50, y: 14 },    // Opp 1: top-center
    { x: 18.5, y: 34 },  // Opp 2: mid-left
    { x: 81.5, y: 34 },  // Opp 3: mid-right
    { x: 81.5, y: 54 },  // Opp 4: lower-right
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
              width: 22,
              height: 22,
              left: `calc(50% - 11px + ${xOff}px)`,
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
  heroAvatarSrc?: string | null;
  heroFrameSrc?: string | null;
  // NOTE: animState removed (Detroit 2026-10-15) — flight system owns all animations.
  // No usePhaseSounds, no useCardAnimations. Single system, no duplicates.
}

export function FlushedUpTable({ state: liveState, myId, selectedCardIndices, onCardClick, isDrawPhase, heroAvatarSrc, heroFrameSrc }: FlushedUpTableProps) {
  const reduced = useReducedMotion();
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
      {/* Table — fixed camera (UNO keeps it still, cards do the dancing) */}
      <div
        className="flex-1 relative"
        style={{
          perspective: '1200px',
        }}
      >
        {/* Detroit 2026-10-18: floating dealer marker removed — dealer shown only by D next to their name (was disconnected/confusing) */}
        {/* Detroit 2026-10-16: Flushed Up community UI removed — engine never deals community cards (dead code). */}

        {/* Center staging — pot as the centerpiece (Badugi's latitude) */}
        <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <AnimatePresence>
            <motion.div
              key={`pot-${state.pot}`}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <div className="text-amber-300/70 text-[10px] font-mono tracking-widest">POT</div>
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
                  // P1 repair: fly to the winner's actual seat position.
                  // The old math converted percent seat coordinates at a
                  // hardcoded 3.5px per percent, which is only true on a
                  // ~350px stage — chips clustered mid-table at every
                  // real size. Animate left/top in percent, the same
                  // pattern the card flights use.
                  initial={{ left: '50%', top: '42%', x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
                  animate={{
                    left: `${wpos.x}%`,
                    top: `${wpos.y}%`,
                    x: '-50%',
                    y: '-50%',
                    scale: 0.6,
                    opacity: 0.9,
                  }}
                  transition={{ duration: 0.9, ease: [0.3, 0.7, 0.4, 1], delay: i * 0.06 }}
                />
              ))}
              <motion.div
                className="absolute z-20 flex flex-col items-center pointer-events-none"
                initial={{ left: '50%', top: '42%', x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
                animate={{
                  left: `${wpos.x}%`,
                  top: `${wpos.y}%`,
                  x: '-50%',
                  y: '-50%',
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
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: p.folded ? 0.55 : 1 }}
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
              {(() => {
                // Server-deadline turn timer (Badugi pattern): shown on
                // whichever seat the server has armed a deadline for,
                // hero included — the hero previously had no countdown
                // while the server auto-acted at the deadline.
                const turnRemainingMs = i === state.activeSeat && state.turnDeadline != null
                  ? Math.max(0, Math.min(30_000, state.turnDeadline - serverNowMs()))
                  : null;
                const timerBar = (inPanel: boolean) => turnRemainingMs == null ? null : inPanel ? (
                  <div className="absolute left-2 right-2 bottom-0.5 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    {!reduced ? (
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
                ) : (
                  <div className="mt-0.5 h-[3px] w-[120px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    {!reduced ? (
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
                );
                return p.isHero ? (
                <>
                  {/* HERO — Badugi structure: avatar (dealer badge on its
                      corner) + name row, chips, bet, timer bar; cards below. */}
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
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: '#C9A227', color: '#1a0f2e', border: '1px solid rgba(0,0,0,0.4)' }}>D</span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-amber-200 font-bold">
                      {p.name}
                    </span>
                    {p.folded && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ color: '#fca5a5', background: 'rgba(127,29,29,0.6)', border: '1px solid rgba(248,113,113,0.5)' }}>FOLD</span>
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
                  {timerBar(false)}
                </>
                ) : (
                <>
                  {/* OPPONENT POD — Badugi's contained panel (2026-10-22):
                      avatar + tucked card TILES on top, name line, chips +
                      plates line, bet, timer bar on the panel's bottom
                      edge. Cards never fan out of the pod again. */}
                  <div
                    className="relative flex flex-col items-center rounded-xl px-2 pt-1.5 pb-1"
                    style={{ background: 'rgba(10,5,25,0.55)', border: '1px solid rgba(255,255,255,0.07)', minWidth: '92px' }}
                  >
                    <div className="flex items-center gap-1">
                      <div className="relative shrink-0">
                        <AvatarWithFrame
                          avatarSrc={(p as any).avatarUrl || getAvatarForSeat(i + 1)}
                          frameSrc={null}
                          initials={getAvatarInitials(p.name)}
                          initialsColor="#FDE68A"
                          size={36}
                        />
                        {isDealer && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: '#C9A227', color: '#1a0f2e', border: '1px solid rgba(0,0,0,0.4)' }}>D</span>
                        )}
                      </div>
                      <div className="flex" style={{ marginLeft: 3 }}>
                        {p.cards.map((card, ci) => (
                          <div
                            key={`${p.id}-tile${ci}`}
                            className="rounded-sm"
                            style={{
                              width: 17, height: 24,
                              marginLeft: ci > 0 ? -6 : 0,
                              background: card.isHidden
                                ? 'linear-gradient(150deg, #4b2a8f 0%, #2c1660 100%)'
                                : '#fffdf7',
                              border: '1px solid rgba(201,162,39,0.6)',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {card.isHidden
                              ? <span style={{ color: 'rgba(240,184,41,0.9)', fontSize: 7 }}>◆</span>
                              : (
                                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                                  <span style={{ fontSize: 8, fontWeight: 800, color: '#1e293b' }}>{card.rank}</span>
                                  <span style={{ fontSize: 7, color: card.suit === 'hearts' || card.suit === 'diamonds' ? '#dc2626' : '#1e293b' }}>
                                    {card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠'}
                                  </span>
                                </span>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-center mt-1" style={{ maxWidth: '100px' }}>
                      <span className="text-[10px] leading-tight font-mono text-white/85 truncate" style={{ maxWidth: '100px' }}>
                        {p.name}
                      </span>
                      <div className="flex items-center gap-1 mt-px">
                        <span className="text-[10px] leading-tight font-mono text-amber-200/90 shrink-0">
                          {p.chips.toLocaleString()}
                        </span>
                        {p.folded && (
                          <span className="text-[8px] font-mono font-bold px-1 py-px rounded-full shrink-0" style={{ color: '#fca5a5', background: 'rgba(127,29,29,0.6)', border: '1px solid rgba(248,113,113,0.5)' }}>FOLD</span>
                        )}
                      </div>
                    </div>
                    {p.bet > 0 && (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-amber-300 text-[10px] font-mono"
                      >
                        ${p.bet}
                      </motion.div>
                    )}
                    {p.drewCount !== null && (state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && !p.folded && (
                      <span className="absolute -top-1.5 -right-1.5 text-[8px] font-mono font-bold px-1 py-px rounded-full" style={{ color: '#e9d5ff', background: 'rgba(88,28,135,0.85)', border: '1px solid rgba(192,132,252,0.5)' }}>
                        {p.drewCount === 0 ? 'KEPT' : `DREW ${p.drewCount}`}
                      </span>
                    )}
                    {timerBar(true)}
                  </div>
                </>
                );
              })()}
              {/* Hero cards — big, below the plate. Opponent cards live
                  in the pod as tiles (above); no full-size fans remain. */}
              {p.isHero && (
              <div className="flex mt-0.5" style={{ gap: '2px' }}>
                <AnimatePresence>
                  {p.cards.map((card, ci) => (
                    <motion.div
                      key={`${p.id}-c${ci}`}
                      initial={false}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
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
                            width: HERO_CARD_W,
                            height: HERO_CARD_H,
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
                            boxShadow: selectedCardIndices.includes(ci)
                              ? '0 0 16px rgba(255,215,0,0.9), 0 0 32px rgba(255,180,0,0.5), 0 -4px 12px rgba(255,220,100,0.4)'
                              : 'none',
                            borderRadius: '6px',
                          }}
                        >
                          <PlayingCard
                            card={card}
                            className={`!w-[${HERO_CARD_W}px] !h-[${HERO_CARD_H}px]`}
                          />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              )}
              {/* Hero draw note (opponents carry theirs as a pod pill) */}
              {p.isHero && p.drewCount !== null && (state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && !p.folded && (
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
                          style={{
                            boxShadow: '0 0 20px rgba(253,230,138,0.6), 0 8px 24px rgba(0,0,0,0.5)',
                            borderRadius: '8px',
                            border: '2px solid rgba(253,230,138,0.8)',
                          }}
                        >
                          <PlayingCard
                            card={{ rank: card.rank as any, suit: card.suit as any, isHidden: false }}
                            className="!w-[52px] !h-[72px]"
                          />
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
                {/* Decisive comparison (server summary, 2026-10-22) */}
                {state.celebration.comparison && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="mt-3 max-w-[320px] text-center text-amber-100/90 text-[11px] leading-snug font-mono"
                    data-testid="fu-showdown-comparison"
                  >
                    {state.celebration.comparison}
                  </motion.div>
                )}
                {/* Other eligible revealed hands (folded hands never appear) */}
                {state.celebration.others.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="mt-3 flex flex-col items-center gap-1.5"
                    data-testid="fu-showdown-others"
                  >
                    {state.celebration.others.map((o, i) => (
                      <div key={`other-${i}`} className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1">
                        <span className="text-white/85 text-[11px] font-semibold max-w-[84px] truncate">{o.name}</span>
                        <span className="flex">
                          {o.cards.map((c, ci) => (
                            <PlayingCard
                              key={ci}
                              card={{ rank: c.rank as any, suit: c.suit as any, isHidden: false }}
                              className="!w-[20px] !h-[28px]"
                            />
                          ))}
                        </span>
                        <span className="text-white/65 text-[10px] font-mono">{o.description}</span>
                      </div>
                    ))}
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
