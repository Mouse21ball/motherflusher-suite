import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const A = (a: number) => `rgba(217,119,6,${a})`;
const B = (a: number) => `rgba(59,130,246,${a})`;
const R = (a: number) => `rgba(239,68,68,${a})`;
const P = (a: number) => `rgba(168,85,247,${a})`;

interface BonecrusherActionBarProps {
  phase: string;
  isMyTurn: boolean;
  chips: number;
  currentBet: number;
  myBet: number;
  pot: number;
  ante: number;
  humanCount: number;
  openSeatsCount: number;
  activeCount: number;
  isClubTable: boolean;
  locked: boolean;
  selectedCards: Set<number>;
  flipCount: number;
  declaration?: string | null;
  myHasActed?: boolean;
  onDiscard: () => void;
  onFlip: () => void;
  onDeclare: (d: 'HIGH' | 'LOW' | 'SWING') => void;
  onAction: (action: string, amount?: number | unknown) => void;
  onRebuy: () => void;
}

function ChipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}>
      <circle cx="6" cy="6" r="5.5" fill="#1e1e1e" stroke="#d97706" strokeWidth="0.75"/>
      <circle cx="6" cy="6" r="3.5" fill="none" stroke="#b45309" strokeWidth="0.75"/>
    </svg>
  );
}

