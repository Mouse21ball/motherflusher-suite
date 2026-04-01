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
import { SpectatorBanner, SpectatorWatchingBadge } from "@/components/game/SpectatorBanner";
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
      setTimeout(() => setCopied(false), 2500);
    });
  }, [url]);

  return (
    <div className="w-full px-3 pt-2">
      <div
        className="max-w-md mx-auto rounded-xl border px-3.5 py-2.5 flex items-center gap-3"
        style={{
          background: 'linear-gradient(135deg, rgba(0,200,150,0.07) 0%, rgba(0,200,150,0.03) 100%)',
          borderColor: 'rgba(0,200,150,0.22)',
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[8px] font-mono uppercase tracking-[0.18em] text-white/25 mb-0.5">Play with friends</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-white/85 text-sm tracking-widest" data-testid="text-table-code">{tableId}</span>
            <span className="text-[10px] font-mono text-emerald-400/55 truncate hidden sm:inline">· share this link to join your table</span>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className={`shrink-0 text-[9px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all duration-200 font-bold ${
            copied
              ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/12'
              : 'text-white/50 border-white/[0.10] hover:text-emerald-400 hover:border-emerald-500/35 hover:bg-emerald-500/[0.06]'
          }`}
          data-testid="button-copy-invite"
        >
          {copied ? '✓ Copied' : 'Copy Link'}
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
  role?: 'player' | 'spectator';
}

function BadugiUI({ state, handleAction, myId, tableId, role = 'player' }: BadugiUIProps) {
  const isSpectator = role === 'spectator';
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();

  const me = state.players.find(p => p.id === myId);
  const openSeatsCount = state.players.filter(p => p.presence === 'reserved').length;
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "Badugi");

  useEffect(() => {
    setSelectedCardIndices([]);
  }, [state.phase]);

  const isDrawPhase = state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3';

  const handleCardClick = (index: number) => {
    if (isSpectator || !isDrawPhase) return;
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

      {isSpectator
        ? <SpectatorBanner spectatorCount={state.spectatorCount} />
        : tableId ? <InviteBanner tableId={tableId} /> : null
      }
      {!isSpectator && state.spectatorCount != null && state.spectatorCount > 0 && (
        <div className="flex justify-center pt-1">
          <SpectatorWatchingBadge count={state.spectatorCount} />
        </div>
      )}

      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable
          gameState={state}
          myId={isSpectator ? 'p1' : myId}
          selectedCardIndices={isSpectator ? [] : selectedCardIndices}
          onCardClick={handleCardClick}
          selectableCards={!isSpectator && isDrawPhase}
          heroCardClassName="w-[60px] h-20 sm:w-20 sm:h-[120px]"
          onReact={!isSpectator ? (emoji) => handleAction('reaction', emoji) : undefined}
          incomingReactions={state.liveReactions}
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

      {!isSpectator && (
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
              openSeatsCount={openSeatsCount}
            />
          </div>
        </div>
      )}

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
  const { state, handleAction, myId, role } = useServerBadugi(tableId);
  return <BadugiUI state={state} handleAction={handleAction} myId={myId} tableId={tableId} role={role} />;
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
