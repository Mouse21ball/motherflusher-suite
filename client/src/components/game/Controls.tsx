import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { GamePhase } from "@/lib/poker/types";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface ActionControlsProps {
  phase: GamePhase;
  currentBet: number;
  myBet: number;
  pot: number;
  chips: number;
  onAction: (action: string, payload?: any) => void;
  isMyTurn: boolean;
  selectedCardsCount: number;
}

export function ActionControls({ phase, currentBet, myBet, pot, chips, onAction, isMyTurn, selectedCardsCount }: ActionControlsProps) {
  const [betAmount, setBetAmount] = useState<number>(Math.max(currentBet - myBet, 2));
  
  const callAmount = currentBet - myBet;
  const canCheck = callAmount === 0;
  const maxBet = Math.min(chips, pot + callAmount * 2); // Pot limit simplified

  if (!isMyTurn) {
    return (
      <div className="w-full max-w-md mx-auto p-4 bg-black/40 backdrop-blur-md rounded-t-2xl border-t border-white/10 flex items-center justify-center min-h-[100px]">
        <span className="text-white/50 text-sm font-mono animate-pulse">Waiting for other players...</span>
      </div>
    );
  }

  if (phase === 'WAITING') {
    return (
      <div className="w-full max-w-md mx-auto p-4 bg-black/40 backdrop-blur-md rounded-t-2xl border-t border-white/10 flex justify-center">
        <Button size="lg" onClick={() => onAction('start')} className="w-full sm:w-auto font-bold tracking-widest uppercase">
          Start Game
        </Button>
      </div>
    );
  }

  if (phase === 'ANTE') {
    return (
      <div className="w-full max-w-md mx-auto p-4 bg-black/40 backdrop-blur-md rounded-t-2xl border-t border-white/10 flex justify-center">
        <Button size="lg" onClick={() => onAction('ante')} className="w-full sm:w-auto font-bold uppercase">
          Pay Ante ($1)
        </Button>
      </div>
    );
  }

  if (phase === 'DECLARE') {
    return (
      <div className="w-full max-w-md mx-auto p-4 bg-black/40 backdrop-blur-md rounded-t-2xl border-t border-white/10">
        <div className="text-center text-sm font-mono text-white/70 mb-4 animate-bounce">DECLARE YOUR INTENT</div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="border-red-500/50 hover:bg-red-500/20 text-red-100" onClick={() => onAction('declare', 1)}>HIGH</Button>
          <Button variant="outline" className="border-purple-500/50 hover:bg-purple-500/20 text-purple-100" onClick={() => onAction('declare', 3)}>SWING</Button>
          <Button variant="outline" className="border-blue-500/50 hover:bg-blue-500/20 text-blue-100" onClick={() => onAction('declare', 2)}>LOW</Button>
        </div>
      </div>
    );
  }

  if (phase === 'DRAW') {
    return (
      <div className="w-full max-w-md mx-auto p-4 bg-black/40 backdrop-blur-md rounded-t-2xl border-t border-white/10 text-center">
        <div className="text-sm font-mono text-white/70 mb-4">SELECT UP TO 2 CARDS TO DISCARD ({selectedCardsCount}/2)</div>
        <Button onClick={() => onAction('draw')} size="lg" className="w-full sm:w-auto" variant={selectedCardsCount > 0 ? "default" : "secondary"}>
          {selectedCardsCount > 0 ? `Discard ${selectedCardsCount} Cards` : 'Stand Pat (Keep All)'}
        </Button>
      </div>
    );
  }

  if (phase.startsWith('REVEAL')) {
     return (
      <div className="w-full max-w-md mx-auto p-4 bg-black/40 backdrop-blur-md rounded-t-2xl border-t border-white/10 text-center">
        <div className="text-sm font-mono text-white/70 mb-4">SELECT A HIDDEN CARD TO REVEAL</div>
        <Button onClick={() => onAction('reveal')} size="lg" className="w-full sm:w-auto" disabled={selectedCardsCount !== 1}>
          {selectedCardsCount === 1 ? 'Reveal Selected Card' : 'Waiting for selection...'}
        </Button>
      </div>
    );
  }

  if (phase === 'SHOWDOWN') {
    return (
      <div className="w-full max-w-md mx-auto p-4 bg-black/40 backdrop-blur-md rounded-t-2xl border-t border-white/10 flex justify-center">
        <Button size="lg" onClick={() => onAction('restart')} className="w-full sm:w-auto font-bold uppercase">
          Next Hand
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-slate-900/90 backdrop-blur-md rounded-t-3xl border-t border-slate-700/50 shadow-2xl">
      <div className="flex justify-between items-center mb-4 px-2">
        <Badge variant="outline" className="bg-black/50 font-mono">Pot: ${pot}</Badge>
        <Badge variant="outline" className="bg-black/50 font-mono">To Call: ${callAmount}</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Button 
          variant="destructive" 
          className="bg-red-500/20 text-red-400 hover:bg-red-500/40 border-0"
          onClick={() => onAction('fold')}
        >
          Fold
        </Button>
        
        <Button 
          variant="secondary"
          className="bg-slate-800 text-white hover:bg-slate-700 border-0"
          onClick={() => onAction(canCheck ? 'check' : 'call')}
        >
          {canCheck ? 'Check' : `Call $${callAmount}`}
        </Button>

        <div className="col-span-2 flex gap-2">
          <Button 
            className="flex-1 font-bold"
            onClick={() => onAction('raise', betAmount)}
            disabled={betAmount < (callAmount > 0 ? callAmount * 2 : 2)}
          >
            {callAmount > 0 ? 'Raise' : 'Bet'} ${betAmount}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 px-2">
        <span className="text-xs font-mono text-slate-400 min-w-[30px]">${callAmount > 0 ? callAmount * 2 : 2}</span>
        <Slider 
          value={[betAmount]} 
          min={callAmount > 0 ? callAmount * 2 : 2} 
          max={maxBet} 
          step={1}
          onValueChange={(val) => setBetAmount(val[0])}
          className="flex-1"
        />
        <span className="text-xs font-mono text-slate-400 min-w-[40px]">${maxBet}</span>
      </div>
    </div>
  );
}