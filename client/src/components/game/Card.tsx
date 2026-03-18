import { cn } from "@/lib/utils";
import { CardType } from "@/lib/poker/types";

interface CardProps {
  card?: CardType;
  className?: string;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
}

const suitColors: Record<string, string> = {
  hearts: "text-red-600",
  diamonds: "text-red-500",
  clubs: "text-[#1a1a24]",
  spades: "text-[#1a1a24]"
};

const suitSymbols: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠"
};

export function PlayingCard({ card, className, onClick, selectable, selected, isSelfHidden }: CardProps & { isSelfHidden?: boolean }) {
  if (!card || (card.isHidden && !isSelfHidden)) {
    return (
      <div 
        className={cn(
          "w-12 h-16 sm:w-16 sm:h-24 playing-card-back rounded-lg shrink-0 transition-shadow duration-200",
          selectable && "cursor-pointer active:scale-[0.97]",
          selected && "card-selected",
          className
        )}
        onClick={onClick}
      />
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div 
      className={cn(
        "w-12 h-16 sm:w-16 sm:h-24 playing-card-front shrink-0 flex flex-col justify-between relative transition-shadow duration-200",
        suitColors[card.suit],
        selectable && "cursor-pointer active:scale-[0.97]",
        selected && "card-selected",
        isSelfHidden && "opacity-55 saturate-[0.4]",
        className
      )}
      onClick={onClick}
    >
      <div className="flex flex-col items-start leading-none gap-px">
        <span className={cn("text-[11px] sm:text-sm font-extrabold", isRed ? "text-red-600" : "text-[#1a1a24]")}>
          {card.rank}
        </span>
        <span className={cn("text-[10px] sm:text-xs", isRed ? "text-red-500" : "text-[#2a2a34]")}>
          {suitSymbols[card.suit]}
        </span>
      </div>
      <div className={cn(
        "text-2xl sm:text-[2rem] text-center leading-none flex-1 flex items-center justify-center",
        isRed ? "drop-shadow-[0_0_1px_rgba(220,38,38,0.15)]" : ""
      )}>
        {suitSymbols[card.suit]}
      </div>
      <div className="flex flex-col items-end leading-none gap-px rotate-180">
        <span className={cn("text-[11px] sm:text-sm font-extrabold", isRed ? "text-red-600" : "text-[#1a1a24]")}>
          {card.rank}
        </span>
        <span className={cn("text-[10px] sm:text-xs", isRed ? "text-red-500" : "text-[#2a2a34]")}>
          {suitSymbols[card.suit]}
        </span>
      </div>
    </div>
  );
}
