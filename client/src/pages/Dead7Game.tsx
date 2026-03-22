import { useState, useEffect, useCallback } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { useServerMode } from "@/lib/poker/engine/useServerMode";
import { Dead7Mode } from "@/lib/poker/modes/dead7";
import { BadugiTable } from "@/components/game/BadugiTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";
import { GameHeader, MODE_INFO } from "@/components/game/GameHeader";
import { ModeIntro, MODE_INTROS } from "@/components/game/ModeIntro";
import { usePhaseSounds } from "@/lib/usePhaseSounds";
import { getPhaseHint } from "@/lib/phaseHints";
import { useGameToasts } from "@/lib/useGameToasts";
import { saveChips } from "@/lib/persistence";
import { trackModePlay } from "@/lib/analytics";
import { XPToast } from "@/components/XPToast";
import { useXPWatcher } from "@/lib/useXPWatcher";
import { generateTableCode } from "@/lib/tableSession";

const useServer = import.meta.env.VITE_BADUGI_ALPHA === 'true';

function InviteBanner({ tableId, mode }: { tableId: string; mode: string }) {
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
            Table <span className="text-emerald-400/70 font-bold">{tableId}</span> · invite a friend to play
          </span>
        </div>
        <button onClick={handleCopy} data-testid="button-copy-invite"
          className={`shrink-0 text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-lg border transition-all duration-200 ${copied ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-white/30 border-white/[0.06] hover:text-white/55 hover:border-white/[0.12]'}`}>
          {copied ? '✓ Copied!' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}

function Dead7GameServer({ tableId }: { tableId: string }) {
  const { state, handleAction, myId } = useServerMode(tableId, 'dead7');
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "Dead 7");
  useEffect(() => { setSelectedCardIndices([]); }, [state.phase]);
  const isDrawPhase = state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3';
  const handleCardClick = (index: number) => {
    if (isDrawPhase) {
      setSelectedCardIndices(prev => {
        if (prev.includes(index)) return prev.filter(i => i !== index);
        let maxCards = 1;
        if (state.phase === 'DRAW_1') maxCards = 3;
        if (state.phase === 'DRAW_2') maxCards = 2;
        if (prev.length < maxCards) return [...prev, index];
        return prev;
      });
    }
  };
  const handleControlAction = (action: string, amount?: number | any) => {
    if (action === 'draw') handleAction(action, selectedCardIndices);
    else handleAction(action, amount);
  };
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <ModeIntro modeId="dead7" {...MODE_INTROS.dead7} />
      <GameHeader mode={MODE_INFO.dead7} modeId="dead7" chips={me?.chips || 0} phase={state.phase} pot={state.pot} onForfeit={() => { if (me) saveChips('dead7', me.chips); }} />
      <InviteBanner tableId={tableId} mode="dead7" />
      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable gameState={state} myId={myId} selectedCardIndices={selectedCardIndices} onCardClick={handleCardClick} selectableCards={isDrawPhase} heroCardClassName="w-[60px] h-20 sm:w-20 sm:h-[120px]" />
      </main>
      {xpToast && xpToast.xpGained > 0 && <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp} newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />}
      <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
        <div className="pointer-events-auto w-full max-w-md px-2">
          <ActionControls phase={state.phase} currentBet={state.currentBet} myBet={me?.bet || 0} pot={state.pot} chips={me?.chips || 0} onAction={handleControlAction} isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'} selectedCardsCount={selectedCardIndices.length} phaseHint={getPhaseHint('dead7', state.phase)} />
        </div>
      </div>
      <ChatBox messages={state.chatMessages} myId={myId} onSendMessage={(text) => handleAction('chat', text)} />
    </div>
  );
}

function Dead7GameClient() {
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(Dead7Mode, myId);
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "Dead 7");
  useEffect(() => { setSelectedCardIndices([]); }, [state.phase]);
  const isDrawPhase = state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3';
  const handleCardClick = (index: number) => {
    if (isDrawPhase) {
      setSelectedCardIndices(prev => {
        if (prev.includes(index)) return prev.filter(i => i !== index);
        let maxCards = 1;
        if (state.phase === 'DRAW_1') maxCards = 3;
        if (state.phase === 'DRAW_2') maxCards = 2;
        if (prev.length < maxCards) return [...prev, index];
        return prev;
      });
    }
  };
  const handleControlAction = (action: string, amount?: number | any) => {
    if (action === 'draw') handleAction(action, selectedCardIndices);
    else handleAction(action, amount);
  };
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <ModeIntro modeId="dead7" {...MODE_INTROS.dead7} />
      <GameHeader mode={MODE_INFO.dead7} modeId="dead7" chips={me?.chips || 0} phase={state.phase} pot={state.pot} onForfeit={() => { if (me) saveChips('dead7', me.chips); }} />
      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable gameState={state} myId={myId} selectedCardIndices={selectedCardIndices} onCardClick={handleCardClick} selectableCards={isDrawPhase} heroCardClassName="w-[60px] h-20 sm:w-20 sm:h-[120px]" />
      </main>
      {xpToast && xpToast.xpGained > 0 && <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp} newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />}
      <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
        <div className="pointer-events-auto w-full max-w-md px-2">
          <ActionControls phase={state.phase} currentBet={state.currentBet} myBet={me?.bet || 0} pot={state.pot} chips={me?.chips || 0} onAction={handleControlAction} isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'} selectedCardsCount={selectedCardIndices.length} phaseHint={getPhaseHint('dead7', state.phase)} />
        </div>
      </div>
      <ChatBox messages={state.chatMessages} myId={myId} onSendMessage={(text) => handleAction('chat', text)} />
    </div>
  );
}

export default function Dead7Game() {
  useEffect(() => { trackModePlay("dead7"); }, []);
  const [tableId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('t') || generateTableCode();
  });
  if (useServer) return <Dead7GameServer tableId={tableId} />;
  return <Dead7GameClient />;
}
