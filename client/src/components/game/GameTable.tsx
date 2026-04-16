import { useState, useEffect, useRef } from "react";
import { GameState, ReactionEvent } from "@/lib/poker/types";
import { PlayerSeat } from "./PlayerSeat";
import { PlayingCard } from "./Card";
import { ResolutionOverlay } from "./ResolutionOverlay";
import { WinCelebration } from "./WinCelebration";
import { ReactionBar } from "./ReactionBar";
import { getPhaseLabel } from "@/lib/phaseLabel";

interface GameTableProps {
  gameState: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
  onReact?: (emoji: string) => void;
  incomingReactions?: ReactionEvent[];
}

export function GameTable({ gameState, myId, selectedCardIndices, onCardClick, selectableCards, onReact, incomingReactions }: GameTableProps) {
  const myIndex = gameState.players.findIndex(p => p.id === myId);
  const orderedPlayers = [...gameState.players];
  if (myIndex !== -1) {
    const p1 = orderedPlayers.splice(myIndex);
    orderedPlayers.unshift(...p1);
  }

  // Pot pulse when value increases
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

  // Win celebration — context-aware triggers, not raw chip thresholds
  const [showCelebration, setShowCelebration] = useState(false);
  const celebFiredRef = useRef(false);
  useEffect(() => {
    if (gameState.phase === 'SHOWDOWN' && !celebFiredRef.current) {
      const hero = gameState.players.find(p => p.id === myId);
      if (!hero?.isWinner) return;

      // Scoop: hero declared SWING and holds both a high and low score at resolution.
      // This is the rarest meaningful outcome in Mother Flusher.
      const isSwingScoop =
        hero.declaration === 'SWING' &&
        !!(hero.score?.high && hero.score?.low);

      // Contested win: at least one other player was still active at showdown
      // (i.e., did not fold before resolution — they chose to stay and lost).
      const activeAtShowdown = gameState.players.filter(p => p.status !== 'folded').length;
      const isContestedWin = activeAtShowdown >= 2;

      // Pot significance: the pot grew meaningfully beyond the opening antes.
      // minBet * 8 means at least 4 players posted + one raise round, or
      // a smaller table where several raises happened. Eliminates uncontested pots.
      const potIsSignificant = gameState.pot >= gameState.minBet * 8;

      const shouldCelebrate = isSwingScoop || (isContestedWin && potIsSignificant);

      if (shouldCelebrate) {
        celebFiredRef.current = true;
        setShowCelebration(true);
      }
    }
    if (gameState.phase !== 'SHOWDOWN') {
      celebFiredRef.current = false;
    }
  }, [gameState.phase, gameState.players, gameState.pot, gameState.minBet, myId]);

  // Scoop detection for the particle burst intensity (more particles + ring effect)
  const heroAtShowdown = gameState.players.find(p => p.id === myId);
  const isScoop =
    !!heroAtShowdown?.isWinner &&
    heroAtShowdown.declaration === 'SWING' &&
    !!(heroAtShowdown.score?.high && heroAtShowdown.score?.low);

  const getSeatPosition = (index: number) => {
    const positions = [
      "-bottom-3 sm:-bottom-6 left-1/2 -translate-x-1/2 scale-[1.05] sm:scale-110 origin-bottom",
      "-left-1 sm:-left-4 bottom-[8%] sm:bottom-[10%] scale-[0.6] sm:scale-[0.7] origin-bottom-left",
      "top-2 sm:top-4 left-[8%] sm:left-[14%] scale-[0.6] sm:scale-[0.7] origin-top-left",
      "top-2 sm:top-4 right-[8%] sm:right-[14%] scale-[0.6] sm:scale-[0.7] origin-top-right",
      "-right-1 sm:-right-4 bottom-[8%] sm:bottom-[10%] scale-[0.6] sm:scale-[0.7] origin-bottom-right",
    ];
    return positions[index] || "hidden";
  };

  // Show live message or fall back to phase label — never both
  const lastMsg = gameState.messages[gameState.messages.length - 1];
  const isIdleMessage = !lastMsg || lastMsg.text === 'Game ready. Waiting for start...';
  const showMessage = gameState.phase !== 'SHOWDOWN' && !isIdleMessage;

  return (
    <div className="relative w-full max-w-5xl mx-auto mt-4 sm:mt-8 mb-8 sm:mb-24 px-2 sm:px-8">
      <div className="relative h-[70vh] min-h-[360px] sm:min-h-[560px]">
        <div className="absolute inset-0 game-table-felt rounded-[100px] sm:rounded-[200px] overflow-hidden shadow-2xl">
          <div className="absolute inset-0 felt-overlay mix-blend-overlay"></div>

          <div className="absolute inset-0 flex flex-col items-center justify-start pointer-events-none pt-1.5 sm:pt-7">

            {/* Single focal point: live message fades out, then phase label */}
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
                  key={gameState.phase}
                  className="text-white/22 text-[10px] font-mono tracking-[0.2em] uppercase anim-phase-snap"
                  data-testid="text-phase"
                >
                  {getPhaseLabel(gameState.phase)}
                </span>
              )}
            </div>

            {/* ── Mother Flusher community card layout ── */}
            {/*
              5 columns of solitaire-style stacked pairs, then 5 single factor cards.
              Each pair: top card peeks (26px mobile / 34px desktop), full bottom card below.
              Negative margin overlap creates the cascade without absolute positioning.
            */}
            <div className="flex flex-col items-center gap-1 sm:gap-4 mb-0 sm:mb-6 origin-center pointer-events-auto">

              {/* Inline pot — flow-positioned, never clips with seats */}
              {gameState.pot > 0 && (
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#080809]/80 border border-[#C9A227]/14 ${potPulse ? 'anim-chip-pop' : ''}`} data-testid="text-pot">
                  <div className="gold-chip" />
                  <span className={`text-sm font-mono font-bold tabular-nums transition-colors duration-150 ${potPulse ? 'text-[#C9A227]' : 'text-white/80'}`}>
                    ${gameState.pot}
                  </span>
                  <span className="text-[7px] font-mono uppercase tracking-[0.2em] text-[#C9A227]/50 ml-0.5">pot</span>
                </div>
              )}

              {/* Pair columns — stacked solitaire cascade */}
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[7px] font-mono uppercase tracking-[0.32em] text-purple-400/40 select-none">Pair Stacks</span>
              <div className="flex gap-2 sm:gap-3 card-depth-shadow">
                {Array.from({ length: 5 }).map((_, colIndex) => {
                  const topIdx = colIndex * 2;
                  const btmIdx = colIndex * 2 + 1;
                  const isUsed = (idx: number) =>
                    gameState.phase === 'SHOWDOWN' &&
                    gameState.players.some(p =>
                      p.score?.highEval?.usedCommunityCardIndices.includes(idx) ||
                      p.score?.lowEval?.usedCommunityCardIndices.includes(idx)
                    );

                  return (
                    <div key={`stack-${colIndex}`} className="flex flex-col items-center">
                      {/* Top card — only peek portion visible above bottom card */}
                      <div className="w-[50px] h-[72px] sm:w-[70px] sm:h-[98px] flex-shrink-0 relative" style={{ zIndex: 1 }}>
                        <PlayingCard
                          card={gameState.communityCards[topIdx]}
                          selected={isUsed(topIdx)}
                          className="w-full h-full"
                        />
                      </div>
                      {/* Bottom card — slides over top card, creating cascade effect */}
                      {/* -mt-[46px] = 72 - 26 → 26px of top card peeks on mobile */}
                      {/* sm:-mt-[64px] = 98 - 34 → 34px of top card peeks on desktop */}
                      <div
                        className="w-[50px] h-[72px] sm:w-[70px] sm:h-[98px] flex-shrink-0 relative -mt-[46px] sm:-mt-[64px]"
                        style={{ zIndex: 2 }}
                      >
                        <PlayingCard
                          card={gameState.communityCards[btmIdx]}
                          selected={isUsed(btmIdx)}
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>{/* end pair-stacks wrapper */}

              {/* Factor row — 5 single cards */}
              <div className="flex flex-col items-center gap-1.5 mt-0">
                <div className="w-full flex items-center gap-2 justify-center">
                  <div className="h-px flex-1 max-w-[60px] bg-white/[0.06]" />
                  <span className="text-[7px] font-mono uppercase tracking-[0.32em] text-purple-400/30 select-none">Factors</span>
                  <div className="h-px flex-1 max-w-[60px] bg-white/[0.06]" />
                </div>
                <div className="flex gap-1 sm:gap-3 card-depth-shadow">
                {Array.from({ length: 5 }).map((_, colIndex) => {
                  const idx = 10 + colIndex;
                  const isUsed =
                    gameState.phase === 'SHOWDOWN' &&
                    gameState.players.some(p =>
                      p.score?.highEval?.usedCommunityCardIndices.includes(idx) ||
                      p.score?.lowEval?.usedCommunityCardIndices.includes(idx)
                    );
                  return (
                    <div key={`single-${colIndex}`} className="flex justify-center w-[50px] sm:w-[70px]">
                      <div className="w-[50px] h-[72px] sm:w-[70px] sm:h-[98px] flex-shrink-0">
                        <PlayingCard
                          card={gameState.communityCards[idx]}
                          selected={isUsed}
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Win celebration — gold particle burst, only on meaningful wins */}
        {showCelebration && (
          <WinCelebration
            isScoop={isScoop}
            onDone={() => setShowCelebration(false)}
          />
        )}

        {/* Reaction tray — anchored to the table felt bottom center, floats travel into table space */}
        {onReact && (
          <div className="absolute bottom-[7%] left-1/2 -translate-x-1/2 z-30">
            <ReactionBar
              onReact={onReact}
              incomingReactions={incomingReactions}
            />
          </div>
        )}


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
