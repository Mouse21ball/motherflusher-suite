import { useState, useEffect, useRef } from "react";
import { GameState, ReactionEvent } from "@/lib/poker/types";
import { PlayerSeat } from "./PlayerSeat";
import { PlayingCard } from "./Card";
import { ResolutionOverlay } from "./ResolutionOverlay";
import { WinCelebration } from "./WinCelebration";
import { ReactionBar } from "./ReactionBar";
import { DiscardPile } from "./DiscardPile";
import { getPhaseLabel } from "@/lib/phaseLabel";
import { saveSessionResult, saveHandResult } from "@/lib/tableSession";
import { evaluateBadugi } from "@/lib/poker/modes/badugi";
import { evaluateDead7 } from "@/lib/poker/modes/dead7";
import { Fifteen35Mode } from "@/lib/poker/modes/fifteen35";
import { cn } from "@/lib/utils";

interface ThreeDTableSceneProps {
  gameState: GameState;
  myId: string;
  modeId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
  heroCardClassName?: string;
  onReact?: (emoji: string) => void;
  incomingReactions?: ReactionEvent[];
}

// ── Arc layout helpers (badugi / dead7 / fifteen35 / suitspoker) ─────────────
function getArcPosition(index: number, total: number): string {
  if (total === 1) return "absolute -top-4 sm:-top-1 left-1/2 -translate-x-1/2 z-20";
  if (total === 2) return (["absolute -top-4 sm:-top-1 left-[26%] -translate-x-1/2 z-20",
    "absolute -top-4 sm:-top-1 right-[26%] translate-x-1/2 z-20"] as const)[index] ?? "hidden";
  if (total === 3) return (["absolute top-[28%] -left-6 sm:-left-3 -translate-y-1/2 z-20",
    "absolute -top-4 sm:-top-1 left-1/2 -translate-x-1/2 z-20",
    "absolute top-[28%] -right-6 sm:-right-3 -translate-y-1/2 z-20"] as const)[index] ?? "hidden";
  return (["absolute top-[34%] -left-6 sm:-left-3 -translate-y-1/2 z-20",
    "absolute -top-4 sm:-top-1 left-[22%] sm:left-[24%] -translate-x-1/2 z-20",
    "absolute -top-4 sm:-top-1 right-[22%] sm:right-[24%] translate-x-1/2 z-20",
    "absolute top-[34%] -right-6 sm:-right-3 -translate-y-1/2 z-20"] as const)[index] ?? "hidden";
}

function getArcScale(index: number, total: number): string {
  if (total === 1) return "scale-[0.68] sm:scale-[0.78] seat-depth-top";
  if (total === 2) return "scale-[0.70] sm:scale-[0.80] seat-depth-top";
  if (total === 3) return (["scale-[0.73] sm:scale-[0.83] seat-depth-side",
    "scale-[0.67] sm:scale-[0.77] seat-depth-top",
    "scale-[0.73] sm:scale-[0.83] seat-depth-side"] as const)[index] ?? "scale-[0.70]";
  return (["scale-[0.74] sm:scale-[0.84] seat-depth-side",
    "scale-[0.67] sm:scale-[0.77] seat-depth-top",
    "scale-[0.67] sm:scale-[0.77] seat-depth-top",
    "scale-[0.74] sm:scale-[0.84] seat-depth-side"] as const)[index] ?? "scale-[0.70]";
}

// ── Ring layout helpers (swing / Swing Poker) ────────────────────────────────
function getRingPosition(seatIndex: number): string {
  const positions = [
    "absolute -bottom-3 sm:-bottom-6 left-1/2 -translate-x-1/2 scale-[1.05] sm:scale-[1.10] origin-bottom z-30 seat-depth-hero",
    "absolute -left-1 sm:-left-4 bottom-[8%] sm:bottom-[10%] scale-[0.62] sm:scale-[0.72] origin-bottom-left z-20 seat-depth-side",
    "absolute top-2 sm:top-4 left-[8%] sm:left-[14%] scale-[0.55] sm:scale-[0.64] origin-top-left z-20 seat-depth-top",
    "absolute top-2 sm:top-4 right-[8%] sm:right-[14%] scale-[0.55] sm:scale-[0.64] origin-top-right z-20 seat-depth-top",
    "absolute -right-1 sm:-right-4 bottom-[8%] sm:bottom-[10%] scale-[0.62] sm:scale-[0.72] origin-bottom-right z-20 seat-depth-side",
  ];
  return positions[seatIndex] ?? "hidden";
}

// ── Community card sub-components ─────────────────────────────────────────────

function CommunityCardSlot({ card, selected }: { card?: import("@/lib/poker/types").CardType; selected?: boolean }) {
  if (!card) return <div className="w-[46px] h-[66px] sm:w-[62px] sm:h-[88px] rounded-lg bg-white/[0.03] border border-white/[0.04]" />;
  return <PlayingCard card={card} selected={selected} className="w-[46px] h-[66px] sm:w-[62px] sm:h-[88px]" />;
}

