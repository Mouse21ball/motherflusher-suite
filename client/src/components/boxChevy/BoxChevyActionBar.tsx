import { useState, useEffect, useRef } from 'react';
import { CardType } from '@/lib/poker/types';
import { hasMadeHand } from '../../../../shared/modes/boxchevy';
import { motion, AnimatePresence } from 'framer-motion';

const B  = (a: number) => `rgba(59,130,246,${a})`;
const R  = (a: number) => `rgba(239,68,68,${a})`;
const G  = (a: number) => `rgba(134,239,172,${a})`;
const Am = (a: number) => `rgba(251,191,36,${a})`;
const Pr = (a: number) => `rgba(168,85,247,${a})`;

type Declaration = 'HIGH' | 'LOW' | 'SWING';

function ChipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}>
      <circle cx="6" cy="6" r="5.5" fill="#1e1e1e" stroke="#3b82f6" strokeWidth="0.75"/>
      <circle cx="6" cy="6" r="3.5" fill="none" stroke="#1d4ed8" strokeWidth="0.75"/>
    </svg>
  );
}

function TutorialPanel() {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '10px 4px 6px', borderTop: `1px solid ${B(0.2)}` }}>
        {[
          { icon: '🃏', label: '5 HOLE CARDS', sub: 'Plus 5 community cards' },
          { icon: '🔄', label: '3 DRAW ROUNDS', sub: '3→2→1 cards max' },
          { icon: '⚡', label: 'HI/LO/SWING', sub: 'SWING must win both' },
        ].map(step => (
          <div key={step.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 18 }}>{step.icon}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#60a5fa', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'center', lineHeight: 1.2 }}>{step.label}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.03em', textAlign: 'center' }}>{step.sub}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export interface BoxChevyActionBarProps {
  phase: string;
  isMyTurn: boolean;
  pot: number;
  currentBet: number;
  heroChips: number;
  heroBet: number;
  raisesThisRound: number;
  selectedCards: Set<number>;
  maxSelect: number;
  communityCards: CardType[];
  heroCards: CardType[];
  humanCount: number;
  declaration?: string | null;
  myHasActed?: boolean;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: (amt: number) => void;
  onDraw: () => void;
  onStandPat: () => void;
  onDeclare: (d: Declaration) => void;
  onAnte: () => void;
  onDeal: () => void;
  onRebuy: () => void;
  actionLocked?: boolean;
}

export function BoxChevyActionBar({
  phase, isMyTurn, pot, currentBet, heroChips, heroBet, raisesThisRound,
  selectedCards, maxSelect, communityCards, heroCards,
  humanCount, declaration, myHasActed,
  onFold, onCheck, onCall, onRaise, onDraw, onStandPat, onDeclare,
  onAnte, onDeal, onRebuy, actionLocked,
}: BoxChevyActionBarProps) {
  const [raiseAmt, setRaiseAmt] = useState(50);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  /* Auto-ante — fires silently, no button shown to hero */
  const autoAnteFired = useRef(false);
  useEffect(() => {
    if (phase !== 'ANTE') { autoAnteFired.current = false; return; }
    if (isMyTurn && !actionLocked && !autoAnteFired.current) {
      autoAnteFired.current = true;
      onAnte();
    }
  }, [phase, isMyTurn, actionLocked, onAnte]);

  const callAmt   = Math.max(0, currentBet - heroBet);
  const canCheck  = callAmt === 0;
  const maxRaises = 3;
  const canRaise  = raisesThisRound < maxRaises && heroChips > callAmt;

  const isDrawPhase = phase === 'DRAW_1' || phase === 'DRAW_2' || phase === 'DRAW_3';
  const isBetPhase  = phase.startsWith('BET_');
  const isWaiting   = phase === 'WAITING';
  const isDeclare   = phase === 'DECLARE';

  const heroC  = heroCards.map(c => ({ ...c, isHidden: false }));
  const commC  = communityCards.map(c => ({ ...c, isHidden: false }));
  const isMade = heroC.length > 0 && commC.length > 0 && hasMadeHand(heroC, commC);

  const canAct = isMyTurn && !actionLocked;

  const base: React.CSSProperties = {
    flex: 1, padding: '13px 8px', borderRadius: 12, fontSize: 13,
    fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', cursor: 'pointer', border: 'none',
    transition: 'opacity 0.15s', outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  const foldStyle: React.CSSProperties = {
    ...base, flex: 0.7,
    background: 'rgba(12,12,12,0.9)',
    color: canAct ? 'rgba(255,100,100,0.9)' : 'rgba(255,255,255,0.2)',
    border: `1px solid ${R(0.2)}`,
    opacity: canAct ? 1 : 0.5,
  };
  const checkCallStyle: React.CSSProperties = {
    ...base,
    background: canAct ? 'linear-gradient(135deg, #1e3a5f, #1d4ed8)' : B(0.2),
    color: canAct ? '#93c5fd' : 'rgba(255,255,255,0.2)',
    border: `1px solid ${B(0.3)}`,
    boxShadow: canAct ? `0 0 10px ${B(0.25)}` : 'none',
    opacity: canAct ? 1 : 0.5,
  };
  const raiseStyle: React.CSSProperties = {
    ...base, flex: 0.9,
    background: canAct && canRaise ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : B(0.2),
    color: canAct && canRaise ? '#fff' : 'rgba(255,255,255,0.2)',
    boxShadow: canAct && canRaise ? `0 0 14px ${B(0.4)}` : 'none',
    opacity: canAct && canRaise ? 1 : 0.4,
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ padding: '8px 12px 0' }}>

        {/* WAITING — Deal Me In */}
        {isWaiting && isMyTurn && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingTop: 4 }}>
            <button
              onClick={onDeal}
              data-testid="button-deal-me-in"
              style={{
                width: '100%', padding: '14px 8px', borderRadius: 12, fontSize: 15,
                fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                outline: 'none', WebkitTapHighlightColor: 'transparent',
                background: 'linear-gradient(135deg, #1e3a5f, #1d4ed8)',
                color: '#93c5fd',
                boxShadow: `0 0 24px ${B(0.55)}, 0 4px 16px rgba(0,0,0,0.4)`,
              }}
            >
              DEAL ME IN
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.14em' }}>
              or wait for players to join
            </div>
          </div>
        )}

        {/* ANTE — silent, auto-fires; show "POSTING ANTE…" */}
        {phase === 'ANTE' && (
          <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, fontFamily: 'monospace', color: B(0.7), letterSpacing: '0.12em' }}>
            POSTING ANTE…
          </div>
        )}

        {/* DRAW phases */}
        {isDrawPhase && isMyTurn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: 'rgba(148,163,184,0.7)',
              letterSpacing: '0.08em', textAlign: 'center',
            }}>
              DISCARD UP TO {maxSelect}&nbsp;
              <span style={{ color: selectedCards.size > 0 ? '#60a5fa' : 'rgba(255,255,255,0.3)' }}>
                [{selectedCards.size}/{maxSelect}]
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ ...base, flex: 0.7, background: 'rgba(12,12,12,0.9)', color: canAct ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)', border: `1px solid rgba(148,163,184,0.2)`, opacity: canAct ? 1 : 0.5 }}
                disabled={!canAct}
                onClick={canAct ? onStandPat : undefined}
                data-testid="button-stand-pat"
              >
                STAND PAT
              </button>
              <button
                style={{
                  ...base,
                  background: canAct && selectedCards.size > 0 ? 'linear-gradient(135deg, #1e3a5f, #1d4ed8)' : B(0.15),
                  color: canAct && selectedCards.size > 0 ? '#93c5fd' : 'rgba(255,255,255,0.25)',
                  boxShadow: canAct && selectedCards.size > 0 ? `0 0 14px ${B(0.4)}` : 'none',
                }}
                disabled={!canAct || selectedCards.size === 0}
                onClick={canAct && selectedCards.size > 0 ? onDraw : undefined}
                data-testid="button-draw"
              >
                {selectedCards.size === 0 ? 'SELECT CARDS' : `DRAW ${selectedCards.size}`}
              </button>
            </div>
          </div>
        )}

        {/* BET phases */}
        {isBetPhase && isMyTurn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: B(0.7), letterSpacing: '0.1em', textAlign: 'center', paddingTop: 2 }}>
              {phase.replace('_', ' ')} · RAISES {raisesThisRound}/{maxRaises}
            </div>
            {canRaise && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>RAISE $</span>
                <input
                  type="range"
                  min={50} max={Math.max(50, Math.min(500, heroChips - callAmt))} step={25}
                  value={raiseAmt}
                  onChange={e => setRaiseAmt(+e.target.value)}
                  data-testid="input-raise-amount"
                  style={{ flex: 1, accentColor: '#3b82f6' }}
                />
                <span style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace', minWidth: 36 }}>{raiseAmt}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={foldStyle} disabled={!canAct} onClick={canAct ? onFold : undefined} data-testid="button-fold">
                FOLD
              </button>
              <button
                style={checkCallStyle}
                disabled={!canAct}
                onClick={canAct ? (canCheck ? onCheck : onCall) : undefined}
                data-testid={canCheck ? 'button-check' : 'button-call'}
              >
                {canCheck ? 'CHECK' : `CALL ${callAmt}`}
              </button>
              {canRaise && (
                <button
                  style={raiseStyle}
                  disabled={!canAct || !canRaise}
                  onClick={canAct && canRaise ? () => onRaise(raiseAmt + callAmt) : undefined}
                  data-testid="button-raise"
                >
                  RAISE
                </button>
              )}
            </div>
          </div>
        )}

        {/* DECLARE phase */}
        {isDeclare && (
          myHasActed ? (
            <div style={{ textAlign: 'center', padding: '14px 0 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: B(0.7), letterSpacing: '0.14em' }}>YOU DECLARED</div>
              <div style={{
                fontSize: 20, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em',
                color: declaration === 'HIGH' ? '#60a5fa' : declaration === 'LOW' ? '#86efac' : '#fbbf24',
                textShadow: declaration === 'HIGH' ? `0 0 16px ${B(0.7)}` : declaration === 'LOW' ? `0 0 16px ${G(0.7)}` : `0 0 16px ${Am(0.7)}`,
              }}>
                {declaration ?? '—'}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>Waiting for others…</div>
            </div>
          ) : !isMade ? (
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, fontFamily: 'monospace', color: 'rgba(252,165,165,0.9)', letterSpacing: '0.06em' }}>
              ✗ NO MADE HAND — YOU WILL BE AUTO-FOLDED
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: B(0.8), letterSpacing: '0.12em', textAlign: 'center', paddingTop: 4 }}>
                DECLARE HIGH · LOW · SWING
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <button onClick={() => onDeclare('HIGH')} data-testid="button-declare-high"
                  style={{ flex: 1, padding: '15px 8px', borderRadius: 12, fontSize: 14, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #1e3a5f, #1d4ed8)', color: '#93c5fd', boxShadow: `0 0 22px ${B(0.6)}, 0 4px 14px rgba(0,0,0,0.4)`, WebkitTapHighlightColor: 'transparent' }}>
                  HIGH
                </button>
                <button onClick={() => onDeclare('LOW')} data-testid="button-declare-low"
                  style={{ flex: 1, padding: '15px 8px', borderRadius: 12, fontSize: 14, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', background: `linear-gradient(135deg, #064e3b, #10b981)`, color: '#fff', boxShadow: `0 0 22px ${G(0.55)}, 0 4px 14px rgba(0,0,0,0.4)`, WebkitTapHighlightColor: 'transparent' }}>
                  LOW
                </button>
                <button onClick={() => onDeclare('SWING')} data-testid="button-declare-swing"
                  style={{ flex: 1, padding: '15px 8px', borderRadius: 12, fontSize: 14, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', background: `linear-gradient(135deg, #6b21a8, #a855f7)`, color: '#fff', boxShadow: `0 0 22px ${Pr(0.55)}, 0 4px 14px rgba(0,0,0,0.4)`, WebkitTapHighlightColor: 'transparent' }}>
                  SWING
                </button>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: Pr(0.7), letterSpacing: '0.06em', textAlign: 'center' }}>
                SWING = must win both HIGH &amp; LOW — or forfeit
              </div>
            </div>
          )
        )}

        {/* Waiting for others (not your turn, not WAITING phase) */}
        {!isMyTurn && phase !== 'WAITING' && (
          <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em' }}>
            WAITING FOR OTHERS…
          </div>
        )}

      </div>

      {/* Tutorial toggle */}
      <button
        onClick={() => setTutorialOpen(o => !o)}
        data-testid="button-tutorial-toggle"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', color: B(0.7), fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', WebkitTapHighlightColor: 'transparent' }}
      >
        <span style={{ fontSize: 11 }}>{tutorialOpen ? '▲' : '▼'}</span>
        HOW BOX CHEVY WORKS
      </button>
      <AnimatePresence>{tutorialOpen && <TutorialPanel />}</AnimatePresence>

      {/* Stats bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px 10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>POT</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}><ChipIcon />{pot}</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>PLAYERS</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{humanCount}</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em' }}>YOUR STACK</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#60a5fa', fontWeight: 700 }}><ChipIcon />{heroChips.toLocaleString()}</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />
        <button
          onClick={onRebuy}
          data-testid="button-rebuy"
          style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #1e3a5f, #1d4ed8)', border: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: 16, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 10px ${B(0.4)}`, WebkitTapHighlightColor: 'transparent' }}
        >
          +
        </button>
      </div>
    </div>
  );
}
