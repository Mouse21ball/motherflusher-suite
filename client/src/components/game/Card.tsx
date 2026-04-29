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
          "w-12 h-16 sm:w-16 sm:h-24 playing-card-back rounded-xl shrink-0 transition-all duration-300",
          selectable && "cursor-pointer active:scale-[0.97]",
          selected && "card-selected",
          className
        )}
        onClick={onClick}
      />
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const colorClass = isRed ? "card-rank-red" : "card-rank-black";
  const suitClass  = isRed ? "card-suit-red" : "card-suit-black";

  return (
    <div
      className={cn(
        "w-12 h-16 sm:w-16 sm:h-24 playing-card-front shrink-0 relative overflow-hidden transition-all duration-200",
        selectable && "cursor-pointer active:scale-[0.97]",
        selected && "card-selected",
        isSelfHidden && "opacity-55 saturate-[0.4]",
        className
      )}
      onClick={onClick}
    >
      {/* Inner highlight — glossy top edge */}
      <div className="card-inner-highlight" />

      {/* Top-left index */}
      <div className="absolute top-[3px] left-[3px] sm:top-[5px] sm:left-[4px] flex flex-col items-center leading-none">
        <span className={cn("text-[11px] sm:text-[15px] font-black leading-none tracking-tight", colorClass)}>
          {card.rank}
        </span>
        <span className={cn("text-[10px] sm:text-[13px] leading-none font-bold", suitClass)}>
          {suitSymbols[card.suit]}
        </span>
      </div>

      {/* Center pip — large suit icon */}
      <div className={cn(
        "absolute inset-0 flex items-center justify-center select-none card-center-pip",
        isRed ? "card-center-red" : "card-center-black"
      )}>
        {suitSymbols[card.suit]}
      </div>

      {/* Bottom-right index — rotated 180° */}
      <div className="absolute bottom-[3px] right-[3px] sm:bottom-[5px] sm:right-[4px] flex flex-col items-center leading-none rotate-180">
        <span className={cn("text-[11px] sm:text-[15px] font-black leading-none tracking-tight", colorClass)}>
          {card.rank}
        </span>
        <span className={cn("text-[10px] sm:text-[13px] leading-none font-bold", suitClass)}>
          {suitSymbols[card.suit]}
        </span>
      </div>
    </div>
  );
}
