import { motion, useSpring, useTransform } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import type { GameState } from '@shared/gameTypes';
import { PlayingCard } from '@/components/game/Card';
import { CardHand } from '@/components/flushedUp/CardHand';
import { WinnerOverlay } from '@/components/flushedUp/WinnerOverlay';
import { evaluateBonecrusher } from '@shared/modes/bonecrusher';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { getAvatarColor } from '@/lib/persistence';

/* ── Amber / Obsidian palette ──────────────────────────────────────────── */
const AMB  = '#d97706';
const BLUE = '#3b82f6';
const PURP = '#a855f7';
const GRN  = '#4ade80';
const aA = (a: number) => `rgba(217,119,6,${a})`;
const bA = (a: number) => `rgba(59,130,246,${a})`;

/* ── Phase label ─────────────────────────────────────────────────────── */
function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    WAITING:   'WAITING FOR PLAYERS',
    ANTE:      'POSTING ANTE',
    DEAL:      'DEALING',
    DISCARD_2: 'PRE-STREET · DISCARD 2',
    REVEAL_1:  'PRE-STREET · REVEAL 1',
    BET_1:     'FIRST BET',
    STREET_1:  'STREET 1',
    BET_2:     'SECOND BET',
    STREET_2:  'STREET 2',
    BET_3:     'THIRD BET',
    STREET_3:  'STREET 3',
    BET_4:     'FOURTH BET',
    SELECT_5:  'SELECT BEST 5 · DISCARD 2',
    FLIP_1:    'FLIP · CARD 1 OF 4',
    BET_5:     'FIFTH BET',
    FLIP_2:    'FLIP · CARD 2 OF 4',
    BET_6:     'SIXTH BET',
    FLIP_3:    'FLIP · CARD 3 OF 4',
    BET_7:     'SEVENTH BET',
    FLIP_4:    'FLIP · CARD 4 OF 4',
    BET_8:     'FINAL BET',
    DECLARE:   'DECLARE HIGH · LOW · SWING',
    SHOWDOWN:  'SHOWDOWN',
  };
  return map[phase] ?? phase.replace(/_/g, ' ');
}

function phaseColor(phase: string): string {
  if (phase === 'DECLARE')  return PURP;
  if (phase === 'DISCARD_2' || phase === 'SELECT_5') return '#ef4444';
  if (phase === 'REVEAL_1' || phase.startsWith('FLIP_')) return AMB;
  if (phase.startsWith('STREET_')) return GRN;
  if (phase.startsWith('BET_')) return BLUE;
  return 'rgba(255,255,255,0.5)';
}

/* ── Animated pot ─────────────────────────────────────────────────────── */
function AnimatedPot({ pot }: { pot: number }) {
  const spring  = useSpring(pot, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, v => Math.round(v).toLocaleString());
  useEffect(() => { spring.set(pot); }, [pot, spring]);
  return (
    <div style={{
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
      border: `1px solid ${aA(0.45)}`, boxShadow: `0 0 18px ${aA(0.15)}, 0 2px 12px rgba(0,0,0,0.6)`,
      textAlign: 'center', padding: '6px 22px', borderRadius: 50,
    }}>
      <div style={{ fontSize: 8, fontFamily: 'monospace', color: aA(0.7), letterSpacing: '0.22em' }}>POT</div>
      <motion.div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 800, color: '#fff', letterSpacing: '0.05em', display: 'inline-block' }}>
        {display}
      </motion.div>
    </div>
  );
}

/* ── Declaration badge helpers ───────────────────────────────────────── */
function declStyle(decl: string): { color: string; bg: string; border: string } {
  if (decl === 'HIGH')  return { color: AMB,  bg: aA(0.15), border: aA(0.4) };
  if (decl === 'LOW')   return { color: BLUE, bg: bA(0.15), border: bA(0.4) };
  return { color: PURP, bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.4)' };
}

/* ── Opponent panel ──────────────────────────────────────────────────── */
interface OppPanelProps {
  name: string; chips: number; cards: any[]; status: string;
  isActive: boolean; isWinner: boolean; isDealer: boolean; seatNum: number;
  declaration?: string | null;
}

