import { motion, useSpring, useTransform } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import type { GameState } from '@shared/gameTypes';
import { CardHand } from './CardHand';
import { WinnerOverlay } from './WinnerOverlay';
import type { CardAnimState } from './useCardAnimations';
import { evaluateFlushedUpHand } from '@shared/modes/flushedUp';
import type { FlushedUpEval } from '@shared/modes/flushedUp';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { getAvatarInitials, getAvatarColor } from '@/lib/persistence';

/* ── Showdown helpers ─────────────────────────────────────────────────────── */

function suitGlowColor(suit: string): string {
  if (suit === 'hearts' || suit === 'diamonds') return 'rgba(196,30,58,0.85)';
  if (suit === 'spades') return 'rgba(100,130,210,0.85)';
  return 'rgba(30,150,70,0.85)';
}

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

/* ── Phase label ─────────────────────────────────────────────────────────── */

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    WAITING:  'WAITING FOR PLAYERS',
    ANTE:     'POSTING ANTE',
    DEAL:     'DEALING',
    BET_1:    'FIRST BET',
    DRAW_1:   'DRAW 1 · UP TO 3',
    BET_2:    'SECOND BET',
    DRAW_2:   'DRAW 2 · UP TO 2',
    BET_3:    'THIRD BET',
    DRAW_3:   'DRAW 3 · UP TO 1',
    BET_4:    'FINAL BET',
    SHOWDOWN: 'SHOWDOWN',
  };
  return map[phase] ?? phase.replace(/_/g, ' ');
}

/* ── Animated pot counter ─────────────────────────────────────────────────── */

function AnimatedPot({ pot }: { pot: number }) {
  const spring = useSpring(pot, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, v => Math.round(v).toLocaleString());
  useEffect(() => { spring.set(pot); }, [pot, spring]);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(124,58,237,0.35)',
      boxShadow: '0 0 20px rgba(124,58,237,0.2), 0 2px 12px rgba(0,0,0,0.5)',
      textAlign: 'center',
      padding: '6px 22px',
      borderRadius: 50,
    }}>
      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(168,85,247,0.7)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        POT
      </div>
      <motion.div style={{
        fontSize: 18, fontFamily: 'monospace', fontWeight: 800,
        color: '#fff', letterSpacing: '0.05em', display: 'inline-block',
      }}>
        {display}
      </motion.div>
    </div>
  );
}

/* ── Opponent panel ───────────────────────────────────────────────────────── */

interface OppPanelProps {
  name: string;
  chips: number;
  cardCount: number;
  status: string;
  isActive: boolean;
  isWinner: boolean;
  isDealer: boolean;
  seatNum: number;
}

function OpponentPanel({ name, chips, cardCount, status, isActive, isWinner, isDealer, seatNum }: OppPanelProps) {
  const isFolded = status === 'folded';
  const avatarSrc = getAvatarForSeat(seatNum);
  const initials = getAvatarInitials(name);
  const avatarBg = getAvatarColor(name);

  const panelStyle: React.CSSProperties = {
    background: isFolded
      ? 'rgba(5,3,15,0.6)'
      : isWinner
        ? 'rgba(10,5,30,0.8)'
        : 'rgba(8,4,20,0.75)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 14,
    border: isWinner
      ? '1px solid rgba(168,85,247,0.8)'
      : isActive
        ? '1px solid rgba(124,58,237,0.65)'
        : '1px solid rgba(255,255,255,0.07)',
    boxShadow: isWinner
      ? '0 0 16px rgba(168,85,247,0.4)'
      : isActive
        ? '0 0 10px rgba(124,58,237,0.25)'
        : '0 2px 10px rgba(0,0,0,0.4)',
    padding: '8px 8px 6px',
    opacity: isFolded ? 0.7 : 1,
    transition: 'border 0.3s, box-shadow 0.3s, opacity 0.3s',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  };

  return (
    <div style={panelStyle}>
      {/* Top row: avatar + name + dealer chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Circular avatar */}
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          border: isActive ? '1.5px solid rgba(124,58,237,0.7)' : '1.5px solid rgba(255,255,255,0.1)',
          background: avatarBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isActive ? '0 0 8px rgba(124,58,237,0.5)' : 'none',
        }}>
          <img
            src={avatarSrc}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        {/* Name + active indicator */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            overflow: 'hidden',
          }}>
            {isActive && (
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 0.85, repeat: Infinity }}
                style={{ width: 5, height: 5, borderRadius: '50%', background: '#a855f7', flexShrink: 0 }}
              />
            )}
            <span style={{
              fontSize: 11, fontFamily: 'monospace', color: isFolded ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.85)',
              fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {name}
            </span>
            {isDealer && (
              <div style={{
                width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #C9A227, #A07C10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 6, fontWeight: 700, color: '#000', fontFamily: 'monospace',
              }}>D</div>
            )}
          </div>
          {/* Chips */}
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(201,162,39,0.75)', fontWeight: 600, marginTop: 1 }}>
            {chips.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Card backs row OR folded label */}
      {isFolded ? (
        <div style={{
          fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)',
          letterSpacing: '0.08em', textAlign: 'center',
        }}>
          FOLDED
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', alignItems: 'center' }}>
          {Array.from({ length: Math.max(cardCount, 5) }).map((_, i) => (
            <div key={i} style={{
              width: 14, height: 20, borderRadius: 3, flexShrink: 0,
              background: 'linear-gradient(145deg, rgba(75,30,130,0.7), rgba(40,15,80,0.9))',
              border: '1px solid rgba(124,58,237,0.4)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }} />
          ))}
        </div>
      )}

      {/* Winner badge */}
      {isWinner && (
        <div style={{
          fontSize: 11, fontFamily: 'monospace', color: '#a855f7',
          letterSpacing: '0.08em', textAlign: 'center', fontWeight: 700,
        }}>
          ★ WINNER
        </div>
      )}
    </div>
  );
}

