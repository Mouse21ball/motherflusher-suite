// Self-contained chain-ring table scene for the 15/35 game mode.
// Visually isolated from all other game modes — no shared layout with Badugi / Dead7 / Suits.

import { useState, useEffect, useRef } from "react";
import type { GameState, ReactionEvent } from "@/lib/poker/types";
import { PlayingCard } from "./Card";
import { getAvatarForSeat, getHeroAvatar } from "@shared/engine/avatarMap";
import { ResolutionOverlay } from "./ResolutionOverlay";
import { WinCelebration } from "./WinCelebration";
import { ReactionBar } from "./ReactionBar";
import { getPhaseLabel } from "@/lib/phaseLabel";
import { saveSessionResult, saveHandResult } from "@/lib/tableSession";
import { cn } from "@/lib/utils";

export interface Fifteen35TableSceneProps {
  gameState: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
  heroCardClassName?: string;
  onReact?: (emoji: string) => void;
  incomingReactions?: ReactionEvent[];
}

// Running total from visible (face-up) cards
function computeVisTotal(cards: import("@/lib/poker/types").CardType[], isSelf: boolean): number | null {
  const visible = isSelf ? cards : cards.filter(c => !c.isHidden);
  if (!visible.length) return null;
  const aceCount = visible.filter(c => c.rank === 'A').length;
  let tot = visible.reduce((sum, c) => {
    if (['J', 'Q', 'K'].includes(c.rank)) return sum + 0.5;
    if (c.rank === 'A') return sum + 11;
    return sum + parseInt(c.rank, 10);
  }, 0);
  let flipped = 0;
  while (tot > 35 && flipped < aceCount) { tot -= 10; flipped++; }
  return Math.round(tot * 2) / 2;
}

// Absolute position styles for opponents around the ring
function getOpponentStyle(index: number, total: number): React.CSSProperties {
  const sets: React.CSSProperties[][] = [
    // 1 opponent
    [{ top: '2%', left: '50%', transform: 'translateX(-50%)' }],
    // 2 opponents
    [
      { top: '5%', left: '18%', transform: 'translateX(-50%)' },
      { top: '5%', right: '18%', transform: 'translateX(50%)' },
    ],
    // 3 opponents
    [
      { top: '42%', left: '-6px', transform: 'translateY(-50%)' },
      { top: '3%',  left: '50%',  transform: 'translateX(-50%)' },
      { top: '42%', right: '-6px', transform: 'translateY(-50%)' },
    ],
    // 4 opponents
    [
      { top: '42%', left: '-6px',  transform: 'translateY(-50%)' },
      { top: '3%',  left: '22%',   transform: 'translateX(-50%)' },
      { top: '3%',  right: '22%',  transform: 'translateX(50%)' },
      { top: '42%', right: '-6px', transform: 'translateY(-50%)' },
    ],
  ];
  return sets[Math.min(total - 1, 3)]?.[index] ?? {};
}

// Running total badge
function VisBadge({ total, isBust }: { total: number | null; isBust: boolean }) {
  if (total === null && !isBust) return null;
  const isOver = (total ?? 0) > 35 || isBust;
  const isQualHigh = !isOver && (total ?? 0) >= 33 && (total ?? 0) <= 35;
  const isQualLow  = !isOver && (total ?? 0) >= 13 && (total ?? 0) <= 15;
  const isQual = isQualHigh || isQualLow;
  return (
    <div className={cn(
      "text-[7px] font-mono font-bold px-1.5 py-[2px] rounded border tracking-wider tabular-nums",
      isOver ? "text-red-400 border-red-500/45 bg-red-950/50" :
      isQual  ? "text-emerald-400 border-emerald-500/40 bg-emerald-950/40" :
                "text-amber-400/80 border-amber-600/30 bg-amber-950/30"
    )}>
      {isBust ? 'BUST' : `VIS ${total}`}
    </div>
  );
}

