import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useServerMode } from '@/lib/poker/engine/useServerMode';
import { generateTableCode, saveRecentTable } from '@/lib/tableSession';
import { FEATURES } from '@/lib/featureFlags';
import { GameStatusBar } from '@/components/game/GameStatusBar';
import { ActionControls } from '@/components/game/Controls';
import { ChatBox } from '@/components/game/ChatBox';
import { ChatEmoteRow } from '@/components/game/ChatEmoteRow';
import { BustOutModal } from '@/components/game/BustOutModal';
import { SpectatorBanner, SpectatorWatchingBadge } from '@/components/game/SpectatorBanner';
import { ModeIntro, MODE_INTROS } from '@/components/game/ModeIntro';
import { DebugOverlay } from '@/components/game/DebugOverlay';
import { XPToast } from '@/components/XPToast';
import { useXPWatcher } from '@/lib/useXPWatcher';
import { usePhaseSounds } from '@/lib/usePhaseSounds';
import { useGameToasts } from '@/lib/useGameToasts';
import { saveChips } from '@/lib/persistence';
import { trackModePlay } from '@/lib/analytics';
import { useServerProfile } from '@/lib/useServerProfile';
import { isRewardAvailable } from '@/lib/dailyReward';
import { FlushedUpTable } from '@/components/flushedUp/FlushedUpTable';
import { useFlushedUpSounds } from '@/components/flushedUp/useFlushedUpSounds';
import { useCardAnimations } from '@/components/flushedUp/useCardAnimations';

const MODE_ID = 'flushed_up';
const ENGINE_ID = 'flushed_up';

function useTableId() {
  const [tableId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('t')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(fromUrl)) return fromUrl;
    const newCode = generateTableCode();
    window.history.replaceState(null, '', `/flushedup?t=${newCode}`);
    return newCode;
  });
  return tableId;
}

function getDrawLimit(phase: string): number {
  if (phase === 'DRAW_1') return 3;
  if (phase === 'DRAW_2') return 2;
  if (phase === 'DRAW_3') return 1;
  return 0;
}

