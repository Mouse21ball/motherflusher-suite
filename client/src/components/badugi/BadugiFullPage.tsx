/**
 * BadugiFullPage — complete Badugi game page.
 * Accepts the same props as UnifiedGameUI so it can be dropped in from
 * BadugiServerGame without changing the hook call-sites.
 *
 * Layout: bg-badugi.png full-screen → GameStatusBar (fixed top) →
 *         BadugiTable (flex-1) → BadugiActionBar (flex bottom) → modals.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { BadugiTable } from './BadugiTable';
import { BadugiActionBar } from './BadugiActionBar';
import { getBadugiDrawLimit, toggleBadugiDrawSelection } from './badugiDrawSelection';
import { GameStatusBar } from '@/components/game/GameStatusBar';
import { useTableBackground } from '@/lib/useTableBackground';
import { SpectatorBanner, SpectatorWatchingBadge } from '@/components/game/SpectatorBanner';
import { BustOutModal } from '@/components/game/BustOutModal';
import { useHandAnalytics } from '@/lib/useHandAnalytics';
import { ChatBox } from '@/components/game/ChatBox';
import { ChatEmoteRow } from '@/components/game/ChatEmoteRow';
import { ModeIntro, MODE_INTROS } from '@/components/game/ModeIntro';
import { XPToast } from '@/components/XPToast';
import { useXPWatcher } from '@/lib/useXPWatcher';
import { useGameToasts } from '@/lib/useGameToasts';
import { useServerProfile } from '@/lib/useServerProfile';
import { resolveAvatarSrc } from '@/lib/persistence';
import type { GameState } from '@/lib/poker/types';
import type { GameSessionStats } from '@/components/game/GameHeader';
import type { TableSettings } from '@/components/HostControls';
import { PersonalChipGiftPanel } from '@/components/game/PersonalChipGiftPanel';
import { FriendSeatActions } from '@/components/game/FriendSeatActions';
import { apiFetch } from '@/lib/session';
import { apiUrl } from '@/lib/apiConfig';
import { TimeBankButton } from '@/components/game/TimeBankButton';
import { serverNowMs } from '@/lib/clockSync';

const MODE_ID = 'badugi';

export interface BadugiFullPageProps {
  state: GameState;
  handleAction: (action: string, payload?: unknown) => void;
  actionError?: string | null;
  requestRebuy: (kind: 'free' | 'reserve' | 'borrow', amount?: number) => Promise<void>;
  myId: string;
  modeId: string;
  tableId?: string;
  role?: 'player' | 'spectator';
  sessionStats?: GameSessionStats;
  lastWsAt?: number | null;
  isClubTable?: boolean;
  kickedByHost?: boolean;
  leaveAndSettle?: () => Promise<void>;
  tableSettings?: TableSettings;
  sendHostAction?: (type: 'host:kick' | 'host:settings', payload: Record<string, unknown>) => void;
  hostId?: string | null;
  lastWsType?: string | null;
}

export function BadugiFullPage({
  state, handleAction, actionError, requestRebuy, myId, tableId, role,
  sessionStats, lastWsAt, isClubTable = false, kickedByHost, leaveAndSettle,
  tableSettings,
}: BadugiFullPageProps) {
  const { background: tableBackground } = useTableBackground();
  const analyticsChipsBefore = useHandAnalytics(state, myId, tableId, 'badugi');
  const [, navigate]   = useLocation();
  const { profile: serverProfile, refetch: refetchProfile } = useServerProfile();
  const leaveToLobby = useCallback(async () => {
    try {
      if (!leaveAndSettle) throw new Error('Table connection is unavailable. Your balance was not confirmed.');
      await leaveAndSettle();
      const profile = await refetchProfile();
      if (!profile) throw new Error('Your balance could not be refreshed. Please stay connected and try again.');
      navigate('/');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not save your table balance. Please try again.');
    }
  }, [leaveAndSettle, navigate, refetchProfile]);
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();

  // Detroit 2026-10-15: usePhaseSounds removed — the flight system
  // in BadugiTable owns ALL table sounds (deal/bet/draw/win).
  useGameToasts(state, myId, 'Badugi');

  useEffect(() => { if (kickedByHost) navigate('/'); }, [kickedByHost, navigate]);

  const isSpectator = role === 'spectator';
  const [hasBoughtIn, setHasBoughtIn]     = useState(false);
  const boughtInInitRef                   = useRef(false);
  useEffect(() => {
    if (boughtInInitRef.current) return;
    if (lastWsAt == null) return;
    boughtInInitRef.current = true;
    if (!isClubTable) setHasBoughtIn(true);
  }, [lastWsAt, isClubTable]);
  const isPrebuyIn       = isClubTable && !hasBoughtIn;
  const effectiveSpectator = isSpectator || isPrebuyIn;

  const me           = state.players.find(p => p.id === myId);
  const humanCount   = state.players.filter(p => p.presence === 'human').length;
  const openSeatsCount = state.players.filter(p => p.presence === 'reserved').length;
  const activeCount  = state.players.filter(p => p.presence === 'bot' || p.presence === 'human').length;

  const isDrawPhase  = state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3';
  const drawLimit    = getBadugiDrawLimit(state.phase);

  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  useEffect(() => { setSelectedCardIndices([]); }, [state.phase]);

  const handleCardClick = useCallback((index: number) => {
    if (effectiveSpectator || !isDrawPhase) return;
    setSelectedCardIndices(prev => toggleBadugiDrawSelection(prev, index, drawLimit));
  }, [effectiveSpectator, isDrawPhase, drawLimit]);

  // Detroit 2026-10-15: useCardAnimations removed — dead code. The flight system
  // in BadugiTable owns all card animations. This hook's output (animState) was
  // never read by BadugiTable.

  const [actionLocked, setActionLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Detroit 2026-10-15: clear lock timer on unmount — was leaking.
  useEffect(() => () => { if (lockTimerRef.current) clearTimeout(lockTimerRef.current); }, []);

  const lock = useCallback(() => {
    setActionLocked(true);
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => setActionLocked(false), 280);
  }, []);

  const handleStandPat = useCallback(() => {
    // Detroit 2026-10-20 (Bug 3): send IMMEDIATELY. The old 50ms delayed
    // send composed the action at tap time but delivered it later — a
    // stale-submission window if the phase moved in between.
    setSelectedCardIndices([]);
    handleAction('draw', []);
    lock();
  }, [handleAction, lock]);

  const handleDraw = useCallback(() => {
    // Detroit 2026-10-15: SWAP requires at least 1 selected card.
    // Button is disabled at 0, but guard here too — never send an empty swap.
    if (selectedCardIndices.length === 0) return;
    // Detroit 2026-10-20 (Bug 3): send IMMEDIATELY (was a 280ms delayed
    // send — same stale-submission window as stand-pat). The action lock
    // still prevents double-taps; the server also rejects a second draw
    // from a player who has already acted this round.
    handleAction('draw', selectedCardIndices);
    setSelectedCardIndices([]);
    lock();
  }, [selectedCardIndices, handleAction, lock]);

  const handleControlAction = useCallback((action: string, amount?: number | unknown) => {
    handleAction(action, amount);
    const PASSIVE = ['restart', 'rebuy', 'chat', 'reaction', 'ante'];
    if (!PASSIVE.includes(action)) lock();
  }, [handleAction, lock]);

  /* Chat */
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const prevChatLenRef = useRef(state.chatMessages.length);
  useEffect(() => {
    const nl = state.chatMessages.length;
    if (nl > prevChatLenRef.current && !chatOpen) setChatUnread(p => p + nl - prevChatLenRef.current);
    prevChatLenRef.current = nl;
  }, [state.chatMessages.length, chatOpen]);
  useEffect(() => { if (chatOpen) setChatUnread(0); }, [chatOpen]);

  /* Bust */
  const [bustDismissed, setBustDismissed] = useState(false);
  const heroBust        = !!me && me.chips <= 0 && !effectiveSpectator && me.status !== 'active';
  const bustEligible    = me?.status === 'sitting_out' || state.phase === 'WAITING' || state.phase === 'SHOWDOWN';
  const showBustModal   = heroBust && bustEligible && !bustDismissed;
  useEffect(() => { if (me && me.chips > 0) setBustDismissed(false); }, [me?.chips]);
  const bustCountedRef = useRef(false);
  useEffect(() => {
    if (heroBust && bustEligible && !bustCountedRef.current) {
      bustCountedRef.current = true;
      const lt = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
      localStorage.setItem('cgp_lifetime_busts', (lt + 1).toString());
    }
    if (!heroBust) bustCountedRef.current = false;
  }, [heroBust, bustEligible]);
  const lifetimeBusts      = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
  const sessionBusts       = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
  const hasNeverPurchased  = !localStorage.getItem('cgp_first_purchase_complete');

  const handleBorrowChips = async () => {
    await requestRebuy('borrow', 1000);
    setBustDismissed(true);
    void refetchProfile();
  };

  /* Detroit 2026-10-15: ShowdownReveal removed — prototype celebration in BadugiTable owns the winner moment */

  const modeIntro = (MODE_INTROS as Record<string, (typeof MODE_INTROS)[keyof typeof MODE_INTROS]>)[MODE_ID];

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      backgroundColor: '#0a0800',
      backgroundImage: `url('${tableBackground.url}')`,
      backgroundSize: 'cover', backgroundPosition: 'center top',
    }} data-mode={MODE_ID}>
      {modeIntro && <ModeIntro modeId={MODE_ID} {...modeIntro} />}

      {/* Fixed top status bar */}
      <GameStatusBar
        modeId={MODE_ID} gameState={state} chips={me?.chips ?? 0}
        stripes={serverProfile?.stripes ?? 0} phase={state.phase}
        onLeave={leaveToLobby}
        sessionStats={effectiveSpectator ? undefined : sessionStats}
        tableId={tableId} humanCount={humanCount} maxPlayers={tableSettings?.maxPlayers}
        onOpenChat={!effectiveSpectator ? () => setChatOpen(true) : undefined}
        chatUnread={chatUnread}
        spectating={effectiveSpectator}
      />

      {/* Gift panel removed — Detroit 2026-10-13 */}

      {isSpectator && <SpectatorBanner spectatorCount={state.spectatorCount} openSeats={openSeatsCount} onTakeSeat={() => window.location.reload()} tableId={tableId} />}
      {!effectiveSpectator && state.spectatorCount != null && state.spectatorCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SpectatorWatchingBadge count={state.spectatorCount} />
        </div>
      )}

      {/* Main table — fills remaining height */}
      <main style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 52 }}>
        <FriendSeatActions state={state} myId={myId} myProfileId={serverProfile?.profileId} disabled={effectiveSpectator}>
          <BadugiTable
            state={state} myId={effectiveSpectator ? 'p1' : myId}
            selectedCardIndices={effectiveSpectator ? [] : selectedCardIndices}
            onCardClick={handleCardClick}
            isDrawPhase={!effectiveSpectator && isDrawPhase}
            heroAvatarSrc={resolveAvatarSrc(serverProfile?.equippedAvatarId, serverProfile?.avatarId)}
            heroFrameSrc={serverProfile?.equippedFrameId ? `/cosmetics/frames/${serverProfile.equippedFrameId.replace(/_/g, '-')}.png` : null}
          />
        </FriendSeatActions>
      </main>

      {/* Bottom bar — action controls */}
      {!effectiveSpectator && state.phase !== 'SHOWDOWN' && (
        <div style={{
          flexShrink: 0,
          background: 'rgba(10,8,0,0.82)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          borderTop: '1px solid rgba(201,162,39,0.12)',
        }}>
          {serverProfile?.profileId && tableId && state.activePlayerId === myId && (
            <div className="flex justify-end px-3 pt-1">
              <TimeBankButton
                key={`${state.handId ?? 0}:${state.phase}:${state.activePlayerId ?? ''}`}
                playerId={serverProfile.profileId}
                tableId={tableId}
                modeId={MODE_ID}
                isMyTurn={state.activePlayerId === myId}
                timerRemainingMs={state.turnDeadline != null ? Math.max(0, state.turnDeadline - serverNowMs()) : undefined}
              />
            </div>
          )}
          <BadugiActionBar
            phase={state.phase} isDrawPhase={!effectiveSpectator && isDrawPhase}
            selectedCount={selectedCardIndices.length} drawLimit={drawLimit}
            isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
            chips={me?.chips ?? 0} currentBet={state.currentBet} myBet={me?.bet ?? 0}
            minBet={state.minBet}
            pot={state.pot} ante={25} humanCount={humanCount}
            openSeatsCount={isClubTable ? 0 : openSeatsCount}
            activeCount={activeCount} isClubTable={isClubTable}
            locked={actionLocked}
            myDeclaration={me?.declaration ?? null}
            myHasActed={state.phase === 'DECLARE' ? (me?.hasActed ?? false) : false}
            onStandPat={handleStandPat} onDraw={handleDraw}
            onAction={handleControlAction}
            onRebuy={() => handleControlAction('rebuy', 1000)}
          />
        </div>
      )}

      {/* Crew buy-in gate */}
      {isPrebuyIn && (
        <div style={{ flexShrink: 0, padding: '8px 12px 12px' }}>
          <button disabled={(me?.chips ?? 0) <= 0}
            onClick={() => { if ((me?.chips ?? 0) <= 0) return; setHasBoughtIn(true); handleAction('sit_down'); }}
            data-testid="button-crew-buyin"
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.18em', textTransform: 'uppercase', border: 'none', cursor: (me?.chips ?? 0) > 0 ? 'pointer' : 'not-allowed',
              background: 'linear-gradient(135deg, #C9A227, #D4B44A)', color: '#0B0B0D',
              boxShadow: '0 0 20px rgba(201,162,39,0.4)',
              opacity: (me?.chips ?? 0) > 0 ? 1 : 0.55 }}>
            {(me?.chips ?? 0) > 0 ? `BUY IN — ${(me?.chips ?? 0).toLocaleString()} chips` : 'REBUY BEFORE BUY-IN'}
          </button>
        </div>
      )}

      {/* Emote row */}
      {!effectiveSpectator && (
        <ChatEmoteRow level={serverProfile?.level} onReact={emoji => handleAction('reaction', emoji)} incomingReactions={state.liveReactions}
          onOpenChat={() => setChatOpen(true)} chatUnread={chatUnread} />
      )}

      {xpToast && xpToast.xpGained > 0 && (
        <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp}
          newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />
      )}

      <ChatBox messages={state.chatMessages} myId={myId}
        onSendMessage={t => handleAction('chat', t)} open={chatOpen} onOpenChange={setChatOpen}
        seatToPlayerId={Object.fromEntries(state.players.filter(p => p.identityId).map(p => [p.id, p.identityId!]))}
        myProfileId={serverProfile?.profileId} />

      {actionError && <div role="alert" className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-red-500/30 bg-black/90 px-4 py-2 text-center text-xs text-red-200">{actionError}</div>}

      <BustOutModal open={showBustModal} tableId={tableId} modeId={MODE_ID} chipsBefore={analyticsChipsBefore} bankrollAvailable={serverProfile?.chipBalance ?? 0}
        bigBlind={state.minBet} lifetimeBusts={lifetimeBusts} sessionBusts={sessionBusts}
        hasNeverPurchased={hasNeverPurchased}
        onRebuy={async amount => { await requestRebuy('reserve', amount); setBustDismissed(true); void refetchProfile(); }}
        onSpectate={() => setBustDismissed(true)}
        onLeaveTable={() => { void leaveToLobby(); }}
        onStarterPack={async () => { await requestRebuy('free'); setBustDismissed(true); void refetchProfile(); }}
        onBorrowChips={handleBorrowChips} />
    </div>
  );
}