// Single opponent seat around the ring
function OpponentSeat({ player, isActive, isShowdown, seatIndex, phase, lastAction, revealed }: {
  player: import("@/lib/poker/types").Player;
  isActive: boolean;
  isShowdown: boolean;
  seatIndex: number;
  phase: string;
  lastAction?: string;
  revealed: boolean;
}) {
  const isFolded = player.status === 'folded';
  const isBust   = player.declaration === 'BUST';
  const isStay   = player.declaration === 'STAY';
  const avatarSrc = getAvatarForSeat(seatIndex);
  const inPlay = !['WAITING', 'ANTE'].includes(phase);
  const hasCards = player.cards.length > 0;
  const visTotal = computeVisTotal(player.cards, false);

  // Lead card: show only the last visible (face-up) card prominently
  const leadCard = hasCards ? player.cards[player.cards.length - 1] : null;
  const stackCards = hasCards ? player.cards.slice(0, player.cards.length - 1) : [];

  return (
    <div
      className={cn("flex flex-col items-center gap-[3px]", isFolded && "opacity-35")}
      data-testid={`fifteen35-seat-${player.id}`}
    >
      {/* Avatar with active glow */}
      <div className="relative">
        <div className={cn(
          "w-[50px] h-[50px] rounded-full overflow-hidden border-2 bg-black/75",
          isActive && !isShowdown
            ? "border-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.70)]"
            : "border-white/15"
        )}>
          <img
            src={avatarSrc} alt={player.name}
            className="w-full h-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="absolute -top-1 -left-1 w-[14px] h-[14px] rounded-full bg-black/90 border border-white/25 flex items-center justify-center text-[7px] font-bold text-white/70">
          {seatIndex}
        </div>
      </div>

      {/* Name + bankroll */}
      <span className="text-[7px] font-mono text-white/55 truncate max-w-[64px] text-center leading-none">
        {player.name}
      </span>
      <span className="text-[8px] font-mono font-bold text-amber-400/75 tabular-nums leading-none">
        ${player.chips.toLocaleString()}
      </span>

      {/* VIS running total */}
      {inPlay && <VisBadge total={visTotal} isBust={isBust} />}

      {/* Cards: lead card + hidden stack behind — no full reveal during play */}
      {inPlay && hasCards && !isShowdown && leadCard && (
        <div className="relative mt-[3px]" style={{ width: 38, height: 52 }}>
          {/* Hidden stacked cards (behind) */}
          {stackCards.map((card, i) => (
            <div
              key={i}
              className="absolute bottom-0"
              style={{
                left: Math.max(0, (i - stackCards.length) * 3 + 6),
                zIndex: i,
                transform: `rotate(${i % 2 === 0 ? -4 : 4}deg)`,
              }}
            >
              <PlayingCard card={{ ...card, isHidden: true }} className="w-[28px] h-[40px]" />
            </div>
          ))}
          {/* Lead card — face-up, on top */}
          <div className="absolute right-0 bottom-0" style={{ zIndex: player.cards.length }}>
            <PlayingCard
              card={{ ...leadCard, isHidden: false }}
              className="w-[28px] h-[40px] shadow-md"
            />
          </div>
        </div>
      )}

      {/* Showdown: all cards revealed */}
      {isShowdown && revealed && hasCards && (
        <div className="flex gap-[2px] mt-[3px] flex-wrap justify-center max-w-[70px]">
          {player.cards.map((c, i) => (
            <PlayingCard key={i} card={{ ...c, isHidden: false }} className="w-[20px] h-[28px]" />
          ))}
        </div>
      )}

      {/* Status badges */}
      {isBust && !isFolded && (
        <span className="text-[6px] font-mono uppercase tracking-wider text-red-400/85 bg-red-950/50 border border-red-800/45 px-1 py-[1px] rounded">
          BUST
        </span>
      )}
      {isStay && !isBust && !isFolded && (
        <span className="text-[6px] font-mono uppercase tracking-wider text-emerald-400/75 bg-emerald-950/40 border border-emerald-800/35 px-1 py-[1px] rounded">
          STAY
        </span>
      )}
      {isFolded && (
        <span className="text-[6px] font-mono text-white/25 bg-white/[0.04] px-1 py-[1px] rounded">
          FOLD
        </span>
      )}
      {lastAction && !isFolded && !isBust && !isStay && (
        <span className="text-[6px] font-mono text-amber-400/50 max-w-[64px] truncate">{lastAction}</span>
      )}
    </div>
  );
}

