/**
 * BadugiTable — prototype layout (Detroit 2026-10-13).
 * Real game on the UNO prototype's table: absolute positioning,
 * hero at bottom, 3 opponents in top arc, pot center, dealer top.
 * 4 players (p1-p4). All game logic unchanged — presentation only.
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

const HERO_CARD_W = 100;
const HERO_CARD_H = 140;

// ── Prototype seat positions (percentages) ───────────────────────────────────
// Hero bottom center, 3 opponents in shallow top arc. Pot gets clear center.
// Adjusted down to clear the UniversalTableHeader (Detroit 2026-10-13).

function seatPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 50, y: 67 }; // hero — cards 512-682px, clear of pot and buttons
  const spots = [
    { x: 14, y: 43 },
    { x: 50, y: 36 },
    { x: 86, y: 43 },
  ];
  return spots[(index - 1) % spots.length];
}

const POT_POS = { x: 50, y: 50 };

function phaseLabel(phase: string): string {
  if (phase.startsWith('DRAW_')) return `DRAW ${phase.split('_')[1]} / 3`;
  if (phase.startsWith('BET_')) return 'BETTING';
  if (phase === 'SHOWDOWN') return 'SHOWDOWN';
  if (phase === 'ANTE') return 'ANTES';
  if (phase === 'WAITING') return 'WAITING';
  return phase.replace(/_/g, ' ');
}

function OpponentSeat({ player, seatNum, isActive, isDrawPhase, isDealer }: {
  player: Player; seatNum: number; isActive: boolean; isDrawPhase: boolean; isDealer: boolean;
}) {
  const pos = seatPosition(seatNum);
  const isFolded = player.status === 'folded';
  const badge = !isDrawPhase || isFolded ? null
    : player.lastDrawCount === undefined ? 'WAITING'
    : player.lastDrawCount === 0 ? 'STAND PAT'
    : `DREW ${player.lastDrawCount}`;
  const cardCount = 4;
  const darkened = isDrawPhase && player.lastDrawCount !== undefined ? player.lastDrawCount : 0;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: isFolded ? 0.45 : 1 }}
      data-player-seat={player.id} data-deal-seat={player.id}
    >
      {isActive && (
        <motion.div
          className="absolute -inset-2 rounded-xl pointer-events-none"
          style={{ border: '2px solid rgba(240,184,41,0.6)' }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
      {isDealer && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-amber-400 text-black text-xs font-bold flex items-center justify-center shadow-lg">D</div>
      )}
      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-amber-400/40 shadow-lg">
        <img src={getAvatarForSeat(seatNum + 1)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} className="w-full h-full object-cover" />
      </div>
      <div className="text-white text-xs font-bold mt-1 whitespace-nowrap">{player.name}</div>
      <div className="text-amber-200/80 text-[10px] font-mono">{player.chips.toLocaleString()}</div>
      {badge && (
        <div className={`text-[9px] font-mono px-2 py-0.5 rounded-full mt-0.5 ${badge === 'WAITING' ? 'bg-white/10 text-white/50' : 'bg-amber-400/20 text-amber-200 border border-amber-400/40'}`}>
          {badge}
        </div>
      )}
      <div className="flex gap-0.5 mt-1">
        {Array.from({ length: cardCount }).map((_, i) => (
          <div
            key={i}
            className="w-5 h-7 rounded-sm border border-white/20"
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
  const me = state.players.find(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';
  const [tableRoot, setTableRoot] = useState<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

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
  const heroPos = seatPosition(0);
  const isHeroDealer = !!(me as any)?.isDealer;

  // Win celebration — show for any winner at showdown (Detroit 2026-10-13)
  const showdownWinner = isShowdown ? state.players.find(p => (p as any).isWinner) : undefined;
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [celebratingWinnerId, setCelebratingWinnerId] = useState<string | null>(null);
  useEffect(() => {
    if (showdownWinner && celebratingWinnerId !== showdownWinner.id) {
      setCelebratingWinnerId(showdownWinner.id);
      setCelebrationKey(k => k + 1);
    } else if (!isShowdown && celebratingWinnerId) {
      setCelebratingWinnerId(null);
    }
  }, [isShowdown, showdownWinner, celebratingWinnerId]);

  return (
    <div className="relative w-full h-full min-h-[600px] overflow-hidden" ref={setTableRoot as any}>
      <UniversalTableHeader mode="badugi" title="BADUGI" subtitle="4-CARD DRAW" hideHelp />

      {/* Info bar — below header */}
      <div className="absolute top-[76px] left-0 right-0 flex justify-center items-center gap-4 text-[10px] font-mono text-white/60 z-10">
        <span><b className="text-amber-300/80">PLAYERS</b> {activeCount}/{state.players.length}</span>
        <span><b className="text-amber-300/80">DRAW</b> {state.phase.startsWith('DRAW_') ? `${state.phase.split('_')[1]}/3` : '–'}</span>
        <span><b className="text-amber-300/80">PHASE</b> {phaseLabel(state.phase)}</span>
        <button
          onClick={toggleFullscreen}
          className="ml-2 px-2 py-1 rounded bg-white/10 text-white/70 text-[10px] font-mono border border-white/20"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? '⤓' : '⤢'}
        </button>
      </div>

      {/* Invisible dealer anchor for deal flights (D badges on seats show dealer) */}
      <div data-dealer-anchor aria-hidden="true" className="absolute" style={{ left: '50%', top: '12%' }} />

      {/* Pot — center, prototype style */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
        style={{ left: `${POT_POS.x}%`, top: `${POT_POS.y}%` }}
        data-pot-anchor
      >        <motion.div
          className="rounded-2xl px-6 py-3 text-center"
          style={{
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(8px)',
            transform: 'rotateX(8deg)',
          }}
        >
          <div className="text-amber-300/70 text-[10px] font-mono tracking-widest">POT</div>
          <PotStack amount={state.pot} />
          <motion.div className="text-amber-200 text-2xl font-bold font-mono mt-1">{potDisplay}</motion.div>
        </motion.div>
      </div>

      {/* Muck anchor */}
      <div data-muck-anchor aria-hidden="true" className="absolute" style={{ left: '63%', top: '44%' }} />

      {/* Opponent seats — prototype top arc */}
      {opponents.map((opp, i) => (
        <OpponentSeat
          key={opp.id}
          player={opp}
          seatNum={i + 1}
          isActive={opp.id === state.activePlayerId}
          isDrawPhase={isDrawPhase}
          isDealer={!!(opp as any).isDealer}
        />
      ))}

      {/* Hero seat — bottom center, cards up top, name tucked under */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10"
        style={{ left: `${heroPos.x}%`, top: `${heroPos.y}%` }}
        data-player-seat={myId} data-deal-seat={myId}
      >
        {isHeroDealer && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-amber-400 text-black text-xs font-bold flex items-center justify-center shadow-lg">D</div>
        )}
        {me && me.cards.length > 0 && me.status !== 'folded' ? (
          <>
            <div style={{ filter: heroFilter }} className="w-[380px] max-w-[94vw]">
              <CardHand cards={me.cards} celebrationCardMarkers selectedIndices={selectedCardIndices} onCardClick={onCardClick}
                isSelectable={isDrawPhase} dealingIndices={animState.dealingIndices} drawingIndices={animState.drawingIndices}
                discardingIndices={animState.discardingIndices} isShowdown={isShowdown} cardWidth={HERO_CARD_W} cardHeight={HERO_CARD_H} testIdPrefix="badugi-card" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-8 h-8 rounded-full overflow-hidden border-2 border-amber-400/60 shadow-lg">
                <img src={getAvatarForSeat(myIndex + 1)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} className="w-full h-full object-cover" />
              </span>
              <div className="text-left">
                <div className="text-white text-sm font-bold">{me?.name ?? 'YOU'}</div>
                <div className="text-amber-200/80 text-[11px] font-mono">{(me?.chips ?? 0).toLocaleString()}</div>
              </div>
            </div>
            <div className="text-white/60 text-[10px] font-mono mt-0.5 text-center">
              {isDrawPhase ? `Tap cards to discard${selectedCardIndices.length ? ` · ${selectedCardIndices.length} selected` : ''}`
                : heroHandEval ? heroHandEval.description : ''}
            </div>
          </>
        ) : me?.status === 'folded' ? (
          <div className="text-white/40 text-sm font-mono">FOLDED</div>
        ) : (
          <div className="text-white/40 text-[10px] font-mono">DEALT IN NEXT HAND</div>
        )}
      </div>

      <BadugiTableEffects state={state} tableRoot={tableRoot} />

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
