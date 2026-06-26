/**
 * Dead7FullPage — complete Dead 7 game page.
 * Accepts the same props as UnifiedGameUI so it drops in from
 * GenericServerGame without changing the hook call-sites.
 *
 * Layout: dead7board.png full-screen → GameStatusBar → Dead7Table → Dead7ActionBar → modals.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { Dead7Table } from './Dead7Table';
import { Dead7ActionBar } from './Dead7ActionBar';
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
import { saveChips } from '@/lib/persistence';
import { evaluateDead7 } from '@shared/modes/dead7';
import type { GameState } from '@/lib/poker/types';
import type { GameSessionStats } from '@/components/game/GameHeader';
import type { TableSettings } from '@/components/HostControls';

const MODE_ID = 'dead7';

export interface Dead7FullPageProps {
  state: GameState;
  handleAction: (action: string, payload?: unknown) => void;
  myId: string;
  modeId: string;
  tableId?: string;
  role?: 'player' | 'spectator';
  sessionStats?: GameSessionStats;
  lastWsAt?: number | null;
  isClubTable?: boolean;
  kickedByHost?: boolean;
  tableSettings?: TableSettings;
  sendHostAction?: (type: 'host:kick' | 'host:settings', payload: Record<string, unknown>) => void;
  hostId?: string | null;
  lastWsType?: string | null;
}

function getDrawLimit(phase: string): number {
  if (phase === 'DRAW_1') return 3;
  if (phase === 'DRAW_2') return 2;
  if (phase === 'DRAW_3') return 1;
  return 0;
}

export function Dead7FullPage({
  state, handleAction, myId, modeId, tableId, role,
  sessionStats, lastWsAt, isClubTable = false, kickedByHost,
}: Dead7FullPageProps) {
  void modeId;
  const [, navigate]   = useLocation();
  const { profile: serverProfile, refetch: refetchProfile } = useServerProfile();
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();

  usePhaseSounds(state.phase);
  useGameToasts(state, myId, 'Dead 7');

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
  const drawLimit    = getDrawLimit(state.phase);

  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  useEffect(() => { setSelectedCardIndices([]); }, [state.phase]);

  const handleCardClick = useCallback((index: number) => {
    if (effectiveSpectator || !isDrawPhase) return;
    setSelectedCardIndices(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length < drawLimit) return [...prev, index];
      return prev;
    });
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
    const pid = serverProfile?.profileId;
    if (!pid) return;
    try {
      const res  = await fetch(`/api/players/${pid}/chip-loan`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) { handleAction('rebuy', 1000); setBustDismissed(true); refetchProfile(); }
    } catch { /* silent */ }
  };

  /* ShowdownReveal data */
  const showReveal   = state.phase === 'SHOWDOWN';
  const revealWinners: WinnerData[] = showReveal
    ? state.players
        .filter(p => (p as any).isWinner)
        .map(p => ({
          id: p.id, name: p.name,
          cards: (p.cards ?? []).map(c => ({ ...c, isHidden: false })),
          handRankLabel: (() => { try { return evaluateDead7((p.cards ?? []).map(c => ({ ...c, isHidden: false })) as Parameters<typeof evaluateDead7>[0])?.description ?? ''; } catch { return ''; } })(),
          potShare: 0,
        }))
    : [];

  const revealHeroData: HeroRevealData = showReveal && me
    ? {
        id: me.id,
        cards: (me.cards ?? []).map(c => ({ ...c, isHidden: false })),
        handRankLabel: (() => { try { return evaluateDead7((me.cards ?? []).map(c => ({ ...c, isHidden: false })) as Parameters<typeof evaluateDead7>[0])?.description ?? ''; } catch { return ''; } })(),
      }
    : { id: myId, cards: [], handRankLabel: '' };

  const heroWonReveal   = revealWinners.some(w => w.id === myId);
  const potMatch        = state.messages.find(m => (m as any).isResolution)?.text?.match(/\$(\d+)/);
  const revealPotAmount = potMatch ? parseInt(potMatch[1], 10) : Math.abs(state.heroChipChange ?? 0);

  const modeIntro = (MODE_INTROS as Record<string, (typeof MODE_INTROS)[keyof typeof MODE_INTROS]>)[MODE_ID];

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      backgroundColor: '#050a05',
      backgroundImage: "url('/assets/backgrounds/dead7board.png')",
      backgroundSize: 'cover', backgroundPosition: 'center center',
    }} data-mode={MODE_ID}>
      {modeIntro && <ModeIntro modeId={MODE_ID} {...modeIntro} />}

      <GameStatusBar
        modeId={MODE_ID} gameState={state} chips={me?.chips ?? 0}
        stripes={serverProfile?.stripes ?? 0} phase={state.phase}
        onForfeit={() => { if (me) saveChips(MODE_ID, me.chips); }}
        sessionStats={effectiveSpectator ? undefined : sessionStats}
        tableId={tableId} humanCount={humanCount}
        onOpenChat={!effectiveSpectator ? () => setChatOpen(true) : undefined}
        chatUnread={chatUnread}
      />

      {isSpectator && <SpectatorBanner spectatorCount={state.spectatorCount} />}
      {!effectiveSpectator && state.spectatorCount != null && state.spectatorCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SpectatorWatchingBadge count={state.spectatorCount} />
        </div>
      )}

      <main style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 52 }}>
        <Dead7Table
          state={state} myId={effectiveSpectator ? 'p1' : myId}
          selectedCardIndices={effectiveSpectator ? [] : selectedCardIndices}
          onCardClick={handleCardClick}
          isDrawPhase={!effectiveSpectator && isDrawPhase}
          animState={{ dealingIndices, drawingIndices, discardingIndices }}
        />
      </main>

      {!effectiveSpectator && state.phase !== 'SHOWDOWN' && (
        <div style={{
          flexShrink: 0,
          background: 'rgba(5,5,0,0.85)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          borderTop: '1px solid rgba(185,28,28,0.18)',
        }}>
          <Dead7ActionBar
            phase={state.phase} isDrawPhase={!effectiveSpectator && isDrawPhase}
            selectedCount={selectedCardIndices.length} drawLimit={drawLimit}
            isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
            chips={me?.chips ?? 0} currentBet={state.currentBet} myBet={me?.bet ?? 0}
            pot={state.pot} ante={25} humanCount={humanCount}
            openSeatsCount={isClubTable ? 0 : openSeatsCount}
            activeCount={activeCount} isClubTable={isClubTable}
            locked={actionLocked}
            onStandPat={handleStandPat} onDraw={handleDraw}
            onAction={handleControlAction}
            onRebuy={() => handleControlAction('rebuy', 1000)}
          />
        </div>
      )}

      {isPrebuyIn && (
        <div style={{ flexShrink: 0, padding: '8px 12px 12px' }}>
          <button onClick={() => { setHasBoughtIn(true); handleAction('sit_down'); }}
            data-testid="button-crew-buyin"
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.18em', textTransform: 'uppercase', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #7a1010, #dc2626)', color: '#fff',
              boxShadow: '0 0 20px rgba(185,28,28,0.4)' }}>
            BUY IN — {(me?.chips ?? 10000).toLocaleString()} chips
          </button>
        </div>
      )}

      {!effectiveSpectator && (
        <ChatEmoteRow onReact={emoji => handleAction('reaction', emoji)} incomingReactions={state.liveReactions}
          onOpenChat={() => setChatOpen(true)} chatUnread={chatUnread} />
      )}

      {showReveal && (
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

      <BustOutModal open={showBustModal} lifetimeBusts={lifetimeBusts} sessionBusts={sessionBusts}
        hasNeverPurchased={hasNeverPurchased}
        onRebuy={amount => { handleAction('rebuy', amount); setBustDismissed(true); }}
        onSpectate={() => setBustDismissed(true)}
        onLeaveTable={() => { if (me) saveChips(MODE_ID, me.chips); navigate('/'); }}
        onClaimDailyBonus={() => { setBustDismissed(true); navigate('/'); }}
        onWatchAd={undefined}
        onStarterPack={() => { handleAction('rebuy', 1000); setBustDismissed(true); }}
        onBorrowChips={handleBorrowChips} />
    </div>
  );
}

