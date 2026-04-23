import { useState, useEffect, useCallback } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { useServerMode } from "@/lib/poker/engine/useServerMode";
import { SuitsPokerMode } from "@/lib/poker/modes/suitspoker";
import { SuitsPokerTable } from "@/components/game/SuitsPokerTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";
import { GameHeader, MODE_INFO } from "@/components/game/GameHeader";
import { ModeIntro, MODE_INTROS } from "@/components/game/ModeIntro";
import { SpectatorBanner, SpectatorWatchingBadge } from "@/components/game/SpectatorBanner";
import { usePhaseSounds } from "@/lib/usePhaseSounds";
import { getPhaseHint } from "@/lib/phaseHints";
import { useGameToasts } from "@/lib/useGameToasts";
import { saveChips } from "@/lib/persistence";
import { trackModePlay } from "@/lib/analytics";
import { Declaration } from "@/lib/poker/types";
import { XPToast } from "@/components/XPToast";
import { useXPWatcher } from "@/lib/useXPWatcher";
import { generateTableCode } from "@/lib/tableSession";

const useServer = import.meta.env.VITE_BADUGI_ALPHA === 'true';

const spDeclarationOptions: { label: string; value: Declaration; className: string }[] = [
  { label: 'POKER', value: 'POKER', className: 'border-red-500/50 hover:bg-red-500/20 text-red-100' },
  { label: 'SWING', value: 'SWING', className: 'border-purple-500/50 hover:bg-purple-500/20 text-purple-100' },
  { label: 'SUITS', value: 'SUITS', className: 'border-cyan-500/50 hover:bg-cyan-500/20 text-cyan-100' },
];

function InviteBanner({ tableId, mode, humanCount = 1 }: { tableId: string; mode: string; humanCount?: number }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/${mode}?t=${tableId}`;
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [url]);
  return (
    <div className="w-full px-2 pt-2">
      <div className="max-w-md mx-auto rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)] animate-pulse shrink-0" />
          <span className="text-[10px] text-white/35 font-mono truncate">
            {humanCount >= 2
              ? <><span className="text-emerald-400/70 font-bold">{humanCount} players</span> · share link to fill table</>
              : <>Table <span className="text-emerald-400/70 font-bold">{tableId}</span> · invite a friend to play</>
            }
          </span>
        </div>
        <button onClick={handleCopy} data-testid="button-copy-invite"
          className={`shrink-0 text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-lg border transition-all duration-200 ${copied ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-white/30 border-white/[0.06] hover:text-white/55 hover:border-white/[0.12]'}`}>
          {copied ? '✓ Invite Copied' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}

function SuitsPokerGameServer({ tableId }: { tableId: string }) {
  const { state, handleAction, myId, role, sessionStats } = useServerMode(tableId, 'suits_poker');
  const isSpectator = role === 'spectator';
  const humanCount = state.players.filter(p => p.presence === 'human').length;
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "Suits & Poker");
  useEffect(() => { setSelectedCardIndices([]); }, [state.phase]);
  const handleCardClick = (index: number) => {
    if (isSpectator || state.phase !== 'DRAW') return;
    setSelectedCardIndices(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length < 2) return [...prev, index];
      return prev;
    });
  };
  const handleControlAction = (action: string, amount?: number) => {
    if (action === 'draw') handleAction(action, selectedCardIndices);
    else handleAction(action, amount);
  };
  const isSelectablePhase = state.phase === 'DRAW';
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <ModeIntro modeId="suitspoker" {...MODE_INTROS.suitspoker} />
      <GameHeader mode={MODE_INFO.suitspoker} modeId="suitspoker" chips={me?.chips || 0} phase={state.phase} pot={state.pot} onForfeit={() => { if (me) saveChips('suitspoker', me.chips); }} sessionStats={isSpectator ? undefined : sessionStats} tableId={tableId} />
      {isSpectator
        ? <SpectatorBanner spectatorCount={state.spectatorCount} />
        : <InviteBanner tableId={tableId} mode="suitspoker" humanCount={humanCount} />
      }
      {!isSpectator && state.spectatorCount != null && state.spectatorCount > 0 && (
        <div className="flex justify-center pt-1">
          <SpectatorWatchingBadge count={state.spectatorCount} />
        </div>
      )}
      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <SuitsPokerTable gameState={state} myId={isSpectator ? 'p1' : myId} selectedCardIndices={isSpectator ? [] : selectedCardIndices} onCardClick={handleCardClick} selectableCards={!isSpectator && isSelectablePhase} />
      </main>
      {xpToast && xpToast.xpGained > 0 && <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp} newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />}
      {!isSpectator && (
        <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
          <div className="pointer-events-auto w-full max-w-md px-2">
            <ActionControls phase={state.phase} currentBet={state.currentBet} myBet={me?.bet || 0} pot={state.pot} chips={me?.chips || 0} onAction={handleControlAction} isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'} selectedCardsCount={selectedCardIndices.length} declarationOptions={spDeclarationOptions} phaseHint={getPhaseHint('suitspoker', state.phase)} />
          </div>
        </div>
      )}
      <ChatBox messages={state.chatMessages} myId={myId} onSendMessage={(text) => handleAction('chat', text)} />
    </div>
  );
}

function SuitsPokerGameClient() {
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(SuitsPokerMode, myId);
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "Suits & Poker");
  useEffect(() => { setSelectedCardIndices([]); }, [state.phase]);
  const handleCardClick = (index: number) => {
    if (state.phase === 'DRAW') {
      setSelectedCardIndices(prev => {
        if (prev.includes(index)) return prev.filter(i => i !== index);
        if (prev.length < 2) return [...prev, index];
        return prev;
      });
    }
  };
  const handleControlAction = (action: string, amount?: number) => {
    if (action === 'draw') handleAction(action, selectedCardIndices);
    else handleAction(action, amount);
  };
  const isSelectablePhase = state.phase === 'DRAW';
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <ModeIntro modeId="suitspoker" {...MODE_INTROS.suitspoker} />
      <GameHeader mode={MODE_INFO.suitspoker} modeId="suitspoker" chips={me?.chips || 0} phase={state.phase} pot={state.pot} onForfeit={() => { if (me) saveChips('suitspoker', me.chips); }} />
      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <SuitsPokerTable gameState={state} myId={myId} selectedCardIndices={selectedCardIndices} onCardClick={handleCardClick} selectableCards={isSelectablePhase} />
      </main>
      {xpToast && xpToast.xpGained > 0 && <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp} newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />}
      <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
        <div className="pointer-events-auto w-full max-w-md px-2">
          <ActionControls phase={state.phase} currentBet={state.currentBet} myBet={me?.bet || 0} pot={state.pot} chips={me?.chips || 0} onAction={handleControlAction} isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'} selectedCardsCount={selectedCardIndices.length} declarationOptions={spDeclarationOptions} phaseHint={getPhaseHint('suitspoker', state.phase)} />
        </div>
      </div>
      <ChatBox messages={state.chatMessages} myId={myId} onSendMessage={(text) => handleAction('chat', text)} />
    </div>
  );
}

export default function SuitsPokerGame() {
  useEffect(() => { trackModePlay("suitspoker"); }, []);
  const [tableId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('t') || generateTableCode();
  });
  if (useServer) return <SuitsPokerGameServer tableId={tableId} />;
  return <SuitsPokerGameClient />;
}
