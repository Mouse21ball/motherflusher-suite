import { useState, useEffect, useCallback, useRef } from "react";
import { useServerBadugi } from "@/lib/poker/engine/useServerGame";
import { useServerMode } from "@/lib/poker/engine/useServerMode";
import { FEATURES } from "@/lib/featureFlags";
import { shareOrigin } from "@/lib/apiConfig";
import { generateTableCode, saveRecentTable } from "@/lib/tableSession";
import { ThreeDTableScene } from "@/components/game/ThreeDTableScene";
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
import type { GameSessionStats } from "@/components/game/GameHeader";

// ── Invite Banner ─────────────────────────────────────────────────────────────

interface InviteBannerProps { tableId: string; modeId: string; humanCount?: number }

function InviteBanner({ tableId, modeId, humanCount = 1 }: InviteBannerProps) {
  const [copied, setCopied] = useState(false);
  const url = `${shareOrigin()}/${modeId}?t=${tableId}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [url]);

  return (
    <div className="w-full px-3 pt-2 game-invite-bar">
      <div
        className="max-w-md mx-auto rounded-xl border px-3.5 py-2.5 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, rgba(0,200,150,0.07) 0%, rgba(0,200,150,0.03) 100%)', borderColor: 'rgba(0,200,150,0.22)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[8px] font-mono uppercase tracking-[0.18em] text-white/25 mb-0.5">Play with friends</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-white/85 text-sm tracking-widest" data-testid="text-table-code">{tableId}</span>
            {humanCount >= 2
              ? <span className="text-[10px] font-mono text-emerald-400/70 truncate">{humanCount} players · share link to fill table</span>
              : <span className="text-[10px] font-mono text-emerald-400/55 truncate hidden sm:inline">· share link to join your table</span>
            }
          </div>
        </div>
        <button
          onClick={handleCopy}
          data-testid="button-copy-invite"
          className={`shrink-0 text-[9px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all duration-200 font-bold ${
            copied
              ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/12'
              : 'text-white/50 border-white/[0.10] hover:text-emerald-400 hover:border-emerald-500/35 hover:bg-emerald-500/[0.06]'
          }`}
        >
          {copied ? '✓ Copied' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}

// ── Unified game UI shell ─────────────────────────────────────────────────────

interface UnifiedGameUIProps {
  state: GameState;
  handleAction: (action: string, payload?: unknown) => void;
  myId: string;
  modeId: string;
  tableId?: string;
  role?: 'player' | 'spectator';
  sessionStats?: GameSessionStats;
}

function UnifiedGameUI({ state, handleAction, myId, modeId, tableId, role = 'player', sessionStats }: UnifiedGameUIProps) {
  const isSpectator = role === 'spectator';
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const me = state.players.find(p => p.id === myId);
  const openSeatsCount = state.players.filter(p => p.presence === 'reserved').length;
  const humanCount = state.players.filter(p => p.presence === 'human').length;

  const modeName = MODE_INFO[modeId]?.name ?? modeId;
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, modeName);

  // Mount confirmation
  const [showJoinConfirm, setShowJoinConfirm] = useState(!!tableId && !isSpectator);
  useEffect(() => {
    if (!showJoinConfirm) return;
    const t = setTimeout(() => setShowJoinConfirm(false), 900);
    return () => clearTimeout(t);
  }, []); // mount-only

  // Live join flash
  const [joinFlashName, setJoinFlashName] = useState<string | null>(null);
  const joinFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const humanIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const humans = state.players.filter(p => p.presence === 'human');
    if (humanIdsRef.current === null) { humanIdsRef.current = new Set(humans.map(p => p.id)); return; }
    if (state.phase === 'WAITING') {
      const newcomers = humans.filter(p => p.id !== myId && !humanIdsRef.current!.has(p.id));
      if (newcomers.length > 0) {
        if (joinFlashTimer.current) clearTimeout(joinFlashTimer.current);
        setJoinFlashName(newcomers[0].name);
        joinFlashTimer.current = setTimeout(() => setJoinFlashName(null), 3500);
      }
    }
    humanIdsRef.current = new Set(humans.map(p => p.id));
  }, [state.players, state.phase, myId]);

  // Clear card selection on phase change
  useEffect(() => { setSelectedCardIndices([]); }, [state.phase]);

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
    if (action === 'draw') handleAction(action, selectedCardIndices);
    else handleAction(action, amount);
  };

  const handleSendMessage = (text: string) => handleAction('chat', text);

  const modeInfo = MODE_INFO[modeId];
  const modeIntro = (MODE_INTROS as Record<string, typeof MODE_INTROS[keyof typeof MODE_INTROS]>)[modeId];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30 game-page-root">
      {modeIntro && <ModeIntro modeId={modeId} {...modeIntro} />}

      {modeInfo && (
        <GameHeader
          mode={modeInfo}
          modeId={modeId}
          chips={me?.chips ?? 0}
          phase={state.phase}
          pot={state.pot}
          onForfeit={() => { if (me) saveChips(modeId, me.chips); }}
          sessionStats={isSpectator ? undefined : sessionStats}
          tableId={tableId}
        />
      )}

      {isSpectator
        ? <SpectatorBanner spectatorCount={state.spectatorCount} />
        : tableId ? <InviteBanner tableId={tableId} modeId={modeId} humanCount={humanCount} /> : null
      }

      {showJoinConfirm && (
        <div className="w-full px-3 flex justify-center" aria-live="polite">
          <span className="text-[10px] font-mono anim-action-label" style={{ color: 'rgba(0,200,150,0.65)' }} data-testid="text-joined-confirm">
            ✓ Joined table
          </span>
        </div>
      )}

      {joinFlashName && state.phase === 'WAITING' && (
        <div className="w-full px-3 pt-1" aria-live="polite">
          <div className="max-w-md mx-auto flex items-center justify-center gap-1.5">
            <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: 'rgba(0,200,150,0.75)' }} />
            <span className="text-[10px] font-mono" style={{ color: 'rgba(0,200,150,0.60)' }} data-testid="text-join-notification">
              {joinFlashName} just joined the table
            </span>
          </div>
        </div>
      )}

      {!isSpectator && state.spectatorCount != null && state.spectatorCount > 0 && (
        <div className="flex justify-center pt-1">
          <SpectatorWatchingBadge count={state.spectatorCount} />
        </div>
      )}

      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44 game-main-area">
        <ThreeDTableScene
          gameState={state}
          myId={isSpectator ? 'p1' : myId}
          modeId={modeId}
          selectedCardIndices={isSpectator ? [] : selectedCardIndices}
          onCardClick={handleCardClick}
          selectableCards={!isSpectator && isDrawPhase}
          heroCardClassName="w-[60px] h-20 sm:w-20 sm:h-[120px]"
          onReact={!isSpectator ? (emoji) => handleAction('reaction', emoji) : undefined}
          incomingReactions={state.liveReactions}
        />
      </main>

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
              myBet={me?.bet ?? 0}
              pot={state.pot}
              chips={me?.chips ?? 0}
              onAction={handleControlAction}
              isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
              selectedCardsCount={selectedCardIndices.length}
              phaseHint={getPhaseHint(modeId, state.phase)}
              openSeatsCount={openSeatsCount}
              humanCount={humanCount}
            />
          </div>
        </div>
      )}

      <ChatBox messages={state.chatMessages} myId={myId} onSendMessage={handleSendMessage} />
    </div>
  );
}

// ── Server-authoritative wrapper for each mode ────────────────────────────────

function useTableId(modeId: string) {
  const [tableId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('t')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(fromUrl)) return fromUrl;
    const newCode = generateTableCode();
    window.history.replaceState(null, '', `/${modeId}?t=${newCode}`);
    return newCode;
  });
  return tableId;
}

function BadugiServerGame({ modeId }: { modeId: string }) {
  const tableId = useTableId(modeId);
  useEffect(() => { trackModePlay(modeId); saveRecentTable(tableId); }, [modeId, tableId]);
  const { state, handleAction, myId, role, sessionStats } = useServerBadugi(tableId);
  return <UnifiedGameUI state={state} handleAction={handleAction} myId={myId} modeId={modeId} tableId={tableId} role={role} sessionStats={sessionStats} />;
}

// Server engine modeId mapping (UI modeId → server engine modeId)
const SERVER_ENGINE_ID: Record<string, string> = {
  dead7: 'dead7',
  fifteen35: 'fifteen35',
  swing: 'swing',
  suitspoker: 'suits_poker',
};

function GenericServerGame({ modeId }: { modeId: string }) {
  const tableId = useTableId(modeId);
  useEffect(() => { trackModePlay(modeId); saveRecentTable(tableId); }, [modeId, tableId]);
  const engineId = SERVER_ENGINE_ID[modeId] ?? modeId;
  const { state, handleAction, myId, role, sessionStats } = useServerMode(tableId, engineId);
  return <UnifiedGameUI state={state} handleAction={handleAction} myId={myId} modeId={modeId} tableId={tableId} role={role} sessionStats={sessionStats} />;
}

// ── Public entry point ────────────────────────────────────────────────────────

interface UnifiedGamePageProps {
  modeId: string;
}

const serverEnabled = FEATURES.SERVER_AUTHORITATIVE_BADUGI || import.meta.env.VITE_BADUGI_ALPHA === 'true';

export function UnifiedGamePage({ modeId }: UnifiedGamePageProps) {
  if (!serverEnabled) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-white/40 font-mono text-sm">Server mode required. Set VITE_BADUGI_ALPHA=true</p>
      </div>
    );
  }
  if (modeId === 'badugi') return <BadugiServerGame modeId={modeId} />;
  return <GenericServerGame modeId={modeId} />;
}
