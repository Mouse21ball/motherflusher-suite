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
import { BoxChevyTable } from '@/components/boxChevy/BoxChevyTable';
import { BoxChevyActionBar } from '@/components/boxChevy/BoxChevyActionBar';
import { BoxChevyShowdown } from '@/components/boxChevy/BoxChevyShowdown';
import { CardHand } from '@/components/flushedUp/CardHand';

const MODE_ID   = 'box_chevy';
const ENGINE_ID = 'box_chevy';

const ACT = '#60a5fa';
const blA = (a: number) => `rgba(59,130,246,${a})`;

function useTableId() {
  const [tableId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('t')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(fromUrl)) return fromUrl;
    const newCode = generateTableCode();
    window.history.replaceState(null, '', `/box-chevy?t=${newCode}`);
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

function BoxChevyHeader({ onBack, onOpenChat, chatUnread, humanCount }: HeaderProps) {
  return (
    <div style={{
      flexShrink: 0, height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px',
      background: 'rgba(0,0,0,0.80)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${blA(0.25)}`,
    }}>
      <button onClick={onBack} data-testid="button-back" style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: blA(0.12), border: `1px solid ${blA(0.35)}`,
        borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.8)',
        fontSize: 11, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.1em',
        cursor: 'pointer',
      }}>
        ← BACK
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: ACT,
          letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          background: blA(0.12), padding: '1px 7px', borderRadius: 4,
        }}>
          CHAIN GANG POKER
          {humanCount > 1 && (
            <span style={{ marginLeft: 5, color: '#93c5fd' }}>{humanCount}P</span>
          )}
        </div>
        <div style={{
          fontSize: 17, fontFamily: 'monospace', fontWeight: 900, color: '#dbeafe',
          letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1,
        }}>
          BOX CHEVY
        </div>
        <div style={{
          fontSize: 11, fontFamily: 'monospace', fontWeight: 500, color: ACT,
          letterSpacing: '0.03em', whiteSpace: 'nowrap',
        }}>
          10 CARDS · HIGH / LOW / SWING
        </div>
      </div>

      <button onClick={onOpenChat} data-testid="button-chat" style={{
        position: 'relative',
        background: blA(0.1), border: `1px solid ${blA(0.3)}`,
        borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.8)',
        fontSize: 18, cursor: 'pointer',
      }}>
        💬
        {chatUnread > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            background: ACT, color: '#000', borderRadius: '50%',
            width: 18, height: 18, fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{chatUnread}</div>
        )}
      </button>
    </div>
  );
}

/* ── Server-mode gate ────────────────────────────────────────────────────── */
const serverEnabled = FEATURES.SERVER_AUTHORITATIVE_BADUGI || import.meta.env.VITE_BADUGI_ALPHA === 'true';

