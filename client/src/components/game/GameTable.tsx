import { GameState, Player } from "@/lib/poker/types";
import { PlayerSeat } from "./PlayerSeat";

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
  const getSeatPosition = (index: number, total: number) => {
    const positions = [
      "bottom-32 sm:bottom-40 left-1/2 -translate-x-1/2", // Me (bottom center)
      "bottom-24 -left-4",                  // Bottom left
      "top-1/2 -left-4 -translate-y-1/2",   // Left center
      "top-4 left-1/2 -translate-x-1/2",    // Top center
      "top-1/2 -right-4 -translate-y-1/2",  // Right center
      "bottom-24 -right-4",                 // Bottom right
    ];
    return positions[index] || "hidden";
  };

  return (
    <div className="relative w-full max-w-4xl aspect-[4/3] sm:aspect-[2/1] mx-auto mt-8 sm:mt-16 mb-24 px-4 sm:px-12">
      {/* The Felt */}
      <div className="absolute inset-0 game-table-felt rounded-[100px] sm:rounded-[200px] overflow-hidden">
        <div className="absolute inset-0 felt-overlay mix-blend-overlay"></div>
        
        {/* Table Center Info */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center">
          <div className="text-white/30 text-sm font-mono tracking-[0.2em] mb-4 uppercase text-center">
            {gameState.phase.replace('_', ' ')}
          </div>
          
          <div className="bg-black/40 backdrop-blur-sm border border-white/10 px-6 py-3 rounded-full flex flex-col items-center transition-all duration-500 scale-100 hover:scale-105">
            <span className="text-[10px] text-primary uppercase font-bold tracking-widest mb-1">Total Pot</span>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-yellow-500 border-2 border-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.3)] flex items-center justify-center">
                <div className="w-3 h-3 rounded-full border border-yellow-600"></div>
              </div>
              <span className="text-2xl font-mono text-white font-bold">${gameState.pot}</span>
            </div>
          </div>
          
          {/* Game Logs / Messages */}
          <div className="absolute top-full mt-8 w-64 text-center">
            {gameState.messages.slice(-1).map(msg => (
              <p key={msg.id} className="text-white/80 text-sm font-mono animate-in fade-in slide-in-from-bottom-2 drop-shadow-md">
                {msg.text}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Seats */}
      {Array.from({ length: 6 }).map((_, i) => {
        const player = orderedPlayers[i];
        return (
          <div key={i} className={`absolute ${getSeatPosition(i, 6)} z-10`}>
             <PlayerSeat 
               player={player || null} 
               seatNumber={i}
               isActive={player?.id === gameState.activePlayerId}
               isSelf={player?.id === myId}
               selectedCardIndices={player?.id === myId ? selectedCardIndices : undefined}
               onCardClick={onCardClick}
               selectableCards={selectableCards}
             />
          </div>
        );
      })}
    </div>
  );
}