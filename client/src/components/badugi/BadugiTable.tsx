/**
 * BadugiTable — universal responsive mobile layout (Detroit 2026-10-14).
 *
 * Five-zone flexible system:
 *   ZONE A — Header (title, game mode, info bar)
 *   ZONE B — Opponents (responsive row, discard indicators)
 *   ZONE C — Game Center (pot, flex-1)
 *   ZONE D — Hero (name/chips on top, responsive cards below)
 *
 * No fixed pixel positions. Cards size from viewport width at runtime.
 * 4 players max (hero + 3 opponents).
 */
import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { GameState } from '@/lib/poker/types';
import type { Player } from '@shared/gameTypes';
import { CardHand } from '@/components/flushedUp/CardHand';
import type { CardAnimState } from '@/components/flushedUp/useCardAnimations';
import { evaluateBadugi } from '@shared/modes/badugi';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { UniversalTableHeader } from '@/components/game/UniversalTableHeader';
import { BadugiTableEffects } from './BadugiTableEffects';
import { PotStack } from '@/components/game/PotStack';
import { WinCelebration } from '@/components/game/WinCelebration';
import { useViewport, useCardSize } from '@/hooks/useViewport';
import { sfx } from '@/lib/sounds';

function phaseLabel(phase: string): string {
  if (phase.startsWith('DRAW_')) return `DRAW ${phase.split('_')[1]} / 3`;
  if (phase.startsWith('BET_')) return 'BETTING';
  if (phase === 'SHOWDOWN') return 'SHOWDOWN';
  if (phase === 'ANTE') return 'ANTES';
  if (phase === 'WAITING') return 'WAITING';
  return phase.replace(/_/g, ' ');
}

/**
 * Opponent seat — responsive, no absolute positioning.
 * Shows avatar, name, chips, discard indicator, and card backs.
 */
