/**
 * BoxChevyTable — prototype-matched table layout (Detroit 2026-10-10).
 * Structure from Claude prototype: topbar → info grid → opponent grid →
 * centered community cards → big pot → hero (avatar + cards) → actions.
 * Yard graphics on everything, nothing that isn't needed.
 * Lady Luck untouched per Detroit.
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { useLocation } from 'wouter';
import { CardType, GameState } from '@/lib/poker/types';
import type { Player } from '@shared/gameTypes';
import { getHeroHandValidity } from '@shared/modes/heroHandValidity';
import { PlayingCard } from '@/components/game/Card';
import { CardHand } from '@/components/flushedUp/CardHand';
import { HeroHandValidityBadge } from '@/components/game/HeroHandValidityBadge';
import { getAvatarForSeat } from '@shared/engine/avatarMap';

function phaseLabel(phase: string): string {
  if (phase.startsWith('DRAW_')) return `DRAW ${phase.split('_')[1]} / 3`;
  if (phase.startsWith('BET_')) return 'BETTING';
  if (phase === 'SHOWDOWN') return 'SHOWDOWN';
  if (phase === 'DECLARE') return 'DECLARE';
  if (phase === 'ANTE') return 'ANTES';
  if (phase === 'WAITING') return 'WAITING';
  return phase.replace(/_/g, ' ');
}

function OpponentCell({ player, seatNum, isActive, phase, isDrawPhase }: {
  player: Player; seatNum: number; isActive: boolean; phase: string; isDrawPhase: boolean;
}) {
  const isFolded = player.status === 'folded';
  const isShowdown = phase === 'SHOWDOWN';
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
      {player.declaration && (
        <div className={`pt-declare pt-declare-${player.declaration.toLowerCase()}`}>{player.declaration}</div>
      )}
      {badge && <div className={`pt-tag${badge === 'WAITING' ? '' : ' hl'}`}>{badge}</div>}
      <div className="pt-cards">
        {isShowdown && player.cards.some(c => !c.isHidden) ? (
          player.cards.map((c, i) => (
            <div key={i} data-celebration-card className="pt-mini-card">
              <PlayingCard card={c} className="!w-[24px] !h-[34px]" />
            </div>
          ))
        ) : (
          Array.from({ length: cardCount }).map((_, i) => (
            <i key={i} className={i >= cardCount - darkened ? ' is-dark' : ''} />
          ))
        )}
      </div>
    </div>
  );
}

interface BoxChevyTableProps {
  state: GameState;
  myId: string;
  phase: string;
  isDrawPhase: boolean;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isMyTurn: boolean;
}

export function BoxChevyTable({ state, myId, phase, isDrawPhase, selectedCardIndices, onCardClick, isMyTurn }: BoxChevyTableProps) {
  const [, navigate] = useLocation();
  const me = state.players.find(p => p.id === myId);
  const myIndex = state.players.findIndex(p => p.id === myId);
  const gridOpps = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId);
  const communityCards: CardType[] = (state.communityCards ?? []).map(c => ({ ...c, isHidden: false }));
  const heroValidity = getHeroHandValidity('boxchevy', phase, me?.cards ?? [], state.communityCards ?? []);

  const activeCount = state.players.filter(p => p.status === 'active').length;
  const potSpring = useSpring(state.pot, { stiffness: 80, damping: 20 });
  const potDisplay = useTransform(potSpring, v => Math.round(v).toLocaleString());
  useEffect(() => { potSpring.set(state.pot); }, [state.pot, potSpring]);

  /* Staggered community card reveal */
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
      for (let i = 0; i < newLen; i++) {
        timersRef.current.push(setTimeout(() => setVisibleCount(i + 1), 200 + i * 300));
      }
      return () => { timersRef.current.forEach(clearTimeout); };
    }
    if (newLen > oldLen) setVisibleCount(newLen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityCards.length]);

  const mySeatNum = myIndex + 1;

  return (
    <div className="pt-table pt-chevy">
      {/* Top bar */}
      <div className="pt-ttop">
        <button className="pt-iconbtn" onClick={() => navigate('/')} aria-label="Back">‹</button>
        <div className="pt-ttitle">
          <div className="pt-game-name pt-orange">BOX CHEVY</div>
          <div className="pt-game-sub">10-CARD LOWBALL</div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* Info grid */}
      <div className="pt-info">
        <div><b>PLAYERS</b><span>{activeCount} / {state.players.length}</span></div>
        <div><b>POT</b><span>${state.pot.toLocaleString()}</span></div>
        <div><b>BOARD</b><span>{communityCards.length} / 5</span></div>
        <div><b>PHASE</b><span>{phaseLabel(phase)}</span></div>
      </div>

      {/* Opponents */}
      <div className="pt-opps">
        {gridOpps.map((opp, i) => (
          <OpponentCell key={opp.id} player={opp} seatNum={i + 1}
            isActive={opp.id === state.activePlayerId} phase={phase} isDrawPhase={isDrawPhase} />
        ))}
      </div>

      {/* Community cards — centered, Box Chevy's signature */}
      <div className="pt-community pt-community-center">
        <div className="pt-community-cards">
          {communityCards.length > 0 ? (
            communityCards.map((c, i) => (
              <div key={i} className="pt-comm-card">
                <AnimatePresence>
                  {i < visibleCount && (
                    <motion.div key={`comm-${i}`} data-celebration-card
                      initial={{ opacity: 0, y: -22, rotateY: 90, scale: 0.85 }}
                      animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
                      transition={{ duration: 0.32, ease: 'easeOut' }}
                      style={{ transformOrigin: 'top center' }}>
                      <PlayingCard card={c} className="!w-[54px] !h-[76px]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          ) : (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="pt-comm-placeholder" />)
          )}
        </div>
        <div className="pt-validity">
          {heroValidity
            ? <HeroHandValidityBadge validity={heroValidity} phase={phase} />
            : `${me?.cards.length ?? 0} HOLE · ${communityCards.length}/5 BOARD`}
        </div>
      </div>

      {/* Big pot */}
      <div className="pt-pot" data-pot-anchor>
        <div className="pt-pot-label">POT</div>
        <motion.div className="pt-pot-value">{potDisplay}</motion.div>
      </div>

      {/* Hero — rendered directly from table state (prototype/Badugi pattern) */}
      <div className="pt-me" data-player-seat={myId} data-deal-seat={myId}>
        <div className={`pt-mehead${state.activePlayerId === myId ? ' is-turn' : ''}`}>
          <span className="pt-me-avatar">
            <img src={getAvatarForSeat(mySeatNum)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
          </span>
          <span className="pt-me-name">{me?.name ?? 'YOU'}</span>
          <span className="pt-me-stack">{(me?.chips ?? 0).toLocaleString()}</span>
        </div>
        <div className="pt-hero-cards">
          {me && me.cards.length > 0 && me.status !== 'folded' ? (
            <div className="pt-hand">
              <CardHand
                cards={me.cards.map(c => ({ ...c, isHidden: false }))}
                selectedIndices={selectedCardIndices}
                onCardClick={onCardClick}
                isSelectable={isDrawPhase && isMyTurn}
                dealingIndices={[]}
                drawingIndices={[]}
                discardingIndices={[]}
                isShowdown={phase === 'SHOWDOWN'}
                celebrationCardMarkers
                cardWidth={64}
                cardHeight={90}
              />
            </div>
          ) : (
            <div className="pt-waiting">WAITING FOR HAND</div>
          )}
        </div>
        <div className="pt-hint">
          {isDrawPhase && isMyTurn ? 'TAP CARDS TO DISCARD' : ''}
        </div>
      </div>

      <div data-muck-anchor aria-hidden="true" className="pt-muck" />
      <div data-deal-anchor="deck" className="pt-deck-anchor" />
    </div>
  );
}