// Hero card fan — horizontal spread, supports 2–6+ cards without overlap breaking layout
function HeroCardFan({ cards, selectedCardIndices, onCardClick, selectableCards }: {
  cards: import("@/lib/poker/types").CardType[];
  selectedCardIndices: number[];
  onCardClick: (i: number) => void;
  selectableCards: boolean;
}) {
  const count = cards.length;
  if (count === 0) return null;
  const CARD_W = 54;
  const CARD_H = 76;
  const spread = count <= 4 ? 42 : Math.max(26, 42 - (count - 4) * 6);
  const totalW  = (count - 1) * spread + CARD_W;
  const maxAngle = count <= 4 ? 4.5 : 2.5;

  return (
    <div
      className="relative flex items-end justify-center"
      style={{ height: CARD_H + 14, width: Math.min(totalW + 8, 290) }}
    >
      {cards.map((card, i) => {
        const selected = selectedCardIndices.includes(i);
        const frac     = count > 1 ? (i - (count - 1) / 2) / ((count - 1) / 2) : 0;
        const angle    = frac * maxAngle;
        return (
          <div
            key={i}
            className={cn(
              "absolute bottom-0 transition-all duration-150",
              selectableCards && "cursor-pointer hover:-translate-y-1"
            )}
            style={{
              left: i * spread,
              zIndex: i,
              transform: `rotate(${angle}deg)`,
              transformOrigin: 'bottom center',
              bottom: selected ? 12 : 0,
            }}
            onClick={() => selectableCards && onCardClick(i)}
            data-testid={`hero-card-${i}`}
          >
            <PlayingCard
              card={card}
              selected={selected}
              className="w-[54px] h-[76px] shadow-lg"
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Fifteen35TableScene({
  gameState, myId,
  selectedCardIndices, onCardClick, selectableCards,
  onReact, incomingReactions,
}: Fifteen35TableSceneProps) {
  const isShowdown = gameState.phase === 'SHOWDOWN';

  // Reorder: hero first
  const myIndex = gameState.players.findIndex(p => p.id === myId);
  const orderedPlayers = [...gameState.players];
  if (myIndex !== -1) {
    const slice = orderedPlayers.splice(myIndex);
    orderedPlayers.unshift(...slice);
  }
  const me        = orderedPlayers[0];
  const opponents = orderedPlayers.slice(1).filter(p => p.presence !== 'reserved');
  const humanCount = gameState.players.filter(p => p.presence === 'human').length;
  const inPlay     = !['WAITING', 'ANTE'].includes(gameState.phase);

  // ── Pot pulse ──────────────────────────────────────────────────────────────
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

  // ── Hand counter ───────────────────────────────────────────────────────────
  const [handCount, setHandCount] = useState(1);
  const prevPhaseRef = useRef(gameState.phase);
  useEffect(() => {
    if (prevPhaseRef.current === 'SHOWDOWN' && gameState.phase !== 'SHOWDOWN') {
      setHandCount(n => n + 1);
    }
    prevPhaseRef.current = gameState.phase;
  }, [gameState.phase]);

  // ── Showdown stagger reveal ────────────────────────────────────────────────
  const [sdRevealCount, setSdRevealCount] = useState(0);
  const sdRevealOrderRef = useRef<string[]>([]);
  const sdRevealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (gameState.phase !== 'SHOWDOWN') {
      setSdRevealCount(0);
      if (sdRevealIntervalRef.current) { clearInterval(sdRevealIntervalRef.current); sdRevealIntervalRef.current = null; }
      return;
    }
    const active = gameState.players.filter(p => p.presence !== 'reserved');
    sdRevealOrderRef.current = [
      ...active.filter(p => !p.isWinner).map(p => p.id),
      ...active.filter(p => p.isWinner).map(p => p.id),
    ];
    setSdRevealCount(0);
    let n = 0;
    sdRevealIntervalRef.current = setInterval(() => {
      n++;
      setSdRevealCount(n);
      if (n >= sdRevealOrderRef.current.length) { clearInterval(sdRevealIntervalRef.current!); sdRevealIntervalRef.current = null; }
    }, 320);
    return () => { if (sdRevealIntervalRef.current) { clearInterval(sdRevealIntervalRef.current); sdRevealIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.phase]);
  const revealedIdSet = new Set(sdRevealOrderRef.current.slice(0, sdRevealCount));

  // ── Win celebration ────────────────────────────────────────────────────────
  const [showCelebration, setShowCelebration] = useState(false);
  const celebFiredRef = useRef(false);
  useEffect(() => {
    if (gameState.phase === 'SHOWDOWN' && !celebFiredRef.current) {
      const hero = gameState.players.find(p => p.id === myId);
      if (hero?.isWinner) { celebFiredRef.current = true; setShowCelebration(true); }
    }
    if (gameState.phase !== 'SHOWDOWN') celebFiredRef.current = false;
  }, [gameState.phase, gameState.players, myId]);

  // ── Session P&L ────────────────────────────────────────────────────────────
  const heroNow = gameState.players.find(p => p.id === myId);
  const heroChipStartRef = useRef<number | null>(null);
  if (heroChipStartRef.current === null && heroNow) heroChipStartRef.current = heroNow.chips;

  const showdownSnapRef = useRef<{ isWinner: boolean; isLoser: boolean; folded: boolean; net: number } | null>(null);
  useEffect(() => {
    if (gameState.phase === 'SHOWDOWN') {
      const hero = gameState.players.find(p => p.id === myId);
      showdownSnapRef.current = {
        isWinner: !!hero?.isWinner, isLoser: !!hero?.isLoser,
        folded: hero?.status === 'folded', net: gameState.heroChipChange ?? 0,
      };
    }
  }, [gameState.phase, gameState.players, gameState.heroChipChange, myId]);

  const wasShowdownRef = useRef(gameState.phase === 'SHOWDOWN');
  useEffect(() => {
    const was = wasShowdownRef.current;
    wasShowdownRef.current = gameState.phase === 'SHOWDOWN';
    if (was && gameState.phase !== 'SHOWDOWN' && heroNow && heroChipStartRef.current !== null) {
      saveSessionResult(heroNow.chips - heroChipStartRef.current, handCount, heroChipStartRef.current);
      const net = showdownSnapRef.current?.net ?? 0;
      if (net > 0) saveHandResult('win');
      else if (net < 0) saveHandResult('loss');
    }
  }, [gameState.phase, heroNow]);

  // ── Last result echo ───────────────────────────────────────────────────────
  const [lastResultEcho, setLastResultEcho] = useState<{ text: string; won: boolean } | null>(null);
  const resultEchoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasShowdownRef2 = useRef(gameState.phase === 'SHOWDOWN');
  useEffect(() => {
    const was = wasShowdownRef2.current;
    wasShowdownRef2.current = gameState.phase === 'SHOWDOWN';
    if (was && gameState.phase !== 'SHOWDOWN') {
      const snap = showdownSnapRef.current;
      const net  = snap?.net ?? 0;
      let text = ''; let won = false;
      if (snap?.isWinner) { text = net > 0 ? `+$${net}` : 'Won'; won = true; }
      else if (snap?.isLoser || net < 0) { text = net < 0 ? `-$${Math.abs(net)}` : 'Lost'; }
      else if (snap?.folded) { text = 'Folded'; }
      if (text) {
        setLastResultEcho({ text, won });
        if (resultEchoTimer.current) clearTimeout(resultEchoTimer.current);
        resultEchoTimer.current = setTimeout(() => setLastResultEcho(null), 1600);
      }
    }
  }, [gameState.phase]);

  // ── Action labels ──────────────────────────────────────────────────────────
  const [actionLabels, setActionLabels] = useState<Record<string, string>>({});
  const actionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const actionPhaseRef = useRef('');
  const actionBaselineRef = useRef<Record<string, { bet: number; chips: number; status: string }>>({});
  useEffect(() => {
    const phase = gameState.phase;
    const isBetPhase = phase.startsWith('BET') || phase.startsWith('HIT_');
    if (phase !== actionPhaseRef.current) {
      actionPhaseRef.current = phase;
      actionBaselineRef.current = Object.fromEntries(
        gameState.players.filter(p => p.presence !== 'reserved').map(p => [p.id, { bet: p.bet, chips: p.chips, status: p.status }])
      );
      if (!isBetPhase) { Object.values(actionTimers.current).forEach(clearTimeout); actionTimers.current = {}; setActionLabels({}); }
      return;
    }
    if (!isBetPhase) return;
    const baseline = actionBaselineRef.current;
    const updates: Record<string, string> = {};
    gameState.players.forEach(p => {
      if (p.presence === 'reserved') return;
      const old = baseline[p.id]; if (!old) return;
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

  // ── Derived hero values ────────────────────────────────────────────────────
  const heroAvatarSrc = getHeroAvatar();
  const heroVisTot    = me ? computeVisTotal(me.cards, true) : null;
  const heroIsBust    = me?.declaration === 'BUST';

  // Waiting state label
  const others = gameState.players.filter(p => p.presence === 'human' && p.id !== myId);
  const waitingLabel = others.length === 0 ? "Table's heating up…"
    : others.length === 1 ? `${others[0].name} · you`
    : `${others.slice(0, 2).map(p => p.name).join(', ')}${others.length > 2 ? ` +${others.length - 2}` : ''} · you`;

  const potAnimDur = `${Math.min(620 + Math.floor(gameState.pot / 120) * 55, 980)}ms`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="game-scene-scaler">
      <div className="relative w-full max-w-[440px] mx-auto px-2 pt-1 pb-1 table-scene-enter flex flex-col items-center gap-1">

        {/* ── Message bar ── */}
        <div className="w-full text-center min-h-[20px] flex items-center justify-center">
          {gameState.phase !== 'SHOWDOWN' && gameState.messages.slice(-1).map(msg => (
            <p
              key={msg.id}
              className="text-white/55 text-[10px] font-mono anim-msg-snap bg-black/70 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/[0.05]"
              data-testid="text-game-message"
            >
              {msg.text}
            </p>
          ))}
        </div>

        {/* ── Chain ring arena ── */}
        <div
          className="relative flex items-center justify-center w-full"
          style={{ minHeight: 290 }}
        >
          {/* Ring frame — chain + concrete floor */}
          <div className="relative fifteen35-chain-ring" style={{ width: 268, height: 268 }}>

            {/* Concrete floor interior */}
            <div className="absolute inset-[13px] rounded-full fifteen35-ring-floor" />

            {/* Center brand / waiting content */}
            <div className="absolute inset-[13px] rounded-full flex flex-col items-center justify-center z-10 px-5">
              {gameState.phase === 'WAITING' ? (
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: '#00C896', boxShadow: '0 0 6px #00C896' }}
                    />
                    <span
                      className="text-[9px] font-mono font-bold uppercase tracking-widest"
                      style={{ color: 'rgba(0,200,150,0.75)' }}
                    >
                      Live Table
                    </span>
                  </div>
                  <div
                    className="text-[11px] font-mono"
                    style={{ color: 'rgba(255,255,255,0.58)' }}
                    data-testid="text-waiting-who"
                  >
                    {waitingLabel}
                  </div>
                </div>
              ) : isShowdown ? null : (
                <div className="flex flex-col items-center gap-[2px] select-none">
                  <div className="f35-brand-title" data-testid="text-fifteen35-brand">15/35</div>
                  <div className="f35-brand-sub1">HIT · STAY · SURVIVE</div>
                  <div className="f35-brand-sub2">CHAIN GANG POKER</div>
                  <div className="f35-brand-rule" />
                  <div className="f35-brand-phase" data-testid="text-phase">
                    {getPhaseLabel(gameState.phase)}
                  </div>
                  {handCount > 1 && (
                    <div className="f35-brand-hand">Hand {handCount}</div>
                  )}
                  <div
                    className="flex items-center gap-1 mt-1"
                    style={{ opacity: humanCount >= 2 ? 0.65 : 0.22 }}
                  >
                    <div className="w-1 h-1 rounded-full" style={{ backgroundColor: '#00C896' }} />
                    <span
                      className="text-[8px] font-mono tracking-widest"
                      style={{ color: 'rgba(0,200,150,0.75)' }}
                    >
                      {humanCount >= 2 ? `${humanCount} live` : 'Live table'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Pot — anchored near bottom of ring */}
            {gameState.pot > 0 && (
              <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ bottom: '14%' }}>
                <div
                  className={cn("f35-pot-plate", potPulse && "anim-pot-arrival anim-pot-shimmer")}
                  style={potPulse ? { animationDuration: potAnimDur } : undefined}
                  data-testid="text-pot"
                >
                  <span className="f35-pot-label">POT</span>
                  <div className="f35-pot-chip" />
                  <span className={cn("f35-pot-amount", potPulse && "!text-amber-400")}>
                    ${gameState.pot.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* Opponent seats — absolutely positioned around the ring */}
            {opponents.map((player, i) => (
              <div
                key={player.id}
                className="absolute z-20"
                style={getOpponentStyle(i, opponents.length)}
              >
                <OpponentSeat
                  player={player}
                  isActive={player.id === gameState.activePlayerId}
                  isShowdown={isShowdown}
                  seatIndex={i + 1}
                  phase={gameState.phase}
                  lastAction={actionLabels[player.id]}
                  revealed={revealedIdSet.has(player.id)}
                />
              </div>
            ))}

          </div>
        </div>

        {/* ── Hero seat — docked below the ring ── */}
        {me && (
          <div className="f35-hero-seat flex flex-col items-center gap-2 w-full max-w-[300px]">
            {/* Avatar + info row */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "relative w-14 h-14 rounded-full overflow-hidden border-2 bg-black/75 flex-shrink-0",
                  me.id === gameState.activePlayerId && !isShowdown
                    ? "border-amber-400/90 shadow-[0_0_16px_rgba(251,191,36,0.70)]"
                    : "border-amber-600/35"
                )}
              >
                <img
                  src={heroAvatarSrc} alt={me.name}
                  className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className="text-[11px] font-mono font-bold text-white/88 leading-none">
                  {me.name}
                </span>
                <span className="text-[14px] font-mono font-black text-amber-400 tabular-nums leading-none">
                  ${me.chips.toLocaleString()}
                </span>
                {inPlay && heroVisTot !== null && (
                  <VisBadge total={heroVisTot} isBust={heroIsBust} />
                )}
                {me.declaration === 'STAY' && !heroIsBust && (
                  <span className="text-[7px] font-mono uppercase tracking-wider text-emerald-400/75 bg-emerald-950/40 border border-emerald-800/35 px-1 py-[1px] rounded self-start">
                    STAY
                  </span>
                )}
              </div>
            </div>

            {/* Hero card fan — supports 2–6+ cards */}
            {me.cards.length > 0 && !isShowdown && (
              <HeroCardFan
                cards={me.cards}
                selectedCardIndices={selectedCardIndices}
                onCardClick={onCardClick}
                selectableCards={selectableCards}
              />
            )}

            {/* Showdown: full reveal in a neat row */}
            {isShowdown && me.cards.length > 0 && (
              <div className="flex gap-1.5 justify-center flex-wrap">
                {me.cards.map((c, i) => (
                  <PlayingCard
                    key={i}
                    card={{ ...c, isHidden: false }}
                    className="w-[50px] h-[70px] shadow-lg"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Last result echo */}
        {lastResultEcho && (
          <div
            className="text-[10px] font-mono anim-action-label tabular-nums tracking-wide font-semibold"
            style={{ color: lastResultEcho.won ? 'rgba(201,162,39,0.80)' : 'rgba(248,113,113,0.70)' }}
            data-testid="text-last-result-echo"
          >
            {lastResultEcho.text}
          </div>
        )}

        {showCelebration && (
          <WinCelebration isScoop={false} onDone={() => setShowCelebration(false)} />
        )}

        <ResolutionOverlay
          messages={gameState.messages}
          phase={gameState.phase}
          heroPlayer={gameState.players.find(p => p.id === myId)}
          heroChipChange={gameState.heroChipChange}
        />
      </div>
    </div>
  );
}
