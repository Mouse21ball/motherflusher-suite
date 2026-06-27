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
import { DebugOverlay } from '@/components/game/DebugOverlay';
import { XPToast } from '@/components/XPToast';
import { useXPWatcher } from '@/lib/useXPWatcher';
import { usePhaseSounds } from '@/lib/usePhaseSounds';
import { useGameToasts } from '@/lib/useGameToasts';
import { saveChips } from '@/lib/persistence';
import { trackModePlay } from '@/lib/analytics';
import { useServerProfile } from '@/lib/useServerProfile';
import { isRewardAvailable } from '@/lib/dailyReward';
import { useFlushedUpSounds } from '@/components/flushedUp/useFlushedUpSounds';
import { useCardAnimations } from '@/components/flushedUp/useCardAnimations';
import { KamikazeTable } from '@/components/kamikaze/KamikazeTable';
import { KamikazeActionBar } from '@/components/kamikaze/KamikazeActionBar';
import { KamikazeShowdown } from '@/components/kamikaze/KamikazeShowdown';

const MODE_ID   = 'kamikaze';
const ENGINE_ID = 'kamikaze';

function useTableId() {
  const [tableId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('t')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(fromUrl)) return fromUrl;
    const newCode = generateTableCode();
    window.history.replaceState(null, '', `/kamikaze?t=${newCode}`);
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

/* ── Graffiti Bomb Header ─────────────────────────────────────────────────── */
interface HeaderProps {
  onBack: () => void;
  onOpenChat: () => void;
  chatUnread: number;
  humanCount: number;
}

function KamikazeHeader({ onBack, onOpenChat, chatUnread, humanCount }: HeaderProps) {
  return (
    <div style={{
      flexShrink: 0, height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px',
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      borderBottom: '1px solid rgba(239,68,68,0.2)',
    }}>
      <button onClick={onBack} data-testid="button-back" style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.8)',
        fontSize: 11, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.1em',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}>
        ← BACK
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <div style={{
          fontSize: 7, fontFamily: 'monospace', fontWeight: 700, color: '#ef4444',
          letterSpacing: '0.24em', textTransform: 'uppercase',
          background: 'rgba(239,68,68,0.1)', padding: '1px 7px', borderRadius: 4,
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
          NEW MODE
        </div>
        <div style={{
          fontSize: 16, fontFamily: 'monospace', fontWeight: 900,
          background: 'linear-gradient(90deg, #ef4444, #facc15, #3b82f6)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '0.1em', lineHeight: 1,
        }}>
          KAMIKAZE
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {humanCount > 1 && (
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(239,68,68,0.7)', letterSpacing: '0.1em' }}>
            {humanCount}P
          </span>
        )}
        <button onClick={onOpenChat} data-testid="button-chat-header" style={{
          position: 'relative', background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '5px 9px',
          color: 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}>
          💬
          {chatUnread > 0 && (
            <div style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: '#ef4444', border: '1.5px solid #000', fontSize: 7, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {chatUnread > 9 ? '9+' : chatUnread}
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Main game UI ─────────────────────────────────────────────────────────── */
function KamikazeGameUI() {
  const tableId = useTableId();
  const [, navigate] = useLocation();

  useEffect(() => { trackModePlay(MODE_ID); saveRecentTable(tableId); }, [tableId]);

  const { state, handleAction, myId, role, sessionStats, lastWsAt, lastWsType, isClubTable, kickedByHost } =
    useServerMode(tableId, ENGINE_ID);

  void sessionStats;

  const { profile: serverProfile, refetch: refetchProfile } = useServerProfile();
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();
  const sounds = useFlushedUpSounds();

  useEffect(() => { if (kickedByHost) navigate('/'); }, [kickedByHost, navigate]);

  usePhaseSounds(state.phase);
  useGameToasts(state, myId, 'Kamikaze');

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

  const isDrawPhase = ['DRAW_1', 'DRAW_2', 'DRAW_3'].includes(state.phase);
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
      if (winner) setTimeout(() => { sounds[winner.id === myId ? 'win' : 'lose'](); }, 800);
    }
  }, [state.phase, state.players, myId, sounds]);

  const [actionLocked, setActionLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleControlAction = useCallback((action: string, amount?: number | unknown) => {
    sounds.unlock();
    if (action === 'draw') {
      if (selectedCardIndices.length > 0) { triggerDiscard(selectedCardIndices); sounds.cardDiscard(); }
      setTimeout(() => { handleAction(action, selectedCardIndices); setSelectedCardIndices([]); }, 280);
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

  const handleStay = useCallback(() => {
    sounds.unlock(); sounds.chipClink();
    setSelectedCardIndices([]);
    setTimeout(() => handleAction('draw', []), 50);
    setActionLocked(true);
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => setActionLocked(false), 280);
  }, [handleAction, sounds]);

  const handleDraw = useCallback(() => { handleControlAction('draw'); }, [handleControlAction]);

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
  const sessionBusts  = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
  const hasNeverPurchased = !localStorage.getItem('cgp_first_purchase_complete');
  const openSeatsCount = state.players.filter(p => p.presence === 'reserved').length;
  const humanCount = state.players.filter(p => p.presence === 'human').length;
  const activeCount = state.players.filter(p => p.presence === 'bot' || p.presence === 'human').length;

  const handleBorrowChips = async () => {
    const pid = serverProfile?.profileId;
    if (!pid) return;
    try {
      const res = await fetch(`/api/players/${pid}/chip-loan`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) { handleAction('rebuy', 1000); setBustDismissed(true); refetchProfile(); }
    } catch { /* silent */ }
  };

  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const prevChatLenRef = useRef(state.chatMessages.length);
  useEffect(() => {
    const newLen = state.chatMessages.length;
    if (newLen > prevChatLenRef.current && !chatOpen) setChatUnread(prev => prev + newLen - prevChatLenRef.current);
    prevChatLenRef.current = newLen;
  }, [state.chatMessages.length, chatOpen]);
  useEffect(() => { if (chatOpen) setChatUnread(0); }, [chatOpen]);

  const modeIntro = (MODE_INTROS as Record<string, (typeof MODE_INTROS)[keyof typeof MODE_INTROS]>)[MODE_ID];
  void isRewardAvailable;

  const handleBack = useCallback(() => { if (me) saveChips(MODE_ID, me.chips); navigate('/'); }, [me, navigate]);

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#000000',
      backgroundImage: "url('/modes/bg-kamikaze.png')",
      backgroundSize: 'cover', backgroundPosition: 'center top', overflow: 'hidden',
    }} data-mode={MODE_ID}>
      {modeIntro && <ModeIntro modeId={MODE_ID} {...modeIntro} />}

      <KamikazeHeader onBack={handleBack} onOpenChat={() => setChatOpen(true)} chatUnread={chatUnread} humanCount={humanCount} />

      {isSpectator && <SpectatorBanner spectatorCount={state.spectatorCount} />}

      {!effectiveSpectator && state.spectatorCount != null && state.spectatorCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
          <SpectatorWatchingBadge count={state.spectatorCount} />
        </div>
      )}

      {import.meta.env.DEV && <DebugOverlay state={state} myId={myId} lastWsAt={lastWsAt ?? null} lastWsType={lastWsType ?? null} />}

      <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <KamikazeTable
          state={state} myId={myId}
          selectedCardIndices={effectiveSpectator ? [] : selectedCardIndices}
          onCardClick={handleCardClick}
          isDrawPhase={!effectiveSpectator && isDrawPhase}
          animState={{ dealingIndices, drawingIndices, discardingIndices }}
        />
      </main>

      {!effectiveSpectator && state.phase !== 'SHOWDOWN' && (
        <div style={{ flexShrink: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: '1px solid rgba(239,68,68,0.15)' }}>
          <KamikazeActionBar
            phase={state.phase} isDrawPhase={!effectiveSpectator && isDrawPhase}
            selectedCount={selectedCardIndices.length} drawLimit={drawLimit}
            isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING' || state.phase === 'DECLARE'}
            chips={me?.chips ?? 0} currentBet={state.currentBet} myBet={me?.bet ?? 0}
            pot={state.pot} ante={25} humanCount={humanCount}
            openSeatsCount={isClubTable ? 0 : openSeatsCount}
            activeCount={activeCount} isClubTable={isClubTable}
            locked={actionLocked}
            myDeclaration={me?.declaration ?? null}
            myHasActed={state.phase === 'DECLARE' ? (me?.hasActed ?? false) : false}
            onStay={handleStay} onDraw={handleDraw}
            onAction={handleControlAction}
            onRebuy={() => handleControlAction('rebuy', 1000)}
          />
        </div>
      )}

      {isPrebuyIn && (
        <div style={{ flexShrink: 0, padding: '8px 12px 12px' }}>
          <button onClick={() => { setHasBoughtIn(true); handleAction('sit_down'); }} data-testid="button-crew-buyin"
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, fontFamily: 'monospace', fontWeight: 700, fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', background: 'linear-gradient(135deg, #b91c1c, #ef4444)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 0 20px rgba(239,68,68,0.4)' }}>
            BUY IN — {(me?.chips ?? 10000).toLocaleString()} chips
          </button>
        </div>
      )}

      {state.phase === 'SHOWDOWN' && <KamikazeShowdown state={state} myId={myId} />}

      {xpToast && xpToast.xpGained > 0 && (
        <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp} newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />
      )}

      {!effectiveSpectator && (
        <ChatEmoteRow onReact={emoji => handleAction('reaction', emoji)} incomingReactions={state.liveReactions} onOpenChat={() => setChatOpen(true)} chatUnread={chatUnread} />
      )}

      <ChatBox messages={state.chatMessages} myId={myId} onSendMessage={text => handleAction('chat', text)} open={chatOpen} onOpenChange={setChatOpen}
        seatToPlayerId={Object.fromEntries(state.players.filter(p => p.identityId).map(p => [p.id, p.identityId!]))}
        myProfileId={serverProfile?.profileId} />

      <BustOutModal open={showBustModal} lifetimeBusts={lifetimeBusts} sessionBusts={sessionBusts}
        hasNeverPurchased={hasNeverPurchased}
        onRebuy={amount => { handleAction('rebuy', amount); setBustDismissed(true); }}
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

export default function KamikazeGame() {
  if (!serverEnabled) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-white/40 font-mono text-sm">Server mode required. Set VITE_BADUGI_ALPHA=true</p>
      </div>
    );
  }
  return <KamikazeGameUI />;
}
