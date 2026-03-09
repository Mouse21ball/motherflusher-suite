import { useState, useEffect } from "react";
import { useMockEngine } from "@/lib/poker/MockEngine";
import { GameTable } from "@/components/game/GameTable";
import { ActionControls } from "@/components/game/Controls";

export default function Game() {
  const myId = 'p1';
  const { state, handleAction } = useMockEngine(myId);
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);

  const me = state.players.find(p => p.id === myId);

  // Clear selections when phase changes
  useEffect(() => {
    setSelectedCardIndices([]);
  }, [state.phase]);

  const handleCardClick = (index: number) => {
    if (state.phase === 'DRAW') {
      setSelectedCardIndices(prev => {
        if (prev.includes(index)) return prev.filter(i => i !== index);
        if (prev.length < 2) return [...prev, index];
        return prev; // Max 2
      });
    } else if (state.phase.startsWith('REVEAL')) {
      const card = me?.cards[index];
      if (card && !card.isHidden) return; // Cannot select already revealed cards
      
      setSelectedCardIndices(prev => {
        if (prev.includes(index)) return [];
        return [index]; // Max 1 per reveal round
      });
    }
  };

  const handleControlAction = (action: string, amount?: number) => {
    if (action === 'draw') {
      handleAction(action, selectedCardIndices);
    } else if (action === 'reveal') {
      handleAction(action, selectedCardIndices[0]);
    } else {
      handleAction(action, amount);
    }
  };

  const isSelectablePhase = state.phase === 'DRAW' || state.phase.startsWith('REVEAL');

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      {/* Top Header */}
      <header className="w-full p-4 flex justify-between items-center bg-card border-b border-white/5 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold font-mono shadow-[0_0_10px_rgba(16,185,129,0.2)] border border-primary/30">
            S
          </div>
          <span className="font-bold tracking-widest text-sm text-foreground/80 uppercase hidden sm:inline">Swing Poker</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase font-mono tracking-wider">My Stack</div>
            <div className="font-mono text-primary font-bold text-lg">${me?.chips || 0}</div>
          </div>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-48">
        <GameTable 
          gameState={state} 
          myId={myId} 
          selectedCardIndices={selectedCardIndices}
          onCardClick={handleCardClick}
          selectableCards={isSelectablePhase}
        />
      </main>

      {/* Bottom Controls Area */}
      <div className="fixed bottom-0 left-0 w-full z-50 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
        <div className="pointer-events-auto w-full max-w-md px-2">
          {me?.status === 'active' && (
            <ActionControls 
              phase={state.phase}
              currentBet={state.currentBet}
              myBet={me?.bet || 0}
              pot={state.pot}
              chips={me?.chips || 0}
              onAction={handleControlAction}
              isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING' || state.phase === 'ANTE'}
              selectedCardsCount={selectedCardIndices.length}
            />
          )}
        </div>
      </div>
    </div>
  );
}