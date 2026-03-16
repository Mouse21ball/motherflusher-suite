import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { GamePhase, Declaration } from "@/lib/poker/types";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { sfx } from "@/lib/sounds";

interface DeclarationOption {
  label: string;
  value: Declaration;
  className: string;
}

interface ActionControlsProps {
  phase: GamePhase;
  currentBet: number;
  myBet: number;
  pot: number;
  chips: number;
  onAction: (action: string, payload?: any) => void;
  isMyTurn: boolean;
  selectedCardsCount: number;
  declarationOptions?: DeclarationOption[];
  phaseHint?: string;
}

const defaultDeclarationOptions: DeclarationOption[] = [
  { label: 'HIGH', value: 'HIGH', className: 'border-red-600/40 hover:bg-red-600/15 text-red-200' },
  { label: 'SWING', value: 'SWING', className: 'border-purple-600/40 hover:bg-purple-600/15 text-purple-200' },
  { label: 'LOW', value: 'LOW', className: 'border-blue-600/40 hover:bg-blue-600/15 text-blue-200' },
];

export function ActionControls({ phase, currentBet, myBet, pot, chips, onAction, isMyTurn, selectedCardsCount, declarationOptions, phaseHint }: ActionControlsProps) {
  const [betAmount, setBetAmount] = useState<number>(Math.max(currentBet - myBet, 2));
  const [pendingDeclaration, setPendingDeclaration] = useState<Declaration>(null);
  
  const callAmount = currentBet - myBet;
  const canCheck = callAmount === 0;
  const maxBet = Math.min(chips, pot + callAmount * 2);

  useEffect(() => {
    if (phase !== 'DECLARE_AND_BET' && phase !== 'DECLARE') {
      setPendingDeclaration(null);
    }
    setBetAmount(Math.max(callAmount > 0 ? callAmount * 2 : 2, 2));
  }, [phase, callAmount]);

  if (phase === 'SHOWDOWN') {
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] flex flex-col items-center gap-2.5">
        <Button size="lg" onClick={() => onAction('restart')} className="w-full sm:w-auto font-semibold uppercase tracking-wide" data-testid="button-next-hand">
          Next Hand
        </Button>
        {chips <= 0 && (
          <Button size="sm" variant="outline" onClick={() => onAction('rebuy')} className="text-xs font-mono uppercase tracking-wider border-white/[0.08] text-white/50 hover:text-white/70" data-testid="button-rebuy">
            Rebuy $1000
          </Button>
        )}
      </div>
    );
  }

  if (phase === 'REVEAL_TOP_ROW' || phase === 'REVEAL_SECOND_ROW' || phase === 'REVEAL_FACTOR_CARD' || phase === 'REVEAL_LOWER_CENTER') {
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] text-center">
        <div className="text-sm font-mono text-[#C9A227]/70 mb-4 animate-pulse font-medium tracking-wide">REVEALING CARDS</div>
      </div>
    );
  }

  if (phase === 'DEAL') {
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] text-center">
        <div className="text-sm font-mono text-[#C9A227]/70 mb-4 animate-pulse font-medium tracking-wide">DEALING</div>
      </div>
    );
  }

  if (!isMyTurn) {
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] flex items-center justify-center min-h-[100px]">
        <span className="text-white/30 text-sm font-mono animate-pulse">Waiting for other players</span>
      </div>
    );
  }

  if (phase === 'WAITING') {
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] flex flex-col items-center gap-3">
        {chips <= 0 && (
          <Button size="sm" variant="outline" onClick={() => onAction('rebuy')} className="text-xs font-mono uppercase tracking-wider border-white/[0.08] text-white/50" data-testid="button-rebuy-waiting">
            Rebuy $1000
          </Button>
        )}
        <Button size="lg" onClick={() => onAction('start')} className="w-full sm:w-auto font-semibold tracking-widest uppercase" disabled={chips <= 0}>
          Deal Me In
        </Button>
        <p className="text-[10px] text-white/30 font-mono">$1 ante</p>
      </div>
    );
  }

  if (phase === 'ANTE') {
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] flex justify-center">
        <Button size="lg" onClick={() => { sfx.chipClink(); onAction('ante'); }} className="w-full sm:w-auto font-semibold uppercase">
          Pay Ante ($1)
        </Button>
      </div>
    );
  }

  const hintEl = phaseHint ? (
    <div className="text-xs text-[#C9A227]/70 text-center mb-2 leading-snug font-mono" data-testid="text-phase-hint">{phaseHint}</div>
  ) : null;

  const isHitPhase = phase.startsWith('HIT_');
  if (isHitPhase) {
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] text-center">
        {hintEl}
        <div className="text-sm font-mono text-white/40 mb-4 tracking-wide">HIT, STAY, OR FOLD</div>
        <div className="grid grid-cols-3 gap-2.5">
          <Button
            variant="destructive"
            className="bg-red-600/15 text-red-400/80 hover:bg-red-600/25 border-0"
            onClick={() => { sfx.fold(); onAction('fold'); }}
            data-testid="button-fold"
          >
            Fold
          </Button>
          <Button
            variant="secondary"
            className="bg-[#1C1C20] text-white/80 hover:bg-[#242428] border-0"
            onClick={() => { sfx.check(); onAction('stay'); }}
            data-testid="button-stay"
          >
            Stay
          </Button>
          <Button
            className="font-semibold"
            onClick={() => { sfx.cardDeal(); onAction('hit'); }}
            data-testid="button-hit"
          >
            Hit
          </Button>
        </div>
      </div>
    );
  }

  const isDrawPhase = phase === 'DRAW' || phase === 'DRAW_1' || phase === 'DRAW_2' || phase === 'DRAW_3';
  if (isDrawPhase) {
    let maxDiscards = 2;
    if (phase === 'DRAW_1') maxDiscards = 3;
    if (phase === 'DRAW_2') maxDiscards = 2;
    if (phase === 'DRAW_3') maxDiscards = 1;

    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] text-center">
        {hintEl}
        <div className="text-sm font-mono text-white/40 mb-4 tracking-wide">SELECT UP TO {maxDiscards} TO DISCARD ({selectedCardsCount}/{maxDiscards})</div>
        <Button onClick={() => { if (selectedCardsCount > 0) sfx.cardFlip(); else sfx.check(); onAction('draw'); }} size="lg" className="w-full sm:w-auto" variant={selectedCardsCount > 0 ? "default" : "secondary"}>
          {selectedCardsCount > 0 ? `Discard ${selectedCardsCount}` : 'Stand Pat'}
        </Button>
      </div>
    );
  }


  if (phase === 'DECLARE_AND_BET' && !pendingDeclaration) {
    const declOpts = declarationOptions || defaultDeclarationOptions;
    const isAllIn = chips <= 0;
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06]">
        {hintEl}
        <div className="text-center text-sm font-mono text-white/40 mb-4 tracking-wide">
          {isAllIn ? "ALL-IN \u2014 DECLARE" : "STEP 1: DECLARE"}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {declOpts.map(opt => (
            <Button key={opt.value} variant="outline" className={opt.className} onClick={() => {
              sfx.declare();
              if (isAllIn) {
                onAction('declare_and_bet', { declaration: opt.value, action: 'check', amount: 0 });
              } else {
                setPendingDeclaration(opt.value);
              }
            }}>{opt.label}</Button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'DECLARE' && !pendingDeclaration) {
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06]">
        <div className="text-center text-sm font-mono text-white/40 mb-4 tracking-wide">DECLARE</div>
        <div className="grid grid-cols-3 gap-2.5">
          <Button variant="outline" className="border-red-600/40 hover:bg-red-600/15 text-red-200" onClick={() => { sfx.declare(); onAction('declare', { declaration: 'HIGH' }); }}>HIGH</Button>
          <Button variant="outline" className="border-white/10 hover:bg-white/5 text-white/50" onClick={() => { sfx.fold(); onAction('declare', { declaration: 'FOLD' }); }}>FOLD</Button>
          <Button variant="outline" className="border-blue-600/40 hover:bg-blue-600/15 text-blue-200" onClick={() => { sfx.declare(); onAction('declare', { declaration: 'LOW' }); }}>LOW</Button>
        </div>
      </div>
    );
  }

  const handleBetAction = (actionName: string, amount?: number) => {
    if (actionName === 'fold') sfx.fold();
    else if (actionName === 'check') sfx.check();
    else if (actionName === 'call') sfx.chipClink();
    else if (actionName === 'raise') sfx.chipClink();

    if (phase === 'DECLARE_AND_BET') {
      onAction('declare_and_bet', { declaration: pendingDeclaration, action: actionName, amount });
    } else {
      onAction(actionName, amount);
    }
  };

  const isBetPhaseForAllIn = (phase.startsWith('BET') || phase === 'DECLARE_AND_BET') && !phase.startsWith('HIT_');
  if (chips <= 0 && isBetPhaseForAllIn) {
    return (
      <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] flex flex-col items-center gap-3">
        <Badge variant="secondary" className="bg-[#C9A227]/15 text-[#C9A227]/80 border-[#C9A227]/20 font-mono text-xs">
          ALL IN
        </Badge>
        <Button variant="secondary" className="w-full sm:w-auto" onClick={() => handleBetAction('check')} data-testid="button-check-allin">
          Check (All-In)
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-5 bg-[#141417]/95 backdrop-blur-lg rounded-t-2xl border-t border-white/[0.06] flex flex-col gap-4">
      {phase === 'DECLARE_AND_BET' && (
        <div className="flex justify-between items-center px-2">
          <span className="text-xs font-mono text-white/30 tracking-wide">STEP 2: BET</span>
          <Badge variant="secondary" className="bg-blue-600/15 text-blue-300/80 border-blue-500/20">
            {pendingDeclaration}
          </Badge>
        </div>
      )}
      
      <div className="flex justify-between items-center px-2">
        <Badge variant="outline" className="bg-[#0B0B0D]/60 font-mono border-white/[0.06] text-white/60">Pot: ${pot}</Badge>
        {callAmount > 0 && <Badge variant="outline" className="bg-[#0B0B0D]/60 font-mono border-white/[0.06] text-white/60">To Call: ${callAmount}</Badge>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Button 
          variant="destructive" 
          className="bg-red-600/15 text-red-400/80 hover:bg-red-600/25 border-0"
          onClick={() => handleBetAction('fold')}
          data-testid="button-fold"
        >
          Fold
        </Button>
        
        <Button 
          variant="secondary"
          className="bg-[#1C1C20] text-white/80 hover:bg-[#242428] border-0"
          onClick={() => handleBetAction(canCheck ? 'check' : 'call')}
          data-testid={canCheck ? "button-check" : "button-call"}
        >
          {canCheck ? 'Check' : `Call $${callAmount}`}
        </Button>

        <div className="col-span-2 flex gap-2.5">
          <Button 
            className="flex-1 font-semibold"
            onClick={() => handleBetAction('raise', betAmount)}
            disabled={betAmount < (callAmount > 0 ? callAmount * 2 : 2) || chips < betAmount}
            data-testid="button-raise"
          >
            {callAmount > 0 ? 'Raise' : 'Bet'} ${betAmount}
          </Button>
        </div>
      </div>

      {chips > 0 && maxBet > 0 && (
        <div className="flex items-center gap-4 px-2">
          <span className="text-xs font-mono text-white/30 min-w-[30px]">${callAmount > 0 ? callAmount * 2 : 2}</span>
          <Slider 
            value={[betAmount]} 
            min={callAmount > 0 ? callAmount * 2 : 2} 
            max={maxBet} 
            step={1}
            onValueChange={(val) => setBetAmount(val[0])}
            className="flex-1"
          />
          <span className="text-xs font-mono text-white/30 min-w-[40px]">${maxBet}</span>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="text-xs h-9 px-3 min-w-[60px] border-[#C9A227]/30 text-[#C9A227]/80 hover:bg-[#C9A227]/10 font-semibold touch-manipulation"
            onClick={() => handleBetAction('raise', chips)}
          >
            ALL IN
          </Button>
        </div>
      )}
    </div>
  );
}
