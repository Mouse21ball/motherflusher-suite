import { useState, useEffect, useRef } from "react";
import { GameState } from "@/lib/poker/types";
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

  // #5 — Pot pulse: fires briefly whenever the pot value increases
  const [potPulse, setPotPulse] = useState(false);
  const prevPotRef = useRef(gameState.pot);
  useEffect(() => {
    if (gameState.pot !== prevPotRef.current && gameState.pot > 0) {
      setPotPulse(true);
      const t = setTimeout(() => setPotPulse(false), 280);
      prevPotRef.current = gameState.pot;
      return () => clearTimeout(t);
    }
    prevPotRef.current = gameState.pot;
  }, [gameState.pot]);

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

  // #4 — determine whether to show a live message or fall back to the phase label
  const lastMsg = gameState.messages[gameState.messages.length - 1];
  const isIdleMessage = !lastMsg || lastMsg.text === 'Game ready. Waiting for start...';
  const showMessage = gameState.phase !== 'SHOWDOWN' && !isIdleMessage;

  return (
    <div className="relative w-full max-w-5xl mx-auto mt-4 sm:mt-8 mb-32 px-2 sm:px-8">
      <div className="relative h-[70vh] min-h-[560px]">
        <div className="absolute inset-0 game-table-felt rounded-[100px] sm:rounded-[200px] overflow-hidden shadow-2xl">
          <div className="absolute inset-0 felt-overlay mix-blend-overlay"></div>

          <div className="absolute inset-0 flex flex-col items-center justify-start pointer-events-none pt-6 sm:pt-8">

            {/* #1 + #4 — Single focal point: message auto-fades, phase label is fallback */}
            <div className="text-center pointer-events-auto mb-1.5 sm:mb-2.5 min-h-[28px] flex items-center justify-center">
              {showMessage ? (
                <p
                  key={lastMsg.id}
                  className="text-white/60 text-[10px] sm:text-xs font-mono anim-message-auto bg-[#0B0B0D]/75 backdrop-blur-sm inline-block px-3 py-1.5 rounded-full border border-white/[0.05]"
                  data-testid="text-game-message"
                >
                  {lastMsg.text}
                </p>
              ) : (
                <span
                  className="text-white/20 text-[10px] font-mono tracking-[0.2em] uppercase"
                  data-testid="text-phase"
                >
                  {getPhaseLabel(gameState.phase)}
                </span>
              )}
            </div>

            <div className="flex flex-col items-center gap-2 sm:gap-4 mb-3 sm:mb-6 origin-center pointer-events-auto">
              <div className="flex gap-1 sm:gap-3">
                {Array.from({ length: 5 }).map((_, colIndex) => (
                  <div key={`pair-${colIndex}`} className="flex flex-col gap-1 sm:gap-2 bg-black/25 p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-white/[0.04]">
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

          </div>
        </div>

        {/* #5 — Pot: number pulses gold briefly when pot value changes */}
        <div className="absolute left-3 sm:left-6 bottom-6 sm:bottom-8 z-40">
          <div className="bg-[#0B0B0D]/80 backdrop-blur-sm border border-white/[0.06] px-4 sm:px-5 py-2 sm:py-2.5 rounded-full flex flex-col items-center" data-testid="text-pot">
            <span className="text-[8px] sm:text-[9px] text-[#C9A227]/70 uppercase font-semibold tracking-[0.2em] mb-0.5 font-sans">Pot</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-[#C9A227] border border-[#C9A227]/60 flex items-center justify-center">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full border border-[#C9A227]/40"></div>
              </div>
              <span
                className={`text-base sm:text-lg font-mono font-bold tracking-tight tabular-nums transition-all duration-150 ${potPulse ? 'text-[#C9A227] scale-110' : 'text-white'}`}
              >
                ${gameState.pot}
              </span>
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
                className={player?.id === myId ? "bg-[#0B0B0D]/85 p-4 pt-3 rounded-xl shadow-xl border border-white/[0.05] backdrop-blur-sm" : ""}
              />
            </div>
          );
        })}

        <ResolutionOverlay messages={gameState.messages} phase={gameState.phase} heroPlayer={gameState.players.find(p => p.id === myId)} heroChipChange={gameState.heroChipChange} />
      </div>
    </div>
  );
}
