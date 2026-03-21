import { useState, useEffect } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { Dead7Mode } from "@/lib/poker/modes/dead7";
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
import { XPToast } from "@/components/XPToast";
import { useXPWatcher } from "@/lib/useXPWatcher";

export default function Dead7Game() {
  useEffect(() => { trackModePlay("dead7"); }, []);
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(Dead7Mode, myId);
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();

  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "Dead 7");

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
      <ModeIntro modeId="dead7" {...MODE_INTROS.dead7} />
      <GameHeader mode={MODE_INFO.dead7} modeId="dead7" chips={me?.chips || 0} phase={state.phase} pot={state.pot} onForfeit={() => { if (me) saveChips('dead7', me.chips); }} />

      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable
          gameState={state}
          myId={myId}
          selectedCardIndices={selectedCardIndices}
          onCardClick={handleCardClick}
          selectableCards={isDrawPhase}
          heroCardClassName="w-[60px] h-20 sm:w-20 sm:h-[120px]"
        />
      </main>

      {xpToast && xpToast.xpGained > 0 && (
        <XPToast
          key={xpToast.id}
          xpGained={xpToast.xpGained}
          leveledUp={xpToast.leveledUp}
          newLevel={xpToast.newLevel}
          newAchievementName={xpToast.achievementName}
          onDone={dismissXP}
        />
      )}

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
            selectedCardsCount={selectedCardIndices.length}
            phaseHint={getPhaseHint('dead7', state.phase)}
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
