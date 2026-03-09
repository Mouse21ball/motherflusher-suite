import { GameState, Player } from "@/lib/poker/types";
import { PlayerSeat } from "./PlayerSeat";
import { PlayingCard } from "./Card";

interface GameTableProps {
  gameState: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
}

export function GameTable({ gameState, myId, selectedCardIndices, onCardClick, selectableCards }: GameTableProps) {
  // Logic to arrange players around the table, putting "me" at the bottom
  const myIndex = gameState.players.findIndex(p => p.id === myId);
  const orderedPlayers = [...gameState.players];
  if (myIndex !== -1) {
    const p1 = orderedPlayers.splice(myIndex);
    orderedPlayers.unshift(...p1);
  }

  // Map 0-5 index to CSS classes for positioning around an oval table
  // Adjust spacing so cards/seats don't overlap, particularly on the sides.
  const getSeatPosition = (index: number, total: number) => {
    const positions = [
      "bottom-2 left-1/2 -translate-x-1/2 scale-110 origin-bottom", // Me (bottom center)
      "bottom-32 sm:bottom-40 -left-6 sm:left-4 scale-75 origin-left", // Bottom left
      "top-16 sm:top-24 -left-6 sm:left-4 scale-75 origin-left",   // Top left
      "top-4 left-1/2 -translate-x-1/2 scale-75 origin-top",    // Top center
      "top-16 sm:top-24 -right-6 sm:right-4 scale-75 origin-right",  // Top right
      "bottom-32 sm:bottom-40 -right-6 sm:right-4 scale-75 origin-right", // Bottom right
    ];
    return positions[index] || "hidden";
  };

  return (
    <div className="relative w-full max-w-5xl h-[75vh] min-h-[600px] mx-auto mt-4 sm:mt-8 mb-32 px-2 sm:px-8">
      {/* The Felt */}
      <div className="absolute inset-0 game-table-felt rounded-[100px] sm:rounded-[200px] overflow-hidden shadow-2xl border-4 border-[#1a3822]">
        <div className="absolute inset-0 felt-overlay mix-blend-overlay"></div>
        
        {/* Table Center Info & Community Cards */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
          
          {/* Game Logs / Messages */}
          <div className="absolute top-12 w-full text-center px-12 z-20">
            {gameState.messages.slice(-1).map(msg => (
              <p key={msg.id} className="text-white/90 text-sm sm:text-base font-mono animate-in fade-in slide-in-from-top-2 drop-shadow-md bg-black/40 inline-block px-4 py-1 rounded-full">
                {msg.text}
              </p>
            ))}
          </div>

          <div className="text-white/30 text-xs sm:text-sm font-mono tracking-[0.2em] mb-4 sm:mb-8 uppercase text-center mt-8">
            {gameState.phase.replace('_', ' ')}
          </div>
          
          {/* 15-Card Community Board */}
          <div className="flex flex-col items-center gap-2 sm:gap-4 mb-4 sm:mb-8 scale-75 sm:scale-100 origin-center pointer-events-auto">
            {/* Top Row: 5 Pairs */}
            <div className="flex gap-2 sm:gap-4">
              {Array.from({ length: 5 }).map((_, colIndex) => (
                <div key={`pair-${colIndex}`} className="flex flex-col gap-1 bg-black/20 p-1 sm:p-2 rounded-lg border border-white/5">
                  <div className="scale-[0.6] sm:scale-75 origin-top w-[42px] sm:w-[60px] h-[60px] sm:h-[84px] mb-[-24px] sm:mb-[-20px]">
                    <PlayingCard card={gameState.communityCards[colIndex * 2]} />
                  </div>
                  <div className="scale-[0.6] sm:scale-75 origin-top w-[42px] sm:w-[60px] h-[60px] sm:h-[84px]">
                    <PlayingCard card={gameState.communityCards[colIndex * 2 + 1]} />
                  </div>
                </div>
              ))}
            </div>
            
            {/* Bottom Row: 5 Singles */}
            <div className="flex gap-2 sm:gap-4 px-1 sm:px-2">
              {Array.from({ length: 5 }).map((_, colIndex) => (
                <div key={`single-${colIndex}`} className="flex justify-center w-[50px] sm:w-[76px]">
                  <div className="scale-[0.6] sm:scale-75 origin-center w-[42px] sm:w-[60px] h-[60px] sm:h-[84px]">
                    <PlayingCard card={gameState.communityCards[10 + colIndex]} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-black/60 backdrop-blur-sm border border-white/10 px-6 sm:px-8 py-2 sm:py-3 rounded-full flex flex-col items-center shadow-[0_0_30px_rgba(0,0,0,0.5)] z-20">
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

      {/* Seats */}
      {Array.from({ length: 6 }).map((_, i) => {
        const player = orderedPlayers[i];
        return (
          <div key={i} className={`absolute ${getSeatPosition(i, 6)} z-30`}>
             <PlayerSeat 
               player={player || null} 
               seatNumber={i}
               isActive={player?.id === gameState.activePlayerId}
               isSelf={player?.id === myId}
               selectedCardIndices={player?.id === myId ? selectedCardIndices : undefined}
               onCardClick={onCardClick}
               selectableCards={selectableCards}
               className={player?.id === myId ? "bg-black/80 p-4 rounded-xl shadow-2xl border border-white/10 backdrop-blur-md pb-6" : ""}
             />
          </div>
        );
      })}
    </div>
  );
}