/* ── Main game UI ────────────────────────────────────────────────────────── */
function BoxChevyGameUI() {
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
  useGameToasts(state, myId, 'Box Chevy');

  const isSpectator = role === 'spectator';
  const [hasBoughtIn, setHasBoughtIn] = useState(false);
  const boughtInInitRef = useRef(false);
  useEffect(() => {
    if (boughtInInitRef.current) return;
    if (lastWsAt == null) return;
    boughtInInitRef.current = true;
    if (!isClubTable) setHasBoughtIn(true);
  }, [lastWsAt, isClubTable]);
  const isPrebuyIn         = isClubTable && !hasBoughtIn;
  const effectiveSpectator = isSpectator || isPrebuyIn;

  const me    = state.players.find(p => p.id === myId);
  const phase = state.phase;

  const isDrawPhase = phase === 'DRAW_1' || phase === 'DRAW_2' || phase === 'DRAW_3';
  const isMyTurn    = state.activePlayerId === myId || phase === 'WAITING' || phase === 'DECLARE';

  /* ── Action locking ──────────────────────────────────────────────────────── */
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

  /* ── Card selection for draw phases ─────────────────────────────────────── */
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const maxSelect = isDrawPhase
    ? (phase === 'DRAW_1' ? 3 : phase === 'DRAW_2' ? 2 : 1)
    : 0;

  useEffect(() => { setSelectedCards(new Set()); }, [phase]);

  const [showdownDismissed, setShowdownDismissed] = useState(false);
  useEffect(() => { if (phase !== 'SHOWDOWN') setShowdownDismissed(false); }, [phase]);

  const handleCardClick = useCallback((idx: number) => {
    if (effectiveSpectator || !isMyTurn || !isDrawPhase) return;
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); return next; }
      if (next.size < maxSelect) { next.add(idx); return next; }
      return prev;
    });
  }, [effectiveSpectator, isMyTurn, isDrawPhase, maxSelect]);

  /* ── Action handlers ─────────────────────────────────────────────────────── */
  const handleFold  = useCallback(() => handleControlAction('fold'),  [handleControlAction]);
  const handleCheck = useCallback(() => handleControlAction('check'), [handleControlAction]);
  const handleCall  = useCallback(() => handleControlAction('call'),  [handleControlAction]);


  const handleRaise = useCallback((amt: number) => {
    handleControlAction('raise', amt);
  }, [handleControlAction]);

  const handleDraw = useCallback(() => {
    const indices = Array.from(selectedCards).sort((a, b) => a - b);
    handleControlAction('draw', indices);
    setSelectedCards(new Set());
  }, [selectedCards, handleControlAction]);

  const handleStandPat = useCallback(() => {
    handleControlAction('draw', []);
    setSelectedCards(new Set());
  }, [handleControlAction]);

  const handleDeclare = useCallback((d: 'HIGH' | 'LOW' | 'SWING') => {
    handleControlAction('declare', d);
  }, [handleControlAction]);

  const handleAnte = useCallback(() => {
    handleControlAction('ante');
  }, [handleControlAction]);

  const handleDeal = useCallback(() => {
    handleControlAction('start');
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

  const lifetimeBusts     = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
  const sessionBusts      = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
  const hasNeverPurchased = !localStorage.getItem('cgp_first_purchase_complete');
  const openSeatsCount    = state.players.filter(p => p.presence === 'reserved').length;
  const humanCount        = state.players.filter(p => p.presence === 'human').length;

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

  const modeIntro = (MODE_INTROS as Record<string, (typeof MODE_INTROS)[keyof typeof MODE_INTROS]>)[MODE_ID];
  const handleBack = useCallback(() => { if (me) saveChips(MODE_ID, me.chips); navigate('/'); }, [me, navigate]);

  const showShowdown = phase === 'SHOWDOWN' && !showdownDismissed;

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#0a1628',
      backgroundImage: "url('/backgrounds/box-chevy-bg.jpg')",
      backgroundSize: 'cover', backgroundPosition: 'center top', overflow: 'hidden',
    }} data-mode={MODE_ID}>

      {modeIntro && <ModeIntro modeId={MODE_ID} {...modeIntro} />}

      {showShowdown && (
        <BoxChevyShowdown
          state={state}
          myId={myId}
          onContinue={() => setShowdownDismissed(true)}
        />
      )}

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

      {xpToast && xpToast.xpGained > 0 && (
        <XPToast key={xpToast.id} xpGained={xpToast.xpGained} leveledUp={xpToast.leveledUp} newLevel={xpToast.newLevel} newAchievementName={xpToast.achievementName} onDone={dismissXP} />
      )}

      <BoxChevyHeader
        onBack={handleBack}
        onOpenChat={() => setChatOpen(true)}
        chatUnread={chatUnread}
        humanCount={humanCount}
      />

      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px' }}>
        <BoxChevyTable
          state={state}
          myId={myId}
          phase={phase}
          isDrawPhase={isDrawPhase}
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
          <div style={{ textAlign: 'center', color: ACT, fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            {state.players.find(p => p.id === state.activePlayerId)?.name ?? 'Opponent'}'s turn…
          </div>
        )}

        <ChatEmoteRow
          onReact={emoji => handleAction('reaction', emoji)}
          incomingReactions={state.liveReactions}
          onOpenChat={() => setChatOpen(true)}
          chatUnread={chatUnread}
        />
      </main>

      {/* Hero hand — pinned just above action bar, closer to controls */}
      {!effectiveSpectator && !showShowdown && (me?.cards?.length ?? 0) > 0 && (
        <div style={{
          flexShrink: 0,
          background: 'rgba(9,22,40,0.92)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          borderTop: `1px solid rgba(59,130,246,0.20)`,
          paddingTop: 6, paddingBottom: 2, paddingLeft: 12, paddingRight: 12,
        }}>
          <div style={{
            fontSize: 11, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.08em',
            color: 'rgba(148,163,184,0.7)', textAlign: 'center', marginBottom: 2,
            textTransform: 'uppercase',
          }}>
            YOUR HAND
            {isDrawPhase && isMyTurn && (
              <span style={{ color: ACT, marginLeft: 6 }}>— TAP TO DISCARD</span>
            )}
          </div>
          <CardHand
            cards={(me?.cards ?? []).map(c => ({ ...c, isHidden: false }))}
            selectedIndices={Array.from(selectedCards)}
            onCardClick={handleCardClick}
            isSelectable={isDrawPhase && isMyTurn && !effectiveSpectator}
            dealingIndices={[]}
            drawingIndices={[]}
            discardingIndices={[]}
            isShowdown={phase === 'SHOWDOWN'}
            cardWidth={52}
            cardHeight={73}
          />
        </div>
      )}

      {!effectiveSpectator && !showShowdown && (
        <BoxChevyActionBar
          phase={phase}
          isMyTurn={isMyTurn}
          pot={state.pot}
          currentBet={state.currentBet ?? 0}
          heroChips={me?.chips ?? 0}
          heroBet={me?.bet ?? 0}
          raisesThisRound={state.raisesThisRound ?? 0}
          selectedCards={selectedCards}
          maxSelect={maxSelect}
          communityCards={state.communityCards ?? []}
          heroCards={(me?.cards ?? []).map(c => ({ ...c, isHidden: false }))}
          humanCount={humanCount}
          declaration={me?.declaration ?? null}
          myHasActed={!!me?.declaration}
          onFold={handleFold}
          onCheck={handleCheck}
          onCall={handleCall}
          onRaise={handleRaise}
          onDraw={handleDraw}
          onStandPat={handleStandPat}
          onDeclare={handleDeclare}
          onAnte={handleAnte}
          onDeal={handleDeal}
          onRebuy={() => handleAction('rebuy', 1000)}
          actionLocked={actionLocked}
        />
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
    </div>
  );
}

/* ── Export ──────────────────────────────────────────────────────────────── */
export default function BoxChevyGame() {
  if (!serverEnabled) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a1628', color: ACT, fontFamily: 'monospace', fontSize: 13,
        flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 22 }}>◈</div>
        <div>Box Chevy requires server mode.</div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>Set BADUGI_ALPHA_ENABLED=true to enable.</div>
      </div>
    );
  }
  return <BoxChevyGameUI />;
}