/* ── Empty seat panel ─────────────────────────────────────────────────────── */
function EmptyPanel() {
  return (
    <div style={{
      background: 'rgba(5,3,12,0.4)',
      borderRadius: 14,
      border: '1px dashed rgba(255,255,255,0.05)',
      padding: '8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 68,
    }}>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>OPEN</span>
    </div>
  );
}

/* ── Props ───────────────────────────────────────────────────────────────── */

interface FlushedUpTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  animState: CardAnimState;
}

/* ── Table ───────────────────────────────────────────────────────────────── */

export function FlushedUpTable({
  state,
  myId,
  selectedCardIndices,
  onCardClick,
  isDrawPhase,
  animState,
}: FlushedUpTableProps) {
  const me = state.players.find(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';

  const heroHandEval: FlushedUpEval | null = isShowdown && me && me.cards.length > 0
    ? evaluateFlushedUpHand(me.cards.map(c => ({ ...c, isHidden: false })))
    : null;
  const heroIsWinner = !!me?.isWinner;
  const heroIsLoser  = isShowdown && !heroIsWinner && me?.status !== 'folded';
  const heroGlowColor = heroIsWinner && heroHandEval ? suitGlowColor(heroHandEval.bestSuit) : null;

  /* Reorder opponents: player left of hero first, wrap around */
  const myIndex = state.players.findIndex(p => p.id === myId);
  const reorderedOpps = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId);

  /* Always show 4 opponent slots: reserved seats render as OPEN panels inside the grid */
  const gridOpps  = reorderedOpps.slice(0, 4);
  const emptyCount = Math.max(0, 4 - gridOpps.length);

  /* Winner overlay */
  const [winnerData, setWinnerData] = useState<{ name: string; pot: number; isHero: boolean } | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const prevPhaseRef = useRef(state.phase);

  useEffect(() => {
    if (state.phase === 'SHOWDOWN' && prevPhaseRef.current !== 'SHOWDOWN') {
      const winner = state.players.find(p => p.isWinner);
      if (winner) {
        setTimeout(() => {
          setWinnerData({ name: winner.name, pot: state.pot, isHero: winner.id === myId });
          setShowWinner(true);
        }, 900);
      }
    }
    if (state.phase === 'WAITING') {
      setShowWinner(false);
      setWinnerData(null);
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, state.players, state.pot, myId]);

  const heroCardW = 54;
  const heroCardH = 76;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* ── Opponent 2×2 grid ──────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 7,
        padding: '8px 10px 4px',
        flexShrink: 0,
      }}>
        {gridOpps.map((opp) => {
          if (opp.presence === 'reserved' || opp.presence === 'open') {
            return <EmptyPanel key={opp.id} />;
          }
          const seatNum = parseInt(opp.id.replace('p', ''), 10) || 1;
          return (
            <OpponentPanel
              key={opp.id}
              name={opp.name}
              chips={opp.chips}
              cardCount={opp.cards.length}
              status={opp.status}
              isActive={state.activePlayerId === opp.id}
              isWinner={!!opp.isWinner}
              isDealer={!!opp.isDealer}
              seatNum={seatNum}
            />
          );
        })}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <EmptyPanel key={`empty-${i}`} />
        ))}
      </div>

      {/* ── Centre — phase label + pot ────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        pointerEvents: 'none',
        padding: '4px 0',
      }}>
        <motion.div
          key={state.phase}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            fontSize: 11, fontFamily: 'monospace',
            color: 'rgba(168,85,247,0.7)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            textShadow: '0 0 12px rgba(124,58,237,0.4)',
          }}
        >
          {phaseLabel(state.phase)}
        </motion.div>

        {state.pot > 0 && <AnimatedPot pot={state.pot} />}

        {/* Hero identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {me?.isDealer && (
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'linear-gradient(135deg, #C9A227, #A07C10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 6, fontWeight: 700, color: '#000', fontFamily: 'monospace',
            }}>D</div>
          )}
          {state.activePlayerId === myId && state.phase !== 'WAITING' && (
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.85, repeat: Infinity }}
              style={{ width: 5, height: 5, borderRadius: '50%', background: '#a855f7' }}
            />
          )}
          <span style={{
            fontSize: 11, fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.06em',
            textShadow: '0 1px 8px rgba(0,0,0,0.9)',
          }}>
            {me?.name ?? 'You'}
          </span>
        </div>
      </div>

      {/* ── Hero hand ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingBottom: 8, flexShrink: 0,
      }}>
        {/* Selection badge */}
        {isDrawPhase && selectedCardIndices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              marginBottom: 4,
              padding: '3px 12px',
              borderRadius: 20,
              background: 'rgba(124,58,237,0.25)',
              border: '1px solid rgba(168,85,247,0.4)',
              fontSize: 11, fontFamily: 'monospace',
              color: '#c084fc', letterSpacing: '0.08em',
            }}
          >
            {selectedCardIndices.length} SELECTED · TAP DRAW
          </motion.div>
        )}

        {/* Cards with glow on showdown */}
        {me && me.cards.length > 0 ? (
          <>
            <div style={{
              opacity: heroIsLoser ? 0.55 : 1,
              filter: heroGlowColor
                ? `drop-shadow(0 0 14px ${heroGlowColor}) drop-shadow(0 0 6px ${heroGlowColor})`
                : 'none',
              transition: 'opacity 0.4s ease, filter 0.4s ease',
            }}>
              <CardHand
                cards={me.cards}
                selectedIndices={selectedCardIndices}
                onCardClick={onCardClick}
                isSelectable={isDrawPhase}
                dealingIndices={animState.dealingIndices}
                drawingIndices={animState.drawingIndices}
                discardingIndices={animState.discardingIndices}
                isShowdown={isShowdown}
                cardWidth={heroCardW}
                cardHeight={heroCardH}
              />
            </div>

            {/* Showdown hand rank */}
            {isShowdown && heroHandEval && me.status !== 'folded' && (
              <div style={{
                marginTop: 3,
                fontSize: 11, fontFamily: 'monospace',
                color: heroIsWinner ? '#a855f7' : 'rgba(255,255,255,0.7)',
                fontWeight: heroIsWinner ? 700 : 400,
                letterSpacing: '0.08em', textAlign: 'center',
                textShadow: heroIsWinner ? '0 0 10px rgba(168,85,247,0.7)' : '0 1px 6px rgba(0,0,0,0.9)',
              }}>
                {showdownLabel(heroHandEval)}
              </div>
            )}
          </>
        ) : (
          /* Ghost card slots */
          <div style={{ display: 'flex', gap: 4, paddingTop: 16, paddingBottom: 6 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: heroCardW, height: heroCardH, borderRadius: 8,
                border: '1px dashed rgba(124,58,237,0.15)',
              }} />
            ))}
          </div>
        )}

        {/* Debug indicator (draw phases only, remove after on-device testing) */}
        {isDrawPhase && (
          <div style={{
            marginTop: 3,
            fontSize: 11, fontFamily: 'monospace',
            color: 'rgba(255,80,80,0.8)', letterSpacing: '0.08em',
            background: 'rgba(0,0,0,0.4)', padding: '2px 8px',
            borderRadius: 4, border: '1px solid rgba(255,80,80,0.25)',
          }}>
            PHASE: {state.phase} · SELECTED: {selectedCardIndices.length}
          </div>
        )}
      </div>

      {/* ── Winner overlay ─────────────────────────────────────────────── */}
      {winnerData && (
        <WinnerOverlay
          show={showWinner}
          winnerName={winnerData.name}
          potAmount={winnerData.pot}
          isHeroWinner={winnerData.isHero}
          onDone={() => setShowWinner(false)}
        />
      )}
    </div>
  );
}
