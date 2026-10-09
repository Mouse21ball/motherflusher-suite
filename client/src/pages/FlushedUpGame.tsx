import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useServerMode } from '@/lib/poker/engine/useServerMode';
import { generateTableCode, saveRecentTable } from '@/lib/tableSession';
import { FEATURES } from '@/lib/featureFlags';
import { ChatBox } from '@/components/game/ChatBox';
import { ChatEmoteRow } from '@/components/game/ChatEmoteRow';
import { BustOutModal } from '@/components/game/BustOutModal';
import { SpectatorBanner, SpectatorWatchingBadge } from '@/components/game/SpectatorBanner';
import { ModeIntro, MODE_INTROS } from '@/components/game/ModeIntro';
import { HowToPlay } from '@/components/ui/HowToPlay';
import { DebugOverlay } from '@/components/game/DebugOverlay';
import { XPToast } from '@/components/XPToast';
import { useXPWatcher } from '@/lib/useXPWatcher';
import { usePhaseSounds } from '@/lib/usePhaseSounds';
import { useGameToasts } from '@/lib/useGameToasts';
import { saveChips } from '@/lib/persistence';
import { trackModePlay } from '@/lib/analytics';
import { useHandAnalytics } from '@/lib/useHandAnalytics';
import { useServerProfile } from '@/lib/useServerProfile';
import { FlushedUpTable } from '@/components/flushedUp/FlushedUpTable';
import { YardPlayerHeader } from '@/components/YardPlayerHeader';
import yardBackdrop from '@/assets/images/yard-backdrop.jpg';
import { FlushedUpActionBar } from '@/components/flushedUp/FlushedUpActionBar';
import { ShowdownScreen } from '@/components/flushedUp/ShowdownScreen';
import { useFlushedUpSounds } from '@/components/flushedUp/useFlushedUpSounds';
import { useCardAnimations } from '@/components/flushedUp/useCardAnimations';
import { PersonalChipGiftPanel } from '@/components/game/PersonalChipGiftPanel';
import { FriendSeatActions } from '@/components/game/FriendSeatActions';
import { apiFetch } from '@/lib/session';
import { apiUrl } from '@/lib/apiConfig';

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

/* ── Custom header ───────────────────────────────────────────────────────── */

interface HeaderProps {
  onBack: () => void;
  onOpenChat: () => void;
  onOpenHowToPlay: () => void;
  chatUnread: number;
  humanCount: number;
}

