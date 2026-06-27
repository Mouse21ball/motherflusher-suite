import { GameState, Player, CardType } from '../../../../shared/gameTypes';
import { cn } from '@/lib/utils';

interface Props {
  state: GameState;
  myId: string;
  selectedCards: Set<number>;
  onCardClick: (idx: number) => void;
  phase?: string;
  flippedByHero?: Set<number>;
}

const SUIT_EMOJI: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};
const RED_SUITS = new Set(['hearts', 'diamonds']);

function isRed(suit: string) { return RED_SUITS.has(suit); }

function CardFace({ card, size = 'md' }: { card: CardType; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-8 h-11 text-xs' : size === 'lg' ? 'w-14 h-20 text-base' : 'w-11 h-16 text-sm';
  const red = isRed(card.suit);
  return (
    <div className={cn('rounded-lg border border-white/20 bg-[#1a1208] flex flex-col justify-between p-1 select-none', sizeClass)}>
      <span className={cn('font-bold leading-none', red ? 'text-red-400' : 'text-white')}>{card.rank}</span>
      <span className={cn('text-center leading-none', red ? 'text-red-400' : 'text-white', size === 'sm' ? 'text-lg' : 'text-2xl')}>{SUIT_EMOJI[card.suit]}</span>
    </div>
  );
}

function CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-8 h-11' : size === 'lg' ? 'w-14 h-20' : 'w-11 h-16';
  return (
    <div className={cn('rounded-lg border border-amber-700/40 bg-gradient-to-br from-amber-900 to-[#0a0702] flex items-center justify-center select-none', sizeClass)}>
      <span className="text-amber-600/60 text-lg">🦴</span>
    </div>
  );
}

function OpponentPanel({ player, pub }: { player: Player; pub: number[] }) {
  const cardCount = Math.max(player.cards.length, 1);
  const isActive = player.status === 'active';
  const isFolded = player.status === 'folded';

  return (
    <div className={cn(
      'rounded-xl border p-2 flex flex-col gap-1 min-w-[120px]',
      isFolded ? 'border-white/10 bg-white/5 opacity-40' : 'border-amber-700/30 bg-[#1a1000]/80',
    )}>
      <div className="flex items-center gap-1">
        <div className={cn('w-2 h-2 rounded-full', isActive ? 'bg-amber-400' : 'bg-white/20')} />
        <span className="text-white/80 text-xs font-medium truncate max-w-[80px]">{player.name}</span>
        {player.declaration && (
          <span className={cn('text-[10px] font-bold ml-auto px-1 rounded',
            player.declaration === 'HIGH' ? 'bg-amber-500/30 text-amber-300' :
            player.declaration === 'LOW'  ? 'bg-blue-500/30 text-blue-300' :
            'bg-purple-500/30 text-purple-300'
          )}>{player.declaration}</span>
        )}
      </div>
      <div className="text-amber-400 text-xs font-bold">${player.chips.toLocaleString()}</div>
      {player.bet > 0 && <div className="text-amber-200/60 text-[10px]">bet ${player.bet}</div>}
      <div className="flex gap-0.5 flex-wrap mt-1">
        {player.cards.map((card, i) => {
          const isPublic = pub.includes(i);
          return !card.isHidden && isPublic
            ? <CardFace key={i} card={card} size="sm" />
            : <CardBack key={i} size="sm" />;
        })}
        {player.cards.length === 0 && Array.from({ length: cardCount }).map((_, i) => <CardBack key={i} size="sm" />)}
      </div>
    </div>
  );
}

export function BonecrusherTable({ state, myId, selectedCards, onCardClick, phase, flippedByHero = new Set() }: Props) {
  const { players } = state;
  const opponents = players.filter(p => p.id !== myId);
  const hero = players.find(p => p.id === myId);

  const isDiscardPhase = phase === 'DISCARD_2' || phase === 'SELECT_5';
  const isFlipPhase    = phase === 'REVEAL_1' || (phase?.startsWith('FLIP_') ?? false);

  const phaseLabel = (() => {
    if (!phase) return '';
    if (phase === 'DISCARD_2') return 'Discard 2 Cards';
    if (phase === 'REVEAL_1') return 'Reveal 1 Card (face up)';
    if (phase === 'SELECT_5') return 'Select Your Best 5 (discard 2)';
    if (phase?.startsWith('FLIP_')) return `Flip a Card Face Up`;
    if (phase?.startsWith('BET')) return 'Place Your Bet';
    if (phase === 'DECLARE') return 'Declare HIGH, LOW, or SWING';
    return phase.replace(/_/g, ' ');
  })();

  const discardMax = phase === 'DISCARD_2' ? 2 : phase === 'SELECT_5' ? 2 : 0;
  const flipMax    = phase === 'REVEAL_1' || phase?.startsWith('FLIP_') ? 1 : 0;

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Opponents grid */}
      <div className="flex flex-wrap justify-center gap-2 w-full">
        {opponents.map(op => (
          <OpponentPanel key={op.id} player={op} pub={[]} />
        ))}
      </div>

      {/* Center info */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-amber-400/60 text-xs uppercase tracking-widest">Pot</div>
          <div className="text-amber-300 text-2xl font-black">${state.pot.toLocaleString()}</div>
        </div>
        {state.currentBet > 0 && (
          <div className="text-center">
            <div className="text-amber-400/60 text-xs uppercase tracking-widest">Bet</div>
            <div className="text-amber-200 text-lg font-bold">${state.currentBet}</div>
          </div>
        )}
      </div>

      {/* Phase label */}
      {phaseLabel && (
        <div className="text-amber-300/80 text-sm font-semibold tracking-wide text-center">
          {phaseLabel}
          {isDiscardPhase && discardMax > 0 && (
            <span className="ml-2 text-amber-500/60 font-normal">({selectedCards.size}/{discardMax} selected)</span>
          )}
        </div>
      )}

      {/* Hero cards */}
      {hero && (
        <div className="flex gap-2 flex-wrap justify-center">
          {hero.cards.map((card, i) => {
            const isSelected = selectedCards.has(i);
            const isTableFaceUp = flippedByHero.has(i);
            const clickable = (isDiscardPhase && discardMax > 0) || (isFlipPhase && flipMax > 0 && !isTableFaceUp);

            return (
              <button
                key={i}
                onClick={() => clickable && onCardClick(i)}
                disabled={!clickable}
                className={cn(
                  'relative rounded-xl transition-all duration-200',
                  clickable ? 'cursor-pointer hover:scale-105' : 'cursor-default',
                  isSelected && isDiscardPhase ? 'ring-2 ring-red-400 -translate-y-2 opacity-70' : '',
                  isFlipPhase && !isTableFaceUp && !isSelected ? 'ring-1 ring-amber-500/50 hover:ring-amber-400' : '',
                  isTableFaceUp && isFlipPhase ? 'opacity-70' : '',
                )}
              >
                {!card.isHidden ? (
                  <CardFace card={card} size="lg" />
                ) : (
                  <CardBack size="lg" />
                )}
                {isSelected && isDiscardPhase && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-red-900/60">
                    <span className="text-red-300 text-xs font-bold">DISCARD</span>
                  </div>
                )}
                {isFlipPhase && isTableFaceUp && (
                  <div className="absolute bottom-0 left-0 right-0 text-center text-[9px] text-amber-400/80 bg-black/60 rounded-b-xl py-0.5">REVEALED</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Hero bet / status */}
      {hero && hero.bet > 0 && (
        <div className="text-amber-300/60 text-xs">Your bet: ${hero.bet}</div>
      )}
    </div>
  );
}
