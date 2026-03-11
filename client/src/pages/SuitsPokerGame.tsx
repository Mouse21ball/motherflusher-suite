import { useState, useEffect } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { SuitsPokerMode } from "@/lib/poker/modes/suitspoker";
import { SuitsPokerTable } from "@/components/game/SuitsPokerTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";
import { GameHeader, MODE_INFO } from "@/components/game/GameHeader";
import { usePhaseSounds } from "@/lib/usePhaseSounds";
import { Declaration } from "@/lib/poker/types";

const spDeclarationOptions: { label: string; value: Declaration; className: string }[] = [
  { label: 'POKER', value: 'POKER', className: 'border-red-500/50 hover:bg-red-500/20 text-red-100' },
  { label: 'SWING', value: 'SWING', className: 'border-purple-500/50 hover:bg-purple-500/20 text-purple-100' },
  { label: 'SUITS', value: 'SUITS', className: 'border-cyan-500/50 hover:bg-cyan-500/20 text-cyan-100' },
];

export default function SuitsPokerGame() {
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(SuitsPokerMode, myId);
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);

  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);

  useEffect(() => {
    setSelectedCardIndices([]);
  }, [state.phase]);

  const handleCardClick = (index: number) => {
    if (state.phase === 'DRAW') {
      setSelectedCardIndices(prev => {
        if (prev.includes(index)) return prev.filter(i => i !== index);
        if (prev.length < 2) return [...prev, index];
        return prev;
      });
    }
  };

  const handleControlAction = (action: string, amount?: number) => {
    if (action === 'draw') {
      handleAction(action, selectedCardIndices);
    } else {
      handleAction(action, amount);
    }
  };

  const handleSendMessage = (text: string) => {
    handleAction('chat', text);
  };

  const isSelectablePhase = state.phase === 'DRAW';

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <GameHeader mode={MODE_INFO.suitspoker} modeId="suitspoker" chips={me?.chips || 0} />

      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <SuitsPokerTable
          gameState={state}
          myId={myId}
          selectedCardIndices={selectedCardIndices}
          onCardClick={handleCardClick}
          selectableCards={isSelectablePhase}
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
            declarationOptions={spDeclarationOptions}
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
