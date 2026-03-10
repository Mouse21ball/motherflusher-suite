import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { Fifteen35Mode } from "@/lib/poker/modes/fifteen35";
import { BadugiTable } from "@/components/game/BadugiTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";

export default function Fifteen35Game() {
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(Fifteen35Mode, myId);

  const me = state.players.find(p => p.id === myId);

  const isHitPhase = state.phase.startsWith('HIT_');
  const alreadyStayed = me?.declaration === 'STAY';
  const alreadyBust = me?.declaration === 'BUST';

  useEffect(() => {
    if (isHitPhase && (alreadyStayed || alreadyBust) && state.activePlayerId === myId) {
      const timer = setTimeout(() => {
        handleAction('stay');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isHitPhase, alreadyStayed, alreadyBust, state.activePlayerId, myId, handleAction]);

  const handleControlAction = (action: string, amount?: number | any) => {
    handleAction(action, amount);
  };

  const handleSendMessage = (text: string) => {
    handleAction('chat', text);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <header className="w-full p-4 flex justify-between items-center bg-card border-b border-white/5 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold font-mono shadow-[0_0_10px_rgba(245,158,11,0.2)] border border-amber-500/30">
            15
          </div>
          <span className="font-bold tracking-widest text-sm text-foreground/80 uppercase hidden sm:inline">15 / 35</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" data-testid="link-lobby">
            <span className="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors cursor-pointer">Lobby</span>
          </Link>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase font-mono tracking-wider">My Stack</div>
            <div className="font-mono text-primary font-bold text-lg">${me?.chips || 0}</div>
          </div>
        </div>
      </header>

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
          {me?.status === 'active' && (
            <ActionControls
              phase={state.phase}
              currentBet={state.currentBet}
              myBet={me?.bet || 0}
              pot={state.pot}
              chips={me?.chips || 0}
              onAction={handleControlAction}
              isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING' || state.phase === 'ANTE'}
              selectedCardsCount={0}
            />
          )}
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