function SuitsPokerCenter({ cc, phase, players }: { cc: import("@/lib/poker/types").CardType[]; phase: string; players: import("@/lib/poker/types").Player[] }) {
  // Always build exactly 12 slots so the layout never jumps when cards are revealed.
  // Undefined entries render as placeholder boxes (same fixed size as a card slot).
  const slots = Array.from({ length: 12 }, (_, i) => cc[i]);
  const sideA  = slots.slice(0, 3);
  const sideB  = slots.slice(3, 6);
  const center = slots.slice(6, 9);
  const lower  = slots.slice(9, 11);
  const final  = slots.slice(11, 12);
  const isUsed = (idx: number) =>
    phase === 'SHOWDOWN' &&
    players.some(p =>
      p.score?.highEval?.usedCommunityCardIndices.includes(idx) ||
      p.score?.lowEval?.usedCommunityCardIndices.includes(idx)
    );

  return (
    <div className="flex items-start justify-center gap-3 sm:gap-6 scale-[0.82] sm:scale-100 origin-center card-depth-shadow">
      <div className="flex flex-col items-center gap-1">
        <span className="text-[7px] sm:text-[9px] text-amber-400/60 font-mono uppercase tracking-wider mb-0.5">Side A</span>
        <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1 sm:p-1.5 border border-white/[0.05]">
          {sideA.map((c, i) => <CommunityCardSlot key={i} card={c} selected={isUsed(i)} />)}
        </div>
        <span className="text-[6px] sm:text-[7px] text-white/30 font-mono">← path</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[7px] sm:text-[9px] text-green-400/60 font-mono uppercase tracking-wider mb-0.5">Center</span>
        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1 sm:p-1.5 border border-white/[0.05]">
            {center.map((c, i) => <CommunityCardSlot key={i} card={c} selected={isUsed(6 + i)} />)}
          </div>
          <div className="w-px h-1 bg-white/10" />
          <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1 sm:p-1.5 border border-white/[0.05]">
            {lower.map((c, i) => <CommunityCardSlot key={i} card={c} selected={isUsed(9 + i)} />)}
          </div>
          <div className="w-px h-1 bg-white/10" />
          <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1 sm:p-1.5 border border-white/[0.05]">
            {final.map((c, i) => <CommunityCardSlot key={i} card={c} selected={isUsed(11 + i)} />)}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[7px] sm:text-[9px] text-cyan-400/60 font-mono uppercase tracking-wider mb-0.5">Side B</span>
        <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1 sm:p-1.5 border border-white/[0.05]">
          {sideB.map((c, i) => <CommunityCardSlot key={i} card={c} selected={isUsed(3 + i)} />)}
        </div>
        <span className="text-[6px] sm:text-[7px] text-white/30 font-mono">path →</span>
      </div>
    </div>
  );
}

// ── 15/35 running total helper ─────────────────────────────────────────────────

function computeVisibleTotal(cards: import("@/lib/poker/types").CardType[], isSelf: boolean): number | null {
  const visible = isSelf ? cards : cards.filter(c => !c.isHidden);
  if (!visible.length) return null;
  const aceCount = visible.filter(c => c.rank === 'A').length;
  let tot = visible.reduce((sum, c) => {
    if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return sum + 0.5;
    if (c.rank === 'A') return sum + 11;
    return sum + parseInt(c.rank, 10);
  }, 0);
  let flipped = 0;
  while (tot > 35 && flipped < aceCount) { tot -= 10; flipped++; }
  return Math.round(tot * 2) / 2; // round to nearest 0.5 for face cards
}

function Fifteen35TotalBadge({ cards, isSelf, isBust, phase }: {
  cards: import("@/lib/poker/types").CardType[];
  isSelf: boolean;
  isBust?: boolean;
  phase: string;
}) {
  const total = computeVisibleTotal(cards, isSelf);
  if (total === null && !isBust) return null;
  if (['WAITING', 'ANTE'].includes(phase)) return null;
  const isOver = (total ?? 0) > 35 || isBust;
  const isQualHigh = !isOver && (total ?? 0) >= 33 && (total ?? 0) <= 35;
  const isQualLow  = !isOver && (total ?? 0) >= 13 && (total ?? 0) <= 15;
  const isQual = isQualHigh || isQualLow;
  const label = isBust ? 'BUST' : String(total);
  const prefix = !isSelf ? 'VIS ' : '';
  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all duration-200"
      data-testid={isSelf ? 'text-fifteen35-total-hero' : 'text-fifteen35-total'}
      style={isOver || isBust
        ? { background: 'rgba(220,38,38,0.20)', borderColor: 'rgba(248,113,113,0.55)', color: 'rgb(254,150,150)' }
        : isQual
          ? { background: 'rgba(0,200,150,0.18)', borderColor: 'rgba(0,220,165,0.60)', color: 'rgb(0,230,170)' }
          : { background: 'rgba(201,162,39,0.10)', borderColor: 'rgba(201,162,39,0.25)', color: 'rgba(201,162,39,0.75)' }
      }
    >
      {prefix && <span className="text-[8px] font-mono tracking-widest opacity-60">{prefix}</span>}
      <span className={`font-mono font-bold tabular-nums tracking-wide ${isSelf ? 'text-[12px]' : 'text-[10px]'}`}>{label}</span>
    </div>
  );
}

// ── Suits & Poker compact opponent chip ───────────────────────────────────────

