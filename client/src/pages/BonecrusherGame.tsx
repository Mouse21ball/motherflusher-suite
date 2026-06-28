import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useServerMode } from '@/lib/poker/engine/useServerMode';
import { FEATURES } from '@/lib/featureFlags';
import { generateTableCode, saveRecentTable } from '@/lib/tableSession';
import { ChatBox } from '@/components/game/ChatBox';
import { ChatEmoteRow } from '@/components/game/ChatEmoteRow';
import { BustOutModal } from '@/components/game/BustOutModal';
import { ModeIntro, MODE_INTROS } from '@/components/game/ModeIntro';
import { XPToast } from '@/components/XPToast';
import { useXPWatcher } from '@/lib/useXPWatcher';
import { usePhaseSounds } from '@/lib/usePhaseSounds';
import { useGameToasts } from '@/lib/useGameToasts';
import { saveChips } from '@/lib/persistence';
import { trackModePlay } from '@/lib/analytics';
import { useServerProfile } from '@/lib/useServerProfile';
import { isRewardAvailable } from '@/lib/dailyReward';
import { BonecrusherTable } from '@/components/bonecrusher/BonecrusherTable';
import { BonecrusherActionBar } from '@/components/bonecrusher/BonecrusherActionBar';
import { BonecrusherShowdown } from '@/components/bonecrusher/BonecrusherShowdown';

const MODE_ID   = 'bonecrusher';
const ENGINE_ID = 'bonecrusher';

function useTableId() {
  const [tableId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('t')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(fromUrl)) return fromUrl;
    const newCode = generateTableCode();
    window.history.replaceState(null, '', `/bonecrusher?t=${newCode}`);
    return newCode;
  });
  return tableId;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
interface HeaderProps {
  onBack: () => void;
  onOpenChat: () => void;
  chatUnread: number;
  humanCount: number;
}

function BonecrusherHeader({ onBack, onOpenChat, chatUnread, humanCount }: HeaderProps) {
  return (
    <div style={{
      flexShrink: 0, height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px',
      background: 'rgba(0,0,0,0.80)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      borderBottom: '1px solid rgba(217,119,6,0.25)',
    }}>
      <button onClick={onBack} data-testid="button-back" style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)',
        borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.8)',
        fontSize: 11, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.1em',
        cursor: 'pointer',
      }}>
        ← BACK
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <div style={{
          fontSize: 7, fontFamily: 'monospace', fontWeight: 700, color: '#d97706',
          letterSpacing: '0.24em', textTransform: 'uppercase',
          background: 'rgba(217,119,6,0.12)', padding: '1px 7px', borderRadius: 4,
        }}>
          CHAIN GANG POKER
          {humanCount > 1 && (
            <span style={{ marginLeft: 5, color: '#fbbf24' }}>{humanCount}P</span>
          )}
        </div>
        <div style={{
          fontSize: 17, fontFamily: 'monospace', fontWeight: 900, color: '#fef3c7',
          letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1,
        }}>
          BONECRUSHER
        </div>
        <div style={{
          fontSize: 8, fontFamily: 'monospace', fontWeight: 500, color: '#d97706',
          letterSpacing: '0.1em',
        }}>
          6 CARDS · HIGH / LOW / SWING
        </div>
      </div>

      <button onClick={onOpenChat} data-testid="button-chat" style={{
        position: 'relative',
        background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)',
        borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.8)',
        fontSize: 18, cursor: 'pointer',
      }}>
        💬
        {chatUnread > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            background: '#d97706', color: '#000', borderRadius: '50%',
            width: 16, height: 16, fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{chatUnread}</div>
        )}
      </button>
    </div>
  );
}

/* ── Server-mode gate (same pattern as KamikazeGame) ────────────────────── */
const serverEnabled = FEATURES.SERVER_AUTHORITATIVE_BADUGI || import.meta.env.VITE_BADUGI_ALPHA === 'true';