function FlushedUpGameUI() {
  const tableId = useTableId();
  const [, navigate] = useLocation();

  useEffect(() => {
    trackModePlay(MODE_ID);
    saveRecentTable(tableId);
  }, [tableId]);

  const {
    state,
    handleAction,
    myId,
    role,
    sessionStats,
    lastWsAt,
    lastWsType,
    isClubTable,
    kickedByHost,
  } = useServerMode(tableId, ENGINE_ID);

  const { profile: serverProfile, refetch: refetchProfile } = useServerProfile();
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const sounds = useFlushedUpSounds();

  useEffect(() => { if (kickedByHost) navigate('/'); }, [kickedByHost, navigate]);

  usePhaseSounds(state.phase);
  useGameToasts(state, myId, 'Flushed Up');

  const isSpectator = role === 'spectator';
  const [hasBoughtIn, setHasBoughtIn] = useState(false);
  const boughtInInitRef = useRef(false);
  useEffect(() => {
    if (boughtInInitRef.current) return;
    if (lastWsAt == null) return;
    boughtInInitRef.current = true;
    if (!isClubTable) setHasBoughtIn(true);
  }, [lastWsAt, isClubTable]);
  const isPrebuyIn = isClubTable && !hasBoughtIn;
  const effectiveSpectator = isSpectator || isPrebuyIn;

  const me = state.players.find(p => p.id === myId);

  const isDrawPhase = state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3';
  const drawLimit = getDrawLimit(state.phase);

  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  useEffect(() => { setSelectedCardIndices([]); }, [state.phase]);

  const handleCardClick = useCallback((index: number) => {
    if (effectiveSpectator || !isDrawPhase) return;
    sounds.unlock();
    sounds.cardSelect();
    setSelectedCardIndices(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length < drawLimit) return [...prev, index];
      return prev;
    });
  }, [effectiveSpectator, isDrawPhase, drawLimit, sounds]);

  const heroCards = me?.cards ?? [];
  const { dealingIndices, drawingIndices, discardingIndices, triggerDiscard } =
    useCardAnimations(heroCards, state.phase);

  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (prev === state.phase) return;
    if (state.phase === 'ANTE') sounds.chipClink();
    if (state.phase === 'SHOWDOWN') {
      sounds.showdownFlip();
      const winner = state.players.find(p => (p as any).isWinner);
      if (winner) {
        const isHeroWin = winner.id === myId;
        setTimeout(() => { if (isHeroWin) sounds.win(); else sounds.lose(); }, 800);
      }
    }
  }, [state.phase, state.players, myId, sounds]);

  const [actionLocked, setActionLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleControlAction = useCallback((action: string, amount?: number | unknown) => {
    sounds.unlock();
    if (action === 'draw') {
      if (selectedCardIndices.length > 0) {
        triggerDiscard(selectedCardIndices);
        sounds.cardDiscard();
      }
      setTimeout(() => handleAction(action, selectedCardIndices), 280);
    } else {
      handleAction(action, amount);
    }
    if (action === 'fold') sounds.lose();
    if (action === 'bet' || action === 'raise' || action === 'call') sounds.chipClink();
    const PASSIVE = ['restart', 'rebuy', 'chat', 'reaction', 'ante'];
    if (!PASSIVE.includes(action)) {
      setActionLocked(true);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => setActionLocked(false), 280);
    }
  }, [selectedCardIndices, triggerDiscard, handleAction, sounds]);

  const handleSendMessage = (text: string) => handleAction('chat', text);

  const [bustDismissed, setBustDismissed] = useState(false);
  const heroBust = !!me && me.chips <= 0 && !effectiveSpectator && me.status !== 'active';
  const bustEligiblePhase = me?.status === 'sitting_out' || state.phase === 'WAITING' || state.phase === 'SHOWDOWN';
  const showBustModal = heroBust && bustEligiblePhase && !bustDismissed;
  useEffect(() => { if (me && me.chips > 0) setBustDismissed(false); }, [me?.chips]);

  const bustCountedRef = useRef(false);
  useEffect(() => {
    if (heroBust && bustEligiblePhase && !bustCountedRef.current) {
      bustCountedRef.current = true;
      const lt = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
      localStorage.setItem('cgp_lifetime_busts', (lt + 1).toString());
      const ss = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
      sessionStorage.setItem('cgp_session_busts', (ss + 1).toString());
    }
    if (!heroBust) bustCountedRef.current = false;
  }, [heroBust, bustEligiblePhase]);

  const lifetimeBusts = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
  const sessionBusts = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
  const hasNeverPurchased = !localStorage.getItem('cgp_first_purchase_complete');
  const openSeatsCount = state.players.filter(p => p.presence === 'reserved').length;
  const humanCount = state.players.filter(p => p.presence === 'human').length;

  const handleBorrowChips = async () => {
    const pid = serverProfile?.profileId;
    if (!pid) return;
    try {
      const res = await fetch(`/api/players/${pid}/chip-loan`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        handleAction('rebuy', 1000);
        setBustDismissed(true);
        refetchProfile();
      }
    } catch { /* silent */ }
  };

  const [chatOpen, setChatOpen] = useState(false);
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

  const [showJoinConfirm, setShowJoinConfirm] = useState(!!tableId && !isSpectator);
  useEffect(() => {
    if (!showJoinConfirm) return;
    const t = setTimeout(() => setShowJoinConfirm(false), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modeIntro = (MODE_INTROS as Record<string, (typeof MODE_INTROS)[keyof typeof MODE_INTROS]>)[MODE_ID];
  // isRewardAvailable used in bust modal flow
  void isRewardAvailable;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30 game-page-root" data-mode={MODE_ID}>
      {modeIntro && <ModeIntro modeId={MODE_ID} {...modeIntro} />}

      <GameStatusBar
        modeId={MODE_ID}
        gameState={state}
        chips={me?.chips ?? 0}
        stripes={serverProfile?.stripes ?? 0}
        phase={state.phase}
        onForfeit={() => { if (me) saveChips(MODE_ID, me.chips); }}
        sessionStats={effectiveSpectator ? undefined : sessionStats}
        tableId={tableId}
        humanCount={humanCount}
        onOpenChat={!effectiveSpectator ? () => setChatOpen(true) : undefined}
        chatUnread={chatUnread}
      />

      {isSpectator && <SpectatorBanner spectatorCount={state.spectatorCount} />}

      {showJoinConfirm && (
        <div className="w-full px-3 flex justify-center pt-14" aria-live="polite">
          <span className="text-[10px] font-mono anim-action-label" style={{ color: 'rgba(0,200,150,0.65)' }} data-testid="text-joined-confirm">
            ✓ Joined table
          </span>
        </div>
      )}

      {!effectiveSpectator && state.spectatorCount != null && state.spectatorCount > 0 && (
        <div className="flex justify-center pt-1">
          <SpectatorWatchingBadge count={state.spectatorCount} />
        </div>
      )}

      {import.meta.env.DEV && (
        <DebugOverlay state={state} myId={myId} lastWsAt={lastWsAt ?? null} lastWsType={lastWsType ?? null} />
      )}

      <main className="flex-1 flex flex-col pt-12 sm:pt-14 pb-64 sm:pb-72 overflow-x-hidden">
        <FlushedUpTable
          state={state}
          myId={myId}
          selectedCardIndices={effectiveSpectator ? [] : selectedCardIndices}
          onCardClick={handleCardClick}
          isDrawPhase={!effectiveSpectator && isDrawPhase}
          animState={{ dealingIndices, drawingIndices, discardingIndices }}
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

      {!effectiveSpectator && (
        <ChatEmoteRow
          onReact={(emoji) => handleAction('reaction', emoji)}
          incomingReactions={state.liveReactions}
          onOpenChat={() => setChatOpen(true)}
          chatUnread={chatUnread}
        />
      )}

      {!effectiveSpectator && (
        <div
          className="fixed bottom-3 sm:bottom-4 left-0 w-full z-40 pointer-events-none"
          style={{ background: 'linear-gradient(to top, #000 60%, rgba(0,0,0,0.92) 85%, transparent 100%)' }}
        >
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
              openSeatsCount={isClubTable ? 0 : openSeatsCount}
              humanCount={humanCount}
              isClubTable={isClubTable}
              myDeclaration={me?.declaration ?? null}
              turnDeadline={state.turnDeadline ?? null}
              modeId={MODE_ID}
              tableId={tableId}
            />
          </div>
        </div>
      )}

      {isPrebuyIn && (
        <div
          className="fixed bottom-3 sm:bottom-4 left-0 w-full z-40 pointer-events-none"
          style={{ background: 'linear-gradient(to top, #000 60%, rgba(0,0,0,0.92) 85%, transparent 100%)' }}
        >
          <div className="pointer-events-auto w-full max-w-md mx-auto px-2 pb-2">
            <button
              data-testid="button-crew-buyin"
              onClick={() => { setHasBoughtIn(true); handleAction('sit_down'); }}
              className="w-full py-3.5 rounded-xl font-mono font-bold text-sm tracking-widest uppercase"
              style={{ background: 'linear-gradient(135deg, #C9A227, #D4B44A)', color: '#0B0B0D', letterSpacing: '0.18em' }}
            >
              BUY IN — {(me?.chips ?? 10000).toLocaleString()} chips
            </button>
          </div>
        </div>
      )}

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
        onLeaveTable={() => { if (me) saveChips(MODE_ID, me.chips); navigate('/'); }}
        onClaimDailyBonus={() => { setBustDismissed(true); navigate('/'); }}
        onWatchAd={undefined}
        onStarterPack={() => { handleAction('rebuy', 1000); setBustDismissed(true); }}
        onBorrowChips={handleBorrowChips}
      />
    </div>
  );
}

const serverEnabled = FEATURES.SERVER_AUTHORITATIVE_BADUGI || import.meta.env.VITE_BADUGI_ALPHA === 'true';

export default function FlushedUpGame() {
  if (!serverEnabled) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-white/40 font-mono text-sm">Server mode required. Set VITE_BADUGI_ALPHA=true</p>
      </div>
    );
  }
  return <FlushedUpGameUI />;
}
