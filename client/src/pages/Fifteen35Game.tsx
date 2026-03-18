import { useEffect } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { Fifteen35Mode } from "@/lib/poker/modes/fifteen35";
import { BadugiTable } from "@/components/game/BadugiTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";
import { GameHeader, MODE_INFO } from "@/components/game/GameHeader";
import { ModeIntro, MODE_INTROS } from "@/components/game/ModeIntro";
import { usePhaseSounds } from "@/lib/usePhaseSounds";
import { getPhaseHint } from "@/lib/phaseHints";
import { useGameToasts } from "@/lib/useGameToasts";
import { saveChips } from "@/lib/persistence";
import { trackModePlay } from "@/lib/analytics";

export default function Fifteen35Game() {
  useEffect(() => { trackModePlay("fifteen35"); }, []);
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(Fifteen35Mode, myId);

  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "15 / 35");

  const handleControlAction = (action: string, amount?: number | any) => {
    handleAction(action, amount);
  };

  const handleSendMessage = (text: string) => {
    handleAction('chat', text);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <ModeIntro modeId="fifteen35" {...MODE_INTROS.fifteen35} />
      <GameHeader mode={MODE_INFO.fifteen35} modeId="fifteen35" chips={me?.chips || 0} phase={state.phase} pot={state.pot} onForfeit={() => { if (me) saveChips('fifteen35', me.chips); }} />

      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable
          gameState={state}
          myId={myId}
          selectedCardIndices={[]}
          onCardClick={() => {}}
          selectableCards={false}
          showVisibleCount={true}
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
            isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
            selectedCardsCount={0}
            phaseHint={getPhaseHint('fifteen35', state.phase)}
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
