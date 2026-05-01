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

/* ── Proper SVG suit icons — no Unicode symbols ─────────────────────────── */
function SuitIcon({ suit, size = 24 }: { suit: string; size?: number }) {
  const red = '#CC1122';
  const blk = '#18181E';

  if (suit === 'hearts') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 90" fill={red} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M50,83 C50,83 4,51 4,27 C4,10 17,2 31,7 C40,10 50,22 50,22 C50,22 60,10 69,7 C83,2 96,10 96,27 C96,51 50,83 50,83Z" />
      </svg>
    );
  }
  if (suit === 'diamonds') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" fill={red} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M50,4 L96,50 L50,96 L4,50Z" />
      </svg>
    );
  }
  if (suit === 'clubs') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" fill={blk} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="50" cy="32" r="22" />
        <circle cx="26" cy="62" r="22" />
        <circle cx="74" cy="62" r="22" />
        <rect x="43" y="70" width="14" height="20" rx="2" />
        <rect x="32" y="86" width="36" height="10" rx="5" />
      </svg>
    );
  }
  /* spades */
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill={blk} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M50,5 L80,44 C87,53 83,65 73,65 C65,65 58,59 55,52 C58,64 54,73 50,73 C46,73 42,64 45,52 C42,59 35,65 27,65 C17,65 13,53 20,44 Z" />
      <rect x="43" y="73" width="14" height="20" rx="2" />
      <rect x="32" y="89" width="36" height="10" rx="5" />
    </svg>
  );
}

/* Small corner suit (tight space) — scales with sm: breakpoint */
function SmallSuit({ suit }: { suit: string }) {
  return <span className="card-corner-suit"><SuitIcon suit={suit} size={13} /></span>;
}

const isRedSuit = (suit: string) => suit === 'hearts' || suit === 'diamonds';

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

  const isRed = isRedSuit(card.suit);
  const rankColor = isRed ? '#CC1122' : '#18181E';

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
      {/* Glossy top-edge highlight */}
      <div className="card-inner-highlight" />

      {/* Top-left index */}
      <div className="absolute top-[3px] left-[3px] sm:top-[4px] sm:left-[4px] flex flex-col items-center leading-none gap-[1px]">
        <span className="card-rank-text" style={{ color: rankColor }}>
          {card.rank}
        </span>
        <SmallSuit suit={card.suit} />
      </div>

      {/* Center pip — CSS constrains to 52% of card width */}
      <div className="absolute inset-0 flex items-center justify-center card-center-pip">
        <SuitIcon suit={card.suit} size={99} />
      </div>

      {/* Bottom-right index — rotated 180° */}
      <div className="absolute bottom-[3px] right-[3px] sm:bottom-[4px] sm:right-[4px] flex flex-col items-center leading-none gap-[1px] rotate-180">
        <span className="card-rank-text" style={{ color: rankColor }}>
          {card.rank}
        </span>
        <SmallSuit suit={card.suit} />
      </div>
    </div>
  );
}
