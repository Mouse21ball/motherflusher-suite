import { useState, useEffect } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { BadugiMode } from "@/lib/poker/modes/badugi";
import { BadugiTable } from "@/components/game/BadugiTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";
import { GameHeader, MODE_INFO } from "@/components/game/GameHeader";
import { usePhaseSounds } from "@/lib/usePhaseSounds";

export default function BadugiGame() {
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(BadugiMode, myId);
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);

  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);

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
      <GameHeader mode={MODE_INFO.badugi} modeId="badugi" chips={me?.chips || 0} />

      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable 
          gameState={state} 
          myId={myId} 
          selectedCardIndices={selectedCardIndices}
          onCardClick={handleCardClick}
          selectableCards={isDrawPhase}
        />
      </main>

      <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
        <div className="pointer-events-auto w-full max-w-md px-2">
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
        </div>
      </div>

      <ChatBox 
        messages={state.chatMessages} 
        myId={myId} 
        onSendMessage={handleSendMessage} 
      />
    </div>
  );
}
