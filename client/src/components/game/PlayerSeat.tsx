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
}

const visibleCardValue = (rank: string): number => {
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 0.5;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
};

export function PlayerSeat({ player, isActive, isSelf, seatNumber, className, selectedCardIndices = [], onCardClick, selectableCards, showdownState, showVisibleCount }: PlayerSeatProps) {
  const prevCardCountRef = useRef(0);
  const [dealAnimKey, setDealAnimKey] = useState(0);
  const [showWinEffect, setShowWinEffect] = useState(false);

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

  if (!player) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-white/10 bg-black/20 text-white/30 w-24 h-24", className)}>
        <span className="text-xs font-mono uppercase tracking-widest">Empty</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative flex flex-col items-center gap-2 transition-all duration-300",
      player.status === 'folded' && !showdownState && "opacity-50 grayscale",
      player.status === 'sitting_out' && "opacity-30 grayscale",
      showdownState && player.isLoser && "anim-loser",
      className
    )}>
      {player.isDealer && (
        <div className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold shadow-lg z-20 border-2 border-slate-200">
          D
        </div>
      )}

      <div className={cn(
        "relative flex justify-center -space-x-4 sm:-space-x-2 mb-[-20px] transition-all duration-300 origin-bottom",
        isSelf ? "z-50 scale-100 hover:scale-110 mb-4 cursor-pointer" : "z-10 scale-75 pointer-events-none -space-x-8"
      )}>
        {player.cards.map((card, idx) => {
          const isSelected = selectedCardIndices.includes(idx);
          const canSelect = isSelf && selectableCards;
          
          return (
            <div 
              key={idx}
              className={cn(
                "relative transition-all duration-300 origin-bottom anim-card-deal",
              )}
              style={{ 
                transform: `rotate(${(idx - (player.cards.length - 1)/2) * 10}deg) translateY(${Math.abs(idx - (player.cards.length - 1)/2) * 5}px) ${isSelected ? 'translateY(-20px) scale(1.1)' : ''}`,
                zIndex: isSelected ? 40 : 10 + idx,
                animationDelay: `${idx * 0.06}s`,
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
              />
              {canSelect && !isSelected && (
                <div className="absolute inset-0 z-50 rounded-md ring-2 ring-yellow-400/50 animate-pulse bg-yellow-400/10 pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>

      {player.score && !isSelf && showdownState && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col gap-1 w-[150px] z-50">
          {['HIGH', 'SWING', 'POKER'].includes(player.declaration || '') && player.score.high && (
             <Badge className="w-full justify-center bg-blue-600/90 text-[10px] py-1 border-blue-400">
               {['POKER', 'SUITS'].includes(player.declaration || '') ? 'Poker' : 'High'}: {player.score.high}
             </Badge>
          )}
          {['LOW', 'SWING', 'SUITS'].includes(player.declaration || '') && player.score.low && (
             <Badge className="w-full justify-center bg-purple-600/90 text-[10px] py-1 border-purple-400">
               {['POKER', 'SUITS'].includes(player.declaration || '') ? 'Suits' : 'Low'}: {player.score.low}
             </Badge>
          )}
          {player.score.description && (
             <Badge className={cn("w-full justify-center text-[10px] py-1", player.score.isValidBadugi ? "bg-green-600/90 border-green-400 text-white" : "bg-red-600/90 border-red-400 text-white")}>
               {player.score.description}
             </Badge>
          )}
        </div>
      )}

      <div className={cn(
        "relative w-full min-w-[100px] bg-slate-900 rounded-lg p-2 border-2 shadow-xl z-20 flex flex-col items-center transition-all duration-300",
        isActive ? "border-primary shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "border-slate-700",
        isSelf && !isActive ? "border-blue-500/50" : "",
        showdownState && player.isWinner && "anim-winner",
        showdownState && player.isLoser && "border-slate-800"
      )}>
        <div className="font-semibold text-sm truncate max-w-full text-white">
          {player.name}
        </div>
        <div className="text-primary font-mono text-xs flex items-center gap-1">
          <span className="opacity-70">$</span>{player.chips}
        </div>
        {showVisibleCount && player.cards.length > 0 && (() => {
          const faceUpCards = player.cards.filter(c => !c.isHidden);
          if (faceUpCards.length === 0) return null;
          const total = faceUpCards.reduce((sum, c) => sum + visibleCardValue(c.rank), 0);
          const display = total % 1 === 0 ? total.toString() : total.toFixed(1);
          return (
            <div className="text-amber-400/90 font-mono text-[10px] flex items-center gap-1 mt-0.5" data-testid={`text-visible-count-${player.id}`}>
              <span className="text-amber-400/50">showing</span>{display}
            </div>
          );
        })()}
        {player.score && isSelf && !showdownState && (
          <div className="flex flex-col gap-0.5 w-full mt-1.5 pt-1.5 border-t border-white/10">
            {player.score.high && (
              <Badge className="w-full justify-center bg-blue-600/90 text-[9px] py-0.5 border-blue-400">
                {player.score.suitsValid !== undefined ? 'Poker' : 'High'}: {player.score.high}
              </Badge>
            )}
            {player.score.low && (
              <Badge className="w-full justify-center bg-purple-600/90 text-[9px] py-0.5 border-purple-400">
                {player.score.suitsValid !== undefined ? 'Suits' : 'Low'}: {player.score.low}
              </Badge>
            )}
            {player.score.description && (
              <Badge className={cn("w-full justify-center text-[9px] py-0.5", player.score.isValidBadugi ? "bg-green-600/90 border-green-400 text-white" : "bg-red-600/90 border-red-400 text-white")}>
                {player.score.description}
              </Badge>
            )}
          </div>
        )}
        {player.score && isSelf && showdownState && (
          <div className="flex flex-col gap-0.5 w-full mt-1.5 pt-1.5 border-t border-white/10">
            {['HIGH', 'SWING', 'POKER'].includes(player.declaration || '') && player.score.high && (
              <Badge className="w-full justify-center bg-blue-600/90 text-[9px] py-0.5 border-blue-400">
                {['POKER', 'SUITS'].includes(player.declaration || '') ? 'Poker' : 'High'}: {player.score.high}
              </Badge>
            )}
            {['LOW', 'SWING', 'SUITS'].includes(player.declaration || '') && player.score.low && (
              <Badge className="w-full justify-center bg-purple-600/90 text-[9px] py-0.5 border-purple-400">
                {['POKER', 'SUITS'].includes(player.declaration || '') ? 'Suits' : 'Low'}: {player.score.low}
              </Badge>
            )}
            {player.score.description && (
              <Badge className={cn("w-full justify-center text-[9px] py-0.5", player.score.isValidBadugi ? "bg-green-600/90 border-green-400 text-white" : "bg-red-600/90 border-red-400 text-white")}>
                {player.score.description}
              </Badge>
            )}
          </div>
        )}
      </div>

      {player.declaration === 'BUST' && (
        <Badge variant="destructive" className="absolute -bottom-3 text-[10px] uppercase font-bold z-30">Bust</Badge>
      )}
      {player.declaration === 'STAY' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-bold bg-amber-600 text-white border-none shadow-sm z-30">Stay</Badge>
      )}
      {player.declaration === 'HIGH' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-bold bg-red-600 text-white border-none shadow-sm z-30">High</Badge>
      )}
      {player.declaration === 'LOW' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-bold bg-blue-600 text-white border-none shadow-sm z-30">Low</Badge>
      )}
      {player.declaration === 'SWING' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-bold bg-purple-600 text-white border-none shadow-sm z-30">Swing</Badge>
      )}
      {player.declaration === 'POKER' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-bold bg-red-600 text-white border-none shadow-sm z-30">Poker</Badge>
      )}
      {player.declaration === 'SUITS' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-bold bg-cyan-600 text-white border-none shadow-sm z-30">Suits</Badge>
      )}
      {player.status === 'folded' && !player.declaration && (
        <Badge variant="destructive" className="absolute -bottom-3 text-[10px] uppercase font-bold z-30">Folded</Badge>
      )}
      {player.status === 'sitting_out' && (
        <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-bold bg-slate-600 text-white/70 border-none z-30">Sitting Out</Badge>
      )}

      {player.bet > 0 && (
        <div className="absolute -bottom-10 flex items-center justify-center gap-1 bg-black/50 px-2 py-1 rounded-full text-xs font-mono text-white border border-white/10 anim-chip-toss">
          <div className="w-3 h-3 rounded-full bg-yellow-500 border border-yellow-300 shadow-[inset_0_-1px_3px_rgba(0,0,0,0.5)]"></div>
          {player.bet}
        </div>
      )}
    </div>
  );
}