function CompactOpponent({ player, isActive, lastAction, isShowdown }: {
  player: import("@/lib/poker/types").Player;
  isActive: boolean;
  lastAction?: string;
  isShowdown: boolean;
}) {
  const isFolded   = player.status === 'folded';
  const isBust     = player.declaration === 'BUST';
  const isStay     = player.declaration === 'STAY';
  const initial    = (player.name || '?')[0].toUpperCase();

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl border transition-all duration-200 min-w-[48px]",
        isActive
          ? "bg-[#C9A227]/10 border-[#C9A227]/35 shadow-[0_0_8px_rgba(201,162,39,0.18)]"
          : "border-white/[0.07] bg-white/[0.025]",
        isFolded && "opacity-35",
      )}
      data-testid={`compact-opponent-${player.id}`}
    >
      {/* Avatar initial */}
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold",
        isActive ? "bg-[#C9A227]/25 text-[#C9A227]" : "bg-white/10 text-white/50"
      )}>
        {initial}
      </div>
      {/* Name */}
      <span className="text-[8px] font-mono text-white/55 truncate max-w-[52px]">{player.name}</span>
      {/* Chips */}
      <span className="text-[9px] font-mono font-semibold text-[#C9A227]/80 tabular-nums">${player.chips}</span>
      {/* Status label */}
      {isBust   && <span className="text-[7px] font-mono text-red-400/80   bg-red-900/20   px-1 py-0.5 rounded" data-testid={`status-bust-${player.id}`}>BUST</span>}
      {isStay && !isBust && <span className="text-[7px] font-mono text-emerald-400/70 bg-emerald-900/20 px-1 py-0.5 rounded">STAY</span>}
      {isFolded && <span className="text-[7px] font-mono text-white/30     bg-white/[0.04] px-1 py-0.5 rounded">FOLD</span>}
      {lastAction && !isFolded && !isBust && !isStay && (
        <span className="text-[7px] font-mono text-white/40 max-w-[52px] truncate">{lastAction}</span>
      )}
      {/* At showdown only: show their actual hole cards */}
      {isShowdown && player.cards.length > 0 && (
        <div className="flex gap-0.5 mt-0.5">
          {player.cards.map((c, i) => (
            <PlayingCard key={i} card={{ ...c, isHidden: false }} className="w-[22px] h-[31px]" />
          ))}
        </div>
      )}
    </div>
  );
}

