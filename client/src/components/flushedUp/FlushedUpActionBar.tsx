import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FlushedUpActionBarProps {
  phase: string;
  isDrawPhase: boolean;
  selectedCount: number;
  drawLimit: number;
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
  onStay: () => void;
  onDraw: () => void;
  onAction: (action: string, amount?: number | unknown) => void;
  onRebuy: () => void;
}

/* ─── Chip icon ──────────────────────────────────────────────────────────── */
function ChipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}>
      <circle cx="6" cy="6" r="5.5" fill="#7c3aed" stroke="#a855f7" strokeWidth="0.75"/>
      <circle cx="6" cy="6" r="3.5" fill="none" stroke="#c084fc" strokeWidth="0.75"/>
    </svg>
  );
}

/* ─── Tutorial panel ─────────────────────────────────────────────────────── */
function TutorialPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8,
        padding: '10px 4px 6px',
        borderTop: '1px solid rgba(124,58,237,0.18)',
      }}>
        {[
          { icon: '🎴', label: 'DRAW UP TO 3', sub: 'Cards per round' },
          { icon: '🗑', label: 'DISCARD ANY', sub: 'Tap to select' },
          { icon: '♠', label: 'GET THE MOST', sub: 'Best flush wins' },
        ].map(step => (
          <div key={step.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 18 }}>{step.icon}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#a855f7', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'center', lineHeight: 1.2 }}>
              {step.label}
            </span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.03em', textAlign: 'center' }}>
              {step.sub}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function FlushedUpActionBar({
  phase, isDrawPhase, selectedCount, isMyTurn,
  chips, currentBet, myBet, pot,
  ante, humanCount, openSeatsCount, activeCount, isClubTable, locked,
  onStay, onDraw, onAction, onRebuy,
}: FlushedUpActionBarProps) {
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // Auto-post ante when it's the player's turn — mirrors Controls.tsx behaviour.
  const autoAnteFired = useRef(false);
  useEffect(() => {
    if (phase !== 'ANTE') { autoAnteFired.current = false; return; }
    if (isMyTurn && !locked && !autoAnteFired.current) {
      autoAnteFired.current = true;
      onAction('ante');
    }
  }, [phase, isMyTurn, locked, onAction]);

  const canAct = isMyTurn && !locked;
  const callAmount = currentBet - myBet;
  const canCheck = callAmount === 0;
  const raiseAmount = Math.max(callAmount > 0 ? callAmount * 2 : 50, 50);

  const isBetPhase = phase.startsWith('BET_');
  const isWaiting = phase === 'WAITING';

  const btnBase: React.CSSProperties = {
    flex: 1,
    padding: '13px 8px',
    borderRadius: 12,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    border: 'none',
    transition: 'opacity 0.15s, transform 0.1s',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  const stayBtn: React.CSSProperties = {
    ...btnBase,
    background: 'rgba(20,12,40,0.9)',
    color: canAct ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)',
    border: '1px solid rgba(124,58,237,0.35)',
    opacity: canAct ? 1 : 0.5,
  };

  const drawBtn: React.CSSProperties = {
    ...btnBase,
    background: canAct
      ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
      : 'rgba(60,30,90,0.5)',
    color: canAct ? '#fff' : 'rgba(255,255,255,0.25)',
    boxShadow: canAct ? '0 0 18px rgba(124,58,237,0.5), 0 4px 12px rgba(0,0,0,0.4)' : 'none',
    opacity: (canAct && (selectedCount > 0 || true)) ? 1 : 0.5,
  };

  const foldBtn: React.CSSProperties = {
    ...btnBase,
    flex: 0.7,
    background: 'rgba(30,10,10,0.85)',
    color: canAct ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(200,50,50,0.25)',
    opacity: canAct ? 1 : 0.5,
  };

  const checkCallBtn: React.CSSProperties = {
    ...btnBase,
    background: canAct
      ? 'linear-gradient(135deg, #1a0a3d, #2d0f6e)'
      : 'rgba(20,10,35,0.5)',
    color: canAct ? '#c084fc' : 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(124,58,237,0.3)',
    boxShadow: canAct ? '0 0 10px rgba(124,58,237,0.25)' : 'none',
    opacity: canAct ? 1 : 0.5,
  };

  const raiseBtn: React.CSSProperties = {
    ...btnBase,
    flex: 0.9,
    background: canAct
      ? 'linear-gradient(135deg, #6d28d9, #9333ea)'
      : 'rgba(50,20,80,0.5)',
    color: canAct ? '#fff' : 'rgba(255,255,255,0.2)',
    boxShadow: canAct ? '0 0 14px rgba(124,58,237,0.4)' : 'none',
    opacity: canAct && chips > raiseAmount ? 1 : 0.4,
  };

  return (
    <div style={{ width: '100%' }}>
      {/* ── Action buttons ───────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px 0' }}>
        {/* Draw phase */}
        {isDrawPhase && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              style={stayBtn}
              disabled={!canAct}
              onClick={canAct ? onStay : undefined}
              data-testid="button-stay"
            >
              STAY
            </button>
            <button
              style={drawBtn}
              disabled={!canAct}
              onClick={canAct ? onDraw : undefined}
              data-testid="button-draw"
            >
              {selectedCount > 0 ? `DRAW ${selectedCount}` : 'DRAW'}
            </button>
          </div>
        )}

        {/* Bet phase */}
        {isBetPhase && isMyTurn && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={foldBtn}
              disabled={!canAct}
              onClick={canAct ? () => onAction('fold') : undefined}
              data-testid="button-fold"
            >
              FOLD
            </button>
            <button
              style={checkCallBtn}
              disabled={!canAct}
              onClick={canAct ? () => onAction(canCheck ? 'check' : 'call', canCheck ? 0 : callAmount) : undefined}
              data-testid={canCheck ? 'button-check' : 'button-call'}
            >
              {canCheck ? 'CHECK' : `CALL ${callAmount}`}
            </button>
            <button
              style={raiseBtn}
              disabled={!canAct || chips <= raiseAmount}
              onClick={(canAct && chips > raiseAmount) ? () => onAction('raise', raiseAmount) : undefined}
              data-testid="button-raise"
            >
              RAISE
            </button>
          </div>
        )}

        {/* Waiting phase */}
        {isWaiting && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingTop: 4 }}>
            <button
              disabled={activeCount < 2}
              onClick={activeCount >= 2 ? () => onAction('start') : undefined}
              data-testid="button-deal-me-in"
              style={{
                width: '100%',
                padding: '14px 8px',
                borderRadius: 12,
                fontSize: 15,
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: activeCount >= 2 ? 'pointer' : 'not-allowed',
                border: 'none',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                background: activeCount >= 2
                  ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                  : 'rgba(50,20,80,0.45)',
                color: activeCount >= 2 ? '#fff' : 'rgba(255,255,255,0.28)',
                boxShadow: activeCount >= 2
                  ? '0 0 24px rgba(124,58,237,0.6), 0 4px 16px rgba(0,0,0,0.4)'
                  : 'none',
                opacity: activeCount >= 2 ? 1 : 0.65,
                transition: 'all 0.2s',
              }}
            >
              {activeCount >= 2 ? 'DEAL ME IN' : 'NEED 1 MORE PLAYER'}
            </button>
            <div style={{
              textAlign: 'center',
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.6)',
              letterSpacing: '0.14em',
            }}>
              or wait for players to join
            </div>
          </div>
        )}

        {/* Non-action phases (ANTE, DEAL, SHOWDOWN) */}
        {!isDrawPhase && !isBetPhase && !isWaiting && (
          <div style={{
            textAlign: 'center', padding: '10px 0',
            fontSize: 11, fontFamily: 'monospace',
            color: 'rgba(124,58,237,0.7)', letterSpacing: '0.12em',
          }}>
            {phase === 'ANTE' ? 'POSTING ANTE...' : ''}
          </div>
        )}
      </div>

      {/* ── Tutorial toggle ───────────────────────────────────────────── */}
      <button
        onClick={() => setTutorialOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          width: '100%', padding: '6px 12px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(168,85,247,0.7)', fontSize: 11, fontFamily: 'monospace',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          WebkitTapHighlightColor: 'transparent',
        }}
        data-testid="button-tutorial-toggle"
      >
        <span style={{ fontSize: 11 }}>{tutorialOpen ? '▲' : '▼'}</span>
        HOW FLUSH RUSH WORKS
      </button>

      <AnimatePresence>
        {tutorialOpen && <TutorialPanel />}
      </AnimatePresence>

      {/* ── Stats bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 14px 10px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* ANTES */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>ANTES</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
            <ChipIcon />{ante}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />

        {/* PLAYERS */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>PLAYERS</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
            {humanCount}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />

        {/* YOUR STACK */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>YOUR STACK</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#a855f7', fontWeight: 700 }}>
            <ChipIcon />{chips.toLocaleString()}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />

        {/* Rebuy + */}
        <button
          onClick={onRebuy}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            border: 'none', cursor: 'pointer',
            color: '#fff', fontSize: 16, fontWeight: 700, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 10px rgba(124,58,237,0.4)',
            WebkitTapHighlightColor: 'transparent',
          }}
          data-testid="button-rebuy"
        >
          +
        </button>
      </div>
    </div>
  );
}
