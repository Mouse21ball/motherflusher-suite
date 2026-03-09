import { useMockEngine } from "@/lib/poker/MockEngine";
import { GameTable } from "@/components/game/GameTable";
import { ActionControls } from "@/components/game/Controls";
import { CardType } from "@/lib/poker/types";
import { PlayingCard } from "@/components/game/Card";

export default function Game() {
  const myId = 'p1';
  const { state, handleAction } = useMockEngine(myId);

  const me = state.players.find(p => p.id === myId);

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30">
      {/* Top Header */}
      <header className="w-full p-4 flex justify-between items-center bg-card border-b border-white/5 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold font-mono">
            S
          </div>
          <span className="font-bold tracking-widest text-sm text-foreground/80 uppercase hidden sm:inline">Swing Poker</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase font-mono">My Stack</div>
            <div className="font-mono text-primary font-bold">${me?.chips || 0}</div>
          </div>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden">
        <GameTable gameState={state} myId={myId} />
      </main>

      {/* Bottom Controls Area */}
      <div className="fixed bottom-0 left-0 w-full z-50 pointer-events-none">
        <div className="pointer-events-auto">
          {me?.status === 'active' && (
            <ActionControls 
              phase={state.phase}
              currentBet={state.currentBet}
              myBet={me?.bet || 0}
              pot={state.pot}
              chips={me?.chips || 0}
              onAction={handleAction}
              isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING' || state.phase === 'ANTE'}
            />
          )}
        </div>
      </div>
    </div>
  );
}