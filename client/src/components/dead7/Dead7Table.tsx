/**
 * Dead7Table — visual table layer for Dead 7.
 * Mirrors BadugiTable with crimson (#dc2626) accent colour and
 * Dead-7-specific phase labels and hand evaluation.
 *
 * No WinnerOverlay: ShowdownReveal handles SHOWDOWN.
 * No debug PHASE/SELECTED strip.
 */
import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import type { GameState } from '@/lib/poker/types';
import { CardHand } from '@/components/flushedUp/CardHand';
import type { CardAnimState } from '@/components/flushedUp/useCardAnimations';
import { evaluateDead7 } from '@shared/modes/dead7';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { getAvatarColor } from '@/lib/persistence';

const R = (a: number) => `rgba(185,28,28,${a})`;
const HERO_CARD_W = 54;
const HERO_CARD_H = 76;
const CARD_BACK   = '/ladyluck/card-back-cgp.png';

/* ── Phase label ──────────────────────────────────────────────────────────── */

function phaseLabel(phase: string): string {
  const m: Record<string, string> = {
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
  return m[phase] ?? phase.replace(/_/g, ' ');
}

/* ── Animated pot ─────────────────────────────────────────────────────────── */

function AnimatedPot({ pot }: { pot: number }) {
  const spring  = useSpring(pot, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, v => Math.round(v).toLocaleString());
  useEffect(() => { spring.set(pot); }, [pot, spring]);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      border: `1px solid ${R(0.35)}`,
      boxShadow: `0 0 18px ${R(0.18)}, 0 2px 10px rgba(0,0,0,0.5)`,
      padding: '6px 22px', borderRadius: 50, textAlign: 'center',
    }}>
      <div style={{ fontSize: 8, fontFamily: 'monospace', color: R(0.7), letterSpacing: '0.22em' }}>POT</div>
      <motion.div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>
        {display}
      </motion.div>
    </div>
  );
}

/* ── Opponent panel ───────────────────────────────────────────────────────── */

interface OppPanelProps { name: string; chips: number; cardCount: number; status: string; isActive: boolean; isWinner: boolean; isDealer: boolean; seatNum: number; }

function OpponentPanel({ name, chips, cardCount, status, isActive, isWinner, isDealer, seatNum }: OppPanelProps) {
  const isFolded  = status === 'folded';
  const avatarSrc = getAvatarForSeat(seatNum);
  const avatarBg  = getAvatarColor(name);
  const cards = Math.max(cardCount, 4);

  return (
    <div style={{
      background: isFolded ? 'rgba(5,0,0,0.6)' : isWinner ? 'rgba(25,5,5,0.85)' : 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 16,
      border: isWinner ? `1.5px solid ${R(0.75)}` : isActive ? `1px solid ${R(0.5)}` : '1px solid rgba(255,255,255,0.08)',
      boxShadow: isWinner ? `0 0 14px ${R(0.3)}` : isActive ? `0 0 8px ${R(0.18)}` : '0 2px 10px rgba(0,0,0,0.4)',
      padding: '8px 8px 6px', opacity: isFolded ? 0.45 : 1,
      transition: 'border 0.3s, box-shadow 0.3s, opacity 0.3s',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      {/* Avatar + name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          border: isActive ? `1.5px solid ${R(0.65)}` : '1.5px solid rgba(255,255,255,0.1)',
          background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isActive ? `0 0 8px ${R(0.4)}` : 'none',
        }}>
          <img src={avatarSrc} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
            {isActive && (
              <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.85, repeat: Infinity }}
                style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: isFolded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)' }}>
              {name}
            </span>
            {isDealer && (
              <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #C9A227, #A07C10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 6, fontWeight: 700, color: '#000', fontFamily: 'monospace' }}>D</div>
            )}
          </div>
          <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 600, marginTop: 1, color: R(0.75) }}>
            {chips.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Card backs or FOLDED label */}
      {isFolded ? (
        <div style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', textAlign: 'center' }}>FOLDED</div>
      ) : (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', alignItems: 'center' }}>
          {Array.from({ length: cards }).map((_, i) => (
            <img key={i} src={CARD_BACK} alt="card" style={{ width: 28, height: 'auto', borderRadius: 3, flexShrink: 0, display: 'block' }} />
          ))}
        </div>
      )}

      {isWinner && (
        <div style={{ fontSize: 7, fontFamily: 'monospace', color: '#ef4444', letterSpacing: '0.18em', textAlign: 'center', fontWeight: 700 }}>
          ★ WINNER
        </div>
      )}
    </div>
  );
}

/* ── Empty seat ───────────────────────────────────────────────────────────── */

function EmptyPanel() {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.25)', borderRadius: 16,
      border: '1px dashed rgba(255,255,255,0.05)',
      padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 74,
    }}>
      <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.2em' }}>OPEN</span>
    </div>
  );
}

