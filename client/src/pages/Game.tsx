import { useState, useEffect } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { SwingPokerMode } from "@/lib/poker/modes/swing";
import { GameTable } from "@/components/game/GameTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";
import { GameHeader, MODE_INFO } from "@/components/game/GameHeader";
import { ModeIntro, MODE_INTROS } from "@/components/game/ModeIntro";
import { usePhaseSounds } from "@/lib/usePhaseSounds";
import { getPhaseHint } from "@/lib/phaseHints";
import { useGameToasts } from "@/lib/useGameToasts";
import { saveChips } from "@/lib/persistence";
import { trackModePlay } from "@/lib/analytics";
import { ReactionBar } from "@/components/game/ReactionBar";

export default function Game() {
  useEffect(() => { trackModePlay("swing"); }, []);
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(SwingPokerMode, myId);
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);

  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "Mother Flusher");

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
      <ModeIntro modeId="swing" {...MODE_INTROS.swing} />
      <GameHeader mode={MODE_INFO.swing} modeId="swing" chips={me?.chips || 0} phase={state.phase} pot={state.pot} onForfeit={() => { if (me) saveChips('swing', me.chips); }} />

      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <GameTable 
          gameState={state} 
          myId={myId} 
          selectedCardIndices={selectedCardIndices}
          onCardClick={handleCardClick}
          selectableCards={isSelectablePhase}
        />
      </main>

      <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end gap-1">
        <ReactionBar />
        <div className="pointer-events-auto w-full max-w-md px-2">
          <ActionControls 
            phase={state.phase}
            currentBet={state.currentBet}
            myBet={me?.bet || 0}
            pot={state.pot}
            chips={me?.chips || 0}
            onAction={handleControlAction}
            isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
            selectedCardsCount={selectedCardIndices.length}
            phaseHint={getPhaseHint('swing', state.phase)}
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
