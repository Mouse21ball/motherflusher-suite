/**
 * BoxChevyTable — VERBATIM Badugi-style presentation with live server state (Detroit 2026-10-15).
 *
 * Rebuilt on Badugi/Flushed Up's flight engine (option A — full rebuild).
 * Same flight engine, same staging, same premium touches — driven by live GameState.
 * 5 hole cards per seated player (25 deal flights at a full five-seat
 * table), THEN 5 community cards dealt the same way as a hand — from the
 * dealer, staggered flights, staged until they land.
 * Single animation/sound system — no duplicates.
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
import { evaluateBoxChevy10, compareBoxChevyHigh, compareBoxChevyLow } from '@shared/modes/boxchevy';
import { getHeroHandValidity } from '@shared/modes/heroHandValidity';
import type { ShowdownSummary } from '@shared/modes/showdownSummary';
import { serverNowMs } from '@/lib/clockSync';

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
  declaration: string | null;
  /** Server-stamped fold reason ('declare-auto-invalid' = the
   *  no-made-hand auto-fold) — drives the pod plate text. */
  foldReason: string | null;
  isWinner: boolean;
  avatarUrl?: string;
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
  side: 'HIGH' | 'LOW' | 'SWING' | 'SOLE' | 'BOTH';
  /** Authoritative payout from the server's showdown summary
   *  (Detroit 2026-10-22). Rendered when present; the legacy
   *  `amount` field is a client estimate and is never displayed. */
  exactAmount?: number;
  /** The settlement's own reason text for this award. */
  reason?: string;
}

interface CelebrationAudit {
  headline: string;
  community: { rank: string; suit: string }[];
  comparisons: string[];
  declarations: { name: string; text: string }[];
  rollover: number;
}

interface CelebrationState {
  active: boolean;
  // Two-winner support: high and low celebrated separately (Detroit 2026-10-15)
  highWinner: WinnerInfo | null;
  lowWinner: WinnerInfo | null;
  // Single winner (swing or sole survivor)
  soleWinner: WinnerInfo | null;
  // Showdown audit from the server summary (Detroit 2026-10-22)
  audit: CelebrationAudit | null;
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
  /** Server turn deadline (epoch ms) for the active seat — drives the
   *  per-pod timer bars (Badugi pattern). */
  turnDeadline: number | null;
}

// Key table positions (percentages) — Detroit 2026-10-22 correction
// plan: center-aware layout. The community block (label + cards + pot
// pill) owns a reserved center band at 50.5%; the pot pill sits at its
// base (~57%). Flights target these anchors.
const DEALER_POS = { x: 50, y: 4 };
const POT_POS = { x: 50, y: 57 };
const MUCK_POS = { x: 63, y: 47 };
const COMMUNITY_POS = { x: 50, y: 49.7 };

// Card sizes — hero bigger (5 cards need to fit); community cards are
// mini (32x44) so the five-card row fits its reserved band at 360px.
const HERO_CARD_W = 52;
const HERO_CARD_H = 74;
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
  return { active: false, highWinner: null, lowWinner: null, soleWinner: null, audit: null };
}