function OpponentPanel({ name, chips, cards, status, isActive, isWinner, isDealer, seatNum, declaration }: OppPanelProps) {
  const isFolded  = status === 'folded';
  const avatarSrc = getAvatarForSeat(seatNum);
  const avatarBg  = getAvatarColor(name);
  const borderCol = isWinner ? AMB : isActive ? BLUE : 'rgba(255,255,255,0.07)';
  const glowCol   = isWinner ? aA(0.35) : isActive ? bA(0.2) : 'transparent';
  const db        = declaration && declaration !== 'FOLD' ? declStyle(declaration) : null;

  return (
    <div style={{
      background: isFolded ? 'rgba(5,3,0,0.55)' : isWinner ? 'rgba(20,10,0,0.72)' : 'rgba(0,0,0,0.40)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
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
                style={{ width: 5, height: 5, borderRadius: '50%', background: AMB, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: isFolded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
            {isDealer && (
              <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg, ${AMB}, #92400e)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 700, color: '#000' }}>D</div>
            )}
            {db && (
              <div style={{ fontSize: 7, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', color: db.color, background: db.bg, border: `1px solid ${db.border}`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                {declaration}
              </div>
            )}
          </div>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: aA(0.75), fontWeight: 600, marginTop: 1 }}>
            {chips.toLocaleString()}
          </div>
        </div>
      </div>
      {isFolded ? (
        <div style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.18em', textAlign: 'center' }}>FOLDED</div>
      ) : (
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'flex-end', flexWrap: 'nowrap' }}>
          {cards.length > 0 ? cards.map((card, i) =>
            card.isHidden ? (
              <div key={i} style={{ width: 13, height: 19, borderRadius: 2, flexShrink: 0, background: 'rgba(10,5,0,0.85)', border: `1px solid ${aA(0.3)}` }} />
            ) : (
              <div key={i} style={{ width: 28, height: 40, borderRadius: 4, flexShrink: 0, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
                <PlayingCard card={card} className="!w-full !h-full !rounded-none !shrink-0" />
              </div>
            )
          ) : Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ width: 13, height: 19, borderRadius: 2, flexShrink: 0, background: 'rgba(10,5,0,0.85)', border: `1px solid ${aA(0.35)}` }} />
          ))}
        </div>
      )}
      {isWinner && (
        <div style={{ fontSize: 7, fontFamily: 'monospace', color: AMB, letterSpacing: '0.18em', textAlign: 'center', fontWeight: 700 }}>★ WINNER</div>
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

/* ── Props ─────────────────────────────────────────────────────────────── */
interface BonecrusherTableProps {
  state: GameState;
  myId: string;
  selectedCards: Set<number>;
  onCardClick: (index: number) => void;
  phase: string;
  flippedByHero: Set<number>;
}

const CARD_W = 46;
const CARD_H = Math.round(CARD_W / 0.714);

/* ── Table ─────────────────────────────────────────────────────────────── */
export function BonecrusherTable({ state, myId, selectedCards, onCardClick, phase, flippedByHero }: BonecrusherTableProps) {
  const me         = state.players.find(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';
  const isDeclare  = state.phase === 'DECLARE';
  const isDiscardPhase = phase === 'DISCARD_2' || phase === 'SELECT_5';
  const isFlipPhase    = phase === 'REVEAL_1' || phase.startsWith('FLIP_');

  const heroEval = (isShowdown || isDeclare) && me && me.cards.length > 0
    ? evaluateBonecrusher(me.cards.map(c => ({ ...c, isHidden: false }))) : null;
  const heroIsWinner = !!me?.isWinner;
  const heroIsLoser  = isShowdown && !heroIsWinner && me?.status !== 'folded';

  const myIndex      = state.players.findIndex(p => p.id === myId);
  const reorderedOpps = [...state.players.slice(myIndex + 1), ...state.players.slice(0, myIndex)].filter(p => p.id !== myId);
  const gridOpps     = reorderedOpps.slice(0, 4);
  const emptyCount   = Math.max(0, 4 - gridOpps.length);

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

  const communityCards = state.communityCards ?? [];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Opponent 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, padding: '8px 10px 4px', flexShrink: 0 }}>
        {gridOpps.map(opp => {
          if (opp.presence === 'reserved' || opp.presence === 'open') return <EmptyPanel key={opp.id} />;
          const seatNum = parseInt(opp.id.replace('p', ''), 10) || 1;
          return (
            <OpponentPanel key={opp.id} name={opp.name} chips={opp.chips} cards={opp.cards}
              status={opp.status} isActive={state.activePlayerId === opp.id} isWinner={!!opp.isWinner}
              isDealer={!!opp.isDealer} seatNum={seatNum} declaration={opp.declaration} />
          );
        })}
        {Array.from({ length: emptyCount }).map((_, i) => <EmptyPanel key={`e-${i}`} />)}
      </div>

      {/* Community cards strip — shown during STREET phases and onward */}
      {communityCards.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, padding: '4px 0' }}>
          <div style={{ fontSize: 7, fontFamily: 'monospace', color: `rgba(74,222,128,0.6)`, letterSpacing: '0.2em', marginRight: 4 }}>BOARD</div>
          {communityCards.map((card, i) => (
            <motion.div key={i} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: i * 0.12, duration: 0.3 }}
              style={{ width: 32, height: 45, borderRadius: 4, overflow: 'hidden', border: `1px solid rgba(74,222,128,0.4)`, boxShadow: `0 0 8px rgba(74,222,128,0.15)` }}>
              <PlayingCard card={card} className="!w-full !h-full !rounded-none" />
            </motion.div>
          ))}
        </div>
      )}

      {/* Centre: phase label + pot */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none', padding: '4px 0' }}>
        <motion.div key={state.phase} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          style={{ fontSize: 8, fontFamily: 'monospace', color: phaseColor(state.phase), letterSpacing: '0.22em', textTransform: 'uppercase', textShadow: `0 0 12px ${phaseColor(state.phase)}55` }}>
          {phaseLabel(state.phase)}
        </motion.div>
        {state.pot > 0 && <AnimatedPot pot={state.pot} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {me?.isDealer && (
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: `linear-gradient(135deg, ${AMB}, #92400e)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 700, color: '#000' }}>D</div>
          )}
          {state.activePlayerId === myId && phase !== 'WAITING' && phase !== 'DECLARE' && (
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.85, repeat: Infinity }}
              style={{ width: 5, height: 5, borderRadius: '50%', background: AMB }} />
          )}
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.06em', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
            {me?.name ?? 'You'}
          </span>
          {isDeclare && me?.declaration && me.declaration !== 'FOLD' && (() => {
            const ds = declStyle(me.declaration);
            return (
              <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', color: ds.color, background: ds.bg, border: `1px solid ${ds.border}`, borderRadius: 4, padding: '2px 7px' }}>
                {me.declaration}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Hero hand */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 8, flexShrink: 0 }}>
        {isDiscardPhase && selectedCards.size > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            style={{ marginBottom: 4, padding: '3px 12px', borderRadius: 20, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', fontSize: 9, fontFamily: 'monospace', color: '#ef4444', letterSpacing: '0.14em' }}>
            {selectedCards.size} SELECTED · TAP {phase === 'DISCARD_2' ? 'DISCARD' : 'KEEP BEST 5'}
          </motion.div>
        )}
        {isFlipPhase && selectedCards.size > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            style={{ marginBottom: 4, padding: '3px 12px', borderRadius: 20, background: aA(0.15), border: `1px solid ${aA(0.4)}`, fontSize: 9, fontFamily: 'monospace', color: AMB, letterSpacing: '0.14em' }}>
            1 SELECTED · TAP FLIP
          </motion.div>
        )}

        {me && me.cards.length > 0 ? (
          <div style={{ opacity: heroIsLoser ? 0.55 : 1, transition: 'opacity 0.4s ease' }}>
            <CardHand
              cards={me.cards.map(c => ({ ...c, isHidden: false }))}
              selectedIndices={Array.from(selectedCards)}
              onCardClick={onCardClick}
              isSelectable={isDiscardPhase || isFlipPhase}
              dealingIndices={[]}
              drawingIndices={[]}
              discardingIndices={[]}
              isShowdown={isShowdown}
              cardWidth={CARD_W}
              cardHeight={CARD_H}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, paddingTop: 16, paddingBottom: 6 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ width: CARD_W, height: CARD_H, borderRadius: 7, border: `1px dashed ${aA(0.15)}` }} />
            ))}
          </div>
        )}

        {isShowdown && heroEval && me?.status !== 'folded' && (
          <div style={{ marginTop: 3, fontSize: 9, fontFamily: 'monospace', color: heroIsWinner ? AMB : 'rgba(255,255,255,0.3)', fontWeight: heroIsWinner ? 700 : 400, letterSpacing: '0.08em', textAlign: 'center' }}>
            {heroEval.highName} · {heroEval.lowDesc}
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
