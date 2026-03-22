import { cn } from "@/lib/utils";
import { CardType } from "@/lib/poker/types";
import { getDeckThemeClass, getDeckTheme } from "@/lib/deckTheme";

interface CardProps {
  card?: CardType;
  className?: string;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
}

const suitSymbols: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠"
};

export function PlayingCard({ card, className, onClick, selectable, selected, isSelfHidden }: CardProps & { isSelfHidden?: boolean }) {
  if (!card || (card.isHidden && !isSelfHidden)) {
    const themeClass = getDeckThemeClass(getDeckTheme());
    return (
      <div
        className={cn(
          themeClass,
          "w-12 h-16 sm:w-16 sm:h-24 playing-card-back rounded-lg shrink-0 transition-all duration-300",
          selectable && "cursor-pointer active:scale-[0.97]",
          selected && "card-selected",
          className
        )}
        onClick={onClick}
      />
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const colorClass = isRed ? "text-red-600" : "text-[#1a1a24]";
  const suitClass  = isRed ? "text-red-500" : "text-[#2a2a34]";

  return (
    <div
      className={cn(
        "w-12 h-16 sm:w-16 sm:h-24 playing-card-front shrink-0 relative overflow-hidden transition-shadow duration-200",
        selectable && "cursor-pointer active:scale-[0.97]",
        selected && "card-selected",
        isSelfHidden && "opacity-55 saturate-[0.4]",
        className
      )}
      onClick={onClick}
    >
      {/* Top-left index */}
      <div className="absolute top-[3px] left-[3px] sm:top-[4px] sm:left-[4px] flex flex-col items-center leading-none">
        <span className={cn("text-[10px] sm:text-[13px] font-extrabold leading-none", colorClass)}>
          {card.rank}
        </span>
        <span className={cn("text-[9px] sm:text-[11px] leading-none", suitClass)}>
          {suitSymbols[card.suit]}
        </span>
      </div>

      {/* Center pip */}
      <div className={cn(
        "absolute inset-0 flex items-center justify-center text-2xl sm:text-[2rem] leading-none select-none",
        isRed ? "drop-shadow-[0_0_1px_rgba(220,38,38,0.15)]" : ""
      )}>
        {suitSymbols[card.suit]}
      </div>

      {/* Bottom-right index — rotated 180° so it reads upside-down like a real card */}
      <div className="absolute bottom-[3px] right-[3px] sm:bottom-[4px] sm:right-[4px] flex flex-col items-center leading-none rotate-180">
        <span className={cn("text-[10px] sm:text-[13px] font-extrabold leading-none", colorClass)}>
          {card.rank}
        </span>
        <span className={cn("text-[9px] sm:text-[11px] leading-none", suitClass)}>
          {suitSymbols[card.suit]}
        </span>
      </div>
    </div>
  );
}
