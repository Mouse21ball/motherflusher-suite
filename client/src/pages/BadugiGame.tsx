import { useState, useEffect } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { BadugiMode } from "@/lib/poker/modes/badugi";
import { GameTable } from "@/components/game/GameTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";

export default function BadugiGame() {
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(BadugiMode, myId);
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);

  const me = state.players.find(p => p.id === myId);

  // Clear selections when phase changes
  useEffect(() => {
    setSelectedCardIndices([]);
  }, [state.phase]);

  const isDrawPhase = state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3';

  const handleCardClick = (index: number) => {
    if (isDrawPhase) {
      setSelectedCardIndices(prev => {
        if (prev.includes(index)) return prev.filter(i => i !== index);
        
        let maxCards = 1;
        if (state.phase === 'DRAW_1') maxCards = 3;
        if (state.phase === 'DRAW_2') maxCards = 2;

        if (prev.length < maxCards) return [...prev, index];
        return prev;
      });
    }
  };

  const handleControlAction = (action: string, amount?: number | any) => {
    if (action === 'draw') {
      handleAction(action, selectedCardIndices);
    } else {
      handleAction(action, amount);
    }
  };

  const handleSendMessage = (text: string) => {
    handleAction('chat', text);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      {/* Top Header */}
      <header className="w-full p-4 flex justify-between items-center bg-card border-b border-white/5 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold font-mono shadow-[0_0_10px_rgba(16,185,129,0.2)] border border-primary/30">
            B
          </div>
          <span className="font-bold tracking-widest text-sm text-foreground/80 uppercase hidden sm:inline">Badugi</span>
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
          selectableCards={isDrawPhase}
        />
      </main>

      {/* Bottom Controls Area */}
      <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
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

      {/* Chat Component */}
      <ChatBox 
        messages={state.chatMessages} 
        myId={myId} 
        onSendMessage={handleSendMessage} 
      />
    </div>
  );
}