function useLiveProtoState(liveState: GameState, myId: string): ProtoState {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [rake, setRake] = useState<RakeState>({ active: false, winnerIndex: -1, amount: 0 });
  const [celebration, setCelebration] = useState<CelebrationState>(emptyCelebration);
  const [landed, setLanded] = useState<Record<string, number>>({});
  const [commLanded, setCommLanded] = useState(-1); // -1 = not staged yet (reconnect fallback shows all)
  const reduced = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flightId = useRef(0);
  const prevRef = useRef<{ handId?: number; phase: string; bets: Record<string, number>; draws: Record<string, string | undefined> } | null>(null);
  // Freshest live state for timer callbacks (the showdown summary
  // lands ~650ms after the phase flips; builders read it from here,
  // fenced by handId).
  const liveRef = useRef(liveState);
  liveRef.current = liveState;

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
      // NEW HAND → 5 hole cards per seated player, THEN 5 community cards
      // (Detroit 2026-10-15: community dealt the same way as a hand —
      // staggered flights from dealer).
      // Detroit 2026-10-21: five-seat phase — the flight count follows the
      // actual seat count (was hardcoded 20 cards over 4 seats).
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
        const others = liveState.players.filter(p => p.id !== myId).slice(0, 4);
        const ordered = me ? [me, ...others] : others;
        const reset: Record<string, number> = {};
        for (const p of ordered) reset[p.id] = 0;
        setLanded(reset);
        setCommLanded(0);
        // Detroit 2026-10-16: clear celebration + rake so they don't bleed into the new hand.
        setCelebration(emptyCelebration());
        setRake({ active: false, winnerIndex: -1, amount: 0 });
        const holeFlights = ordered.length * 5;
        for (let i = 0; i < holeFlights; i++) {
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
            later(320, () => {
              removeFlight(fid);
              setLanded(prevLanded => ({
                ...prevLanded,
                [player.id]: Math.min((prevLanded[player.id] ?? 0) + 1, 5),
              }));
            });
          });
        }
        const commStart = holeFlights * 160 + 200; // Detroit 2026-10-16: tightened from 400ms — was a visible pause
        for (let c = 0; c < 5; c++) {
          later(commStart + c * 160, () => {
            const fid = addFlight({
              kind: 'card',
              fromX: DEALER_POS.x, fromY: DEALER_POS.y,
              toX: COMMUNITY_POS.x + (c - 2) * 10.3, toY: COMMUNITY_POS.y,
              label: '', faceDown: false, duration: 0.32, toHero: false,
            });
            sfx.dealSingle();
            later(320, () => {
              removeFlight(fid);
              setCommLanded(prev => Math.min((prev === -1 ? 0 : prev) + 1, 5));
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
        const scheduledHandId = liveState.handId;
        if (winners.length > 0) {
          const evals = new Map(winners.map(w => {
            const hole = (w.cards ?? []).map(c => ({ ...c, isHidden: false }));
            return [w.id, evaluateBoxChevy10(hole as any, comm as any)];
          }));
          const decl = (w: any) => (w as any).declaration as string | null;
          const highPool = winners.filter(w => decl(w) === 'HIGH' || decl(w) === 'SWING');
          const lowPool = winners.filter(w => decl(w) === 'LOW' || decl(w) === 'SWING');
          // Detroit 2026-10-16: collect ALL tied winners, not just the first.
          let bestHighEval: any = null;
          const highTied: any[] = [];
          for (const w of highPool) {
            const e = evals.get(w.id)!;
            if (!bestHighEval || compareBoxChevyHigh(e, bestHighEval) > 0) {
              bestHighEval = e; highTied.length = 0; highTied.push(w);
            } else if (compareBoxChevyHigh(e, bestHighEval) === 0) {
              highTied.push(w);
            }
          }
          let bestLowEval: any = null;
          const lowTied: any[] = [];
          for (const w of lowPool) {
            const e = evals.get(w.id)!;
            if (!bestLowEval || compareBoxChevyLow(e, bestLowEval) > 0) {
              bestLowEval = e; lowTied.length = 0; lowTied.push(w);
            } else if (compareBoxChevyLow(e, bestLowEval) === 0) {
              lowTied.push(w);
            }
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
          // Detroit 2026-10-16: tied winners share the celebration (names joined).
          const tieName = (tied: any[]) => tied.map(w => w.name).join(' & ');
          if (highTied.length > 0 && lowTied.length > 0 && highTied[0].id === lowTied[0].id && highTied.length === 1 && lowTied.length === 1) {
            soleWinner = buildInfo(highTied[0], 'SWING');
          } else {
            if (highTied.length > 0) {
              const info = buildInfo(highTied[0], 'HIGH');
              info.name = tieName(highTied);
              highWinner = info;
            }
            if (lowTied.length > 0) {
              const info = buildInfo(lowTied[0], 'LOW');
              info.name = tieName(lowTied);
              lowWinner = info;
            }
            if (!highWinner && !lowWinner && winners.length > 0) {
              soleWinner = buildInfo(winners[0], 'SOLE');
            }
          }
          const firstWinner = highTied[0] ?? lowTied[0] ?? winners[0];
          const isHero = firstWinner.id === myId;
          const seatIdx = isHero ? 0 : liveState.players.filter(x => x.id !== myId).findIndex(x => x.id === firstWinner.id) + 1;
          later(2500, () => {
            setRake({ active: true, winnerIndex: Math.max(0, seatIdx), amount: liveState.pot });
            sfx.chipRake();
          });
          later(3700, () => {
            setRake({ active: false, winnerIndex: -1, amount: 0 });
            // Server summary first (Detroit 2026-10-22): exact
            // payouts, sides, and reasons come from the settlement
            // itself. Fallback (fold-win direct awards carry no
            // summary): the client-derived build above, unchanged.
            const sum = (liveRef.current as any).showdownSummary as ShowdownSummary | null;
            if (sum && sum.handId === scheduledHandId && sum.modeId === 'box_chevy') {
              const livePlayers = (liveRef.current as any).players as any[];
              const byId = new Map(livePlayers.map(p => [p.id, p]));
              const infoFor = (a: ShowdownSummary['awards'][number], side: WinnerInfo['side']): WinnerInfo => {
                const p = byId.get(a.playerId);
                return {
                  name: p?.name ?? a.playerId,
                  amount: a.amount,
                  exactAmount: a.amount,
                  cards: (p?.cards ?? []).map((c: any) => ({ rank: c.rank, suit: c.suit })),
                  handLabel: sum.entries.find(e => e.playerId === a.playerId)?.description ?? '',
                  side,
                  reason: a.reason,
                };
              };
              let hi: WinnerInfo | null = null;
              let lo: WinnerInfo | null = null;
              let sole: WinnerInfo | null = null;
              for (const a of sum.awards) {
                if (a.part === 'HIGH') hi = infoFor(a, 'HIGH');
                else if (a.part === 'LOW') lo = infoFor(a, 'LOW');
                else if (a.part === 'SWING') sole = infoFor(a, 'SWING');
                else if (a.part === 'HIGH + LOW') sole = infoFor(a, 'BOTH');
                else sole = infoFor(a, 'SOLE');
              }
              const usedReasons = new Set(sum.awards.map(a => a.reason));
              const audit: CelebrationAudit = {
                headline: sum.headline,
                community: comm.map(c => ({ rank: c.rank, suit: c.suit })),
                comparisons: sum.comparisons.filter(c => !usedReasons.has(c)),
                declarations: (sum.declarations ?? []).map(d => ({
                  name: byId.get(d.playerId)?.name ?? d.playerId,
                  text: d.declaration && d.outcome === 'declared' ? d.declaration : d.outcome,
                })),
                rollover: sum.rollover,
              };
              setCelebration({ active: true, highWinner: hi, lowWinner: lo, soleWinner: sole, audit });
            } else {
              setCelebration({ active: true, highWinner, lowWinner, soleWinner, audit: null });
            }
            sfx.bigWin();
          });
          later(9000, () => { // Detroit 2026-10-16: reduced from 12s — 9s is enough to read two hands
            setCelebration(emptyCelebration());
          });
        } else if (liveState.pot > 0) {
          // No winners at entry: a contested hand that will resolve
          // to a rollover (nobody qualified) still gets its audit —
          // built purely from the server summary when it lands.
          later(3700, () => {
            const sum = (liveRef.current as any).showdownSummary as ShowdownSummary | null;
            if (!sum || sum.handId !== scheduledHandId || sum.modeId !== 'box_chevy') return;
            const livePlayers = (liveRef.current as any).players as any[];
            const byId = new Map(livePlayers.map(p => [p.id, p]));
            setCelebration({
              active: true, highWinner: null, lowWinner: null, soleWinner: null,
              audit: {
                headline: sum.headline,
                community: comm.map(c => ({ rank: c.rank, suit: c.suit })),
                comparisons: sum.comparisons,
                declarations: (sum.declarations ?? []).map(d => ({
                  name: byId.get(d.playerId)?.name ?? d.playerId,
                  text: d.declaration && d.outcome === 'declared' ? d.declaration : d.outcome,
                })),
                rollover: sum.rollover,
              },
            });
            sfx.bigWin();
          });
          later(9000, () => {
            setCelebration(emptyCelebration());
          });
        }
      }
    }
    prevRef.current = curr;
  }, [liveState, myId, reduced, later, addFlight, removeFlight]);

  const me = liveState.players.find(p => p.id === myId);
  const others = liveState.players.filter(p => p.id !== myId).slice(0, 4);
  const ordered = me ? [me, ...others] : others;

  const showdownPhase = mapPhase(liveState.phase) === 'showdown';
  const players: ProtoPlayer[] = ordered.map((p, i) => ({
    id: p.id,
    name: p.name,
    chips: p.chips,
    bet: p.bet,
    cards: p.cards.slice(0, landed[p.id] ?? p.cards.length).map(c => ({
      ...c,
      // Detroit 2026-10-16: folded players (including hero) hide cards at showdown.
      isHidden: p.status === 'folded' ? true : (i === 0 ? c.isHidden : (showdownPhase ? false : true)),
    })),
    isHero: i === 0,
    folded: p.status === 'folded',
    drewCount: (p as any).lastDrawCount ?? null,
    declaration: (p as any).declaration ?? null,
    foldReason: (p as any).foldReason ?? null,
    isWinner: !!(p as any).isWinner,
    avatarUrl: (p as any).avatarUrl ?? undefined,
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
    communityCards: (liveState.communityCards ?? []).slice(0, commLanded === -1 ? (liveState.communityCards ?? []).length : commLanded).map(c => ({ ...c, isHidden: false })),
    turnDeadline: (liveState as any).turnDeadline ?? null,
  };
}

function seatPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 50, y: 80 }; // hero — below the center band
  // Detroit 2026-10-22 (correction plan): center-aware ring variant.
  // Badugi's oval ring cannot host Box Chevy: its mid/lower pods sit
  // exactly where the five community cards must live. Opponents take a
  // top pair + mid pair ABOVE the reserved community band (50.5%), the
  // hero sits below it. Pod structure, tiles, plates, and timer bars
  // are Badugi's; only the seat geography is center-aware. Geometry
  // budget verified at 360x740 and 393x852 stage equivalents.
  const spots = [
    { x: 27, y: 10.5 },   // Opp 1: top-left
    { x: 73, y: 10.5 },   // Opp 2: top-right
    { x: 18.5, y: 30.5 }, // Opp 3: mid-left
    { x: 81.5, y: 30.5 }, // Opp 4: mid-right
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
  heroAvatarSrc?: string | null;
  heroFrameSrc?: string | null;
}

export function BoxChevyTable({ state: liveState, myId, selectedCardIndices, onCardClick, isDrawPhase, heroAvatarSrc, heroFrameSrc }: BoxChevyTableProps) {
  const reduced = useReducedMotion();
  const state = useLiveProtoState(liveState, myId);
  const coins = useMemo(() => Array.from({ length: 24 }).map((_, i) => ({
    angle: (i / 24) * Math.PI * 2,
    dist: 120 + Math.random() * 80,
    duration: 1.2 + Math.random() * 0.6,
    delay: Math.random() * 0.3,
  })), [state.celebration.active]);
  const bg = getSelectedBackground();
  // Hero qualification state for the in-table validity badge — the same
  // shared evaluator family the server's auto-fold rule uses
  // (evaluateBoxChevy10.isMade), so the badge can never disagree with
  // the DECLARE outcome. Null outside the visible hand phases.
  const heroLive = liveState.players.find(p => p.id === myId);
  const validity = heroLive
    ? getHeroHandValidity('boxchevy', liveState.phase, heroLive.cards ?? [], liveState.communityCards ?? [])
    : null;

  return (
    <div className="h-full flex flex-col relative" style={{
      backgroundImage: `url(${bg.url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      {/* Detroit 2026-10-16: dark overlay removed — was reading as a "box" around the table */}
      <div className="flex-1 relative" style={{ perspective: '1200px' }}>
        {/* Floating dealer marker removed (Badugi/FU precedent): the
            dealer is the D badge on the dealer's avatar corner. */}

        {/* Center band (reserved): COMMUNITY label + five mini cards +
            pot pill, one block centered at 50.5%. Detroit 2026-10-22:
            the old layout floated the community row at 42% and the pot
            at 52% on the same axis with no reserved bands, so the pot
            amount crowded the cards' lower edge. The pill keeps the pot
            compact inside the band — and visible during WAITING, which
            ruling 2's rollover depends on. */}
        <div className="absolute left-1/2 top-[50.5%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ gap: 4 }}>
          {state.communityCards.length > 0 && (
            <div className="text-white/40 text-[9px] font-mono tracking-widest">COMMUNITY</div>
          )}
          <div className="flex" style={{ gap: 5 }}>
            <AnimatePresence>
              {state.communityCards.map((card, i) => (
                <motion.div
                  key={`comm-${i}`}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <PlayingCard card={card} className="!w-[32px] !h-[44px]" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            <motion.div
              key={`pot-${state.pot}`}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25 }}
              className="rounded-full px-3 py-1 font-mono font-bold text-amber-200 whitespace-nowrap"
              style={{ background: 'rgba(20,10,40,0.88)', border: '1px solid rgba(240,184,41,0.55)', fontSize: 12, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
            >
              POT ${state.pot.toLocaleString()}
            </motion.div>
          </AnimatePresence>
        </div>
        {(state.phase === 'draw1' || state.phase === 'draw2' || state.phase === 'draw3') && (
          <div className="absolute left-1/2 -translate-x-1/2 text-white/30 text-[10px] font-mono" style={{ top: 'calc(50.5% + 50px)' }}>🂠 muck</div>
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
                  initial={{ left: '50%', top: '57%', x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
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
          // Detroit 2026-10-16: avatars with cosmetic borders on every seat.
          const avatarSrc = p.isHero ? (heroAvatarSrc || getAvatarForSeat(0)) : (p.avatarUrl || getAvatarForSeat(i + 1));
          const frameSrc = p.isHero ? heroFrameSrc : null;
          // Server-deadline turn timer (Badugi pattern) — visible on the
          // armed seat, hero included, so a DECLARE/bet wait always
          // shows its own clock instead of reading as a stall.
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
          const foldPlate = p.folded ? (
            <span className="text-[8px] font-mono font-bold px-1 py-px rounded-full shrink-0" style={{ color: '#fca5a5', background: 'rgba(127,29,29,0.6)', border: '1px solid rgba(248,113,113,0.5)' }}>
              {p.foldReason === 'declare-auto-invalid' ? 'NO MADE HAND' : 'FOLD'}
            </span>
          ) : null;
          const declarationPill = p.declaration ? (
            <span className={`text-[8px] font-mono font-bold px-1 py-px rounded-full shrink-0 ${
              p.declaration === 'HIGH' ? 'text-blue-300 bg-blue-500/20' :
              p.declaration === 'LOW' ? 'text-green-300 bg-green-500/20' :
              p.declaration === 'SWING' ? 'text-purple-300 bg-purple-500/20' :
              'text-white/40 bg-white/10'
            }`}>
              {p.declaration}
            </span>
          ) : null;
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: p.folded ? 0.55 : 1 }}
            >
              {/* Active turn — premium layered glow (Badugi/FU pattern) */}
              {isActive && (
                <>
                  <motion.div
                    className="absolute -inset-4 rounded-2xl pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at center, rgba(240,184,41,0.25) 0%, transparent 70%)', filter: 'blur(8px)' }}
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
                  {/* HERO — Badugi structure: avatar (dealer badge on its
                      corner) + name row, chips, bet, timer; cards below;
                      validity badge under the cards. */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative shrink-0">
                      <AvatarWithFrame
                        avatarSrc={avatarSrc}
                        frameSrc={frameSrc}
                        initials={getAvatarInitials(p.name)}
                        initialsColor="#FDE68A"
                        size={52}
                      />
                      {state.dealerSeat === i && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: '#C9A227', color: '#1a0f2e', border: '1px solid rgba(0,0,0,0.4)' }}>D</span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-amber-200 font-bold">{p.name}</span>
                    {foldPlate}
                    {declarationPill}
                  </div>
                  {/* Chips + bet share one line — the center-aware
                      layout buys back the vertical room the community
                      band and validity badge need (budget-verified). */}
                  <div className="text-white/50 text-[10px] font-mono">
                    {p.chips.toLocaleString()}
                    {p.bet > 0 && <span className="text-amber-300"> · ${p.bet} bet</span>}
                  </div>
                  {timerBar(false)}
                  <div className="flex mt-0.5" style={{ gap: '2px' }}>
                    <AnimatePresence>
                      {p.cards.map((card, ci) => (
                        <motion.div
                          key={`${p.id}-c${ci}`}
                          initial={false}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          exit={{ opacity: 0, scale: 0.6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          style={{ transformOrigin: 'bottom center' }}
                        >
                          {card.isHidden ? (
                            <div
                              className="rounded"
                              style={{
                                width: HERO_CARD_W, height: HERO_CARD_H,
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
                              <PlayingCard card={card} className={`!w-[${HERO_CARD_W}px] !h-[${HERO_CARD_H}px]`} />
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  {/* Validity badge — the missing in-table qualification
                      signal (correction plan P0-2): live from the first
                      bet round, names the duplicate ranks, and never
                      recommends an impossible repair. */}
                  {validity && (
                    <div
                      data-testid="box-chevy-validity-badge"
                      className="mt-1 flex flex-col items-center rounded-xl px-3 py-1"
                      style={{
                        maxWidth: 300,
                        background: validity.status === 'valid' ? 'rgba(6,78,59,0.78)' : validity.status === 'invalid' ? 'rgba(127,29,29,0.78)' : 'rgba(30,41,59,0.78)',
                        border: `1px solid ${validity.status === 'valid' ? 'rgba(52,211,153,0.55)' : validity.status === 'invalid' ? 'rgba(248,113,113,0.55)' : 'rgba(148,163,184,0.4)'}`,
                      }}
                    >
                      <span className="text-[10px] font-mono font-bold tracking-wide" style={{ color: validity.status === 'valid' ? '#6ee7b7' : validity.status === 'invalid' ? '#fca5a5' : 'rgba(255,255,255,0.75)' }}>
                        {validity.label}
                      </span>
                      {validity.detail && (
                        <span className="text-[9px] font-mono text-center" style={{ color: 'rgba(255,255,255,0.8)' }}>
                          {validity.detail}
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* OPPONENT POD — Badugi's contained panel: avatar +
                      hole-card TILES, name line, chips + plates line
                      (FOLD / NO MADE HAND / declaration), bet, timer. */}
                  <div
                    className="relative flex flex-col items-center rounded-xl px-2 pt-1.5 pb-1"
                    style={{ background: 'rgba(10,5,25,0.55)', border: '1px solid rgba(255,255,255,0.07)', minWidth: '92px' }}
                  >
                    <div className="flex items-center gap-1">
                      <div className="relative shrink-0">
                        <AvatarWithFrame
                          avatarSrc={avatarSrc}
                          frameSrc={null}
                          initials={getAvatarInitials(p.name)}
                          initialsColor="#FDE68A"
                          size={36}
                        />
                        {state.dealerSeat === i && (
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
                        {foldPlate}
                        {declarationPill}
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

                {/* Showdown audit — server summary (Detroit 2026-10-22):
                    community in fixed order, decisive comparisons,
                    declarations, and any rollover. */}
                {state.celebration.audit && (
                  <div className="mt-5 flex flex-col items-center" data-testid="bc-showdown-audit">
                    {!state.celebration.highWinner && !state.celebration.lowWinner && !state.celebration.soleWinner && (
                      <div className="text-amber-200 text-base font-bold font-mono text-center max-w-[320px]">
                        {state.celebration.audit.headline}
                      </div>
                    )}
                    <div className="mt-3 text-white/50 text-[9px] font-mono tracking-widest">COMMUNITY</div>
                    <div className="mt-1 flex gap-1.5">
                      {state.celebration.audit.community.map((c, i) => (
                        <PlayingCard
                          key={`audit-comm-${i}`}
                          card={{ rank: c.rank as any, suit: c.suit as any, isHidden: false }}
                          className="!w-[32px] !h-[44px]"
                        />
                      ))}
                    </div>
                    {state.celebration.audit.comparisons.map((line, i) => (
                      <div key={`audit-cmp-${i}`} className="mt-2 max-w-[330px] text-center text-amber-100/90 text-[11px] leading-snug font-mono">
                        {line}
                      </div>
                    ))}
                    {state.celebration.audit.declarations.length > 0 && (
                      <div className="mt-3 flex flex-col items-center gap-0.5">
                        {state.celebration.audit.declarations.map((d, i) => (
                          <div key={`audit-decl-${i}`} className="text-white/70 text-[10px] font-mono">
                            <span className="text-white/90 font-semibold">{d.name}</span> — {d.text}
                          </div>
                        ))}
                      </div>
                    )}
                    {state.celebration.audit.rollover > 0 && (
                      <div className="mt-2 text-amber-300 text-[11px] font-mono font-bold">
                        ${state.celebration.audit.rollover.toLocaleString()} ROLLS OVER
                      </div>
                    )}
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
        {/* Detroit 2026-10-16: amount removed — was fabricated (pot ÷ winners), wrong with side pots.
            Detroit 2026-10-22: the exact payout returns, sourced from the server's showdown summary. */}
        {winner.exactAmount !== undefined && (
          <span className="text-amber-300 text-xl font-mono ml-3">+${winner.exactAmount.toLocaleString()}</span>
        )}
      </div>
      {winner.side !== 'SOLE' && (
        <div className={`text-xs font-mono tracking-widest mt-1 ${
          winner.side === 'HIGH' ? 'text-blue-300' :
          winner.side === 'LOW' ? 'text-green-300' :
          'text-purple-300'
        }`}>
          {winner.side === 'SWING' ? 'SWING — TAKES BOTH' : winner.side === 'BOTH' ? 'HIGH + LOW — BOTH SIDES' : `${winner.side} HAND`}
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
      {winner.reason && (
        <div className="mt-1.5 max-w-[320px] text-center text-amber-100/85 text-[11px] leading-snug font-mono">
          {winner.reason}
        </div>
      )}
    </motion.div>
  );
}
