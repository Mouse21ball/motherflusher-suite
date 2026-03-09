import { cn } from "@/lib/utils";
import { CardType } from "@/lib/poker/types";

interface CardProps {
  card?: CardType;
  className?: string;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
}

const suitColors = {
  hearts: "text-red-500",
  diamonds: "text-red-500",
  clubs: "text-slate-800",
  spades: "text-slate-800"
};

const suitSymbols = {
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
          "w-12 h-16 sm:w-16 sm:h-24 playing-card-back rounded-md shrink-0 transition-transform",
          selectable && "cursor-pointer hover:-translate-y-2",
          selected && "-translate-y-4 ring-2 ring-primary",
          className
        )}
        onClick={onClick}
      />
    );
  }

  return (
    <div 
      className={cn(
        "w-12 h-16 sm:w-16 sm:h-24 playing-card-front shrink-0 transition-transform flex flex-col justify-between",
        suitColors[card.suit],
        selectable && "cursor-pointer hover:-translate-y-2",
        selected && "-translate-y-4 ring-2 ring-primary ring-offset-2 ring-offset-slate-900",
        isSelfHidden && "opacity-60 saturate-50 shadow-inner",
        className
      )}
      onClick={onClick}
    >
      <div className="text-[10px] sm:text-sm leading-none font-bold">{card.rank}</div>
      <div className="text-xl sm:text-3xl text-center leading-none flex-1 flex items-center justify-center">{suitSymbols[card.suit]}</div>
      <div className="text-[10px] sm:text-sm leading-none font-bold text-right rotate-180">{card.rank}</div>
    </div>
  );
}