import { useState, useEffect, useCallback } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { useServerMode } from "@/lib/poker/engine/useServerMode";
import { Fifteen35Mode } from "@/lib/poker/modes/fifteen35";
import { BadugiTable } from "@/components/game/BadugiTable";
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
import { XPToast } from "@/components/XPToast";
import { useXPWatcher } from "@/lib/useXPWatcher";
import { generateTableCode } from "@/lib/tableSession";

const useServer = import.meta.env.VITE_BADUGI_ALPHA === 'true';

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

function Fifteen35GameServer({ tableId }: { tableId: string }) {
  const { state, handleAction, myId, role, sessionStats } = useServerMode(tableId, 'fifteen35');
  const isSpectator = role === 'spectator';
  const humanCount = state.players.filter(p => p.presence === 'human').length;
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "15 / 35");
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <ModeIntro modeId="fifteen35" {...MODE_INTROS.fifteen35} />
      <GameHeader mode={MODE_INFO.fifteen35} modeId="fifteen35" chips={me?.chips || 0} phase={state.phase} pot={state.pot} onForfeit={() => { if (me) saveChips('fifteen35', me.chips); }} sessionStats={isSpectator ? undefined : sessionStats} tableId={tableId} />
      {isSpectator
        ? <SpectatorBanner spectatorCount={state.spectatorCount} />
        : <InviteBanner tableId={tableId} mode="fifteen35" humanCount={humanCount} />
      }
      {!isSpectator && state.spectatorCount != null && state.spectatorCount > 0 && (
        <div className="flex justify-center pt-1">
          <SpectatorWatchingBadge count={state.spectatorCount} />
        </div>
      )}
      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable gameState={state} myId={isSpectator ? 'p1' : myId} selectedCardIndices={[]} onCardClick={() => {}} selectableCards={false} showVisibleCount={true} modeId="fifteen35" />
      </main>
      {xpToast && xpToast.xpGained > 0 && <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp} newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />}
      {!isSpectator && (
        <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
          <div className="pointer-events-auto w-full max-w-md px-2">
            <ActionControls phase={state.phase} currentBet={state.currentBet} myBet={me?.bet || 0} pot={state.pot} chips={me?.chips || 0} onAction={(action, amount) => handleAction(action, amount)} isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'} selectedCardsCount={0} phaseHint={getPhaseHint('fifteen35', state.phase)} />
          </div>
        </div>
      )}
      <ChatBox messages={state.chatMessages} myId={myId} onSendMessage={(text) => handleAction('chat', text)} />
    </div>
  );
}

function Fifteen35GameClient() {
  const myId = 'p1';
  const { state, handleAction } = useGameEngine(Fifteen35Mode, myId);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "15 / 35");
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <ModeIntro modeId="fifteen35" {...MODE_INTROS.fifteen35} />
      <GameHeader mode={MODE_INFO.fifteen35} modeId="fifteen35" chips={me?.chips || 0} phase={state.phase} pot={state.pot} onForfeit={() => { if (me) saveChips('fifteen35', me.chips); }} />
      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable gameState={state} myId={myId} selectedCardIndices={[]} onCardClick={() => {}} selectableCards={false} showVisibleCount={true} modeId="fifteen35" />
      </main>
      {xpToast && xpToast.xpGained > 0 && <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp} newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />}
      <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
        <div className="pointer-events-auto w-full max-w-md px-2">
          <ActionControls phase={state.phase} currentBet={state.currentBet} myBet={me?.bet || 0} pot={state.pot} chips={me?.chips || 0} onAction={(action, amount) => handleAction(action, amount)} isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'} selectedCardsCount={0} phaseHint={getPhaseHint('fifteen35', state.phase)} />
        </div>
      </div>
      <ChatBox messages={state.chatMessages} myId={myId} onSendMessage={(text) => handleAction('chat', text)} />
    </div>
  );
}

export default function Fifteen35Game() {
  useEffect(() => { trackModePlay("fifteen35"); }, []);
  const [tableId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('t') || generateTableCode();
  });
  if (useServer) return <Fifteen35GameServer tableId={tableId} />;
  return <Fifteen35GameClient />;
}