/* ── Props & main component ───────────────────────────────────────────────── */

export interface Dead7TableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  animState: CardAnimState;
}

export function Dead7Table({ state, myId, selectedCardIndices, onCardClick, isDrawPhase, animState }: Dead7TableProps) {
  const me          = state.players.find(p => p.id === myId);
  const isShowdown  = state.phase === 'SHOWDOWN';

  const heroHandEval = isShowdown && me && me.cards.length > 0
    ? evaluateDead7(me.cards.map(c => ({ ...c, isHidden: false })) as Parameters<typeof evaluateDead7>[0])
    : null;
  const heroIsWinner = !!(me as any)?.isWinner;
  const heroIsLoser  = isShowdown && !heroIsWinner && me?.status !== 'folded';

  const myIndex  = state.players.findIndex(p => p.id === myId);
  const gridOpps = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId).slice(0, 4);
  const emptyCount = Math.max(0, 4 - gridOpps.length);

  const heroFilter = heroIsLoser ? 'brightness(0.6) saturate(0.5)' : 'none';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Opponent 2×2 grid ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, padding: '8px 10px 4px', flexShrink: 0 }}>
        {gridOpps.map(opp => {
          if (opp.presence === 'reserved' || opp.presence === 'open') return <EmptyPanel key={opp.id} />;
          const seatNum = parseInt(opp.id.replace('p', ''), 10) || 1;
          return (
            <OpponentPanel key={opp.id}
              name={opp.name} chips={opp.chips} cardCount={opp.cards.length} status={opp.status}
              isActive={state.activePlayerId === opp.id} isWinner={!!(opp as any).isWinner}
              isDealer={!!(opp as any).isDealer} seatNum={seatNum} />
          );
        })}
        {Array.from({ length: emptyCount }).map((_, i) => <EmptyPanel key={`e-${i}`} />)}
      </div>

      {/* ── Centre ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '4px 0', pointerEvents: 'none' }}>
        <motion.div key={state.phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          style={{ fontSize: 8, fontFamily: 'monospace', color: R(0.6), letterSpacing: '0.22em', textTransform: 'uppercase', textShadow: `0 0 12px ${R(0.3)}` }}>
          {phaseLabel(state.phase)}
        </motion.div>

        {/* "DEAD 7" watermark */}
        <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.4em', color: R(0.07), textTransform: 'uppercase', userSelect: 'none' }}>
          DEAD 7
        </div>

        {state.pot > 0 && <AnimatedPot pot={state.pot} />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {(me as any)?.isDealer && (
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'linear-gradient(135deg, #C9A227, #A07C10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 700, color: '#000', fontFamily: 'monospace' }}>D</div>
          )}
          {state.activePlayerId === myId && state.phase !== 'WAITING' && (
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.85, repeat: Infinity }}
              style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />
          )}
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.06em', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
            {me?.name ?? 'You'}
          </span>
        </div>
      </div>

      {/* ── Hero hand ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 8, flexShrink: 0 }}>
        {isDrawPhase && selectedCardIndices.length > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            style={{ marginBottom: 4, padding: '3px 12px', borderRadius: 20,
              background: R(0.18), border: `1px solid ${R(0.4)}`,
              fontSize: 9, fontFamily: 'monospace', color: '#ef4444', letterSpacing: '0.14em' }}>
            {selectedCardIndices.length} SELECTED · TAP DRAW
          </motion.div>
        )}

        {me && me.cards.length > 0 ? (
          <>
            <div style={{ filter: heroFilter, transition: 'filter 0.4s ease' }}>
              <CardHand cards={me.cards} selectedIndices={selectedCardIndices} onCardClick={onCardClick}
                isSelectable={isDrawPhase} dealingIndices={animState.dealingIndices}
                drawingIndices={animState.drawingIndices} discardingIndices={animState.discardingIndices}
                isShowdown={isShowdown} cardWidth={HERO_CARD_W} cardHeight={HERO_CARD_H} />
            </div>

            {isShowdown && heroHandEval && me.status !== 'folded' && (
              <div style={{ marginTop: 3, fontSize: 9, fontFamily: 'monospace',
                color: heroIsWinner ? '#ef4444' : 'rgba(255,255,255,0.3)',
                fontWeight: heroIsWinner ? 700 : 400, letterSpacing: '0.08em', textAlign: 'center',
                textShadow: heroIsWinner ? `0 0 10px ${R(0.65)}` : '0 1px 6px rgba(0,0,0,0.9)' }}>
                {heroHandEval.description}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', gap: 4, paddingTop: 16, paddingBottom: 6 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ width: HERO_CARD_W, height: HERO_CARD_H, borderRadius: 8, border: `1px dashed ${R(0.12)}` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
