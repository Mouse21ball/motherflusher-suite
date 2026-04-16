import { Player, CardType, HandEvaluation } from '@/lib/poker/types';
import { PlayingCard } from './Card';
import { cn } from '@/lib/utils';
import { User, Coins } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Badge } from "@/components/ui/badge";
import { sfx } from '@/lib/sounds';

interface PlayerSeatProps {
  player: Player | null;
  isActive?: boolean;
  isSelf?: boolean;
  seatNumber: number;
  className?: string;
  selectedCardIndices?: number[];
  onCardClick?: (index: number) => void;
  selectableCards?: boolean;
  showdownState?: boolean;
  communityCards?: CardType[];
  showVisibleCount?: boolean;
  heroCardClassName?: string;
  sessionHandCount?: number;
  isStackLeader?: boolean;
  lastActionLabel?: string;
  justActed?: boolean;
  anyJustActed?: boolean;
  hasActivePlayer?: boolean;
}

const visibleCardValue = (rank: string): number => {
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 0.5;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
};

export function PlayerSeat({ player, isActive, isSelf, seatNumber, className, selectedCardIndices = [], onCardClick, selectableCards, showdownState, showVisibleCount, heroCardClassName, sessionHandCount, isStackLeader, lastActionLabel, justActed, anyJustActed, hasActivePlayer }: PlayerSeatProps) {
  const prevCardCountRef = useRef(0);
  const [dealAnimKey, setDealAnimKey] = useState(0);
  const [showWinEffect, setShowWinEffect] = useState(false);

  /* ── Turn onset pulse — fires once when this seat becomes active ─────── */
  const [turnOnsetKey, setTurnOnsetKey] = useState(0);
  const prevIsActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !prevIsActiveRef.current) {
      setTurnOnsetKey(k => k + 1);
    }
    prevIsActiveRef.current = isActive;
  }, [isActive]);

  /* ── Session chip delta — track starting stack once, compare every render ── */
  const sessionStartChipsRef = useRef<number | null>(null);
  if (sessionStartChipsRef.current === null && player !== null) {
    sessionStartChipsRef.current = player.chips;
  }
  const sessionDelta = player && sessionStartChipsRef.current !== null
    ? player.chips - sessionStartChipsRef.current
    : 0;

  const cardCount = player?.cards.length || 0;
  useEffect(() => {
    if (cardCount > 0 && cardCount !== prevCardCountRef.current) {
      setDealAnimKey(k => k + 1);
      if (isSelf && cardCount > prevCardCountRef.current) {
        sfx.cardDeal();
      }
    }
    prevCardCountRef.current = cardCount;
  }, [cardCount, isSelf]);

  useEffect(() => {
    if (showdownState && player?.isWinner && isSelf) {
      sfx.win();
      setShowWinEffect(true);
    } else if (showdownState && player?.isLoser && isSelf) {
      sfx.lose();
      setShowWinEffect(false);
    } else {
      setShowWinEffect(false);
    }
  }, [showdownState, player?.isWinner, player?.isLoser, isSelf]);

  /* ── Chip flash on hand transition ─────────────────────────────────────── */
  const [chipFlash, setChipFlash] = useState(false);
  const wasShowdownRef = useRef(showdownState);
  useEffect(() => {
    const was = wasShowdownRef.current;
    wasShowdownRef.current = showdownState;
    if (was && !showdownState) {
      setChipFlash(true);
      const t = setTimeout(() => setChipFlash(false), 1600);
      return () => clearTimeout(t);
    }
  }, [showdownState]);

  if (!player) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-4 rounded-xl border border-white/[0.04] bg-[#141417]/40 text-white/20 w-24 h-24", className)}>
        <span className="text-xs font-mono uppercase tracking-widest">Empty</span>
      </div>
    );
  }

  // Reserved seat — open for a real player to join during the join window.
  if (player.presence === 'reserved') {
    return (
      <div className={cn("relative flex flex-col items-center gap-2", className)}>
        <div
          className="rounded-xl border border-dashed px-4 py-3 min-w-[110px] flex flex-col items-center gap-1.5"
          style={{ borderColor: 'rgba(0,200,150,0.35)', backgroundColor: 'rgba(0,200,150,0.04)' }}
          data-testid="seat-reserved"
        >
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(0,200,150,0.70)' }} />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: 'rgba(0,200,150,0.65)' }}>Open Seat</span>
          </div>
          <span className="text-[9px] font-mono text-white/25">Awaiting player</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative flex flex-col items-center gap-2 transition-all duration-300",
      /* Opponent opacity — contextual attention hierarchy */
      !isSelf && isActive && "opacity-100",
      !isSelf && !isActive && !showdownState && (
        justActed   ? "opacity-80"   /* spotlight: just acted — snap to foreground briefly */
        : anyJustActed ? "opacity-25" /* others recede while a seat has the moment */
        : hasActivePlayer ? "opacity-30" /* dimmer during active decisions — table tension */
        : "opacity-40"                  /* normal idle */
      ),
      player.status === 'folded' && !showdownState && "opacity-40 grayscale anim-fold-drop",
      player.status === 'sitting_out' && "opacity-30 grayscale",
      showdownState && player.isLoser && "anim-loser",
      className
    )}>
      {player.isDealer && (
        <div className="absolute -right-1 -top-1 w-6 h-6 rounded-full bg-[#C9A227] text-[#0B0B0D] flex items-center justify-center text-[10px] font-bold shadow-sm z-50 border border-[#C9A227]/60">
          D
        </div>
      )}

      <div
        className={cn(
          "relative flex justify-center",
          isSelf ? "z-50 mb-4" : "z-10 scale-75 pointer-events-none mb-[-20px]"
        )}
        style={isSelf ? { width: '100%', maxWidth: '420px', margin: '0 auto 16px' } : undefined}
      >
        {player.cards.map((card, idx) => {
          const isSelected = selectedCardIndices.includes(idx);
          const canSelect = isSelf && selectableCards;
          const n = player.cards.length;
          const center = (n - 1) / 2;
          const offset = idx - center;

          const marginLeft = idx === 0 ? 0 : (isSelf ? -22 : -32);
          const rotDeg = isSelf ? 0 : offset * 10;
          const arcY = isSelf ? 0 : Math.abs(offset) * 5;
          const liftY = isSelected ? -14 : 0;
          const scaleVal = isSelected ? 1.03 : 1;

          return (
            <div 
              key={idx}
              className="relative anim-card-deal"
              style={{ 
                marginLeft: `${marginLeft}px`,
                transform: `rotate(${rotDeg}deg) translateY(${arcY + liftY}px) scale(${scaleVal})`,
                zIndex: isSelected ? 40 : 10 + idx,
                animationDelay: `${idx * 0.06}s`,
                transition: 'transform 120ms ease, box-shadow 120ms ease',
                transformOrigin: 'bottom center',
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (canSelect && onCardClick) {
                  onCardClick(idx);
                }
              }}
            >
              <PlayingCard 
                card={card} 
                selectable={canSelect}
                selected={isSelected || (showdownState && player.score && (player.score.highEval?.usedHoleCardIndices.includes(idx) || player.score.lowEval?.usedHoleCardIndices.includes(idx)))}
                isSelfHidden={isSelf && card.isHidden}
                className={isSelf && heroCardClassName ? heroCardClassName : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* Bot score badges at showdown only */}
      {player.score && !isSelf && showdownState && (
        <div className="absolute -top-14 left-1/2 -translate-x-1/2 flex flex-col gap-0.5 w-[140px] z-50 pointer-events-none">
          {['HIGH', 'SWING', 'POKER'].includes(player.declaration || '') && player.score.high && (
             <Badge className="w-full justify-center bg-blue-600/80 text-[9px] py-0.5 border-blue-500/30 shadow-sm">
               {['POKER', 'SUITS'].includes(player.declaration || '') ? 'Poker' : 'High'}: {player.score.high}
             </Badge>
          )}
          {['LOW', 'SWING', 'SUITS'].includes(player.declaration || '') && player.score.low && (
             <Badge className="w-full justify-center bg-purple-600/80 text-[9px] py-0.5 border-purple-500/30 shadow-sm">
               {['POKER', 'SUITS'].includes(player.declaration || '') ? 'Suits' : 'Low'}: {player.score.low}
             </Badge>
          )}
          {player.score.description && (
             <Badge className={cn("w-full justify-center text-[9px] py-0.5 shadow-sm", player.score.isValidBadugi ? "bg-green-700/80 border-green-600/30 text-white" : "bg-red-700/80 border-red-600/30 text-white")}>
               {player.score.description}
             </Badge>
          )}
        </div>
      )}

      {/* Name plate */}
      <div
        key={isActive ? `active-${turnOnsetKey}` : 'idle'}
        className={cn(
        "relative w-full min-w-[100px] rounded-lg p-2.5 border shadow-lg z-20 flex flex-col items-center transition-all duration-200",
        isSelf ? "bg-[#101013]" : "bg-[#0a0a0d]",
        /* Active: stronger gold border + glow + one-shot onset pulse */
        isActive && !showdownState
          ? "border-[#C9A227]/75 shadow-[0_0_26px_rgba(201,162,39,0.32)] anim-active-turn anim-turn-onset"
          : isStackLeader && !showdownState
          ? "border-[#C9A227]/18 shadow-[0_0_10px_rgba(201,162,39,0.09)]"
          : "border-white/[0.05]",
        /* Self border when idle — slightly more visible than bots */
        isSelf && !isActive ? "border-white/[0.09]" : "",
        /* Human opponent idle border — warm gold tint after 1st hand (rivalry feel) */
        !isSelf && !isActive && player.presence === 'human'
          ? ((sessionHandCount ?? 0) >= 2
              ? "border-[#C9A227]/20 bg-[#100e09]"
              : "border-white/[0.08]")
          : "",
        /* Just-acted linger — brief silver border after any bet/call/fold */
        justActed && !isActive && !showdownState ? "border-white/[0.22]" : "",
        showdownState && player.isWinner && "anim-winner",
        showdownState && player.isWinner && isSelf && "anim-win-flash",
        showdownState && player.isLoser && "border-white/[0.03]"
      )}>
        <div className="flex items-center gap-1.5 max-w-full">
          <div className={cn(
            "text-sm truncate font-sans",
            /* Identity hierarchy: self > human opponent > bot; winner name turns gold at showdown */
            isSelf ? "font-semibold text-white/90"
              : showdownState && player.isWinner ? "font-semibold text-[#C9A227]/90"
              : player.presence === 'human' ? "font-semibold text-white/85"
              : "font-normal text-white/45"
          )}>
            {player.name}
          </div>
          {!isSelf && player.presence === 'human' && (
            <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#00C896]/70" title="Real player" />
          )}
          {player.presence === 'bot' && !isSelf && (
            <span className="text-[7px] font-mono uppercase tracking-widest text-white/18 border border-white/[0.07] px-1 py-0.5 rounded shrink-0">BOT</span>
          )}
        </div>
        <div className="flex flex-col items-center gap-0">
          <div className={cn(
            "font-mono text-xs flex items-center gap-0.5 tracking-tight transition-colors duration-700",
            /* Session P&L color: green if meaningfully up, red if meaningfully down */
            sessionDelta > 75
              ? (isSelf ? "text-emerald-400/90" : "text-emerald-400/60")
              : sessionDelta < -75
              ? (isSelf ? "text-red-400/80" : "text-red-400/50")
              : (isSelf ? "text-[#C9A227]" : isStackLeader ? "text-[#C9A227]/82" : "text-[#C9A227]/65"),
            /* Brief warmth boost when chips just updated after showdown */
            chipFlash && "anim-pulse-gold text-[#D4B44A]",
            showdownState && player.isWinner && "anim-win-chip-pop"
          )}>
            {/* Stack leader marker — quiet gold chevron, all players */}
            {isStackLeader && !showdownState && (
              <span className="text-[7px] leading-none mr-0.5" style={{ color: 'rgba(201,162,39,0.55)' }}>▲</span>
            )}
            <span className="opacity-60">$</span>{player.chips}
          </div>
          {/* Session status label — self only, shown outside showdown */}
          {isSelf && !showdownState && sessionDelta > 75 && (
            <div className="text-[8px] font-mono tracking-wide leading-tight mt-0.5" style={{ color: 'rgba(52,211,153,0.45)' }}>
              up this session
            </div>
          )}
          {isSelf && !showdownState && sessionDelta < -100 && (
            <div className="text-[8px] font-mono tracking-wide leading-tight mt-0.5" style={{ color: 'rgba(248,113,113,0.38)' }}>
              down this session
            </div>
          )}
          {/* Last-action label — opponents only, auto-cleared after 750ms */}
          {!isSelf && lastActionLabel && (
            <div
              className="text-[9px] font-mono font-semibold anim-action-label mt-0.5 tracking-wide"
              style={{
                color: lastActionLabel === 'Fold'
                  ? 'rgba(248,113,113,0.72)'
                  : 'rgba(201,162,39,0.85)',
              }}
              data-testid={`text-last-action-${player.id}`}
            >
              {lastActionLabel}
            </div>
          )}
        </div>
        {showVisibleCount && player.cards.length > 0 && (() => {
          const faceUpCards = player.cards.filter(c => !c.isHidden);
          if (faceUpCards.length === 0) return null;
          const total = faceUpCards.reduce((sum, c) => sum + visibleCardValue(c.rank), 0);
          const display = total % 1 === 0 ? total.toString() : total.toFixed(1);
          return (
            <div className="text-amber-400/70 font-mono text-[10px] flex items-center gap-1 mt-0.5" data-testid={`text-visible-count-${player.id}`}>
              <span className="text-amber-400/50">showing</span>{display}
            </div>
          );
        })()}

        {/* Hero score badges — showdown only, clutter-free during live play */}
        {player.score && isSelf && showdownState && (
          <div className="flex flex-col gap-0.5 w-full mt-1.5 pt-1.5 border-t border-white/[0.06]">
            {['HIGH', 'SWING', 'POKER'].includes(player.declaration || '') && player.score.high && (
              <Badge className="w-full justify-center bg-blue-600/80 text-[9px] py-0.5 border-blue-500/30">
                {['POKER', 'SUITS'].includes(player.declaration || '') ? 'Poker' : 'High'}: {player.score.high}
              </Badge>
            )}
            {['LOW', 'SWING', 'SUITS'].includes(player.declaration || '') && player.score.low && (
              <Badge className="w-full justify-center bg-purple-600/80 text-[9px] py-0.5 border-purple-500/30">
                {['POKER', 'SUITS'].includes(player.declaration || '') ? 'Suits' : 'Low'}: {player.score.low}
              </Badge>
            )}
            {player.score.description && (
              <Badge className={cn("w-full justify-center text-[9px] py-0.5", player.score.isValidBadugi ? "bg-green-700/80 border-green-600/30 text-white" : "bg-red-700/80 border-red-600/30 text-white")}>
                {player.score.description}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Declaration badges */}
      {player.declaration === 'BUST' && (
        <Badge variant="destructive" className="absolute -bottom-3 text-[10px] uppercase font-semibold z-30">Bust</Badge>
      )}
      {player.declaration === 'STAY' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-semibold bg-amber-700/80 text-white border-none z-30">Stay</Badge>
      )}
      {player.declaration === 'HIGH' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-semibold bg-red-700/80 text-white border-none z-30">High</Badge>
      )}
      {player.declaration === 'LOW' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-semibold bg-blue-700/80 text-white border-none z-30">Low</Badge>
      )}
      {player.declaration === 'SWING' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-semibold bg-purple-700/80 text-white border-none z-30">Swing</Badge>
      )}
      {player.declaration === 'POKER' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-semibold bg-red-700/80 text-white border-none z-30">Poker</Badge>
      )}
      {player.declaration === 'SUITS' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-semibold bg-cyan-700/80 text-white border-none z-30">Suits</Badge>
      )}
      {player.status === 'folded' && !player.declaration && (
        <Badge variant="destructive" className="absolute -bottom-3 text-[10px] uppercase font-semibold z-30">Folded</Badge>
      )}
      {player.status === 'sitting_out' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-semibold bg-[#1C1C20] text-white/50 border-none z-30">Sitting Out</Badge>
      )}

      {player.bet > 0 && (
        <div className="absolute -bottom-12 flex items-center justify-center gap-1.5 bg-[#0B0B0D]/70 px-2.5 py-1 rounded-full text-xs font-mono text-white/90 border border-white/[0.06] anim-chip-toss z-20">
          <div className="gold-chip anim-chip-pop" />
          {player.bet}
        </div>
      )}
    </div>
  );
}