function MotherFlushCenter({ cc, phase, players }: { cc: import("@/lib/poker/types").CardType[]; phase: string; players: import("@/lib/poker/types").Player[] }) {
  const isUsed = (idx: number) =>
    phase === 'SHOWDOWN' &&
    players.some(p =>
      p.score?.highEval?.usedCommunityCardIndices.includes(idx) ||
      p.score?.lowEval?.usedCommunityCardIndices.includes(idx)
    );

  return (
    <div className="flex flex-col items-center gap-1.5 sm:gap-2">
      <div className="flex flex-col items-center gap-1">
        <span className="text-[7px] font-mono uppercase tracking-[0.28em] text-purple-400/40 select-none">Pair Stacks</span>
        <div className="flex gap-1.5 sm:gap-2.5 card-depth-shadow">
          {Array.from({ length: 5 }).map((_, col) => {
            const topIdx = col * 2;
            const btmIdx = col * 2 + 1;
            return (
              <div key={col} className="flex flex-col items-center">
                <div className="w-[46px] h-[66px] sm:w-[60px] sm:h-[86px] flex-shrink-0" style={{ zIndex: 1 }}>
                  <PlayingCard card={cc[topIdx]} selected={isUsed(topIdx)} className="w-full h-full" />
                </div>
                <div className="w-[46px] h-[66px] sm:w-[60px] sm:h-[86px] flex-shrink-0 -mt-[42px] sm:-mt-[58px]" style={{ zIndex: 2 }}>
                  <PlayingCard card={cc[btmIdx]} selected={isUsed(btmIdx)} className="w-full h-full" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 w-full justify-center">
        <div className="h-px flex-1 max-w-[48px] bg-white/[0.06]" />
        <span className="text-[7px] font-mono uppercase tracking-[0.28em] text-purple-400/30 select-none">Factors</span>
        <div className="h-px flex-1 max-w-[48px] bg-white/[0.06]" />
      </div>
      <div className="flex gap-1 sm:gap-2 card-depth-shadow">
        {Array.from({ length: 5 }).map((_, col) => {
          const idx = 10 + col;
          return (
            <div key={col} className="w-[46px] h-[66px] sm:w-[60px] sm:h-[86px] flex-shrink-0">
              <PlayingCard card={cc[idx]} selected={isUsed(idx)} className="w-full h-full" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ThreeDTableScene({
  gameState, myId, modeId,
  selectedCardIndices, onCardClick, selectableCards,
  heroCardClassName, onReact, incomingReactions,
}: ThreeDTableSceneProps) {
  const isRingLayout = modeId === 'swing';
  const isDrawModeFull = ['badugi', 'dead7', 'fifteen35'].includes(modeId);
  const isSuitsPoker   = modeId === 'suitspoker';
  const isShowdown     = gameState.phase === 'SHOWDOWN';

  // Reorder players: hero first
  const myIndex = gameState.players.findIndex(p => p.id === myId);
  const orderedPlayers = [...gameState.players];
  if (myIndex !== -1) {
    const p1 = orderedPlayers.splice(myIndex);
    orderedPlayers.unshift(...p1);
  }
  const me        = orderedPlayers[0];
  const opponents = orderedPlayers.slice(1);

  // ── Pot pulse ────────────────────────────────────────────────────────────
  const [potPulse, setPotPulse] = useState(false);
  const prevPotRef = useRef(gameState.pot);
  useEffect(() => {
    if (gameState.pot !== prevPotRef.current && gameState.pot > 0) {
      setPotPulse(true);
      const t = setTimeout(() => setPotPulse(false), 280);
      prevPotRef.current = gameState.pot;
      return () => clearTimeout(t);
    }
    prevPotRef.current = gameState.pot;
  }, [gameState.pot]);

  // ── Session P&L tracking ──────────────────────────────────────────────────
  const heroNow = gameState.players.find(p => p.id === myId);
  const heroChipStartRef = useRef<number | null>(null);
  if (heroChipStartRef.current === null && heroNow) heroChipStartRef.current = heroNow.chips;

  const [handCount, setHandCount] = useState(1);
  const prevPhaseRef = useRef(gameState.phase);
  useEffect(() => {
    if (prevPhaseRef.current === 'SHOWDOWN' && gameState.phase !== 'SHOWDOWN') {
      setHandCount(n => n + 1);
    }
    prevPhaseRef.current = gameState.phase;
  }, [gameState.phase]);

  const wasShowdownRef = useRef(gameState.phase === 'SHOWDOWN');
  useEffect(() => {
    const was = wasShowdownRef.current;
    wasShowdownRef.current = gameState.phase === 'SHOWDOWN';
    if (was && gameState.phase !== 'SHOWDOWN' && heroNow && heroChipStartRef.current !== null) {
      saveSessionResult(heroNow.chips - heroChipStartRef.current, handCount, heroChipStartRef.current);
      const net = gameState.heroChipChange ?? 0;
      if (net > 0) saveHandResult('win');
      else if (net < 0) saveHandResult('loss');
    }
  }, [gameState.phase, heroNow]);

  // ── Last result echo ──────────────────────────────────────────────────────
  const [lastResultEcho, setLastResultEcho] = useState<{ text: string; won: boolean } | null>(null);
  const resultEchoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasShowdownRef2 = useRef(gameState.phase === 'SHOWDOWN');
  useEffect(() => {
    const was = wasShowdownRef2.current;
    wasShowdownRef2.current = gameState.phase === 'SHOWDOWN';
    if (was && gameState.phase !== 'SHOWDOWN') {
      const hero = gameState.players.find(p => p.id === myId);
      const net = gameState.heroChipChange ?? 0;
      let text = '';
      let won = false;
      if (hero?.isWinner) { text = net > 0 ? `+$${net}` : 'Won'; won = true; }
      else if (hero?.isLoser || net < 0) { text = net < 0 ? `-$${Math.abs(net)}` : 'Lost'; }
      else if (hero?.status === 'folded') { text = 'Folded'; }
      if (text) {
        setLastResultEcho({ text, won });
        if (resultEchoTimer.current) clearTimeout(resultEchoTimer.current);
        resultEchoTimer.current = setTimeout(() => setLastResultEcho(null), 1600);
      }
    }
  }, [gameState.phase]);

  // ── Win celebration (ring layout only) ───────────────────────────────────
  const [showCelebration, setShowCelebration] = useState(false);
  const celebFiredRef = useRef(false);
  useEffect(() => {
    if (isRingLayout && gameState.phase === 'SHOWDOWN' && !celebFiredRef.current) {
      const hero = gameState.players.find(p => p.id === myId);
      if (!hero?.isWinner) return;
      const isSwingScoop = hero.declaration === 'SWING' && !!(hero.score?.high && hero.score?.low);
      const activeAtShowdown = gameState.players.filter(p => p.status !== 'folded').length;
      const potSignificant = gameState.pot >= gameState.minBet * 8;
      if (isSwingScoop || (activeAtShowdown >= 2 && potSignificant)) {
        celebFiredRef.current = true;
        setShowCelebration(true);
      }
    }
    if (gameState.phase !== 'SHOWDOWN') celebFiredRef.current = false;
  }, [gameState.phase, gameState.players, gameState.pot, gameState.minBet, myId, isRingLayout]);

  const heroAtShowdown = gameState.players.find(p => p.id === myId);
  const isScoop = !!heroAtShowdown?.isWinner && heroAtShowdown.declaration === 'SWING' && !!(heroAtShowdown.score?.high && heroAtShowdown.score?.low);

  // ── Stack leader ──────────────────────────────────────────────────────────
  const activePlayers = gameState.players.filter(p => p.presence !== 'reserved');
  const maxChips = activePlayers.length > 1 ? Math.max(...activePlayers.map(p => p.chips)) : -1;
  const leadCandidates = activePlayers.filter(p => p.chips === maxChips);
  const stackLeaderId = leadCandidates.length === 1 ? leadCandidates[0].id : null;

  // ── Action labels ─────────────────────────────────────────────────────────
  const [actionLabels, setActionLabels] = useState<Record<string, string>>({});
  const actionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const actionPhaseRef = useRef<string>('');
  const actionBaselineRef = useRef<Record<string, { bet: number; chips: number; status: string }>>({});
  useEffect(() => {
    const phase = gameState.phase;
    const isBetPhase = phase.startsWith('BET') || phase.startsWith('HIT_');
    if (phase !== actionPhaseRef.current) {
      actionPhaseRef.current = phase;
      actionBaselineRef.current = Object.fromEntries(
        gameState.players.filter(p => p.presence !== 'reserved').map(p => [p.id, { bet: p.bet, chips: p.chips, status: p.status }])
      );
      if (!isBetPhase) {
        Object.values(actionTimers.current).forEach(clearTimeout);
        actionTimers.current = {};
        setActionLabels({});
      }
      return;
    }
    if (!isBetPhase) return;
    const baseline = actionBaselineRef.current;
    const updates: Record<string, string> = {};
    gameState.players.forEach(p => {
      if (p.presence === 'reserved') return;
      const old = baseline[p.id];
      if (!old) return;
      let label = '';
      if (p.status === 'folded' && old.status !== 'folded') label = 'Fold';
      else if (p.bet > old.bet) { const d = p.bet - old.bet; label = old.bet === 0 ? `Bet $${d}` : `Call $${d}`; }
      if (label) { updates[p.id] = label; baseline[p.id] = { bet: p.bet, chips: p.chips, status: p.status }; }
    });
    if (Object.keys(updates).length > 0) {
      setActionLabels(prev => ({ ...prev, ...updates }));
      Object.keys(updates).forEach(pid => {
        if (actionTimers.current[pid]) clearTimeout(actionTimers.current[pid]);
        actionTimers.current[pid] = setTimeout(() => {
          setActionLabels(prev => { const n = { ...prev }; delete n[pid]; return n; });
        }, 750);
      });
    }
  }, [gameState.players, gameState.phase]);

  const anyJustActed = Object.keys(actionLabels).length > 0;
  const hasActivePlayer = !!gameState.activePlayerId && !isShowdown && gameState.phase !== 'WAITING';

  // ── Hero made-hand status (arc draw modes only) ───────────────────────────
  const showMadeStatus = isDrawModeFull && !!me && me.cards.length > 0 &&
    !['SHOWDOWN', 'WAITING', 'ANTE', 'DEAL'].includes(gameState.phase);
  let heroIsMade = false;
  let heroMadeLabel = '';
  if (showMadeStatus && me) {
    if (modeId === 'badugi') {
      const ev = evaluateBadugi(me.cards);
      heroIsMade = !!ev?.isValidBadugi;
      heroMadeLabel = heroIsMade ? `✓ ${ev!.description}` : '✗ No Badugi yet';
    } else if (modeId === 'dead7') {
      const ev = evaluateDead7(me.cards.map(c => ({ ...c, isHidden: false })));
      heroIsMade = !!ev?.isValidBadugi;
      heroMadeLabel = ev?.isDead ? '✗ Dead — has a 7' : heroIsMade ? `✓ ${ev!.description}` : '✗ No qualifier yet';
    } else if (modeId === 'fifteen35') {
      const ev = Fifteen35Mode.evaluateHand?.(me, []);
      heroIsMade = !!ev?.isValidBadugi;
      heroMadeLabel = heroIsMade ? `✓ ${ev!.description}` : ev?.description?.includes('BUST') ? '✗ Bust' : '✗ No qualifier yet';
    }
  }

  const drawNumber = gameState.phase === 'DRAW_1' ? 1 : gameState.phase === 'DRAW_2' ? 2 : gameState.phase === 'DRAW_3' ? 3 : 0;
  const isDrawPhase = drawNumber > 0;

  // ── Center content ────────────────────────────────────────────────────────
  const lastMsg = gameState.messages[gameState.messages.length - 1];
  const isIdleMsg = !lastMsg || lastMsg.text === 'Game ready. Waiting for start...';
  const showMsg = gameState.phase !== 'SHOWDOWN' && !isIdleMsg;
  const humanCount = gameState.players.filter(p => p.presence === 'human').length;

  // ── Waiting state label ───────────────────────────────────────────────────
  function renderWaitingCenter() {
    const reservedCount = gameState.players.filter(p => p.presence === 'reserved').length;
    const others = gameState.players.filter(p => p.presence === 'human' && p.id !== myId);
    let nameLabel = others.length === 0 ? 'Just you here'
      : others.length === 1 ? `${others[0].name} · you`
      : `${others.slice(0, 2).map(p => p.name).join(', ')}${others.length > 2 ? ` +${others.length - 2}` : ''} · you`;
    return (
      <div className="flex flex-col items-center gap-2 text-center anim-slide-up">
        <div className="flex items-center gap-1.5 mb-0.5">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#00C896', boxShadow: '0 0 6px #00C896' }} />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: 'rgba(0,200,150,0.75)' }}>Live Table</span>
        </div>
        <div className="text-sm font-mono font-medium" style={{ color: 'rgba(255,255,255,0.65)' }} data-testid="text-waiting-who">{nameLabel}</div>
        <div className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
          {reservedCount > 0 ? `${reservedCount} seat${reservedCount !== 1 ? 's' : ''} open` : 'full table'}
        </div>
      </div>
    );
  }

  // ── Pot display ───────────────────────────────────────────────────────────
  function PotDisplay() {
    return (
      <div
        className={cn("pot-counter bg-[#080809]/92 backdrop-blur-sm border border-[#C9A227]/14 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full flex flex-col items-center", potPulse && "anim-chip-pop")}
        data-testid="text-pot"
      >
        <span className="text-[8px] text-[#C9A227]/65 uppercase font-semibold tracking-[0.2em] mb-0.5 font-sans">Pot</span>
        <div className="flex items-center gap-1.5">
          <div className="gold-chip w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className={cn("text-sm sm:text-base font-mono font-bold tabular-nums", potPulse ? "text-[#C9A227]" : "text-white/85")}>
            ${gameState.pot}
          </span>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RING LAYOUT (swing / Swing Poker)
  // ─────────────────────────────────────────────────────────────────────────
  if (isRingLayout) {
    return (
      <div className="game-scene-scaler">
      <div className="relative w-full max-w-5xl mx-auto mt-4 sm:mt-6 mb-8 sm:mb-24 px-2 sm:px-8 table-scene-enter">
        <div className="relative h-[70vh] min-h-[360px] sm:min-h-[560px] table-3d-perspective game-scene-ring-persp">

          {/* Felt surface — 3D tilted */}
          <div
            className="absolute inset-0 game-table-felt game-table-felt-3d table-perspective-oval overflow-hidden table-3d-tilt"
            style={{ filter: isShowdown ? 'brightness(0.92)' : 'brightness(1)', transition: 'filter 500ms ease-in-out' }}
          >
            <div className="absolute inset-0 felt-overlay mix-blend-overlay" />
            {/* Community cards + pot + phase inside the felt */}
            <div className="absolute inset-0 flex flex-col items-center justify-start pointer-events-none pt-2 sm:pt-8">
              <div className="text-center pointer-events-auto mb-1.5 sm:mb-3 min-h-[28px] flex items-center justify-center">
                {showMsg
                  ? <p key={lastMsg.id} className="text-white/60 text-[10px] sm:text-xs font-mono anim-message-auto bg-[#0B0B0D]/75 backdrop-blur-sm inline-block px-3 py-1.5 rounded-full border border-white/[0.05]" data-testid="text-game-message">{lastMsg.text}</p>
                  : <span key={gameState.phase} className="text-white/22 text-[10px] font-mono tracking-[0.2em] uppercase anim-phase-snap" data-testid="text-phase">{getPhaseLabel(gameState.phase)}</span>
                }
              </div>
              <div className="flex flex-col items-center gap-2 sm:gap-4 pointer-events-auto">
                {gameState.pot > 0 && (
                  <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#080809]/80 border border-[#C9A227]/14", potPulse && "anim-chip-pop")} data-testid="text-pot">
                    <div className="gold-chip w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className={cn("text-sm sm:text-base font-mono font-bold tabular-nums", potPulse ? "text-[#C9A227]" : "text-white/80")}>${gameState.pot}</span>
                    <span className="text-[7px] font-mono uppercase tracking-[0.2em] text-[#C9A227]/50 ml-0.5">pot</span>
                  </div>
                )}
                <MotherFlushCenter cc={gameState.communityCards} phase={gameState.phase} players={gameState.players} />
              </div>
            </div>
          </div>

          {/* Win celebration */}
          {showCelebration && <WinCelebration isScoop={isScoop} onDone={() => setShowCelebration(false)} />}

          {/* Reaction tray */}
          {onReact && (
            <div className="absolute bottom-[7%] left-1/2 -translate-x-1/2 z-30">
              <ReactionBar onReact={onReact} incomingReactions={incomingReactions} />
            </div>
          )}

          {/* All 5 seats */}
          {Array.from({ length: 5 }).map((_, i) => {
            const player = orderedPlayers[i];
            return (
              <div key={i} className={getRingPosition(i)}>
                <PlayerSeat
                  player={player || null}
                  seatNumber={i}
                  isActive={player?.id === gameState.activePlayerId}
                  isSelf={player?.id === myId}
                  selectedCardIndices={player?.id === myId ? selectedCardIndices : undefined}
                  onCardClick={onCardClick}
                  selectableCards={selectableCards}
                  showdownState={isShowdown}
                  isStackLeader={stackLeaderId === player?.id}
                  lastActionLabel={actionLabels[player?.id ?? '']}
                  justActed={!!actionLabels[player?.id ?? '']}
                  anyJustActed={anyJustActed}
                  hasActivePlayer={hasActivePlayer}
                  className={player?.id === myId ? "bg-[#0B0B0D]/85 p-3 sm:p-4 rounded-xl shadow-2xl border border-white/[0.06] backdrop-blur-md" : ""}
                />
              </div>
            );
          })}

          <ResolutionOverlay
            messages={gameState.messages}
            phase={gameState.phase}
            heroPlayer={gameState.players.find(p => p.id === myId)}
            heroChipChange={gameState.heroChipChange}
          />
        </div>
      </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITS & POKER: compact layout — hero large, opponents condensed row
  // ─────────────────────────────────────────────────────────────────────────
  if (isSuitsPoker) {
    const activeSPOpponents = opponents.filter(p => p.status !== 'sitting_out');
    return (
      <div className="game-scene-scaler">
      <div className="relative w-full max-w-3xl mx-auto px-2 sm:px-6 pt-2 pb-4 table-scene-enter flex flex-col gap-2">

        {/* ── Message bar ── */}
        <div className="w-full text-center min-h-[28px] flex items-center justify-center relative z-40">
          {gameState.phase !== 'SHOWDOWN' && gameState.messages.slice(-1).map(msg => (
            <p key={msg.id} className="text-white/60 text-[10px] sm:text-xs font-mono anim-msg-snap drop-shadow-lg bg-[#0B0B0D]/80 backdrop-blur-sm inline-block px-3 py-1.5 rounded-full border border-white/[0.05]" data-testid="text-game-message">
              {msg.text}
            </p>
          ))}
          {gameState.phase !== 'SHOWDOWN' && !gameState.messages.length && (
            <span key={gameState.phase} className="text-white/22 text-[10px] font-mono tracking-[0.2em] uppercase anim-phase-snap" data-testid="text-phase">
              {getPhaseLabel(gameState.phase)}
            </span>
          )}
        </div>

        {/* ── Opponents compact row ── */}
        <div className="flex justify-center gap-1.5 sm:gap-2 flex-wrap min-h-[80px] items-center">
          {activeSPOpponents.map(player => (
            <CompactOpponent
              key={player.id}
              player={player}
              isActive={player.id === gameState.activePlayerId}
              lastAction={actionLabels[player.id]}
              isShowdown={isShowdown}
            />
          ))}
        </div>

        {/* ── Community card board — fixed height, always 12 slots ── */}
        <div className="flex justify-center py-1">
          <SuitsPokerCenter cc={gameState.communityCards} phase={gameState.phase} players={gameState.players} />
        </div>

        {/* ── Pot ── */}
        {gameState.pot > 0 && (
          <div className="flex justify-center">
            <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#080809]/80 border border-[#C9A227]/14", potPulse && "anim-chip-pop")} data-testid="text-pot">
              <div className="gold-chip w-3.5 h-3.5" />
              <span className={cn("text-sm font-mono font-bold tabular-nums", potPulse ? "text-[#C9A227]" : "text-white/80")}>${gameState.pot}</span>
              <span className="text-[7px] font-mono uppercase tracking-[0.2em] text-[#C9A227]/50 ml-0.5">pot</span>
            </div>
          </div>
        )}

        {/* ── Hero seat ── */}
        <div className="flex justify-center">
          {me && (
            <div className="flex flex-col items-center gap-2 w-full">
              {showMadeStatus && heroMadeLabel && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] sm:text-[13px] font-mono font-bold tracking-wide border" data-testid="text-hero-made-status"
                  style={heroIsMade
                    ? { backgroundColor: 'rgba(0,200,150,0.22)', borderColor: 'rgba(0,220,165,0.70)', color: 'rgb(0,240,180)' }
                    : { backgroundColor: 'rgba(220,38,38,0.18)', borderColor: 'rgba(248,113,113,0.65)', color: 'rgb(254,150,150)' }}>
                  {heroMadeLabel}
                </div>
              )}
              <PlayerSeat
                player={me}
                seatNumber={0}
                isActive={me.id === gameState.activePlayerId}
                isSelf={true}
                selectedCardIndices={selectedCardIndices}
                onCardClick={onCardClick}
                selectableCards={selectableCards}
                showdownState={isShowdown}
                heroCardClassName={heroCardClassName}
                isStackLeader={stackLeaderId === me.id}
                className="bg-[#0B0B0D]/85 p-3 sm:p-4 rounded-xl shadow-2xl border border-white/[0.06] backdrop-blur-md pb-4 sm:pb-6"
              />
            </div>
          )}
        </div>

        <ResolutionOverlay
          messages={gameState.messages}
          phase={gameState.phase}
          heroPlayer={gameState.players.find(p => p.id === myId)}
          heroChipChange={gameState.heroChipChange}
        />

        {showCelebration && <WinCelebration isScoop={isScoop} onDone={() => setShowCelebration(false)} />}

        {lastResultEcho && (
          <div className="w-full flex justify-center">
            <div className="text-[10px] font-mono anim-action-label tabular-nums tracking-wide font-semibold" style={{ color: lastResultEcho.won ? 'rgba(201,162,39,0.75)' : 'rgba(248,113,113,0.65)' }} data-testid="text-last-result-echo">
              {lastResultEcho.text}
            </div>
          </div>
        )}

        {onReact && (
          <div className="w-full flex justify-center mt-1">
            <ReactionBar onReact={onReact} incomingReactions={incomingReactions} />
          </div>
        )}
      </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ARC LAYOUT (badugi / dead7 / fifteen35)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="game-scene-scaler">
    <div className="relative w-full max-w-3xl mx-auto px-2 sm:px-6 pt-2 pb-4 table-scene-enter">

      {/* Message bar above table */}
      <div className="w-full text-center mb-1 relative z-40 min-h-[28px] flex items-center justify-center">
        {gameState.phase !== 'SHOWDOWN' && gameState.messages.slice(-1).map(msg => (
          <p key={msg.id} className="text-white/60 text-[10px] sm:text-xs font-mono anim-msg-snap drop-shadow-lg bg-[#0B0B0D]/80 backdrop-blur-sm inline-block px-3 py-1.5 rounded-full border border-white/[0.05]" data-testid="text-game-message">
            {msg.text}
          </p>
        ))}
      </div>

      {/* 3D perspective wrapper */}
      <div className="relative table-3d-perspective">

        {/* Felt surface — tilted for 3D depth */}
        <div
          className="relative w-full table-perspective-oval game-table-felt game-table-felt-3d overflow-visible min-h-[340px] sm:min-h-[420px] table-3d-tilt game-scene-arc-felt"
          style={{ filter: isShowdown ? 'brightness(0.92)' : 'brightness(1)', transition: 'filter 500ms ease-in-out' }}
        >
          <div className="absolute inset-0 felt-overlay mix-blend-overlay pointer-events-none rounded-[76px] sm:rounded-[116px]" />

          {/* Center content inside the tilted felt */}
          <div className="relative z-10 flex flex-col items-center justify-center min-h-[340px] sm:min-h-[420px] px-4 sm:px-8 py-6 game-scene-arc-center">
            <div className="flex flex-col items-center gap-3 my-auto table-3d-counter">

              {gameState.phase === 'WAITING' ? renderWaitingCenter() : isShowdown ? null : (
                <div className="flex flex-col items-center gap-1.5 anim-slide-up">
                  <div className="text-white/30 text-[10px] sm:text-xs font-mono tracking-[0.2em] uppercase font-medium" data-testid="text-phase">
                    {getPhaseLabel(gameState.phase)}
                  </div>
                  {handCount > 1 && (
                    <div className="text-[9px] font-mono tracking-widest uppercase transition-colors duration-[2000ms]" style={{ color: handCount >= 7 ? 'rgba(201,162,39,0.42)' : handCount >= 4 ? 'rgba(220,190,70,0.32)' : 'rgba(255,255,255,0.26)' }}>
                      Hand {handCount}
                    </div>
                  )}
                  <div className="flex items-center gap-1" style={{ opacity: humanCount >= 2 ? 0.65 : 0.28 }}>
                    <div className="w-1 h-1 rounded-full" style={{ backgroundColor: '#00C896' }} />
                    <span className="text-[9px] font-mono tracking-widest" style={{ color: 'rgba(0,200,150,0.75)' }}>
                      {humanCount >= 2 ? `${humanCount} live` : 'Live table'}
                    </span>
                  </div>
                </div>
              )}

              {/* Draw round tracker */}
              {drawNumber > 0 && (
                <div className="flex items-center gap-1.5" data-testid="text-draw-round">
                  {[1, 2, 3].map(d => (
                    <div key={d} className={cn("w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center justify-center border",
                      d < drawNumber ? "bg-green-600/60 border-green-400 text-white" :
                      d === drawNumber ? "bg-yellow-500/80 border-yellow-300 text-black animate-pulse" :
                      "bg-white/10 border-white/20 text-white/45"
                    )}>{d}</div>
                  ))}
                  <span className="text-white/50 text-[9px] sm:text-[10px] font-mono ml-1">DRAW</span>
                </div>
              )}

              {/* Discard pile / draw status (badugi / dead7 / fifteen35) */}
              <DiscardPile messages={gameState.messages} isDrawPhase={isDrawPhase} />

              {gameState.phase === 'DECLARE' && (
                <div className="text-[#C9A227]/60 text-[10px] sm:text-xs font-mono uppercase tracking-wider animate-pulse" data-testid="text-declare-prompt">
                  Declaration Round
                </div>
              )}
            </div>
          </div>

          {/* Pot — absolute bottom-right of felt */}
          <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-7 z-30">
            <PotDisplay />
          </div>
        </div>

        {/* Opponent seats — positioned on the perspective wrapper, NOT inside the felt */}
        {opponents.map((player, i) => (
          <div key={player.id} className={`${getArcPosition(i, opponents.length)} ${getArcScale(i, opponents.length)} origin-center`}>
            <PlayerSeat
              player={player}
              seatNumber={i + 1}
              isActive={player.id === gameState.activePlayerId}
              isSelf={false}
              showdownState={isShowdown}
              sessionHandCount={handCount}
              isStackLeader={stackLeaderId === player.id}
              lastActionLabel={actionLabels[player.id]}
              justActed={!!actionLabels[player.id]}
              anyJustActed={anyJustActed}
              hasActivePlayer={hasActivePlayer}
            />
            {/* 15/35: running total badge from visible (face-up) cards only */}
            {modeId === 'fifteen35' && player.cards.length > 0 && (
              <div className="flex justify-center mt-0.5">
                <Fifteen35TotalBadge
                  cards={player.cards}
                  isSelf={false}
                  isBust={player.declaration === 'BUST'}
                  phase={gameState.phase}
                />
              </div>
            )}
          </div>
        ))}

        <ResolutionOverlay
          messages={gameState.messages}
          phase={gameState.phase}
          heroPlayer={gameState.players.find(p => p.id === myId)}
          heroChipChange={gameState.heroChipChange}
        />
      </div>

      {/* Last result echo */}
      {lastResultEcho && (
        <div className="w-full flex justify-center relative z-30 mb-[-6px]">
          <div className="text-[10px] font-mono anim-action-label tabular-nums tracking-wide font-semibold" style={{ color: lastResultEcho.won ? 'rgba(201,162,39,0.75)' : 'rgba(248,113,113,0.65)' }} data-testid="text-last-result-echo">
            {lastResultEcho.text}
          </div>
        </div>
      )}

      {/* Hero seat — prominent foreground, below the felt */}
      <div className="w-full flex justify-center -mt-10 sm:-mt-12 relative z-30 seat-depth-hero">
        {me && (
          <div className="flex flex-col items-center gap-2 w-full">
            {showMadeStatus && heroMadeLabel && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] sm:text-[13px] font-mono font-bold tracking-wide border transition-all duration-300" data-testid="text-hero-made-status"
                style={heroIsMade ? { backgroundColor: 'rgba(0,200,150,0.22)', borderColor: 'rgba(0,220,165,0.70)', color: 'rgb(0,240,180)', boxShadow: '0 0 14px rgba(0,200,150,0.35)' }
                  : { backgroundColor: 'rgba(220,38,38,0.18)', borderColor: 'rgba(248,113,113,0.65)', color: 'rgb(254,150,150)', boxShadow: '0 0 10px rgba(220,38,38,0.20)' }}>
                {heroMadeLabel}
              </div>
            )}
            <PlayerSeat
              player={me}
              seatNumber={0}
              isActive={me.id === gameState.activePlayerId}
              isSelf={true}
              selectedCardIndices={selectedCardIndices}
              onCardClick={onCardClick}
              selectableCards={selectableCards}
              showdownState={isShowdown}
              heroCardClassName={heroCardClassName}
              isStackLeader={stackLeaderId === me.id}
              className="bg-[#0B0B0D]/85 p-3 sm:p-4 rounded-xl shadow-2xl border border-white/[0.06] backdrop-blur-md pb-4 sm:pb-6"
            />
            {/* 15/35: hero sees their own hidden card in the total */}
            {modeId === 'fifteen35' && me.cards.length > 0 && (
              <div className="flex justify-center mt-1">
                <Fifteen35TotalBadge
                  cards={me.cards}
                  isSelf={true}
                  isBust={me.declaration === 'BUST'}
                  phase={gameState.phase}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reaction tray — below hero, floats travel upward */}
      {onReact && (
        <div className="w-full flex justify-center mt-2 relative z-30">
          <ReactionBar onReact={onReact} incomingReactions={incomingReactions} />
        </div>
      )}
    </div>
    </div>
  );
}
