import { cn } from "@/lib/utils";
import { Player } from "@/lib/poker/types";
import { PlayingCard } from "./Card";
import { Badge } from "@/components/ui/badge";

interface PlayerSeatProps {
  player: Player | null;
  isActive?: boolean;
  isSelf?: boolean;
  seatNumber: number;
  className?: string;
  selectedCardIndices?: number[];
  onCardClick?: (index: number) => void;
  selectableCards?: boolean;
}

export function PlayerSeat({ player, isActive, isSelf, seatNumber, className, selectedCardIndices = [], onCardClick, selectableCards }: PlayerSeatProps) {
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
      player.status === 'folded' && "opacity-50 grayscale",
      className
    )}>
      {/* Dealer Button */}
      {player.isDealer && (
        <div className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold shadow-lg z-20 border-2 border-slate-200">
          D
        </div>
      )}

      {/* Cards */}
      <div className={cn(
        "relative flex justify-center -space-x-4 sm:-space-x-2 mb-[-20px] transition-all duration-300 origin-bottom",
        isSelf ? "z-50 scale-100 hover:scale-110 mb-4 cursor-pointer" : "z-10 scale-75 pointer-events-none -space-x-8"
      )}>
        {player.cards.map((card, idx) => {
          const isSelected = selectedCardIndices.includes(idx);
          const canSelect = isSelf && selectableCards && (card.isHidden || selectedCardIndices.includes(idx));
          
          return (
            <div 
              key={idx}
              className="relative transition-all duration-300 origin-bottom"
              style={{ 
                transform: `rotate(${(idx - (player.cards.length - 1)/2) * 10}deg) translateY(${Math.abs(idx - (player.cards.length - 1)/2) * 5}px) ${isSelected ? 'translateY(-20px) scale(1.1)' : ''}`,
                zIndex: isSelected ? 40 : 10 + idx
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
                selected={isSelected}
                isSelfHidden={isSelf && card.isHidden}
              />
              {canSelect && !isSelected && (
                <div className="absolute inset-0 z-50 rounded-md ring-2 ring-yellow-400/50 animate-pulse bg-yellow-400/10 pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>

      {/* Avatar & Info Container */}
      <div className={cn(
        "relative w-full min-w-[100px] bg-slate-900 rounded-lg p-2 border-2 shadow-xl z-20 flex flex-col items-center",
        isActive ? "border-primary shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "border-slate-700",
        isSelf && !isActive ? "border-blue-500/50" : ""
      )}>
        <div className="font-semibold text-sm truncate max-w-full text-white">
          {player.name}
        </div>
        <div className="text-primary font-mono text-xs flex items-center gap-1">
          <span className="opacity-70">$</span>{player.chips}
        </div>

        {/* Status/Declaration Badge */}
        {player.declaration && (
          <Badge variant="secondary" className="absolute -bottom-3 text-[10px] uppercase font-bold bg-blue-600 text-white border-none shadow-sm">
            {player.declaration}
          </Badge>
        )}
        {player.status === 'folded' && !player.declaration && (
          <Badge variant="destructive" className="absolute -bottom-3 text-[10px] uppercase font-bold">Folded</Badge>
        )}
      </div>

      {/* Current Bet */}
      {player.bet > 0 && (
        <div className="absolute -bottom-8 flex items-center justify-center gap-1 bg-black/50 px-2 py-1 rounded-full text-xs font-mono text-white border border-white/10">
          <div className="w-3 h-3 rounded-full bg-yellow-500 border border-yellow-300 shadow-[inset_0_-1px_3px_rgba(0,0,0,0.5)]"></div>
          {player.bet}
        </div>
      )}
    </div>
  );
}