import { GameState, Player } from "@/lib/poker/types";
import { PlayerSeat } from "./PlayerSeat";
import { PlayingCard } from "./Card";
import { DiscardPile } from "./DiscardPile";

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
      "bottom-0 left-1/2 -translate-x-1/2 scale-110 origin-bottom",
      "-left-4 sm:-left-2 top-[55%] -translate-y-1/2 scale-[0.65] sm:scale-75 origin-left",
      "-top-2 sm:top-0 left-[15%] sm:left-[18%] scale-[0.65] sm:scale-75 origin-top-left",
      "-top-2 sm:top-0 right-[15%] sm:right-[18%] scale-[0.65] sm:scale-75 origin-top-right",
      "-right-4 sm:-right-2 top-[55%] -translate-y-1/2 scale-[0.65] sm:scale-75 origin-right",
    ];
    return positions[index] || "hidden";
  };

  const isDrawPhase = gameState.phase === 'DRAW';

  return (
    <div className="relative w-full max-w-5xl h-[75vh] min-h-[600px] mx-auto mt-4 sm:mt-8 mb-32 px-2 sm:px-8">
      <div className="absolute inset-0 game-table-felt rounded-[100px] sm:rounded-[200px] overflow-hidden shadow-2xl border-4 border-[#1a3822]">
        <div className="absolute inset-0 felt-overlay mix-blend-overlay"></div>
        
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
          <div className="absolute top-12 w-full text-center px-12 z-20">
            {gameState.messages.slice(-1).map(msg => (
              <p key={msg.id} className="text-white/90 text-sm sm:text-base font-mono animate-in fade-in slide-in-from-top-2 drop-shadow-md bg-black/40 inline-block px-4 py-1 rounded-full">
                {msg.text}
              </p>
            ))}
          </div>

          <div className="text-white/30 text-xs sm:text-sm font-mono tracking-[0.2em] mb-4 sm:mb-8 uppercase text-center mt-8">
            {gameState.phase.replace(/_/g, ' ')}
          </div>
          
          <div className="flex flex-col items-center gap-3 sm:gap-6 mb-4 sm:mb-10 origin-center pointer-events-auto mt-4 sm:mt-8">
            <div className="flex gap-2 sm:gap-4">
              {Array.from({ length: 5 }).map((_, colIndex) => (
                <div key={`pair-${colIndex}`} className="flex flex-col gap-1.5 sm:gap-2.5 bg-black/30 p-2 sm:p-3 rounded-xl border border-white/10 shadow-inner">
                  <div className="w-[50px] h-[72px] sm:w-[68px] sm:h-[96px] flex-shrink-0">
                    <PlayingCard 
                      card={gameState.communityCards[colIndex * 2]} 
                      selected={gameState.phase === 'SHOWDOWN' && gameState.players.some(p => p.score?.highEval?.usedCommunityCardIndices.includes(colIndex * 2) || p.score?.lowEval?.usedCommunityCardIndices.includes(colIndex * 2))}
                      className="w-full h-full"
                    />
                  </div>
                  <div className="w-[50px] h-[72px] sm:w-[68px] sm:h-[96px] flex-shrink-0">
                    <PlayingCard 
                      card={gameState.communityCards[colIndex * 2 + 1]} 
                      selected={gameState.phase === 'SHOWDOWN' && gameState.players.some(p => p.score?.highEval?.usedCommunityCardIndices.includes(colIndex * 2 + 1) || p.score?.lowEval?.usedCommunityCardIndices.includes(colIndex * 2 + 1))}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2 sm:gap-4 mt-2">
              {Array.from({ length: 5 }).map((_, colIndex) => (
                <div key={`single-${colIndex}`} className="flex justify-center w-[66px] sm:w-[92px]">
                  <div className="w-[50px] h-[72px] sm:w-[68px] sm:h-[96px] flex-shrink-0">
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

          <div className="flex items-center gap-4 z-20">
            <DiscardPile messages={gameState.messages} isDrawPhase={isDrawPhase} />
            <div className="bg-black/60 backdrop-blur-sm border border-white/10 px-6 sm:px-8 py-2 sm:py-3 rounded-full flex flex-col items-center shadow-[0_0_30px_rgba(0,0,0,0.5)]">
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
    </div>
  );
}
