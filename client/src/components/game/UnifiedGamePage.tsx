import { useState, useEffect, useCallback, useRef } from "react";
import { useServerBadugi } from "@/lib/poker/engine/useServerGame";
import { useServerMode } from "@/lib/poker/engine/useServerMode";
import { FEATURES } from "@/lib/featureFlags";
import { generateTableCode, saveRecentTable } from "@/lib/tableSession";
import { HostControls } from "@/components/HostControls";
import type { TableSettings } from "@/components/HostControls";
import { ThreeDTableScene } from "@/components/game/ThreeDTableScene";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";
import { GameStatusBar } from "@/components/game/GameStatusBar";
import { HeroHandPanel } from "@/components/game/HeroHandPanel";
import { ChatEmoteRow } from "@/components/game/ChatEmoteRow";
import { MODE_INFO } from "@/components/game/GameHeader";
import { ModeIntro, MODE_INTROS } from "@/components/game/ModeIntro";
import { SpectatorBanner, SpectatorWatchingBadge } from "@/components/game/SpectatorBanner";
import { BustOutModal } from "@/components/game/BustOutModal";
import { useLocation } from "wouter";
import { DebugOverlay } from "@/components/game/DebugOverlay";
import { XPToast } from "@/components/XPToast";
import { useXPWatcher } from "@/lib/useXPWatcher";
import { usePhaseSounds } from "@/lib/usePhaseSounds";
import { getContextualHint } from "@/lib/phaseHints";
import { useGameToasts } from "@/lib/useGameToasts";
import { saveChips } from "@/lib/persistence";
import { trackModePlay } from "@/lib/analytics";
import { useServerProfile } from "@/lib/useServerProfile";
import { isRewardAvailable } from "@/lib/dailyReward";
import type { GameState } from "@/lib/poker/types";
import type { GameSessionStats } from "@/components/game/GameHeader";
import { qualifiesForSuits } from '@shared/modes/suitspoker';

// ── Unified game UI shell ─────────────────────────────────────────────────────

interface UnifiedGameUIProps {
  state: GameState;
  handleAction: (action: string, payload?: unknown) => void;
  myId: string;
  modeId: string;
  tableId?: string;
  role?: 'player' | 'spectator';
  sessionStats?: GameSessionStats;
  lastWsAt?: number | null;
  lastWsType?: string | null;
  // Host authority
  hostId?: string | null;
  tableSettings?: TableSettings;
  sendHostAction?: (type: 'host:kick' | 'host:settings', payload: Record<string, unknown>) => void;
  kickedByHost?: boolean;
}

const SUITSPOKER_DECLARATION_OPTIONS = [
  { label: 'POKER', value: 'POKER' as const, className: 'border-red-500/25 hover:bg-red-500/10 text-red-300/80 hover:text-red-200' },
  { label: 'SWING', value: 'SWING' as const, className: 'border-purple-500/25 hover:bg-purple-500/10 text-purple-300/80 hover:text-purple-200' },
  { label: 'SUITS', value: 'SUITS' as const, className: 'border-blue-500/25 hover:bg-blue-500/10 text-blue-300/80 hover:text-blue-200' },
];