/* ── Main game UI ────────────────────────────────────────────────────────── */
function BonecrusherGameUI() {
  const tableId = useTableId();
  const [, navigate] = useLocation();

  useEffect(() => { trackModePlay(MODE_ID); saveRecentTable(tableId); }, [tableId]);

  const { state, handleAction, myId, role, sessionStats, lastWsAt, lastWsType, isClubTable, kickedByHost } =
    useServerMode(tableId, ENGINE_ID);

  void sessionStats; void lastWsType;

  const { profile: serverProfile, refetch: refetchProfile } = useServerProfile();
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();

  useEffect(() => { if (kickedByHost) navigate('/'); }, [kickedByHost, navigate]);

  usePhaseSounds(state.phase);
  useGameToasts(state, myId, 'Bonecrusher');

  const isSpectator = role === 'spectator';
  const [hasBoughtIn, setHasBoughtIn] = useState(false);
  const boughtInInitRef = useRef(false);
  useEffect(() => {
    if (boughtInInitRef.current) return;
    if (lastWsAt == null) return;
    boughtInInitRef.current = true;
    if (!isClubTable) setHasBoughtIn(true);
  }, [lastWsAt, isClubTable]);
  const isPrebuyIn       = isClubTable && !hasBoughtIn;
  const effectiveSpectator = isSpectator || isPrebuyIn;

  const me    = state.players.find(p => p.id === myId);
  const phase = state.phase;
  const isMyTurn = state.activePlayerId === myId || phase === 'WAITING' || phase === 'DECLARE';

  const isDiscardPhase = phase === 'DISCARD_2' || phase === 'SELECT_5';
  const isFlipPhase    = phase === 'REVEAL_1' || phase.startsWith('FLIP_');

  /* ── Action locking (prevents double-fires, same as KamikazeGame) ──────── */
  const [actionLocked, setActionLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleControlAction = useCallback((action: string, amount?: number | unknown) => {
    handleAction(action, amount);
    const PASSIVE = ['restart', 'rebuy', 'chat', 'reaction', 'ante'];
    if (!PASSIVE.includes(action)) {
      setActionLocked(true);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => setActionLocked(false), 280);
    }
  }, [handleAction]);

  /* ── Card selection ──────────────────────────────────────────────────────── */
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [flippedByHero, setFlippedByHero] = useState<Set<number>>(new Set());

  useEffect(() => {
    setSelectedCards(new Set());
    if (phase === 'DISCARD_2' || phase === 'REVEAL_1' || phase === 'FLIP_1') {
      setFlippedByHero(new Set());
    }
  }, [phase]);

  const [showdownDismissed, setShowdownDismissed] = useState(false);
  useEffect(() => { if (phase !== 'SHOWDOWN') setShowdownDismissed(false); }, [phase]);

  const handleCardClick = useCallback((idx: number) => {
    if (effectiveSpectator || !isMyTurn) return;
    if (isDiscardPhase) {
      setSelectedCards(prev => {
        const next = new Set(prev);
        if (next.has(idx)) { next.delete(idx); return next; }
        if (next.size < 2) { next.add(idx); return next; }
        return prev;
      });
    } else if (isFlipPhase) {
      if (flippedByHero.has(idx)) return;
      setSelectedCards(new Set([idx]));
    }
  }, [effectiveSpectator, isMyTurn, isDiscardPhase, isFlipPhase, flippedByHero]);

  const handleDiscard = useCallback(() => {
    if (selectedCards.size !== 2) return;
    const indices = Array.from(selectedCards);
    handleControlAction('discard', indices);
    setSelectedCards(new Set());
  }, [selectedCards, handleControlAction]);

  const handleFlip = useCallback(() => {
    if (selectedCards.size !== 1) return;
    const [idx] = Array.from(selectedCards);
    handleControlAction('flip', idx);
    setFlippedByHero(prev => new Set([...prev, idx]));
    setSelectedCards(new Set());
  }, [selectedCards, handleControlAction]);

  const handleDeclare = useCallback((d: 'HIGH' | 'LOW' | 'SWING') => {
    handleControlAction('declare', d);
  }, [handleControlAction]);

  /* ── Bust out logic ──────────────────────────────────────────────────────── */
  const [bustDismissed, setBustDismissed] = useState(false);
  const heroBust        = !!me && me.chips <= 0 && !effectiveSpectator && me.status !== 'active';
  const bustEligiblePhase = me?.status === 'sitting_out' || phase === 'WAITING' || phase === 'SHOWDOWN';
  const showBustModal   = heroBust && bustEligiblePhase && !bustDismissed;
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

  const lifetimeBusts      = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
  const sessionBusts       = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
  const hasNeverPurchased  = !localStorage.getItem('cgp_first_purchase_complete');
  const openSeatsCount     = state.players.filter(p => p.presence === 'reserved').length;
  const humanCount         = state.players.filter(p => p.presence === 'human').length;
  const activeCount        = state.players.filter(p => p.presence === 'bot' || p.presence === 'human').length;

  const handleBorrowChips = async () => {
    const pid = serverProfile?.profileId;
    if (!pid) return;
    try {
      const res  = await fetch(`/api/players/${pid}/chip-loan`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) { handleAction('rebuy', 1000); setBustDismissed(true); refetchProfile(); }
    } catch { /* silent */ }
  };

  /* ── Chat ────────────────────────────────────────────────────────────────── */
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const prevChatLenRef = useRef(state.chatMessages.length);
  useEffect(() => {
    const newLen = state.chatMessages.length;
    if (newLen > prevChatLenRef.current && !chatOpen) setChatUnread(prev => prev + newLen - prevChatLenRef.current);
    prevChatLenRef.current = newLen;
  }, [state.chatMessages.length, chatOpen]);
  useEffect(() => { if (chatOpen) setChatUnread(0); }, [chatOpen]);

  void isRewardAvailable;
  const modeIntro = (MODE_INTROS as Record<string, (typeof MODE_INTROS)[keyof typeof MODE_INTROS]>)[MODE_ID];
  const handleBack = useCallback(() => { if (me) saveChips(MODE_ID, me.chips); navigate('/'); }, [me, navigate]);

  const showShowdown = phase === 'SHOWDOWN' && !showdownDismissed;

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#0a0702',
      backgroundImage: "url('/backgrounds/bonecrusher-bg.jpg')",
      backgroundSize: 'cover', backgroundPosition: 'center top', overflow: 'hidden',
    }} data-mode={MODE_ID}>

      {modeIntro && <ModeIntro modeId={MODE_ID} {...modeIntro} />}

      {showShowdown && (
        <BonecrusherShowdown
          state={state}
          myId={myId}
          onContinue={() => setShowdownDismissed(true)}
        />
      )}

      <BonecrusherHeader
        onBack={handleBack}
        onOpenChat={() => setChatOpen(true)}
        chatUnread={chatUnread}
        humanCount={humanCount}
      />

      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px' }}>
        <BonecrusherTable
          state={state}
          myId={myId}
          selectedCards={selectedCards}
          onCardClick={handleCardClick}
          phase={phase}
          flippedByHero={flippedByHero}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 90, overflowY: 'auto', marginTop: 8 }}>
          {(state.messages ?? []).slice(-4).map(m => (
            <div key={m.id} style={{
              color: m.isResolution ? '#fbbf24' : 'rgba(255,255,255,0.5)',
              fontSize: 11, letterSpacing: '0.05em', textAlign: 'center',
            }}>
              {m.text}
            </div>
          ))}
        </div>

        {!isMyTurn && (phase as string) !== 'WAITING' && (phase as string) !== 'SHOWDOWN' && state.activePlayerId && (
          <div style={{ textAlign: 'center', color: '#d97706', fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            {state.players.find(p => p.id === state.activePlayerId)?.name ?? 'Opponent'}'s turn…
          </div>
        )}
      </main>

      {!effectiveSpectator && !showShowdown && (
        <div style={{
          flexShrink: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          borderTop: '1px solid rgba(217,119,6,0.2)',
        }}>
          <BonecrusherActionBar
            phase={phase}
            isMyTurn={isMyTurn}
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
            selectedCards={selectedCards}
            flipCount={flippedByHero.size}
            declaration={me?.declaration ?? null}
            myHasActed={me?.hasActed ?? false}
            onDiscard={handleDiscard}
            onFlip={handleFlip}
            onDeclare={handleDeclare}
            onAction={handleControlAction}
            onRebuy={() => handleControlAction('rebuy', 1000)}
          />
        </div>
      )}

      {isPrebuyIn && (
        <div style={{ flexShrink: 0, padding: '8px 12px 12px' }}>
          <button
            onClick={() => { setHasBoughtIn(true); handleAction('sit_down'); }}
            data-testid="button-buyin"
            style={{
              width: '100%', padding: '14px 0', borderRadius: 14, fontFamily: 'monospace',
              fontWeight: 700, fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase',
              background: 'linear-gradient(135deg, #b45309, #d97706)', color: '#000',
              border: 'none', cursor: 'pointer', boxShadow: '0 0 20px rgba(217,119,6,0.4)',
            }}
          >
            BUY IN — {(me?.chips ?? 10000).toLocaleString()} chips
          </button>
        </div>
      )}

      {xpToast && xpToast.xpGained > 0 && (
        <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp} newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />
      )}

      {!effectiveSpectator && (
        <ChatEmoteRow onReact={emoji => handleAction('reaction', emoji)} incomingReactions={state.liveReactions} onOpenChat={() => setChatOpen(true)} chatUnread={chatUnread} />
      )}

      <ChatBox
        messages={state.chatMessages}
        myId={myId}
        onSendMessage={text => handleAction('chat', text)}
        open={chatOpen}
        onOpenChange={setChatOpen}
        seatToPlayerId={Object.fromEntries(state.players.filter(p => p.identityId).map(p => [p.id, p.identityId!]))}
        myProfileId={serverProfile?.profileId}
      />

      <BustOutModal
        open={showBustModal}
        lifetimeBusts={lifetimeBusts}
        sessionBusts={sessionBusts}
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

export default function BonecrusherGame() {
  if (!serverEnabled) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0702' }}>
        <p style={{ color: '#d97706', fontFamily: 'monospace', fontSize: 16, fontWeight: 700, letterSpacing: '0.1em' }}>BONECRUSHER</p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 13, marginTop: 8 }}>Server mode required. Set VITE_BADUGI_ALPHA=true</p>
      </div>
    );
  }
  return <BonecrusherGameUI />;
}
