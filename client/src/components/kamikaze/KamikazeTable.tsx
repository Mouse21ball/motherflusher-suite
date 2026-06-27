import { motion, useSpring, useTransform } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import type { GameState } from '@shared/gameTypes';
import { CardHand } from '@/components/flushedUp/CardHand';
import { WinnerOverlay } from '@/components/flushedUp/WinnerOverlay';
import type { CardAnimState } from '@/components/flushedUp/useCardAnimations';
import { evaluateKamikaze } from '@shared/modes/kamikaze';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { getAvatarColor } from '@/lib/persistence';

/* ── Graffiti Bomb palette ─────────────────────────────────────────────────── */
const RED    = '#ef4444';
const BLUE   = '#3b82f6';
const YELLOW = '#facc15';
const rA = (a: number) => `rgba(239,68,68,${a})`;
const bA = (a: number) => `rgba(59,130,246,${a})`;
const yA = (a: number) => `rgba(250,204,21,${a})`;

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
    DECLARE:  'DECLARE HIGH OR LOW',
    SHOWDOWN: 'SHOWDOWN',
  };
  return map[phase] ?? phase.replace(/_/g, ' ');
}

function phaseColor(phase: string): string {
  if (phase === 'DECLARE') return YELLOW;
  if (phase.startsWith('DRAW')) return RED;
  if (phase.startsWith('BET')) return BLUE;
  return 'rgba(255,255,255,0.5)';
}

/* ── Animated pot ─────────────────────────────────────────────────────────── */
function AnimatedPot({ pot }: { pot: number }) {
  const spring = useSpring(pot, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, v => Math.round(v).toLocaleString());
  useEffect(() => { spring.set(pot); }, [pot, spring]);
  return (
    <div style={{
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
      border: `1px solid ${yA(0.45)}`, boxShadow: `0 0 18px ${yA(0.15)}, 0 2px 12px rgba(0,0,0,0.6)`,
      textAlign: 'center', padding: '6px 22px', borderRadius: 50,
    }}>
      <div style={{ fontSize: 8, fontFamily: 'monospace', color: yA(0.7), letterSpacing: '0.22em' }}>POT</div>
      <motion.div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 800, color: '#fff', letterSpacing: '0.05em', display: 'inline-block' }}>
        {display}
      </motion.div>
    </div>
  );
}

/* ── Opponent panel ─────────────────────────────────────────────────────── */
interface OppPanelProps {
  name: string; chips: number; cardCount: number; status: string;
  isActive: boolean; isWinner: boolean; isDealer: boolean; seatNum: number;
  declaration?: string | null;
}

function OpponentPanel({ name, chips, cardCount, status, isActive, isWinner, isDealer, seatNum, declaration }: OppPanelProps) {
  const isFolded = status === 'folded';
  const avatarSrc = getAvatarForSeat(seatNum);
  const avatarBg  = getAvatarColor(name);
  const borderCol = isWinner ? RED : isActive ? BLUE : 'rgba(255,255,255,0.07)';
  const glowCol   = isWinner ? rA(0.35) : isActive ? bA(0.2) : 'transparent';

  return (
    <div style={{
      background: isFolded ? 'rgba(0,0,0,0.5)' : 'rgba(8,8,8,0.8)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 14, border: `1px solid ${borderCol}`,
      boxShadow: `0 0 12px ${glowCol}`,
      padding: '8px 8px 6px', opacity: isFolded ? 0.45 : 1,
      transition: 'border 0.3s, box-shadow 0.3s',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          border: isActive ? `1.5px solid ${BLUE}` : '1.5px solid rgba(255,255,255,0.1)',
          background: avatarBg,
          boxShadow: isActive ? `0 0 8px ${bA(0.5)}` : 'none',
        }}>
          <img src={avatarSrc} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
            {isActive && (
              <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.85, repeat: Infinity }}
                style={{ width: 5, height: 5, borderRadius: '50%', background: YELLOW, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: isFolded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
            {isDealer && (
              <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg, ${YELLOW}, #b45309)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 700, color: '#000' }}>D</div>
            )}
            {declaration && declaration !== 'FOLD' && (
              <div style={{ fontSize: 7, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', color: declaration === 'HIGH' ? YELLOW : BLUE, background: declaration === 'HIGH' ? yA(0.15) : bA(0.15), border: `1px solid ${declaration === 'HIGH' ? yA(0.4) : bA(0.4)}`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                {declaration}
              </div>
            )}
          </div>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: yA(0.75), fontWeight: 600, marginTop: 1 }}>
            {chips.toLocaleString()}
          </div>
        </div>
      </div>
      {isFolded ? (
        <div style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.18em', textAlign: 'center' }}>FOLDED</div>
      ) : (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          {Array.from({ length: Math.max(cardCount, 6) }).map((_, i) => (
            <div key={i} style={{ width: 11, height: 17, borderRadius: 2, flexShrink: 0, background: 'rgba(10,10,10,0.9)', border: `1px solid ${rA(0.35)}`, boxShadow: `0 0 4px ${rA(0.12)}` }} />
          ))}
        </div>
      )}
      {isWinner && (
        <div style={{ fontSize: 7, fontFamily: 'monospace', color: RED, letterSpacing: '0.18em', textAlign: 'center', fontWeight: 700 }}>★ WINNER</div>
      )}
    </div>
  );
}

function EmptyPanel() {
  return (
    <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 14, border: '1px dashed rgba(255,255,255,0.05)', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 68 }}>
      <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.1)', letterSpacing: '0.2em' }}>OPEN</span>
    </div>
  );
}

/* ── Props ──────────────────────────────────────────────────────────────── */
interface KamikazeTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  animState: CardAnimState;
}

