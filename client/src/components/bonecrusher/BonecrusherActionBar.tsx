import { cn } from '@/lib/utils';

interface Props {
  phase: string;
  chips: number;
  currentBet: number;
  myBet: number;
  pot: number;
  minBet: number;
  selectedCards: Set<number>;
  flipCount: number;
  declaration: string | null;
  isMyTurn: boolean;
  onAnte: () => void;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: (amount: number) => void;
  onDiscard: () => void;
  onFlip: () => void;
  onDeclare: (d: 'HIGH' | 'LOW' | 'SWING') => void;
}

export function BonecrusherActionBar({
  phase, chips, currentBet, myBet, pot, minBet, selectedCards, flipCount, declaration, isMyTurn,
  onAnte, onFold, onCheck, onCall, onRaise, onDiscard, onFlip, onDeclare,
}: Props) {
  const callAmount = Math.max(0, currentBet - myBet);

  const btnBase = 'px-4 py-2 rounded-lg font-bold text-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';

  if (phase === 'ANTE') {
    return (
      <div className="flex gap-3 justify-center">
        <button onClick={onAnte} className={cn(btnBase, 'bg-amber-600 hover:bg-amber-500 text-white')}>
          Pay $25 Ante
        </button>
      </div>
    );
  }

  if (phase === 'DISCARD_2') {
    const ready = selectedCards.size === 2;
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-amber-300/70 text-xs">Select exactly 2 cards to permanently discard</p>
        <div className="flex gap-3">
          <button onClick={onFold} className={cn(btnBase, 'bg-white/10 hover:bg-white/20 text-white/70')}>
            Fold
          </button>
          <button
            onClick={onDiscard}
            disabled={!ready}
            className={cn(btnBase, ready ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-white/10 text-white/40')}
          >
            Discard {selectedCards.size}/2
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'REVEAL_1') {
    const ready = selectedCards.size === 1;
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-amber-300/70 text-xs">Tap a card to reveal it face-up to all players</p>
        <div className="flex gap-3">
          <button
            onClick={onFlip}
            disabled={!ready}
            className={cn(btnBase, ready ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-white/10 text-white/40')}
          >
            {ready ? 'Reveal Card' : 'Select a card'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'SELECT_5') {
    const ready = selectedCards.size === 2;
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-amber-300/70 text-xs">Select 2 cards to discard — keep your best 5</p>
        <div className="flex gap-3">
          <button onClick={onFold} className={cn(btnBase, 'bg-white/10 hover:bg-white/20 text-white/70')}>
            Fold
          </button>
          <button
            onClick={onDiscard}
            disabled={!ready}
            className={cn(btnBase, ready ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-white/10 text-white/40')}
          >
            Discard {selectedCards.size}/2
          </button>
        </div>
      </div>
    );
  }

  if (phase?.startsWith('FLIP_')) {
    const ready = selectedCards.size === 1;
    const flipNum = parseInt(phase.split('_')[1], 10);
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-amber-300/70 text-xs">Flip card {flipNum} face-up (4 total — one remains hidden)</p>
        <div className="flex gap-3">
          <button
            onClick={onFlip}
            disabled={!ready}
            className={cn(btnBase, ready ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-white/10 text-white/40')}
          >
            {ready ? 'Flip Card' : 'Select a card to flip'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'DECLARE') {
    if (declaration) {
      return (
        <div className="text-amber-300/70 text-sm font-semibold">
          You declared <span className={cn('font-black',
            declaration === 'HIGH' ? 'text-amber-400' :
            declaration === 'LOW'  ? 'text-blue-400'  : 'text-purple-400'
          )}>{declaration}</span> — waiting for others…
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-amber-300/70 text-xs">Declare your hand direction</p>
        <div className="flex gap-3">
          <button onClick={() => onDeclare('HIGH')} className={cn(btnBase, 'bg-amber-600 hover:bg-amber-500 text-white')}>
            HIGH 👑
          </button>
          <button onClick={() => onDeclare('LOW')} className={cn(btnBase, 'bg-blue-700 hover:bg-blue-600 text-white')}>
            LOW 🎯
          </button>
          <button onClick={() => onDeclare('SWING')} className={cn(btnBase, 'bg-purple-700 hover:bg-purple-600 text-white')}>
            SWING ⚡
          </button>
        </div>
        <p className="text-white/40 text-[10px]">SWING = must win both HIGH & LOW — or get nothing</p>
      </div>
    );
  }

  if (phase?.startsWith('BET')) {
    const canCheck = callAmount === 0;
    const raiseAmounts = [
      Math.max(minBet, currentBet * 2 || minBet),
      Math.max(minBet, Math.floor(pot * 0.5)),
      Math.max(minBet, pot),
    ].map(a => Math.min(a, chips + myBet)).filter((a, i, arr) => arr.indexOf(a) === i && a > currentBet);

    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-2 flex-wrap justify-center">
          <button onClick={onFold} className={cn(btnBase, 'bg-white/10 hover:bg-white/20 text-white/70')}>
            Fold
          </button>
          {canCheck ? (
            <button onClick={onCheck} className={cn(btnBase, 'bg-white/15 hover:bg-white/25 text-white')}>
              Check
            </button>
          ) : (
            <button
              onClick={onCall}
              disabled={chips === 0}
              className={cn(btnBase, 'bg-amber-700 hover:bg-amber-600 text-white')}
            >
              Call ${callAmount}
            </button>
          )}
          {raiseAmounts.slice(0, 3).map(amt => (
            <button
              key={amt}
              onClick={() => onRaise(amt)}
              disabled={chips === 0}
              className={cn(btnBase, 'bg-amber-500 hover:bg-amber-400 text-black font-black')}
            >
              Raise ${amt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
