import { GameState, CardType } from "@/lib/poker/types";
import { PlayerSeat } from "./PlayerSeat";
import { PlayingCard } from "./Card";
import { ResolutionOverlay } from "./ResolutionOverlay";
import { cn } from "@/lib/utils";
import { getPhaseLabel } from "@/lib/phaseLabel";

interface SuitsPokerTableProps {
  gameState: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
}

function CommunityCard({ card }: { card?: CardType }) {
  if (!card) return null;
  return (
    <div className="relative">
      <PlayingCard card={card} />
    </div>
  );
}

export function SuitsPokerTable({ gameState, myId, selectedCardIndices, onCardClick, selectableCards }: SuitsPokerTableProps) {
  const myIndex = gameState.players.findIndex(p => p.id === myId);
  const orderedPlayers = [...gameState.players];
  if (myIndex !== -1) {
    const p1 = orderedPlayers.splice(myIndex);
    orderedPlayers.unshift(...p1);
  }

  const opponents = orderedPlayers.slice(1);
  const me = orderedPlayers[0];
  const isShowdown = gameState.phase === 'SHOWDOWN';
  const cc = gameState.communityCards;

  const sideA = cc.slice(0, 3);
  const sideB = cc.slice(3, 6);
  const center = cc.slice(6, 9);
  const lower = cc.slice(9, 11);
  const final = cc.slice(11, 12);

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
        {gameState.phase !== 'SHOWDOWN' && gameState.messages.slice(-1).map(msg => (
          <p key={msg.id} className="text-white/70 text-xs sm:text-sm font-mono animate-in fade-in slide-in-from-top-2 drop-shadow-lg bg-[#0B0B0D]/80 backdrop-blur-sm inline-block px-3 py-1.5 rounded-full border border-white/[0.06]" data-testid="text-game-message">
            {msg.text}
          </p>
        ))}
      </div>

      <div className="relative w-full rounded-[80px] sm:rounded-[120px] game-table-felt shadow-2xl overflow-visible min-h-[380px] sm:min-h-[480px]">
        <div className="absolute inset-0 felt-overlay mix-blend-overlay pointer-events-none rounded-[76px] sm:rounded-[116px]"></div>

        {opponents.map((player, i) => (
          <div key={player.id} className={`absolute ${getOpponentPosition(i, opponents.length)} z-20 scale-[0.7] sm:scale-[0.8] origin-center`}>
            <PlayerSeat
              player={player}
              seatNumber={i + 1}
              isActive={player.id === gameState.activePlayerId}
              isSelf={false}
              showdownState={isShowdown}
            />
          </div>
        ))}

        <div className="relative z-10 flex flex-col items-center justify-end min-h-[380px] sm:min-h-[480px] px-2 sm:px-8 pt-[120px] sm:pt-[140px] pb-6">
          <div className="flex flex-col items-center gap-1.5 sm:gap-2">
            <div className="text-white/30 text-xs sm:text-sm font-mono tracking-[0.2em] uppercase font-medium" data-testid="text-phase">
              {getPhaseLabel(gameState.phase)}
            </div>

            <div className="scale-75 sm:scale-100 origin-center">
              <div className="flex items-start justify-center">
                <div className="flex flex-col items-center pt-2 sm:pt-3">
                  <span className="text-[8px] sm:text-[10px] text-amber-400/60 font-mono uppercase tracking-wider font-bold mb-1">Side A</span>
                  <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1.5 sm:p-2 border border-white/[0.06]">
                    {sideA.map((card, i) => <CommunityCard key={i} card={card} />)}
                  </div>
                  <span className="text-[7px] sm:text-[8px] text-white/40 font-mono mt-1">← path</span>
                </div>

                <div className="mx-4 sm:mx-8 flex flex-col items-center">
                  <span className="text-[8px] sm:text-[10px] text-green-400/60 font-mono uppercase tracking-wider font-bold mb-1">Center</span>
                  <div className="flex flex-col items-center gap-1 sm:gap-1.5">
                    <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1.5 sm:p-2 border border-white/[0.06]">
                      {center.map((card, i) => <CommunityCard key={i} card={card} />)}
                    </div>
                    <div className="w-px h-1 sm:h-1.5 bg-white/10"></div>
                    <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1.5 sm:p-2 border border-white/[0.06]">
                      {lower.map((card, i) => <CommunityCard key={i} card={card} />)}
                    </div>
                    <div className="w-px h-1 sm:h-1.5 bg-white/10"></div>
                    <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1.5 sm:p-2 border border-white/[0.06]">
                      {final.map((card, i) => <CommunityCard key={i} card={card} />)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center pt-2 sm:pt-3">
                  <span className="text-[8px] sm:text-[10px] text-cyan-400/60 font-mono uppercase tracking-wider font-bold mb-1">Side B</span>
                  <div className="flex gap-0.5 sm:gap-1 bg-white/[0.04] rounded-lg p-1.5 sm:p-2 border border-white/[0.06]">
                    {sideB.map((card, i) => <CommunityCard key={i} card={card} />)}
                  </div>
                  <span className="text-[7px] sm:text-[8px] text-white/40 font-mono mt-1">path →</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[8px] sm:text-[10px] font-mono text-white/45">
              <span className="text-amber-400/60">A</span>
              <span className="text-white/35">+</span>
              <span className="text-green-400/60">Center</span>
              <span className="text-white/40 mx-0.5">or</span>
              <span className="text-cyan-400/60">B</span>
              <span className="text-white/35">+</span>
              <span className="text-green-400/60">Center</span>
            </div>

            <div className="bg-[#0B0B0D]/70 backdrop-blur-sm border border-white/[0.06] px-5 sm:px-8 py-2.5 sm:py-3 rounded-full flex flex-col items-center" data-testid="text-pot">
              <span className="text-[9px] text-[#C9A227]/70 uppercase font-semibold tracking-[0.2em] mb-0.5 font-sans">Pot</span>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#C9A227] border border-[#C9A227]/60 flex items-center justify-center">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-[#C9A227]/40"></div>
                </div>
                <span className="text-lg sm:text-2xl font-mono text-white font-bold tracking-tight">${gameState.pot}</span>
              </div>
            </div>
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
            className="bg-[#0B0B0D]/85 p-3 sm:p-4 rounded-xl shadow-2xl border border-white/[0.06] backdrop-blur-md pb-4 sm:pb-6"
          />
        )}
      </div>

      <ResolutionOverlay messages={gameState.messages} phase={gameState.phase} />
    </div>
  );
}
