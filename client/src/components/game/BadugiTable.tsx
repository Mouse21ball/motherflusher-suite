import { GameState } from "@/lib/poker/types";
import { PlayerSeat } from "./PlayerSeat";
import { DiscardPile } from "./DiscardPile";
import { cn } from "@/lib/utils";
import { getPhaseLabel } from "@/lib/phaseLabel";

interface BadugiTableProps {
  gameState: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
  showVisibleCount?: boolean;
}

export function BadugiTable({ gameState, myId, selectedCardIndices, onCardClick, selectableCards, showVisibleCount }: BadugiTableProps) {
  const myIndex = gameState.players.findIndex(p => p.id === myId);
  const orderedPlayers = [...gameState.players];
  if (myIndex !== -1) {
    const p1 = orderedPlayers.splice(myIndex);
    orderedPlayers.unshift(...p1);
  }

  const opponents = orderedPlayers.slice(1);
  const me = orderedPlayers[0];

  const drawNumber = gameState.phase === 'DRAW_1' ? 1 : gameState.phase === 'DRAW_2' ? 2 : gameState.phase === 'DRAW_3' ? 3 : 0;
  const isDrawPhase = drawNumber > 0;
  const isShowdown = gameState.phase === 'SHOWDOWN';

  const getOpponentPosition = (index: number, total: number) => {
    if (total === 1) return "-top-2 sm:top-2 left-1/2 -translate-x-1/2";
    if (total === 2) {
      return [
        "-top-2 sm:top-2 left-[20%] sm:left-[25%] -translate-x-1/2",
        "-top-2 sm:top-2 right-[20%] sm:right-[25%] translate-x-1/2",
      ][index];
    }
    if (total === 3) {
      return [
        "top-[18%] -left-2 sm:left-2",
        "-top-2 sm:top-2 left-1/2 -translate-x-1/2",
        "top-[18%] -right-2 sm:right-2",
      ][index];
    }
    return [
      "top-[30%] -left-4 sm:-left-1 -translate-y-1/2",
      "-top-2 sm:top-2 left-[28%] sm:left-[30%] -translate-x-1/2",
      "-top-2 sm:top-2 right-[28%] sm:right-[30%] translate-x-1/2",
      "top-[30%] -right-4 sm:-right-1 -translate-y-1/2",
    ][index] || "hidden";
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto px-2 sm:px-6 pt-2 pb-4">
      <div className="w-full text-center mb-1 relative z-40">
        {gameState.messages.slice(-1).map(msg => (
          <p key={msg.id} className="text-white/90 text-xs sm:text-sm font-mono animate-in fade-in slide-in-from-top-2 drop-shadow-lg bg-black/70 backdrop-blur-sm inline-block px-3 py-1.5 rounded-full border border-white/10" data-testid="text-game-message">
            {msg.text}
          </p>
        ))}
      </div>

      <div className="relative w-full rounded-[80px] sm:rounded-[120px] game-table-felt border-4 border-[#1a3822] shadow-2xl overflow-visible min-h-[340px] sm:min-h-[420px]">
        <div className="absolute inset-0 felt-overlay mix-blend-overlay pointer-events-none rounded-[76px] sm:rounded-[116px]"></div>

        {opponents.map((player, i) => (
          <div key={player.id} className={`absolute ${getOpponentPosition(i, opponents.length)} z-20 scale-[0.7] sm:scale-[0.8] origin-center`}>
            <PlayerSeat
              player={player}
              seatNumber={i + 1}
              isActive={player.id === gameState.activePlayerId}
              isSelf={false}
              showdownState={isShowdown}
              showVisibleCount={showVisibleCount}
            />
          </div>
        ))}

        <div className="relative z-10 flex flex-col items-center justify-center min-h-[340px] sm:min-h-[420px] px-4 sm:px-8 py-6">
          <div className="flex flex-col items-center gap-2 my-auto">
            <div className="text-white/40 text-xs sm:text-sm font-mono tracking-[0.15em] uppercase font-semibold" data-testid="text-phase">
              {getPhaseLabel(gameState.phase)}
            </div>

            {drawNumber > 0 && (
              <div className="flex items-center gap-1.5" data-testid="text-draw-round">
                {[1, 2, 3].map(d => (
                  <div
                    key={d}
                    className={cn(
                      "w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center justify-center border",
                      d < drawNumber ? "bg-green-600/60 border-green-400 text-white" :
                      d === drawNumber ? "bg-yellow-500/80 border-yellow-300 text-black animate-pulse" :
                      "bg-white/10 border-white/20 text-white/30"
                    )}
                  >
                    {d}
                  </div>
                ))}
                <span className="text-white/40 text-[9px] sm:text-[10px] font-mono ml-1">DRAW</span>
              </div>
            )}

            <DiscardPile messages={gameState.messages} isDrawPhase={isDrawPhase} />

            <div className="bg-black/60 backdrop-blur-sm border border-white/10 px-5 sm:px-8 py-2 sm:py-3 rounded-full flex flex-col items-center shadow-[0_0_30px_rgba(0,0,0,0.5)]" data-testid="text-pot">
              <span className="text-[9px] sm:text-[10px] text-green-400 uppercase font-bold tracking-widest mb-0.5">Total Pot</span>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-yellow-500 border-2 border-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.3)] flex items-center justify-center">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full border border-yellow-600"></div>
                </div>
                <span className="text-lg sm:text-2xl font-mono text-white font-bold">${gameState.pot}</span>
              </div>
            </div>

            {gameState.phase === 'DECLARE' && (
              <div className="text-yellow-400/80 text-[10px] sm:text-xs font-mono uppercase tracking-wider animate-pulse mt-1" data-testid="text-declare-prompt">
                Declaration Round
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full flex justify-center -mt-10 sm:-mt-12 relative z-30">
        {me && (
          <PlayerSeat
            player={me}
            seatNumber={0}
            isActive={me.id === gameState.activePlayerId}
            isSelf={true}
            selectedCardIndices={selectedCardIndices}
            onCardClick={onCardClick}
            selectableCards={selectableCards}
            showdownState={isShowdown}
            showVisibleCount={showVisibleCount}
            className="bg-black/80 p-3 sm:p-4 rounded-xl shadow-2xl border border-white/10 backdrop-blur-md pb-4 sm:pb-6"
          />
        )}
      </div>
    </div>
  );
}
