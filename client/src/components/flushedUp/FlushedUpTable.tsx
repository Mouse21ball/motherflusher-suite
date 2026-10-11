/**
 * FlushedUpTable — prototype-matched table layout (Detroit 2026-10-10).
 * Structure from Claude prototype: topbar → info grid → opponent grid →
 * community cards → big pot → hero (avatar + cards) → actions.
 * Yard graphics on everything, nothing that isn't needed.
 * Lady Luck untouched per Detroit.
 */
import { AnimatePresence, motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import type { GameState } from '@shared/gameTypes';
import type { Player } from '@shared/gameTypes';
import { CardHand } from './CardHand';
import { PlayingCard } from '@/components/game/Card';
import type { CardAnimState } from './useCardAnimations';
import { evaluateFlushedUpHand } from '@shared/modes/flushedUp';
import type { FlushedUpEval } from '@shared/modes/flushedUp';
import { TableDealAnimator } from './TableDealAnimator';
import { getAvatarForSeat } from '@shared/engine/avatarMap';

const HERO_CARD_W = 62;
const HERO_CARD_H = 88;

function rankLabel(v: number): string {
  if (v === 14) return 'A';
  if (v === 13) return 'K';
  if (v === 12) return 'Q';
  if (v === 11) return 'J';
  return String(v);
}

function showdownLabel(ev: FlushedUpEval): string {
  const SYM: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const sym = SYM[ev.bestSuit] ?? '';
  if (ev.isFlush) {
    const top = rankLabel(ev.rankValues[0] ?? 14);
    return `5-Card Flush ${sym} ${top}-high`;
  }
  if (ev.suitCount <= 1) return 'No Flush';
  const top = rankLabel(ev.rankValues[0] ?? 14);
  return `${ev.suitCount}-Card ${sym} ${top}-high`;
}

function phaseLabel(phase: string): string {
  if (phase.startsWith('DRAW_')) return `DRAW ${phase.split('_')[1]} / 3`;
  if (phase.startsWith('BET_')) return 'BETTING';
  if (phase === 'SHOWDOWN') return 'SHOWDOWN';
  if (phase === 'ANTE') return 'ANTES';
  if (phase === 'WAITING') return 'WAITING';
  return phase.replace(/_/g, ' ');
}

function OpponentCell({ player, seatNum, isActive, isDrawPhase }: {
  player: Player; seatNum: number; isActive: boolean; isDrawPhase: boolean;
}) {
  const isFolded = player.status === 'folded';
  const badge = !isDrawPhase || isFolded ? null
    : player.lastDrawCount === undefined ? 'WAITING'
    : player.lastDrawCount === 0 ? 'STAND PAT'
    : `DREW ${player.lastDrawCount}`;
  const cardCount = 5;
  const darkened = isDrawPhase && player.lastDrawCount !== undefined ? player.lastDrawCount : 0;

  return (
    <div className={`pt-seat${isFolded ? ' is-out' : ''}${isActive ? ' is-turn' : ''}`}
      data-player-seat={player.id} data-deal-seat={player.id}>
      <div className="pt-sav">
        <img src={getAvatarForSeat(seatNum)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
        {isActive && <span className="pt-turn-ring" />}
      </div>
      <div className="pt-nm">{player.name}</div>
      <div className="pt-st">{player.chips.toLocaleString()}</div>
      {badge && <div className={`pt-tag${badge === 'WAITING' ? '' : ' hl'}`}>{badge}</div>}
      <div className="pt-cards">
        {Array.from({ length: cardCount }).map((_, i) => (
          <i key={i} className={i >= cardCount - darkened ? ' is-dark' : ''} />
        ))}
      </div>
    </div>
  );
}

interface FlushedUpTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  animState: CardAnimState;
}

export function FlushedUpTable({
  state,
  myId,
  selectedCardIndices,
  onCardClick,
  isDrawPhase,
  animState,
}: FlushedUpTableProps) {
  const [, navigate] = useLocation();
  const tableRef = useRef<HTMLDivElement>(null);
  const me = state.players.find(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';
  const communityCards = (state.communityCards ?? []).map(card => ({ ...card, isHidden: false }));
  const [visibleCount, setVisibleCount] = useState(communityCards.length);
  const prevLenRef = useRef(communityCards.length);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const newLen = communityCards.length;
    const oldLen = prevLenRef.current;
    prevLenRef.current = newLen;
    if (newLen === 0) {
      setVisibleCount(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }
    if (oldLen === 0 && newLen > 0) {
      setVisibleCount(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      for (let i = 0; i < newLen; i++) timersRef.current.push(setTimeout(() => setVisibleCount(i + 1), 200 + i * 300));
      return () => { timersRef.current.forEach(clearTimeout); };
    }
    if (newLen > oldLen) setVisibleCount(newLen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityCards.length]);

  const heroHandEval: FlushedUpEval | null = me && me.cards.length > 0 && !me.cards.some(card => card.isHidden)
    ? evaluateFlushedUpHand(me.cards.map(c => ({ ...c, isHidden: false })))
    : null;
  const heroIsLoser = isShowdown && !me?.isWinner && me?.status !== 'folded';

  const myIndex = state.players.findIndex(p => p.id === myId);
  const gridOpps = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId);

  const activeCount = state.players.filter(p => p.status === 'active').length;
  const potSpring = useSpring(state.pot, { stiffness: 80, damping: 20 });
  const potDisplay = useTransform(potSpring, v => Math.round(v).toLocaleString());
  useEffect(() => { potSpring.set(state.pot); }, [state.pot, potSpring]);

  const mySeatNum = myIndex + 1;
  const heroFilter = heroIsLoser ? 'brightness(0.6) saturate(0.5)' : 'none';

  return (
    <div className="pt-table pt-flushed" ref={tableRef}>
      {/* Top bar */}
      <div className="pt-ttop">
        <button className="pt-iconbtn" onClick={() => navigate('/')} aria-label="Back">‹</button>
        <div className="pt-ttitle">
          <div className="pt-game-name pt-pink">FLUSHED UP</div>
          <div className="pt-game-sub">CHASE THE FLUSH</div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* Info grid */}
      <div className="pt-info">
        <div><b>PLAYERS</b><span>{activeCount} / {state.players.length}</span></div>
        <div><b>POT</b><span>${state.pot.toLocaleString()}</span></div>
        <div><b>DRAW</b><span>{state.phase.startsWith('DRAW_') ? `${state.phase.split('_')[1]} / 3` : '–'}</span></div>
        <div><b>PHASE</b><span>{phaseLabel(state.phase)}</span></div>
      </div>

      {/* Opponents */}
      <div className="pt-opps">
        {gridOpps.map((opp, i) => (
          <OpponentCell key={opp.id} player={opp} seatNum={i + 1}
            isActive={opp.id === state.activePlayerId} isDrawPhase={isDrawPhase} />
        ))}
      </div>

      {/* Community cards */}
      {communityCards.length > 0 && (
        <div className="pt-community">
          <div className="pt-community-cards">
            {communityCards.map((card, i) => (
              <div key={i} className="pt-comm-card">
                <AnimatePresence>
                  {i < visibleCount && (
                    <motion.div key={`comm-${i}`} data-celebration-card
                      initial={{ opacity: 0, y: -22, rotateY: 90, scale: .85 }}
                      animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
                      transition={{ duration: .32, ease: 'easeOut' }}
                      style={{ transformOrigin: 'top center' }}>
                      <PlayingCard card={card} className="!w-[54px] !h-[76px]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Big pot */}
      <div className="pt-pot" data-pot-anchor>
        <div className="pt-pot-label">POT</div>
        <motion.div className="pt-pot-value">{potDisplay}</motion.div>
      </div>

      {/* Hero */}
      <div className="pt-me" data-player-seat={myId} data-deal-seat={myId}>
        <div className={`pt-mehead${state.activePlayerId === myId ? ' is-turn' : ''}`}>
          <span className="pt-me-avatar">
            <img src={getAvatarForSeat(mySeatNum)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
          </span>
          <span className="pt-me-name">{me?.name ?? 'YOU'}</span>
          <span className="pt-me-stack">{(me?.chips ?? 0).toLocaleString()}</span>
        </div>
        {me && me.cards.length > 0 && me.status !== 'folded' ? (
          <>
            <div className="pt-hand" style={{ filter: heroFilter }}>
              <CardHand cards={me.cards} selectedIndices={selectedCardIndices} onCardClick={onCardClick}
                isSelectable={isDrawPhase} dealingIndices={animState.dealingIndices} drawingIndices={animState.drawingIndices}
                discardingIndices={animState.discardingIndices} isShowdown={isShowdown} celebrationCardMarkers
                cardWidth={HERO_CARD_W} cardHeight={HERO_CARD_H} />
            </div>
            <div className="pt-hint">
              {isDrawPhase ? `Tap cards to discard${selectedCardIndices.length ? ` · ${selectedCardIndices.length} selected` : ''}`
                : heroHandEval ? showdownLabel(heroHandEval) : ''}
            </div>
          </>
        ) : me?.status === 'folded' ? (
          <div className="pt-folded">FOLDED</div>
        ) : (
          <div className="pt-waiting">WAITING FOR HAND</div>
        )}
      </div>

      <div data-muck-anchor aria-hidden="true" className="pt-muck" />
      <div data-deal-anchor="deck" className="pt-deck-anchor" />
      <TableDealAnimator players={state.players} phase={state.phase} myId={myId} tableRoot={tableRef.current} />
    </div>
  );
}