function TutorialPanel() {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '10px 4px 6px', borderTop: `1px solid ${A(0.2)}` }}>
        {[
          { icon: '🦴', label: '6 → 5 CARDS', sub: 'Discard 2, keep your best 5' },
          { icon: '↩️', label: '4-CARD FLIP', sub: 'Reveal rollback phase' },
          { icon: '⚡', label: 'HI/LO/SWING', sub: 'SWING must win both halves' },
        ].map(step => (
          <div key={step.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 18 }}>{step.icon}</span>
            <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#d97706', fontWeight: 700, letterSpacing: '0.1em', textAlign: 'center', lineHeight: 1.2 }}>{step.label}</span>
            <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textAlign: 'center' }}>{step.sub}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function BonecrusherActionBar({
  phase, isMyTurn, chips, currentBet, myBet, pot,
  ante, humanCount, openSeatsCount, activeCount, isClubTable, locked,
  selectedCards, flipCount, declaration, myHasActed,
  onDiscard, onFlip, onDeclare, onAction, onRebuy,
}: BonecrusherActionBarProps) {
  void pot; void openSeatsCount; void flipCount;

  const [tutorialOpen, setTutorialOpen] = useState(false);

  const autoAnteFired = useRef(false);
  useEffect(() => {
    if (phase !== 'ANTE') { autoAnteFired.current = false; return; }
    if (isMyTurn && !locked && !autoAnteFired.current) { autoAnteFired.current = true; onAction('ante'); }
  }, [phase, isMyTurn, locked, onAction]);

  const canAct     = isMyTurn && !locked;
  const callAmount = Math.max(0, currentBet - myBet);
  const canCheck   = callAmount === 0;
  const raiseAmount = Math.max(callAmount > 0 ? callAmount * 2 : 50, 50);
  const isBetPhase  = phase.startsWith('BET_');
  const isWaiting   = phase === 'WAITING';
  const isDeclare   = phase === 'DECLARE';
  const isDiscard   = phase === 'DISCARD_2' || phase === 'SELECT_5';
  const isFlip      = phase === 'REVEAL_1' || phase.startsWith('FLIP_');

  const base: React.CSSProperties = {
    flex: 1, padding: '13px 8px', borderRadius: 12, fontSize: 13,
    fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', cursor: 'pointer', border: 'none',
    transition: 'opacity 0.15s, transform 0.1s', outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  const foldBtn: React.CSSProperties = { ...base, flex: 0.7, background: 'rgba(12,12,12,0.9)', color: canAct ? 'rgba(255,100,100,0.9)' : 'rgba(255,255,255,0.2)', border: `1px solid ${R(0.2)}`, opacity: canAct ? 1 : 0.5 };
  const checkCallBtn: React.CSSProperties = { ...base, background: canAct ? 'linear-gradient(135deg, #1e3a5f, #1d4ed8)' : B(0.2), color: canAct ? '#93c5fd' : 'rgba(255,255,255,0.2)', border: `1px solid ${B(0.3)}`, boxShadow: canAct ? `0 0 10px ${B(0.25)}` : 'none', opacity: canAct ? 1 : 0.5 };
  const raiseBtn: React.CSSProperties = { ...base, flex: 0.9, background: canAct ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : B(0.2), color: canAct ? '#fff' : 'rgba(255,255,255,0.2)', boxShadow: canAct ? `0 0 14px ${B(0.4)}` : 'none', opacity: canAct && chips > raiseAmount ? 1 : 0.4 };

  const discardReady = phase === 'SELECT_5' ? selectedCards.size === 5 : selectedCards.size === 2;
  const discardBtn: React.CSSProperties = { ...base, background: canAct && discardReady ? 'linear-gradient(135deg, #991b1b, #ef4444)' : R(0.2), color: canAct && discardReady ? '#fff' : 'rgba(255,255,255,0.25)', boxShadow: canAct && discardReady ? `0 0 18px ${R(0.5)}, 0 4px 12px rgba(0,0,0,0.4)` : 'none' };
  const stayBtn: React.CSSProperties = { ...base, background: 'rgba(8,8,8,0.9)', color: canAct ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)', border: `1px solid ${A(0.35)}`, opacity: canAct ? 1 : 0.5 };
  const flipReady = selectedCards.size === 1;
  const flipBtn: React.CSSProperties = { ...base, background: canAct && flipReady ? `linear-gradient(135deg, #92400e, #d97706)` : A(0.2), color: canAct && flipReady ? '#000' : 'rgba(255,255,255,0.25)', boxShadow: canAct && flipReady ? `0 0 18px ${A(0.5)}, 0 4px 12px rgba(0,0,0,0.4)` : 'none' };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ padding: '8px 12px 0' }}>

        {/* DISCARD phase (DISCARD_2 or SELECT_5) */}
        {isDiscard && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={foldBtn} disabled={!canAct} onClick={canAct ? () => onAction('fold') : undefined} data-testid="button-fold">FOLD</button>
            <button style={discardBtn} disabled={!canAct || !discardReady} onClick={canAct && discardReady ? onDiscard : undefined} data-testid="button-discard">
              {discardReady
                ? (phase === 'DISCARD_2' ? 'DISCARD 2' : 'KEEP BEST 5')
                : `SELECT ${(phase === 'SELECT_5' ? 5 : 2) - selectedCards.size} MORE`}
            </button>
          </div>
        )}

        {/* FLIP / REVEAL phase */}
        {isFlip && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ ...stayBtn, flex: 0, padding: '13px 10px', fontSize: 10, letterSpacing: '0.08em', cursor: 'default', pointerEvents: 'none' }} data-testid="button-flip-label">
              {phase === 'REVEAL_1' ? 'REVEAL 1' : `FLIP ${phase.split('_')[1]} OF 4`}
            </button>
            <button style={flipBtn} disabled={!canAct || !flipReady} onClick={canAct && flipReady ? onFlip : undefined} data-testid="button-flip">
              {flipReady ? 'FLIP CARD' : 'SELECT CARD'}
            </button>
          </div>
        )}

        {/* BET phase */}
        {isBetPhase && isMyTurn && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={foldBtn} disabled={!canAct} onClick={canAct ? () => onAction('fold') : undefined} data-testid="button-fold">FOLD</button>
            <button style={checkCallBtn} disabled={!canAct} onClick={canAct ? () => onAction(canCheck ? 'check' : 'call', canCheck ? 0 : callAmount) : undefined} data-testid={canCheck ? 'button-check' : 'button-call'}>
              {canCheck ? 'CHECK' : `CALL ${callAmount}`}
            </button>
            <button style={raiseBtn} disabled={!canAct || chips <= raiseAmount} onClick={(canAct && chips > raiseAmount) ? () => onAction('raise', raiseAmount) : undefined} data-testid="button-raise">RAISE</button>
          </div>
        )}

        {/* DECLARE phase */}
        {isDeclare && (
          myHasActed ? (
            <div style={{ textAlign: 'center', padding: '14px 0 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: A(0.55), letterSpacing: '0.2em' }}>YOU DECLARED</div>
              <div style={{
                fontSize: 20, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em',
                color: declaration === 'HIGH' ? '#d97706' : declaration === 'LOW' ? '#3b82f6' : '#a855f7',
                textShadow: declaration === 'HIGH' ? `0 0 16px ${A(0.7)}` : declaration === 'LOW' ? `0 0 16px ${B(0.7)}` : `0 0 16px ${P(0.7)}`,
              }}>
                {declaration ?? '—'}
              </div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.14em' }}>Waiting for others…</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: A(0.8), letterSpacing: '0.22em', textAlign: 'center', paddingTop: 4 }}>DECLARE HIGH · LOW · SWING</div>
              <div style={{ display: 'flex', gap: 7 }}>
                <button onClick={() => onDeclare('HIGH')} data-testid="button-declare-high"
                  style={{ flex: 1, padding: '15px 8px', borderRadius: 12, fontSize: 14, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #92400e, #d97706)', color: '#000', boxShadow: `0 0 22px ${A(0.6)}, 0 4px 14px rgba(0,0,0,0.4)`, WebkitTapHighlightColor: 'transparent' }}>
                  HIGH
                </button>
                <button onClick={() => onDeclare('LOW')} data-testid="button-declare-low"
                  style={{ flex: 1, padding: '15px 8px', borderRadius: 12, fontSize: 14, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)', color: '#fff', boxShadow: `0 0 22px ${B(0.55)}, 0 4px 14px rgba(0,0,0,0.4)`, WebkitTapHighlightColor: 'transparent' }}>
                  LOW
                </button>
                <button onClick={() => onDeclare('SWING')} data-testid="button-declare-swing"
                  style={{ flex: 1, padding: '15px 8px', borderRadius: 12, fontSize: 14, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', background: 'linear-gradient(135deg, #6b21a8, #a855f7)', color: '#fff', boxShadow: `0 0 22px ${P(0.55)}, 0 4px 14px rgba(0,0,0,0.4)`, WebkitTapHighlightColor: 'transparent' }}>
                  SWING
                </button>
              </div>
              <button onClick={() => onAction('declare', { declaration: 'FOLD' })} data-testid="button-declare-fold"
                style={{ width: '100%', padding: '8px 0', borderRadius: 10, fontSize: 11, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', background: 'rgba(20,8,8,0.7)', color: 'rgba(255,100,100,0.6)', border: `1px solid ${R(0.15)}`, WebkitTapHighlightColor: 'transparent' }}>
                FOLD
              </button>
              <div style={{ fontSize: 8, fontFamily: 'monospace', color: P(0.55), letterSpacing: '0.1em', textAlign: 'center' }}>
                SWING = must win both HIGH &amp; LOW — or forfeit
              </div>
            </div>
          )
        )}

        {/* WAITING phase */}
        {isWaiting && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingTop: 4 }}>
            <button disabled={activeCount < 2} onClick={activeCount >= 2 ? () => onAction('start') : undefined} data-testid="button-deal-me-in"
              style={{ width: '100%', padding: '14px 8px', borderRadius: 12, fontSize: 15, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: activeCount >= 2 ? 'pointer' : 'not-allowed', border: 'none', outline: 'none', WebkitTapHighlightColor: 'transparent', background: activeCount >= 2 ? 'linear-gradient(135deg, #92400e, #d97706)' : A(0.2), color: activeCount >= 2 ? '#000' : 'rgba(255,255,255,0.28)', boxShadow: activeCount >= 2 ? `0 0 24px ${A(0.55)}, 0 4px 16px rgba(0,0,0,0.4)` : 'none', opacity: activeCount >= 2 ? 1 : 0.65 }}>
              {activeCount >= 2 ? 'DEAL ME IN' : 'NEED 1 MORE PLAYER'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.14em' }}>or wait for players to join</div>
          </div>
        )}

        {/* Non-action phases (ANTE auto-fires, STREET auto-deals) */}
        {!isDiscard && !isFlip && !isBetPhase && !isWaiting && !isDeclare && (
          <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 10, fontFamily: 'monospace', color: A(0.55), letterSpacing: '0.18em' }}>
            {phase === 'ANTE' ? 'POSTING ANTE...' : phase.startsWith('STREET_') ? `DEALING STREET ${phase.split('_')[1]}...` : ''}
          </div>
        )}
      </div>

      {/* Tutorial toggle */}
      <button onClick={() => setTutorialOpen(o => !o)} data-testid="button-tutorial-toggle"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', color: A(0.65), fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.16em', textTransform: 'uppercase', WebkitTapHighlightColor: 'transparent' }}>
        <span style={{ fontSize: 10 }}>{tutorialOpen ? '▲' : '▼'}</span>
        HOW BONECRUSHER WORKS
      </button>
      <AnimatePresence>{tutorialOpen && <TutorialPanel />}</AnimatePresence>

      {/* Stats bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px 10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em' }}>ANTES</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}><ChipIcon />{ante}</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em' }}>PLAYERS</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{humanCount}</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em' }}>YOUR STACK</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#d97706', fontWeight: 700 }}><ChipIcon />{chips.toLocaleString()}</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />
        <button onClick={onRebuy} data-testid="button-rebuy"
          style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #92400e, #d97706)', border: 'none', cursor: 'pointer', color: '#000', fontSize: 16, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 10px ${A(0.4)}`, WebkitTapHighlightColor: 'transparent' }}>
          +
        </button>
      </div>
    </div>
  );
}
