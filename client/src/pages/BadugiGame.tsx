import { useState, useEffect, useCallback } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { useServerBadugi } from "@/lib/poker/engine/useServerGame";
import { BadugiMode } from "@/lib/poker/modes/badugi";
import { FEATURES } from "@/lib/featureFlags";
import { generateTableCode } from "@/lib/tableSession";
import { BadugiTable } from "@/components/game/BadugiTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";
import { GameHeader, MODE_INFO } from "@/components/game/GameHeader";
import { ModeIntro, MODE_INTROS } from "@/components/game/ModeIntro";
import { ReactionBar } from "@/components/game/ReactionBar";
import { XPToast } from "@/components/XPToast";
import { useXPWatcher } from "@/lib/useXPWatcher";
import { usePhaseSounds } from "@/lib/usePhaseSounds";
import { getPhaseHint } from "@/lib/phaseHints";
import { useGameToasts } from "@/lib/useGameToasts";
import { saveChips } from "@/lib/persistence";
import { trackModePlay } from "@/lib/analytics";
import type { GameState } from "@/lib/poker/types";

// ─── Invite banner ────────────────────────────────────────────────────────────
// Shows the table code and a copy-link button. Encourages real multiplayer.

function InviteBanner({ tableId }: { tableId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/badugi?t=${tableId}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
        <button
          onClick={handleCopy}
          className={`shrink-0 text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-lg border transition-all duration-200 ${
            copied
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : 'text-white/30 border-white/[0.06] hover:text-white/55 hover:border-white/[0.12]'
          }`}
          data-testid="button-copy-invite"
        >
          {copied ? '✓ Copied!' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}

// ─── Shared UI layer ──────────────────────────────────────────────────────────

interface BadugiUIProps {
  state: GameState;
  handleAction: (action: string, payload?: unknown) => void;
  myId: string;
  tableId?: string;
}

function BadugiUI({ state, handleAction, myId, tableId }: BadugiUIProps) {
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();

  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "Badugi");

  useEffect(() => {
    setSelectedCardIndices([]);
  }, [state.phase]);

  const isDrawPhase = state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3';

  const handleCardClick = (index: number) => {
    if (!isDrawPhase) return;
    setSelectedCardIndices(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      let maxCards = 1;
      if (state.phase === 'DRAW_1') maxCards = 3;
      if (state.phase === 'DRAW_2') maxCards = 2;
      if (prev.length < maxCards) return [...prev, index];
      return prev;
    });
  };

  const handleControlAction = (action: string, amount?: number | unknown) => {
    if (action === 'draw') {
      handleAction(action, selectedCardIndices);
    } else {
      handleAction(action, amount);
    }
  };

  const handleSendMessage = (text: string) => {
    handleAction('chat', text);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <ModeIntro modeId="badugi" {...MODE_INTROS.badugi} />
      <GameHeader
        mode={MODE_INFO.badugi}
        modeId="badugi"
        chips={me?.chips || 0}
        phase={state.phase}
        pot={state.pot}
        onForfeit={() => { if (me) saveChips('badugi', me.chips); }}
      />

      {/* Multiplayer invite banner — shown in server-authoritative mode */}
      {tableId && <InviteBanner tableId={tableId} />}

      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable
          gameState={state}
          myId={myId}
          selectedCardIndices={selectedCardIndices}
          onCardClick={handleCardClick}
          selectableCards={isDrawPhase}
          heroCardClassName="w-[60px] h-20 sm:w-20 sm:h-[120px]"
        />
      </main>

      {/* XP toast after hand resolution */}
      {xpToast && xpToast.xpGained > 0 && (
        <XPToast
          key={xpToast.id}
          xpGained={xpToast.xpGained}
          leveledUp={xpToast.leveledUp}
          newLevel={xpToast.newLevel}
          newAchievementName={xpToast.achievementName}
          onDone={dismissXP}
        />
      )}

      {/* Reaction bar — right edge of screen, wired to server for all players */}
      <div className="fixed right-2 bottom-36 z-40">
        <ReactionBar
          onReact={(emoji) => handleAction('reaction', emoji)}
          incomingReactions={state.liveReactions}
        />
      </div>

      <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
        <div className="pointer-events-auto w-full max-w-md px-2">
          <ActionControls
            phase={state.phase}
            currentBet={state.currentBet}
            myBet={me?.bet || 0}
            pot={state.pot}
            chips={me?.chips || 0}
            onAction={handleControlAction}
            isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
            selectedCardsCount={selectedCardIndices.length}
            phaseHint={getPhaseHint('badugi', state.phase)}
          />
        </div>
      </div>

      <ChatBox
        messages={state.chatMessages}
        myId={myId}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}

// ─── Engine-specific wrappers ─────────────────────────────────────────────────

const MY_ID = 'p1';

function BadugiClientGame() {
  useEffect(() => { trackModePlay("badugi"); }, []);
  const { state, handleAction } = useGameEngine(BadugiMode, MY_ID);
  return <BadugiUI state={state} handleAction={handleAction} myId={MY_ID} />;
}

function BadugiServerGame() {
  const [tableId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('t')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(fromUrl)) return fromUrl;
    const newCode = generateTableCode();
    window.history.replaceState(null, '', `/badugi?t=${newCode}`);
    return newCode;
  });

  useEffect(() => { trackModePlay("badugi"); }, []);
  const { state, handleAction, myId } = useServerBadugi(tableId);
  return <BadugiUI state={state} handleAction={handleAction} myId={myId} tableId={tableId} />;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const isServerAuthoritative =
  FEATURES.SERVER_AUTHORITATIVE_BADUGI ||
  import.meta.env.VITE_BADUGI_ALPHA === 'true';

export default function BadugiGame() {
  return isServerAuthoritative
    ? <BadugiServerGame />
    : <BadugiClientGame />;
}
