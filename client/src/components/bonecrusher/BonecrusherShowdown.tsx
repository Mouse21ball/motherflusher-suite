import { useEffect, useState } from 'react';
import { GameState } from '../../../../shared/gameTypes';
import { cn } from '@/lib/utils';

interface Props {
  state: GameState;
  myId: string;
  onContinue?: () => void;
}

const SUIT_EMOJI: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const RED_SUITS = new Set(['hearts', 'diamonds']);
const HOLD_MS = 6000;

export function BonecrusherShowdown({ state, myId, onContinue }: Props) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const pct = Math.min(1, (Date.now() - start) / HOLD_MS);
      setProgress(pct);
      if (pct >= 1) { clearInterval(interval); onContinue?.(); }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const hero = state.players.find(p => p.id === myId);
  const heroWon = hero?.isWinner;

  const resolutionMsgs = state.messages.filter(m => m.isResolution).slice(-5);
  const lastMsgs = state.messages.slice(-3);

  const displayMsgs = resolutionMsgs.length > 0 ? resolutionMsgs : lastMsgs;

  const winners = state.players.filter(p => p.isWinner);
  const declaredPlayers = state.players.filter(p => p.status !== 'folded' && p.declaration && p.declaration !== 'FOLD');

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#120c00] border border-amber-700/40 rounded-2xl max-w-lg w-full p-6 flex flex-col gap-4">

        {/* Header */}
        <div className="text-center">
          <div className={cn(
            'text-3xl font-black tracking-wider mb-1',
            heroWon ? 'text-amber-400' : 'text-white/50'
          )}>
            {heroWon ? '💰 WINNER!' : 'SHOWDOWN'}
          </div>
          {heroWon && hero && (
            <div className="text-amber-300 font-bold text-lg">Winner!</div>
          )}
        </div>

        {/* Declarations */}
        {declaredPlayers.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {declaredPlayers.map(p => (
              <div key={p.id} className={cn(
                'rounded-lg border p-2 text-sm',
                p.isWinner ? 'border-amber-500/50 bg-amber-900/20' : 'border-white/10 bg-white/5',
              )}>
                <div className="flex items-center gap-2">
                  {p.isWinner && <span>🏆</span>}
                  <span className="text-white/80 font-medium truncate">{p.name}</span>
                  <span className={cn('ml-auto text-xs font-black px-1.5 py-0.5 rounded',
                    p.declaration === 'HIGH' ? 'bg-amber-500/20 text-amber-300' :
                    p.declaration === 'LOW'  ? 'bg-blue-500/20 text-blue-300' :
                    'bg-purple-500/20 text-purple-300'
                  )}>{p.declaration}</span>
                </div>
                <div className="flex gap-1 flex-wrap mt-1">
                  {p.cards.map((card, i) => (
                    <div key={i} className={cn(
                      'text-[10px] font-bold px-1 py-0.5 rounded bg-white/10',
                      RED_SUITS.has(card.suit) ? 'text-red-400' : 'text-white',
                    )}>
                      {card.rank}{SUIT_EMOJI[card.suit]}
                    </div>
                  ))}
                </div>
                <div className="text-amber-400 text-xs font-bold mt-1">${p.chips.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex flex-col gap-1">
          {displayMsgs.map(msg => (
            <div key={msg.id} className="text-amber-200/80 text-sm text-center">{msg.text}</div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-75 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <button
          onClick={onContinue}
          className="bg-amber-700/30 hover:bg-amber-700/50 text-amber-300 rounded-lg py-2 text-sm font-semibold transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