function FlushedUpHeader({ onBack, onOpenChat, onOpenHowToPlay, chatUnread, humanCount }: HeaderProps) {
  return (
    <div style={{
      flexShrink: 0,
      height: 52,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      background: 'rgba(5,2,15,0.7)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderBottom: '1px solid rgba(124,58,237,0.15)',
    }}>
      {/* Left: back button */}
      <button
        onClick={onBack}
        aria-label="Return to lobby"
        title="Return to lobby"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(124,58,237,0.12)',
          border: '1px solid rgba(124,58,237,0.25)',
          borderRadius: 8, padding: '5px 10px',
          color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: 'monospace',
          fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
        data-testid="button-back"
      >
        ← LOBBY
      </button>

      {/* Center: title */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          color: '#a855f7', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          background: 'rgba(124,58,237,0.15)', padding: '1px 7px', borderRadius: 4,
          border: '1px solid rgba(124,58,237,0.3)',
        }}>
          NEW MODE
        </div>
        <div style={{
          fontSize: 16, fontFamily: 'monospace', fontWeight: 900,
          background: 'linear-gradient(90deg, #c084fc, #a855f7, #7c3aed)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '0.08em', lineHeight: 1,
        }}>
          FLUSH RUSH
        </div>
      </div>

      {/* Right: chat + human count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {humanCount > 1 && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(168,85,247,0.7)', letterSpacing: '0.04em' }}>
            {humanCount}P
          </span>
        )}
        <button
          onClick={onOpenHowToPlay}
          aria-label="How to play"
          title="How to play"
          data-testid="button-how-to-play-header"
          style={{
            background: 'rgba(124,58,237,0.12)',
            border: '1px solid rgba(124,58,237,0.25)',
            borderRadius: 8, width: 30, height: 30,
            color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: 700,
            fontFamily: 'monospace', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ?
        </button>
        <button
          onClick={onOpenChat}
          style={{
            position: 'relative',
            background: 'rgba(124,58,237,0.12)',
            border: '1px solid rgba(124,58,237,0.25)',
            borderRadius: 8, padding: '5px 9px',
            color: 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
          data-testid="button-chat-header"
        >
          💬
          {chatUnread > 0 && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              width: 18, height: 18, borderRadius: '50%',
              background: '#a855f7', border: '1.5px solid #0d0a1a',
              fontSize: 11, fontWeight: 700, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {chatUnread > 9 ? '9+' : chatUnread}
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Main game UI ────────────────────────────────────────────────────────── */

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
    actionError,
    requestRebuy,
    myId,
    role,
    sessionStats,
    lastWsAt,
    lastWsType,
    isClubTable,
    kickedByHost,
    leaveAndSettle,
  } = useServerMode(tableId, ENGINE_ID);
  const analyticsChipsBefore = useHandAnalytics(state, myId, tableId, 'flushed_up');

  const { profile: serverProfile, refetch: refetchProfile } = useServerProfile();
  const leaveToLobby = useCallback(async () => {
    try {
      await leaveAndSettle();
      const profile = await refetchProfile();
      if (!profile) throw new Error('Your balance could not be refreshed. Please stay connected and try again.');
      navigate('/');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not save your table balance. Please try again.');
    }
  }, [leaveAndSettle, navigate, refetchProfile]);
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
      setTimeout(() => {
        handleAction(action, selectedCardIndices);
        setSelectedCardIndices([]);
      }, 280);
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

  /* STAY = draw with empty indices (stand pat) */
  const handleStay = useCallback(() => {
    sounds.unlock();
    sounds.chipClink();
    setSelectedCardIndices([]);
    setTimeout(() => handleAction('draw', []), 50);
    setActionLocked(true);
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => setActionLocked(false), 280);
  }, [handleAction, sounds]);

  /* DRAW = use selected indices */
  const handleDraw = useCallback(() => {
    handleControlAction('draw');
  }, [handleControlAction]);

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
  const activeCount = state.players.filter(p => p.presence === 'bot' || p.presence === 'human').length;

  const handleBorrowChips = async () => {
    await requestRebuy('borrow', 1000);
    setBustDismissed(true);
    void refetchProfile();
  };

  const [chatOpen, setChatOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
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

  const modeIntro = (MODE_INTROS as Record<string, (typeof MODE_INTROS)[keyof typeof MODE_INTROS]>)[MODE_ID]
    ?? MODE_INTROS.swing;

  const handleBack = useCallback(() => { void leaveToLobby(); }, [leaveToLobby]);

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0d0a1a',
        backgroundImage: `url('${yardBackdrop}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        overflow: 'hidden',
      }}
      data-mode={MODE_ID}
    >
      <YardPlayerHeader readOnly />
      {modeIntro && <ModeIntro modeId={MODE_ID} {...modeIntro} />}

      {/* ── Custom header ─────────────────────────────────────────── */}
      <FlushedUpHeader
        onBack={handleBack}
        onOpenChat={() => setChatOpen(true)}
        onOpenHowToPlay={() => setShowHowToPlay(true)}
        chatUnread={chatUnread}
        humanCount={humanCount}
      />

      {!effectiveSpectator && (
        <PersonalChipGiftPanel tableId={tableId} modeId={ENGINE_ID} myId={myId} players={state.players} onGiftSuccess={refetchProfile} />
      )}

      {/* ── Spectator / join-confirm banners ─────────────────────── */}
      {isSpectator && <SpectatorBanner spectatorCount={state.spectatorCount} />}

      {showJoinConfirm && (
        <div style={{ padding: '2px 0', textAlign: 'center' }} aria-live="polite">
          <span className="text-[11px] font-mono anim-action-label" style={{ color: 'rgba(0,200,150,0.7)' }} data-testid="text-joined-confirm">
            ✓ Joined table
          </span>
        </div>
      )}

      {!effectiveSpectator && state.spectatorCount != null && state.spectatorCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
          <SpectatorWatchingBadge count={state.spectatorCount} />
        </div>
      )}

      {import.meta.env.DEV && (
        <DebugOverlay state={state} myId={myId} lastWsAt={lastWsAt ?? null} lastWsType={lastWsType ?? null} />
      )}

      {/* ── Main table area ───────────────────────────────────────── */}
      <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <FriendSeatActions state={state} myId={myId} myProfileId={serverProfile?.profileId} disabled={effectiveSpectator}>
          <FlushedUpTable
            state={state}
            myId={myId}
            selectedCardIndices={effectiveSpectator ? [] : selectedCardIndices}
            onCardClick={handleCardClick}
            isDrawPhase={!effectiveSpectator && isDrawPhase}
            animState={{ dealingIndices, drawingIndices, discardingIndices }}
          />
        </FriendSeatActions>
      </main>

      {/* ── Bottom bar: action controls + stats ──────────────────── */}
      {!effectiveSpectator && state.phase !== 'SHOWDOWN' && (
        <div style={{
          flexShrink: 0,
          background: 'rgba(5,2,15,0.75)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderTop: '1px solid rgba(124,58,237,0.18)',
        }}>
          <FlushedUpActionBar
            phase={state.phase}
            isDrawPhase={!effectiveSpectator && isDrawPhase}
            selectedCount={selectedCardIndices.length}
            drawLimit={drawLimit}
            isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
            chips={me?.chips ?? 0}
            currentBet={state.currentBet}
            myBet={me?.bet ?? 0}
            pot={state.pot}
            ante={25}
            humanCount={humanCount}
            openSeatsCount={isClubTable ? 0 : openSeatsCount}
            activeCount={activeCount}
            isClubTable={isClubTable}
            locked={actionLocked}
            onStay={handleStay}
            onDraw={handleDraw}
            onAction={handleControlAction}
            onRebuy={() => handleControlAction('rebuy', 1000)}
          />
        </div>
      )}

      {/* ── Pre buy-in bar ────────────────────────────────────────── */}
      {isPrebuyIn && (
        <div style={{ flexShrink: 0, padding: '8px 12px 12px' }}>
          <button
            data-testid="button-crew-buyin"
            onClick={() => { setHasBoughtIn(true); handleAction('sit_down'); }}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 14,
              fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 0 20px rgba(124,58,237,0.5)',
            }}
          >
            BUY IN — {(me?.chips ?? 10000).toLocaleString()} chips
          </button>
        </div>
      )}

      {/* ── Full-screen showdown overlay ──────────────────────────── */}
      {state.phase === 'SHOWDOWN' && (
        <ShowdownScreen state={state} myId={myId} />
      )}

      {/* ── XP toast ─────────────────────────────────────────────── */}
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

      {/* ── Emote row ────────────────────────────────────────────── */}
      {!effectiveSpectator && (
        <ChatEmoteRow
          level={serverProfile?.level}
          onReact={(emoji) => handleAction('reaction', emoji)}
          incomingReactions={state.liveReactions}
          onOpenChat={() => setChatOpen(true)}
          chatUnread={chatUnread}
        />
      )}

      {/* ── Chat ─────────────────────────────────────────────────── */}
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

      {showHowToPlay && <HowToPlay modeId="flushedup" onClose={() => setShowHowToPlay(false)} />}

      {/* ── Bust out modal ────────────────────────────────────────── */}
      {actionError && <div role="alert" className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-red-500/30 bg-black/90 px-4 py-2 text-center text-xs text-red-200">{actionError}</div>}
      <BustOutModal
        chipsBefore={analyticsChipsBefore}
        open={showBustModal}
        tableId={tableId}
        modeId={ENGINE_ID}
        bankrollAvailable={serverProfile?.chipBalance ?? 0}
        bigBlind={state.minBet}
        lifetimeBusts={lifetimeBusts}
        sessionBusts={sessionBusts}
        hasNeverPurchased={hasNeverPurchased}
        onRebuy={async amount => { await requestRebuy('reserve', amount); setBustDismissed(true); void refetchProfile(); }}
        onSpectate={() => setBustDismissed(true)}
        onLeaveTable={() => { void leaveToLobby(); }}
        onStarterPack={async () => { await requestRebuy('free'); setBustDismissed(true); void refetchProfile(); }}
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
        <p className="text-white/70 font-mono text-sm">Server mode required. Set VITE_BADUGI_ALPHA=true</p>
      </div>
    );
  }
  return <FlushedUpGameUI />;
}
