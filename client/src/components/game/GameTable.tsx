import { GameState, Player } from "@/lib/poker/types";
import { PlayerSeat } from "./PlayerSeat";
import { PlayingCard } from "./Card";
import { ResolutionOverlay } from "./ResolutionOverlay";
import { getPhaseLabel } from "@/lib/phaseLabel";

interface GameTableProps {
  gameState: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
}

export function GameTable({ gameState, myId, selectedCardIndices, onCardClick, selectableCards }: GameTableProps) {
  const myIndex = gameState.players.findIndex(p => p.id === myId);
  const orderedPlayers = [...gameState.players];
  if (myIndex !== -1) {
    const p1 = orderedPlayers.splice(myIndex);
    orderedPlayers.unshift(...p1);
  }

  const getSeatPosition = (index: number) => {
    const positions = [
      "-bottom-6 left-1/2 -translate-x-1/2 scale-110 origin-bottom",
      "-left-6 sm:-left-4 bottom-[8%] sm:bottom-[10%] scale-[0.6] sm:scale-[0.7] origin-bottom-left",
      "top-2 sm:top-4 left-[8%] sm:left-[14%] scale-[0.6] sm:scale-[0.7] origin-top-left",
      "top-2 sm:top-4 right-[8%] sm:right-[14%] scale-[0.6] sm:scale-[0.7] origin-top-right",
      "-right-6 sm:-right-4 bottom-[8%] sm:bottom-[10%] scale-[0.6] sm:scale-[0.7] origin-bottom-right",
    ];
    return positions[index] || "hidden";
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto mt-4 sm:mt-8 mb-32 px-2 sm:px-8">
      <div className="relative h-[70vh] min-h-[560px]">
        <div className="absolute inset-0 game-table-felt rounded-[100px] sm:rounded-[200px] overflow-hidden shadow-2xl border-4 border-[#1a3822]">
          <div className="absolute inset-0 felt-overlay mix-blend-overlay"></div>

          <div className="absolute inset-0 flex flex-col items-center justify-start pointer-events-none pt-6 sm:pt-8">
            <div className="text-white/40 text-sm sm:text-base font-mono tracking-[0.15em] mb-1 uppercase text-center font-semibold" data-testid="text-phase">
              {getPhaseLabel(gameState.phase)}
            </div>

            <div className="text-center pointer-events-auto mb-1 sm:mb-2 min-h-[24px]">
              {gameState.phase !== 'SHOWDOWN' && gameState.messages.slice(-1).map(msg => (
                <p key={msg.id} className="text-white/90 text-[10px] sm:text-xs font-mono animate-in fade-in drop-shadow-lg bg-black/70 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/10" data-testid="text-game-message">
                  {msg.text}
                </p>
              ))}
            </div>

            <div className="flex flex-col items-center gap-2 sm:gap-4 mb-3 sm:mb-6 origin-center pointer-events-auto">
              <div className="flex gap-1 sm:gap-3">
                {Array.from({ length: 5 }).map((_, colIndex) => (
                  <div key={`pair-${colIndex}`} className="flex flex-col gap-1 sm:gap-2 bg-black/30 p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-white/10 shadow-inner">
                    <div className="w-[50px] h-[72px] sm:w-[70px] sm:h-[98px] flex-shrink-0">
                      <PlayingCard
                        card={gameState.communityCards[colIndex * 2]}
                        selected={gameState.phase === 'SHOWDOWN' && gameState.players.some(p => p.score?.highEval?.usedCommunityCardIndices.includes(colIndex * 2) || p.score?.lowEval?.usedCommunityCardIndices.includes(colIndex * 2))}
                        className="w-full h-full"
                      />
                    </div>
                    <div className="w-[50px] h-[72px] sm:w-[70px] sm:h-[98px] flex-shrink-0">
                      <PlayingCard
                        card={gameState.communityCards[colIndex * 2 + 1]}
                        selected={gameState.phase === 'SHOWDOWN' && gameState.players.some(p => p.score?.highEval?.usedCommunityCardIndices.includes(colIndex * 2 + 1) || p.score?.lowEval?.usedCommunityCardIndices.includes(colIndex * 2 + 1))}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-1 sm:gap-3 mt-1">
                {Array.from({ length: 5 }).map((_, colIndex) => (
                  <div key={`single-${colIndex}`} className="flex justify-center w-[65px] sm:w-[91px]">
                    <div className="w-[50px] h-[72px] sm:w-[70px] sm:h-[98px] flex-shrink-0">
                      <PlayingCard
                        card={gameState.communityCards[10 + colIndex]}
                        selected={gameState.phase === 'SHOWDOWN' && gameState.players.some(p => p.score?.highEval?.usedCommunityCardIndices.includes(10 + colIndex) || p.score?.lowEval?.usedCommunityCardIndices.includes(10 + colIndex))}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 z-40">
              <div className="flex items-center gap-4">
                <div className="bg-black/60 backdrop-blur-sm border border-white/10 px-6 sm:px-8 py-2 sm:py-3 rounded-full flex flex-col items-center shadow-[0_0_30px_rgba(0,0,0,0.5)]" data-testid="text-pot">
                  <span className="text-[10px] text-green-400 uppercase font-bold tracking-widest mb-1">Total Pot</span>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-yellow-500 border-2 border-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.3)] flex items-center justify-center">
                      <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full border border-yellow-600"></div>
                    </div>
                    <span className="text-xl sm:text-2xl font-mono text-white font-bold">${gameState.pot}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {Array.from({ length: 5 }).map((_, i) => {
          const player = orderedPlayers[i];
          return (
            <div key={i} className={`absolute ${getSeatPosition(i)} z-30`}>
              <PlayerSeat
                player={player || null}
                seatNumber={i}
                isActive={player?.id === gameState.activePlayerId}
                isSelf={player?.id === myId}
                selectedCardIndices={player?.id === myId ? selectedCardIndices : undefined}
                onCardClick={onCardClick}
                selectableCards={selectableCards}
                showdownState={gameState.phase === 'SHOWDOWN'}
                className={player?.id === myId ? "bg-black/80 p-4 rounded-xl shadow-2xl border border-white/10 backdrop-blur-md pb-6" : ""}
              />
            </div>
          );
        })}

        <ResolutionOverlay messages={gameState.messages} phase={gameState.phase} />
      </div>
    </div>
  );
}