function OpponentSeat({ player, seatNum, isActive, isDrawPhase, isDealer, compact }: {
  player: Player; seatNum: number; isActive: boolean; isDrawPhase: boolean; isDealer: boolean; compact: boolean;
}) {
  const isFolded = player.status === 'folded';
  // Discard indicator — accessible, not color-only (Detroit 2026-10-14 spec)
  const badge = !isDrawPhase || isFolded ? null
    : player.lastDrawCount === undefined ? 'WAITING'
    : player.lastDrawCount === 0 ? 'STAND PAT'
    : `DISCARDED ${player.lastDrawCount}`;
  const cardCount = 4;
  const darkened = isDrawPhase && player.lastDrawCount !== undefined ? player.lastDrawCount : 0;
  const avatarSize = compact ? 'w-10 h-10' : 'w-12 h-12';

  return (
    <div
      className="flex flex-col items-center flex-1 min-w-0"
      style={{ opacity: isFolded ? 0.45 : 1 }}
      data-player-seat={player.id} data-deal-seat={player.id}
    >
      <div className="relative">
        {isActive && (
          <motion.div
            className="absolute -inset-1.5 rounded-xl pointer-events-none"
            style={{ border: '2px solid rgba(240,184,41,0.6)' }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        {isDealer && (
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-400 text-black text-[10px] font-bold flex items-center justify-center shadow-lg z-10">D</div>
        )}
        <div className={`${avatarSize} rounded-full overflow-hidden border-2 border-amber-400/40 shadow-lg`}>
          <img src={getAvatarForSeat(seatNum + 1)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} className="w-full h-full object-cover" />
        </div>
      </div>
      <div className="text-white text-xs font-bold mt-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{player.name}</div>
      <div className="text-amber-200/80 text-[10px] font-mono">{player.chips.toLocaleString()}</div>
      {badge && (
        <div className={`text-[9px] font-mono px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap ${badge === 'WAITING' ? 'bg-white/10 text-white/50' : 'bg-amber-400/20 text-amber-200 border border-amber-400/40'}`}>
          {badge}
        </div>
      )}
      <div className="flex gap-0.5 mt-1" aria-hidden="true">
        {Array.from({ length: cardCount }).map((_, i) => (
          <div
            key={i}
            className="w-4 h-6 rounded-sm border border-white/20"
            style={{
              background: i >= cardCount - darkened ? 'rgba(0,0,0,0.6)' : 'linear-gradient(135deg, #2a1a4a 0%, #1a0f2e 100%)',
              transform: `rotate(${(i - 1.5) * 4}deg)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export interface BadugiTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  animState: CardAnimState;
}

export function BadugiTable({ state, myId, selectedCardIndices, onCardClick, isDrawPhase, animState }: BadugiTableProps) {
  const viewport = useViewport();
  const me = state.players.find(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';
  const [tableRoot, setTableRoot] = useState<HTMLElement | null>(null);

  // Auto-fullscreen on first tap (Detroit 2026-10-13) — browsers require a user gesture
  useEffect(() => {
    const goFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      window.removeEventListener('pointerdown', goFullscreen);
    };
    window.addEventListener('pointerdown', goFullscreen);
    return () => window.removeEventListener('pointerdown', goFullscreen);
  }, []);

  const heroHandEval = me && me.cards.length > 0 && !me.cards.some(card => card.isHidden)
    ? evaluateBadugi(me.cards.map(c => ({ ...c, isHidden: false })) as Parameters<typeof evaluateBadugi>[0])
    : null;
  const heroIsLoser = isShowdown && !(me as any)?.isWinner && me?.status !== 'folded';

  const myIndex = state.players.findIndex(p => p.id === myId);
  // Order: hero first (seat 0), then opponents clockwise
  const orderedPlayers = myIndex >= 0
    ? [state.players[myIndex], ...state.players.slice(myIndex + 1), ...state.players.slice(0, myIndex)]
    : state.players;
  const opponents = orderedPlayers.slice(1, 4); // max 3 opponents (4 players total)

  const activeCount = state.players.filter(p => p.status === 'active').length;
  const potSpring = useSpring(state.pot, { stiffness: 80, damping: 20 });
  const potDisplay = useTransform(potSpring, v => Math.round(v).toLocaleString());
  useEffect(() => { potSpring.set(state.pot); }, [state.pot, potSpring]);

  const heroFilter = heroIsLoser ? 'brightness(0.6) saturate(0.5)' : 'none';
  const isHeroDealer = !!(me as any)?.isDealer;

  // Responsive hero card sizing — ego style, large and dominant (Detroit 2026-10-15)
  // Prototype uses absolute positions so no flexbox overlap — cards can be big again
  const heroCardAreaWidth = viewport.usableWidth * 0.92;
  const { width: heroCardW, height: heroCardH } = useCardSize(heroCardAreaWidth, 4, 110, 0.22);

  // Win celebration — show for any winner at showdown (Detroit 2026-10-13)
  const showdownWinner = isShowdown ? state.players.find(p => (p as any).isWinner) : undefined;
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [celebratingWinnerId, setCelebratingWinnerId] = useState<string | null>(null);
  useEffect(() => {
    if (showdownWinner && celebratingWinnerId !== showdownWinner.id) {
      setCelebratingWinnerId(showdownWinner.id);
      setCelebrationKey(k => k + 1);
      sfx.bigWin(); // Prototype sound (Detroit 2026-10-15)
    } else if (!isShowdown && celebratingWinnerId) {
      setCelebratingWinnerId(null);
    }
  }, [isShowdown, showdownWinner, celebratingWinnerId]);

  // Prototype seat positions (Detroit 2026-10-15) — UNO-style absolute layout
  // Hero at bottom, opponents spread around top, pot center
  // Adjusted 2026-10-15: moved opponents down to clear the header (was overlapping title)
  const seatPos = (index: number): { x: number; y: number } => {
    if (index === 0) return { x: 50, y: 84 }; // hero
    const spots = [
      { x: 16, y: 32 },
      { x: 50, y: 22 },
      { x: 84, y: 32 },
    ];
    return spots[(index - 1) % spots.length];
  };

  return (
    <div ref={setTableRoot as any} className="w-full h-full relative">
      {/* Header — compact */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <UniversalTableHeader mode="badugi" title="BADUGI" subtitle="4-CARD DRAW" hideHelp />
        <div className="flex justify-center items-center gap-3 px-4 py-1 text-[10px] font-mono text-white/60">
          <span><b className="text-amber-300/80">PLAYERS</b> {activeCount}/{Math.min(state.players.length, 4)}</span>
          <span><b className="text-amber-300/80">DRAW</b> {state.phase.startsWith('DRAW_') ? `${state.phase.split('_')[1]}/3` : '–'}</span>
          <span><b className="text-amber-300/80">PHASE</b> {phaseLabel(state.phase)}</span>
        </div>
      </div>

      {/* Table — prototype absolute positions (UNO-style) */}
      <div className="absolute inset-0" style={{ perspective: '1200px' }}>
        {/* Dealer anchor — top center */}
        <div data-dealer-anchor aria-hidden="true" className="absolute" style={{ left: '50%', top: '4%' }} />
        {/* Muck anchor */}
        <div data-muck-anchor aria-hidden="true" className="absolute" style={{ left: '63%', top: '44%' }} />

        {/* Pot — center (50%, 52%) */}
        <div className="absolute" style={{ left: '50%', top: '52%', transform: 'translate(-50%, -50%)' }}>
          <motion.div
            className="rounded-2xl px-6 py-3 text-center"
            style={{
              background: 'rgba(240,184,41,0.08)',
              border: '1px solid rgba(240,184,41,0.25)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 24px rgba(240,184,41,0.15)',
            }}
            data-pot-anchor
            key={`pot-${state.pot}`}
            initial={{ scale: 1.15 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.25 }}
          >
            <div className="text-amber-300/70 text-[10px] font-mono tracking-widest">POT</div>
            <PotStack amount={state.pot} />
            <motion.div className="text-amber-200 text-2xl font-bold font-mono mt-1">{potDisplay}</motion.div>
          </motion.div>
        </div>

        {/* Opponents — spread around top */}
        {opponents.map((opp, i) => {
          const pos = seatPos(i + 1);
          return (
            <div
              key={opp.id}
              className="absolute"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
              data-player-seat={opp.id}
            >
              <OpponentSeat
                player={opp}
                seatNum={i + 1}
                isActive={opp.id === state.activePlayerId}
                isDrawPhase={isDrawPhase}
                isDealer={!!(opp as any).isDealer}
                compact={viewport.isNarrow}
              />
            </div>
          );
        })}

        {/* Hero — bottom center (50%, 86%), ego style with large cards */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: '50%', top: '86%', transform: 'translate(-50%, -50%)', width: '92%' }}
          data-player-seat={myId} data-deal-seat={myId}
        >
          {isHeroDealer && (
            <div className="w-6 h-6 rounded-full bg-amber-400 text-black text-xs font-bold flex items-center justify-center shadow-lg mb-1">D</div>
          )}
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-full overflow-hidden border-2 border-amber-400/60 shadow-lg">
              <img src={getAvatarForSeat(myIndex + 1)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} className="w-full h-full object-cover" />
            </span>
            <div className="text-left">
              <div className="text-white text-sm font-bold leading-tight">{me?.name ?? 'YOU'}</div>
              <div className="text-amber-200/80 text-[11px] font-mono leading-tight">{(me?.chips ?? 0).toLocaleString()}</div>
            </div>
          </div>
          {me && me.cards.length > 0 && me.status !== 'folded' ? (
            <>
              <div style={{ filter: heroFilter, width: '100%', maxWidth: `${heroCardAreaWidth}px` }}>
                <CardHand
                  cards={me.cards}
                  celebrationCardMarkers
                  selectedIndices={selectedCardIndices}
                  onCardClick={onCardClick}
                  isSelectable={isDrawPhase}
                  dealingIndices={animState.dealingIndices}
                  drawingIndices={animState.drawingIndices}
                  discardingIndices={animState.discardingIndices}
                  isShowdown={isShowdown}
                  cardWidth={Math.round(heroCardW)}
                  cardHeight={Math.round(heroCardH)}
                  testIdPrefix="badugi-card"
                />
              </div>
              <div className="text-white/60 text-[10px] font-mono mt-1 text-center min-h-[14px]">
                {isDrawPhase ? `Tap cards to discard${selectedCardIndices.length ? ` · ${selectedCardIndices.length} selected` : ''}`
                  : heroHandEval ? heroHandEval.description : ''}
              </div>
            </>
          ) : me?.status === 'folded' ? (
            <div className="text-white/40 text-sm font-mono py-4">FOLDED</div>
          ) : (
            <div className="text-white/40 text-[10px] font-mono py-4">DEALT IN NEXT HAND</div>
          )}
        </div>
      </div>

      <BadugiTableEffects state={state} tableRoot={tableRoot} myId={myId} />

      {/* Win celebration — any winner at showdown */}
      {celebratingWinnerId && showdownWinner && (
        <WinCelebration
          key={celebrationKey}
          winnerName={showdownWinner.name}
          onDone={() => setCelebratingWinnerId(null)}
        />
      )}
    </div>
  );
}