/* ── Table ──────────────────────────────────────────────────────────────── */
export function KamikazeTable({ state, myId, selectedCardIndices, onCardClick, isDrawPhase, animState }: KamikazeTableProps) {
  const me = state.players.find(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';
  const isDeclare  = state.phase === 'DECLARE';

  const heroEval  = (isShowdown || isDeclare) && me && me.cards.length > 0
    ? evaluateKamikaze(me.cards.map(c => ({ ...c, isHidden: false }))) : null;
  const heroIsWinner = !!me?.isWinner;
  const heroIsLoser  = isShowdown && !heroIsWinner && me?.status !== 'folded';

  const myIndex = state.players.findIndex(p => p.id === myId);
  const reorderedOpps = [...state.players.slice(myIndex + 1), ...state.players.slice(0, myIndex)].filter(p => p.id !== myId);
  const gridOpps   = reorderedOpps.slice(0, 4);
  const emptyCount = Math.max(0, 4 - gridOpps.length);

  const [winnerData, setWinnerData] = useState<{ name: string; pot: number; isHero: boolean } | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    if (state.phase === 'SHOWDOWN' && prevPhaseRef.current !== 'SHOWDOWN') {
      const winner = state.players.find(p => p.isWinner);
      if (winner) setTimeout(() => { setWinnerData({ name: winner.name, pot: state.pot, isHero: winner.id === myId }); setShowWinner(true); }, 900);
    }
    if (state.phase === 'WAITING') { setShowWinner(false); setWinnerData(null); }
    prevPhaseRef.current = state.phase;
  }, [state.phase, state.players, state.pot, myId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Opponent 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, padding: '8px 10px 4px', flexShrink: 0 }}>
        {gridOpps.map(opp => {
          if (opp.presence === 'reserved' || opp.presence === 'open') return <EmptyPanel key={opp.id} />;
          const seatNum = parseInt(opp.id.replace('p', ''), 10) || 1;
          return (
            <OpponentPanel key={opp.id} name={opp.name} chips={opp.chips} cardCount={opp.cards.length}
              status={opp.status} isActive={state.activePlayerId === opp.id} isWinner={!!opp.isWinner}
              isDealer={!!opp.isDealer} seatNum={seatNum} declaration={opp.declaration} />
          );
        })}
        {Array.from({ length: emptyCount }).map((_, i) => <EmptyPanel key={`e-${i}`} />)}
      </div>

      {/* Centre: phase + pot */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none', padding: '4px 0' }}>
        <motion.div key={state.phase} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          style={{ fontSize: 8, fontFamily: 'monospace', color: phaseColor(state.phase), letterSpacing: '0.22em', textTransform: 'uppercase', textShadow: `0 0 12px ${phaseColor(state.phase)}55` }}>
          {phaseLabel(state.phase)}
        </motion.div>
        {state.pot > 0 && <AnimatedPot pot={state.pot} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {me?.isDealer && (
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: `linear-gradient(135deg, ${YELLOW}, #b45309)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 700, color: '#000' }}>D</div>
          )}
          {state.activePlayerId === myId && state.phase !== 'WAITING' && state.phase !== 'DECLARE' && (
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.85, repeat: Infinity }}
              style={{ width: 5, height: 5, borderRadius: '50%', background: YELLOW }} />
          )}
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.06em', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
            {me?.name ?? 'You'}
          </span>
          {isDeclare && me?.declaration && me.declaration !== 'FOLD' && (
            <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', color: me.declaration === 'HIGH' ? YELLOW : BLUE, background: me.declaration === 'HIGH' ? yA(0.15) : bA(0.15), border: `1px solid ${me.declaration === 'HIGH' ? yA(0.4) : bA(0.4)}`, borderRadius: 4, padding: '2px 7px' }}>
              {me.declaration}
            </div>
          )}
        </div>
      </div>

      {/* Hero hand */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 8, flexShrink: 0 }}>
        {isDrawPhase && selectedCardIndices.length > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            style={{ marginBottom: 4, padding: '3px 12px', borderRadius: 20, background: rA(0.15), border: `1px solid ${rA(0.4)}`, fontSize: 9, fontFamily: 'monospace', color: RED, letterSpacing: '0.14em' }}>
            {selectedCardIndices.length} SELECTED · TAP DRAW
          </motion.div>
        )}
        {me && me.cards.length > 0 ? (
          <div style={{ opacity: heroIsLoser ? 0.55 : 1, transition: 'opacity 0.4s ease' }}>
            <CardHand
              cards={me.cards} selectedIndices={selectedCardIndices} onCardClick={onCardClick}
              isSelectable={isDrawPhase} dealingIndices={animState.dealingIndices}
              drawingIndices={animState.drawingIndices} discardingIndices={animState.discardingIndices}
              isShowdown={isShowdown} cardWidth={50} cardHeight={70}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 3, paddingTop: 16, paddingBottom: 6 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ width: 50, height: 70, borderRadius: 8, border: `1px dashed ${rA(0.15)}` }} />
            ))}
          </div>
        )}
        {isShowdown && heroEval && me?.status !== 'folded' && (
          <div style={{ marginTop: 3, fontSize: 9, fontFamily: 'monospace', color: heroIsWinner ? YELLOW : 'rgba(255,255,255,0.3)', fontWeight: heroIsWinner ? 700 : 400, letterSpacing: '0.08em', textAlign: 'center' }}>
            {heroEval.description}
          </div>
        )}
      </div>

      {winnerData && (
        <WinnerOverlay show={showWinner} winnerName={winnerData.name} potAmount={winnerData.pot}
          isHeroWinner={winnerData.isHero} onDone={() => setShowWinner(false)} />
      )}
    </div>
  );
}
