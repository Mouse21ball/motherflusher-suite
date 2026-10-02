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
import { SpectatorBanner, SpectatorWatchingBadge } from '@/components/game/SpectatorBanner';
import { BustOutModal } from '@/components/game/BustOutModal';
import { ChatBox } from '@/components/game/ChatBox';
import { ChatEmoteRow } from '@/components/game/ChatEmoteRow';
import { ModeIntro, MODE_INTROS } from '@/components/game/ModeIntro';
import { XPToast } from '@/components/XPToast';
import { ShowdownReveal } from '@/components/game/ShowdownReveal';
import type { WinnerData, HeroRevealData } from '@/components/game/ShowdownReveal';
import { useXPWatcher } from '@/lib/useXPWatcher';
import { usePhaseSounds } from '@/lib/usePhaseSounds';
import { useGameToasts } from '@/lib/useGameToasts';
import { useCardAnimations } from '@/components/flushedUp/useCardAnimations';
import { useServerProfile } from '@/lib/useServerProfile';
import { evaluateBadugi } from '@shared/modes/badugi';
import type { GameState } from '@/lib/poker/types';
import type { GameSessionStats } from '@/components/game/GameHeader';
import type { TableSettings } from '@/components/HostControls';
import { PersonalChipGiftPanel } from '@/components/game/PersonalChipGiftPanel';
import { FriendSeatActions } from '@/components/game/FriendSeatActions';
import { apiFetch } from '@/lib/session';
import { apiUrl } from '@/lib/apiConfig';

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
  state, handleAction, actionError, requestRebuy, myId, modeId, tableId, role,
  sessionStats, lastWsAt, isClubTable = false, kickedByHost, leaveAndSettle,
}: BadugiFullPageProps) {
  void modeId;
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

  usePhaseSounds(state.phase);
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

  const heroCards = me?.cards ?? [];
  const { dealingIndices, drawingIndices, discardingIndices, triggerDiscard } =
    useCardAnimations(heroCards, state.phase);

  const [actionLocked, setActionLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    setActionLocked(true);
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => setActionLocked(false), 280);
  }, []);

  const handleStandPat = useCallback(() => {
    setSelectedCardIndices([]);
    setTimeout(() => handleAction('draw', []), 50);
    lock();
  }, [handleAction, lock]);

  const handleDraw = useCallback(() => {
    if (selectedCardIndices.length > 0) triggerDiscard(selectedCardIndices);
    setTimeout(() => {
      handleAction('draw', selectedCardIndices);
      setSelectedCardIndices([]);
    }, 280);
    lock();
  }, [selectedCardIndices, triggerDiscard, handleAction, lock]);

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

  /* ShowdownReveal data */
  const showReveal   = state.phase === 'SHOWDOWN';
  const [showRevealOverlay, setShowRevealOverlay] = useState(false);
  useEffect(() => {
    if (!showReveal) {
      setShowRevealOverlay(false);
      return;
    }
    const timer = window.setTimeout(() => setShowRevealOverlay(true), 900);
    return () => window.clearTimeout(timer);
  }, [showReveal]);
  const revealWinners: WinnerData[] = showReveal
    ? state.players
        .filter(p => (p as any).isWinner)
        .map(p => ({
          id: p.id, name: p.name,
          cards: (p.cards ?? []).map(c => ({ ...c, isHidden: false })),
          handRankLabel: (() => { try { return evaluateBadugi((p.cards ?? []).map(c => ({ ...c, isHidden: false })) as Parameters<typeof evaluateBadugi>[0])?.description ?? ''; } catch { return ''; } })(),
          potShare: 0,
        }))
    : [];

  const revealHeroData: HeroRevealData = showReveal && me
    ? {
        id: me.id,
        cards: (me.cards ?? []).map(c => ({ ...c, isHidden: false })),
        handRankLabel: (() => { try { return evaluateBadugi((me.cards ?? []).map(c => ({ ...c, isHidden: false })) as Parameters<typeof evaluateBadugi>[0])?.description ?? ''; } catch { return ''; } })(),
      }
    : { id: myId, cards: [], handRankLabel: '' };

  const heroWonReveal  = revealWinners.some(w => w.id === myId);
  const potMatch       = state.messages.find(m => (m as any).isResolution)?.text?.match(/\$(\d+)/);
  const revealPotAmount = potMatch ? parseInt(potMatch[1], 10) : Math.abs(state.heroChipChange ?? 0);

  const modeIntro = (MODE_INTROS as Record<string, (typeof MODE_INTROS)[keyof typeof MODE_INTROS]>)[MODE_ID];

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      backgroundColor: '#0a0800',
      backgroundImage: "url('/modes/bg-badugi.png')",
      backgroundSize: 'cover', backgroundPosition: 'center top',
    }} data-mode={MODE_ID}>
      {modeIntro && <ModeIntro modeId={MODE_ID} {...modeIntro} />}

      {/* Fixed top status bar */}
      <GameStatusBar
        modeId={MODE_ID} gameState={state} chips={me?.chips ?? 0}
        stripes={serverProfile?.stripes ?? 0} phase={state.phase}
        onLeave={leaveToLobby}
        sessionStats={effectiveSpectator ? undefined : sessionStats}
        tableId={tableId} humanCount={humanCount}
        onOpenChat={!effectiveSpectator ? () => setChatOpen(true) : undefined}
        chatUnread={chatUnread}
        spectating={effectiveSpectator}
      />

      {!effectiveSpectator && (
        <PersonalChipGiftPanel
          tableId={tableId}
          modeId="badugi"
          myId={myId}
          players={state.players}
          onGiftSuccess={refetchProfile}
        />
      )}

      {isSpectator && <SpectatorBanner spectatorCount={state.spectatorCount} />}
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
            animState={{ dealingIndices, drawingIndices, discardingIndices }}
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

      {/* ShowdownReveal overlay */}
      {showRevealOverlay && (
        <ShowdownReveal cardsPerHand={4} winners={revealWinners} heroData={revealHeroData}
          heroWon={heroWonReveal} potAmount={revealPotAmount} onComplete={() => {}} />
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

      <BustOutModal open={showBustModal} tableId={tableId} modeId={MODE_ID} bankrollAvailable={serverProfile?.chipBalance ?? 0}
        bigBlind={state.minBet} lifetimeBusts={lifetimeBusts} sessionBusts={sessionBusts}
        hasNeverPurchased={hasNeverPurchased}
        onRebuy={async amount => { await requestRebuy('reserve', amount); setBustDismissed(true); void refetchProfile(); }}
        onSpectate={() => setBustDismissed(true)}
        onLeaveTable={() => { void leaveToLobby(); }}
        onWatchAd={undefined}
        onStarterPack={async () => { await requestRebuy('free'); setBustDismissed(true); void refetchProfile(); }}
        onBorrowChips={handleBorrowChips} />
    </div>
  );
}

