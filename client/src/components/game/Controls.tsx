import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { GamePhase, Declaration } from "@/lib/poker/types";
import { useState, useEffect, useRef } from "react";
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
  openSeatsCount?: number;
  humanCount?: number;
}

const defaultDeclarationOptions: DeclarationOption[] = [
  { label: 'HIGH', value: 'HIGH', className: 'border-red-500/25 hover:bg-red-500/10 text-red-300/80 hover:text-red-200' },
  { label: 'SWING', value: 'SWING', className: 'border-purple-500/25 hover:bg-purple-500/10 text-purple-300/80 hover:text-purple-200' },
  { label: 'LOW', value: 'LOW', className: 'border-blue-500/25 hover:bg-blue-500/10 text-blue-300/80 hover:text-blue-200' },
];

const panelClass = "w-full max-w-md mx-auto px-4 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] glass-panel rounded-t-2xl border-t border-white/[0.04]";

export function ActionControls({ phase, currentBet, myBet, pot, chips, onAction, isMyTurn, selectedCardsCount, declarationOptions, phaseHint, openSeatsCount, humanCount }: ActionControlsProps) {
  const [betAmount, setBetAmount] = useState<number>(Math.max(currentBet - myBet, 2));
  const [pendingDeclaration, setPendingDeclaration] = useState<Declaration>(null);

  /* ── Turn onset — fires once when it becomes the hero's turn ────────── */
  const prevIsMyTurnRef = useRef(isMyTurn);
  const [heroTurnKey, setHeroTurnKey] = useState(0);
  useEffect(() => {
    if (isMyTurn && !prevIsMyTurnRef.current && phase !== 'WAITING') {
      setHeroTurnKey(k => k + 1);
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn, phase]);
  
  const callAmount = currentBet - myBet;
  const canCheck = callAmount === 0;
  const maxBet = chips;

  useEffect(() => {
    if (phase !== 'DECLARE_AND_BET' && phase !== 'DECLARE') {
      setPendingDeclaration(null);
    }
    setBetAmount(Math.max(callAmount > 0 ? callAmount * 2 : 2, 2));
  }, [phase, callAmount]);

  /* ── Auto-ante: fires automatically 400ms after hero's ante turn begins ─ */
  const autoAnteFired = useRef(false);
  useEffect(() => {
    if (phase !== 'ANTE' || !isMyTurn || chips <= 0) {
      autoAnteFired.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (!autoAnteFired.current) {
        autoAnteFired.current = true;
        sfx.chipClink();
        onAction('ante');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [phase, isMyTurn, chips, onAction]);

  /* ── Auto next-hand: fires 1700ms after showdown if chips remain ─────── */
  /* Guard: only the active player's client sends restart to prevent         */
  /* duplicate triggers when multiple humans are seated at the same table.   */
  const autoRestartFired = useRef(false);
  useEffect(() => {
    if (phase !== 'SHOWDOWN' || chips <= 0 || !isMyTurn) {
      autoRestartFired.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (!autoRestartFired.current) {
        autoRestartFired.current = true;
        onAction('restart');
      }
    }, 1700);
    return () => clearTimeout(t);
  }, [phase, chips, isMyTurn, onAction]);

  if (phase === 'SHOWDOWN') {
    return (
      <div className={`${panelClass} flex flex-col items-center gap-2`}>
        <Button
          size="lg"
          onClick={() => { autoRestartFired.current = true; onAction('restart'); }}
          className="w-full sm:w-auto uppercase tracking-widest btn-casino-gold"
          data-testid="button-next-hand"
        >
          Next Hand
        </Button>
        <p
          className="text-[9px] font-mono tracking-[0.32em] uppercase anim-pulse-gold"
          style={{ color: 'rgba(255,255,255,0.18)' }}
        >
          next hand…
        </p>
        {chips <= 0 && (
          <Button size="sm" variant="outline" onClick={() => onAction('rebuy')} className="text-[10px] font-mono uppercase tracking-widest border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.03]" data-testid="button-rebuy">
            Rebuy $1000
          </Button>
        )}
      </div>
    );
  }

  if (phase === 'REVEAL_TOP_ROW' || phase === 'REVEAL_SECOND_ROW' || phase === 'REVEAL_FACTOR_CARD' || phase === 'REVEAL_LOWER_CENTER') {
    return (
      <div className={`${panelClass} text-center`}>
        <div className="text-xs font-mono text-[#C9A227]/60 anim-pulse-gold font-medium tracking-widest uppercase">Revealing Cards</div>
      </div>
    );
  }

  if (phase === 'DEAL') {
    return (
      <div className={`${panelClass} text-center`}>
        <div className="text-xs font-mono text-[#C9A227]/60 anim-pulse-gold font-medium tracking-widest uppercase">Dealing</div>
      </div>
    );
  }

  if (!isMyTurn) {
    return (
      <div className={`${panelClass} flex items-center justify-center min-h-[88px]`}>
        <span className="text-white/20 text-xs font-mono tracking-wider uppercase anim-pulse-gold">Waiting for opponents</span>
      </div>
    );
  }

  if (phase === 'WAITING') {
    const hasOpenSeats = openSeatsCount != null && openSeatsCount > 0;
    const hc = humanCount ?? 1;

    /* State-aware readiness copy */
    let readinessMsg: string;
    let startSubtext: string;
    if (hc >= 4 || !hasOpenSeats) {
      readinessMsg = hc > 1
        ? `${hc} real players here — full table`
        : 'Everyone is here — ready to start';
      startSubtext = 'Start the hand when everyone is ready';
    } else if (hc >= 2) {
      readinessMsg = `${hc} real players here — start now or wait for more`;
      startSubtext = `${openSeatsCount} seat${openSeatsCount !== 1 ? 's' : ''} still open for friends`;
    } else {
      readinessMsg = 'Share the link — friends can still join';
      startSubtext = 'Starting now fills empty seats with bots';
    }

    return (
      <div className={`${panelClass} flex flex-col items-center gap-3`}>
        {/* State-aware readiness message */}
        <div
          className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
          style={{ backgroundColor: 'rgba(0,200,150,0.06)', border: '1px solid rgba(0,200,150,0.14)' }}
        >
          <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: 'rgba(0,200,150,0.7)' }} />
          <span className="text-[10px] font-mono leading-snug" style={{ color: 'rgba(0,200,150,0.65)' }}>
            {readinessMsg}
          </span>
        </div>
        {chips <= 0 && (
          <Button size="sm" variant="outline" onClick={() => onAction('rebuy')} className="text-[10px] font-mono uppercase tracking-widest border-white/[0.06] text-white/40" data-testid="button-rebuy-waiting">
            Rebuy $1000
          </Button>
        )}
        <Button
          size="lg"
          onClick={() => onAction('start')}
          className="w-full sm:w-auto tracking-[0.15em] uppercase btn-casino-gold"
          disabled={chips <= 0}
          data-testid="button-deal-me-in"
        >
          Deal Me In
        </Button>
        <p className="text-[9px] text-white/20 font-mono tracking-widest">
          {startSubtext}
        </p>
      </div>
    );
  }

  if (phase === 'ANTE') {
    return (
      <div className={`${panelClass} flex flex-col items-center gap-2`}>
        <Button
          size="lg"
          onClick={() => { autoAnteFired.current = true; sfx.chipClink(); onAction('ante'); }}
          className="w-full sm:w-auto uppercase tracking-wider btn-casino-gold"
          data-testid="button-pay-ante"
        >
          Pay Ante ($1)
        </Button>
        <span className="text-[9px] font-mono text-white/20 tracking-[0.2em] uppercase anim-pulse-gold">auto-posting…</span>
      </div>
    );
  }

  const hintEl = phaseHint ? (
    <div className="text-[11px] text-[#C9A227]/50 text-center mb-3 leading-snug font-mono tracking-wide" data-testid="text-phase-hint">{phaseHint}</div>
  ) : null;

  const isHitPhase = phase.startsWith('HIT_');
  if (isHitPhase) {
    return (
      <div key={phase} className={`${panelClass} anim-decision-ready text-center`}>
        {hintEl}
        <div className="text-[10px] font-mono text-white/25 mb-3 tracking-[0.2em] uppercase">Hit, Stay, or Fold</div>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="btn-casino-fold"
            onClick={() => { sfx.fold(); onAction('fold'); }}
            data-testid="button-fold"
          >
            Fold
          </Button>
          <Button
            variant="outline"
            className="btn-casino-neutral"
            onClick={() => { sfx.check(); onAction('stay'); }}
            data-testid="button-stay"
          >
            Stay
          </Button>
          <Button
            className="btn-casino-gold"
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
      <div key={`${phase}-${heroTurnKey}`} className={`${panelClass} anim-decision-ready anim-turn-onset`}>
        {hintEl}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-[10px] font-mono text-white/30 tracking-[0.15em] uppercase">
            {selectedCardsCount > 0
              ? <span>Drawing <span className="text-[#C9A227]/70 font-bold">{selectedCardsCount}</span> card{selectedCardsCount !== 1 ? 's' : ''}</span>
              : 'Tap cards to draw — or Stay'}
          </div>
          {selectedCardsCount > 0 && (
            <span className="text-[10px] font-mono text-white/20">{selectedCardsCount}/{maxDiscards} max</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => { sfx.check(); onAction('draw'); }}
            variant="outline"
            className="flex-1 btn-casino-neutral"
            data-testid="button-stay"
          >
            Stay
          </Button>
          <Button
            onClick={() => { sfx.cardFlip(); onAction('draw'); }}
            disabled={selectedCardsCount === 0}
            className="flex-1 btn-casino-gold"
            data-testid="button-draw"
          >
            Draw {selectedCardsCount > 0 ? selectedCardsCount : ''}
          </Button>
        </div>
      </div>
    );
  }


  if (phase === 'DECLARE_AND_BET' && !pendingDeclaration) {
    const declOpts = declarationOptions || defaultDeclarationOptions;
    const isAllIn = chips <= 0;
    return (
      <div className={panelClass}>
        {hintEl}
        <div className="text-center text-[10px] font-mono text-white/25 mb-3 tracking-[0.2em] uppercase">
          {isAllIn ? "All-In — Declare" : "Step 1: Declare"}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {declOpts.map(opt => (
            <Button key={opt.value} variant="outline" className={`${opt.className} transition-all duration-200`} onClick={() => {
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
      <div className={panelClass}>
        <div className="text-center text-[10px] font-mono text-white/25 mb-3 tracking-[0.2em] uppercase">Declare</div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="border-red-500/25 hover:bg-red-500/10 text-red-300/80 hover:text-red-200 transition-all" onClick={() => { sfx.declare(); onAction('declare', { declaration: 'HIGH' }); }}>HIGH</Button>
          <Button variant="outline" className="border-white/[0.08] hover:bg-white/[0.04] text-white/40 hover:text-white/60 transition-all" onClick={() => { sfx.fold(); onAction('declare', { declaration: 'FOLD' }); }}>FOLD</Button>
          <Button variant="outline" className="border-blue-500/25 hover:bg-blue-500/10 text-blue-300/80 hover:text-blue-200 transition-all" onClick={() => { sfx.declare(); onAction('declare', { declaration: 'LOW' }); }}>LOW</Button>
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
      <div className={`${panelClass} flex flex-col items-center gap-3`}>
        <Badge variant="secondary" className="bg-[#C9A227]/10 text-[#C9A227]/70 border-[#C9A227]/15 font-mono text-[10px] tracking-widest">
          ALL IN
        </Badge>
        <Button variant="secondary" className="w-full sm:w-auto bg-[#1C1C20] text-white/60 hover:bg-[#242428]" onClick={() => handleBetAction('check')} data-testid="button-check-allin">
          Check (All-In)
        </Button>
      </div>
    );
  }

  return (
    <div key={`${phase}-${heroTurnKey}`} className={`${panelClass} anim-decision-ready anim-turn-onset flex flex-col gap-4`}>
      {phase === 'DECLARE_AND_BET' && (
        <div className="flex justify-between items-center px-1">
          <span className="text-[10px] font-mono text-white/20 tracking-[0.15em] uppercase">Step 2: Bet</span>
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-300/60 border-blue-500/15 text-[10px] font-mono">
            {pendingDeclaration}
          </Badge>
        </div>
      )}
      
      <div className="flex justify-between items-center px-1">
        <Badge variant="outline" className="bg-[#0B0B0D]/50 font-mono border-white/[0.05] text-white/45 text-[10px]">Pot ${pot}</Badge>
        {callAmount > 0 && <Badge variant="outline" className="bg-[#0B0B0D]/50 font-mono border-white/[0.05] text-white/45 text-[10px]">Call ${callAmount}</Badge>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button 
          variant="outline" 
          className="btn-casino-fold"
          onClick={() => handleBetAction('fold')}
          data-testid="button-fold"
        >
          Fold
        </Button>
        
        <Button 
          variant="outline"
          className="btn-casino-neutral"
          onClick={() => handleBetAction(canCheck ? 'check' : 'call')}
          data-testid={canCheck ? "button-check" : "button-call"}
        >
          {canCheck ? 'Check' : `Call $${callAmount}`}
        </Button>

        <div className="col-span-2 flex gap-2">
          <Button 
            className="flex-1 btn-casino-gold"
            onClick={() => handleBetAction('raise', betAmount)}
            disabled={betAmount < (callAmount > 0 ? callAmount * 2 : 2) || chips < betAmount}
            data-testid="button-raise"
          >
            {callAmount > 0 ? 'Raise' : 'Bet'} ${betAmount}
          </Button>
        </div>
      </div>

      {chips > 0 && maxBet > 0 && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-[10px] font-mono text-white/20 min-w-[30px] tabular-nums">${callAmount > 0 ? callAmount * 2 : 2}</span>
          <Slider 
            value={[betAmount]} 
            min={callAmount > 0 ? callAmount * 2 : 2} 
            max={maxBet} 
            step={1}
            onValueChange={(val) => setBetAmount(val[0])}
            className="flex-1"
          />
          <span className="text-[10px] font-mono text-white/20 min-w-[40px] text-right tabular-nums">${maxBet}</span>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="text-[10px] h-8 px-3 min-w-[56px] touch-manipulation btn-casino-allin"
            onClick={() => handleBetAction('raise', chips)}
          >
            ALL IN
          </Button>
        </div>
      )}
    </div>
  );
}