function UnifiedGameUI({ state, handleAction, myId, modeId, tableId, role = 'player', sessionStats, lastWsAt, lastWsType, hostId = null, tableSettings, sendHostAction, kickedByHost = false }: UnifiedGameUIProps) {
  const isSpectator = role === 'spectator';
  const [, navigate] = useLocation();
  const { profile: serverProfile } = useServerProfile();

  // Navigate home if host kicked this player
  useEffect(() => {
    if (kickedByHost) navigate('/');
  }, [kickedByHost, navigate]);
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const me = state.players.find(p => p.id === myId);

  /* P2 — Bust-out modal: shown when hero stack is 0 outside of a hand
   *      (waiting/showdown). Suppressed during active play so it doesn't
   *      interrupt resolution animations or all-in showdowns. The user
   *      can rebuy, spectate the rest of the table, or leave.
   *
   *      IMPORTANT: an all-in player has chips=0 but status='active' — they
   *      are still contesting the pot and must NOT be flagged as busted.
   *      Only flag bust when the player is no longer actively playing
   *      (sitting_out, folded, or absent). */
  const [bustDismissed, setBustDismissed] = useState(false);
  const heroBust = !!me && me.chips <= 0 && !isSpectator && me.status !== 'active';
  const bustEligiblePhase = me?.status === 'sitting_out' || state.phase === 'WAITING' || state.phase === 'SHOWDOWN';
  const showBustModal = heroBust && bustEligiblePhase && !bustDismissed;
  // Reset dismissal once chips return.
  useEffect(() => { if (me && me.chips > 0) setBustDismissed(false); }, [me?.chips]);

  // Bust counters — increment exactly once per bust event.
  const bustCountedRef = useRef(false);
  useEffect(() => {
    if (heroBust && bustEligiblePhase && !bustCountedRef.current) {
      bustCountedRef.current = true;
      const lifetime = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
      localStorage.setItem('cgp_lifetime_busts', (lifetime + 1).toString());
      const session = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
      sessionStorage.setItem('cgp_session_busts', (session + 1).toString());
    }
    if (!heroBust) bustCountedRef.current = false;
  }, [heroBust, bustEligiblePhase]);

  // State vars read once when bust modal opens.
  const lifetimeBusts = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
  const sessionBusts = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
  const hasNeverPurchased = !localStorage.getItem('cgp_first_purchase_complete');
  const dailyBonusAvailable = isRewardAvailable();
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

  // ── SERVER-AUTHORITATIVE: no client-derived state. heroChipChange comes
  //    from the server snapshot or is undefined. Do not merge fallbacks.

  // 'DRAW' = Suits & Poker single draw phase; DRAW_1/2/3 = Badugi/Dead7 multi-draw phases
  const isDrawPhase = state.phase === 'DRAW' || state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3';

  const handleCardClick = (index: number) => {
    if (isSpectator || !isDrawPhase) return;
    setSelectedCardIndices(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      let maxCards = 1;
      if (state.phase === 'DRAW_1') maxCards = 3;
      if (state.phase === 'DRAW_2') maxCards = 2;
      if (state.phase === 'DRAW') maxCards = 2; // Suits & Poker: discard up to 2 hole cards
      if (prev.length < maxCards) return [...prev, index];
      return prev;
    });
  };

  /* ── Post-action lock: brief 280ms pause after hero acts so the "bet
   *    impact" lands before the next player's controls appear.            */
  const [actionLocked, setActionLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleControlAction = (action: string, amount?: number | unknown) => {
    if (action === 'draw') handleAction(action, selectedCardIndices);
    else handleAction(action, amount);
    // Lock controls briefly — skip for passive events (restart, rebuy, chat, reaction)
    const PASSIVE = ['restart', 'rebuy', 'chat', 'reaction', 'ante'];
    if (!PASSIVE.includes(action)) {
      setActionLocked(true);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => setActionLocked(false), 280);
    }
  };

  const handleSendMessage = (text: string) => handleAction('chat', text);

  // Chat drawer external control
  const [chatOpen, setChatOpen] = useState(false);

  // Unread count — tracked here so ChatEmoteRow can show the badge
  const [chatUnread, setChatUnread] = useState(0);
  const prevChatLenRef = useRef(state.chatMessages.length);
  useEffect(() => {
    const newLen = state.chatMessages.length;
    if (newLen > prevChatLenRef.current && !chatOpen) {
      setChatUnread(prev => prev + newLen - prevChatLenRef.current);
    }
    prevChatLenRef.current = newLen;
  }, [state.chatMessages.length, chatOpen]);
  useEffect(() => { if (chatOpen) setChatUnread(0); }, [chatOpen]);

  const modeInfo = MODE_INFO[modeId];
  const modeIntro = (MODE_INTROS as Record<string, typeof MODE_INTROS[keyof typeof MODE_INTROS]>)[modeId];

  const phaseHint = getContextualHint(modeId, state.phase, me, { currentBet: state.currentBet, pot: state.pot });

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30 game-page-root" data-mode={modeId}>
      {modeIntro && <ModeIntro modeId={modeId} {...modeIntro} />}

      {/* Fixed top status bar */}
      <GameStatusBar
        modeId={modeId}
        gameState={state}
        chips={me?.chips ?? 0}
        stripes={serverProfile?.stripes ?? 0}
        phase={state.phase}
        onForfeit={() => { if (me) saveChips(modeId, me.chips); }}
        sessionStats={isSpectator ? undefined : sessionStats}
        tableId={tableId}
        humanCount={humanCount}
        onOpenChat={!isSpectator ? () => setChatOpen(true) : undefined}
        chatUnread={chatUnread}
      />

      {/* Spectator banner */}
      {isSpectator && <SpectatorBanner spectatorCount={state.spectatorCount} />}

      {/* Join/presence notifications */}
      {showJoinConfirm && (
        <div className="w-full px-3 flex justify-center pt-14" aria-live="polite">
          <span className="text-[10px] font-mono anim-action-label" style={{ color: 'rgba(0,200,150,0.65)' }} data-testid="text-joined-confirm">
            ✓ Joined table
          </span>
        </div>
      )}

      {joinFlashName && state.phase === 'WAITING' && (
        <div className="w-full px-3 pt-14" aria-live="polite">
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

      {import.meta.env.DEV && (
        <DebugOverlay state={state} myId={myId} lastWsAt={lastWsAt ?? null} lastWsType={lastWsType ?? null} />
      )}

      {/* Host controls — shown when there is a known host (private or any table with host set) */}
      {hostId && tableId && tableSettings && sendHostAction && (
        <div className="fixed top-12 sm:top-14 right-3 z-30">
          <HostControls
            myId={myId}
            hostId={hostId}
            tableCode={tableId}
            tableSettings={tableSettings}
            players={state.players
              .filter(p => p.presence === 'human')
              .map(p => ({ id: p.id, name: p.name }))}
            onKick={targetPlayerId =>
              sendHostAction('host:kick', { targetPlayerId })
            }
            onSettings={settings =>
              sendHostAction('host:settings', settings as Record<string, unknown>)
            }
          />
        </div>
      )}

      {/* ── Main content column ───────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col pt-12 sm:pt-14 pb-64 sm:pb-72 game-main-area overflow-x-hidden">

        {/* Table 3D scene */}
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

        {/* Hero hand panel — 3-column card/info/qualifier strip */}
        {!isSpectator && me && me.cards.length > 0 && (
          <div className="mt-2 px-2">
            <HeroHandPanel
              player={me}
              modeId={modeId}
              phase={state.phase}
              selectedCardIndices={selectedCardIndices}
              onCardClick={handleCardClick}
              selectableCards={isDrawPhase}
              sessionNetProfit={sessionStats?.netProfit ?? 0}
              isShowdown={state.phase === 'SHOWDOWN'}
            />
          </div>
        )}


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

      {/* ── Fixed action zone ─────────────────────────────────────────────── */}
      {!isSpectator && (
        <div className="fixed bottom-3 sm:bottom-4 left-0 w-full z-40 pointer-events-none"
          style={{ background: 'linear-gradient(to top, #000 60%, rgba(0,0,0,0.92) 85%, transparent 100%)' }}>
          <div className="pointer-events-auto w-full max-w-md mx-auto px-2 pb-2">
            <ActionControls
              phase={state.phase}
              currentBet={state.currentBet}
              myBet={me?.bet ?? 0}
              pot={state.pot}
              chips={me?.chips ?? 0}
              onAction={handleControlAction}
              isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
              locked={actionLocked}
              selectedCardsCount={selectedCardIndices.length}
              openSeatsCount={openSeatsCount}
              humanCount={humanCount}
              declarationOptions={modeId === 'suitspoker' ? (() => {
                const heroSuitsQualifies = me ? qualifiesForSuits(me.cards) : false;
                return SUITSPOKER_DECLARATION_OPTIONS.map(opt => ({
                  ...opt,
                  disabled: (opt.value === 'SUITS' || opt.value === 'SWING') && !heroSuitsQualifies,
                }));
              })() : undefined}
              myDeclaration={me?.declaration ?? null}
              turnDeadline={state.turnDeadline ?? null}
            />
          </div>
        </div>
      )}

      {/* Chat drawer — externally controlled via chatOpen */}
      <ChatBox
        messages={state.chatMessages}
        myId={myId}
        onSendMessage={handleSendMessage}
        open={chatOpen}
        onOpenChange={setChatOpen}
        seatToPlayerId={Object.fromEntries(
          state.players.filter(p => p.identityId).map(p => [p.id, p.identityId!])
        )}
        myProfileId={serverProfile?.profileId}
      />

      <BustOutModal
        open={showBustModal}
        lifetimeBusts={lifetimeBusts}
        sessionBusts={sessionBusts}
        hasNeverPurchased={hasNeverPurchased}
        onRebuy={(amount) => { handleAction('rebuy', amount); setBustDismissed(true); }}
        onSpectate={() => setBustDismissed(true)}
        onLeaveTable={() => { if (me) saveChips(modeId, me.chips); navigate('/'); }}
        onClaimDailyBonus={() => { setBustDismissed(true); navigate('/'); }}
        onWatchAd={undefined}
        onStarterPack={() => { handleAction('rebuy', 1000); setBustDismissed(true); }}
      />
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
  const { state, handleAction, myId, role, sessionStats, lastWsAt, lastWsType, hostId, tableSettings, sendHostAction, kickedByHost } = useServerBadugi(tableId);
  return <UnifiedGameUI state={state} handleAction={handleAction} myId={myId} modeId={modeId} tableId={tableId} role={role} sessionStats={sessionStats} lastWsAt={lastWsAt} lastWsType={lastWsType} hostId={hostId} tableSettings={tableSettings} sendHostAction={sendHostAction} kickedByHost={kickedByHost} />;
}

// Server engine modeId mapping (UI modeId → server engine modeId)
const SERVER_ENGINE_ID: Record<string, string> = {
  dead7: 'dead7',
  fifteen35: 'fifteen35',
  suitspoker: 'suits_poker',
};

function GenericServerGame({ modeId }: { modeId: string }) {
  const tableId = useTableId(modeId);
  useEffect(() => { trackModePlay(modeId); saveRecentTable(tableId); }, [modeId, tableId]);
  const engineId = SERVER_ENGINE_ID[modeId] ?? modeId;
  const { state, handleAction, myId, role, sessionStats, lastWsAt, lastWsType, hostId, tableSettings, sendHostAction, kickedByHost } = useServerMode(tableId, engineId);
  return <UnifiedGameUI state={state} handleAction={handleAction} myId={myId} modeId={modeId} tableId={tableId} role={role} sessionStats={sessionStats} lastWsAt={lastWsAt} lastWsType={lastWsType} hostId={hostId} tableSettings={tableSettings} sendHostAction={sendHostAction} kickedByHost={kickedByHost} />;
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
