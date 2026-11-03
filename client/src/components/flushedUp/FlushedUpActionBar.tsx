import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eraser, Layers3, Spade } from 'lucide-react';
import {
  createBettingContext, canRaiseTo, parseRaiseTo, suggestedRaiseTo,
  getCheckCallAction, getAllInAction,
} from '@/components/game/bettingMath';

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
  minBet: number;
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
      <circle cx="6" cy="6" r="5.5" fill="#86198F" stroke="#D946EF" strokeWidth="0.75"/>
      <circle cx="6" cy="6" r="3.5" fill="none" stroke="#F0ABFC" strokeWidth="0.75"/>
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
        borderTop: '1px solid rgba(217,70,239,0.3)',
      }}>
        {[
          { icon: <Layers3 size={18} />, label: 'DRAW UP TO 3', sub: 'Cards per round' },
          { icon: <Eraser size={18} />, label: 'DISCARD ANY', sub: 'Tap to select' },
          { icon: <Spade size={18} />, label: 'MOST OF ONE SUIT WINS', sub: 'Best flush-ish hand takes the pot — no flush required' },
        ].map(step => (
          <div key={step.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ color:'#D946EF' }}>{step.icon}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#D946EF', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'center', lineHeight: 1.2 }}>
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
  chips, currentBet, myBet, pot, minBet,
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
  const isBetPhase = phase.startsWith('BET_');

  // Bet-any-amount entry (Detroit 2026-10-25): Box Chevy-style, in the
  // bar — a slider plus an exact typed amount, replacing the shared
  // BettingControls popup for Flushed Up only. Legality comes from the
  // same bettingMath the shared component uses (raise-TO semantics:
  // min = current bet + min bet, max = the hero's whole stack), so the
  // amounts offered here are exactly the amounts the server accepts.
  // BettingControls itself is unmodified; Badugi still uses it.
  const betCtx = useMemo(
    () => createBettingContext({ currentBet, myBet, chips, pot, minBet }),
    [currentBet, myBet, chips, pot, minBet],
  );
  const [raiseText, setRaiseText] = useState('');
  useEffect(() => {
    if (isBetPhase) setRaiseText(String(suggestedRaiseTo(betCtx)));
    // Reset the dial whenever the betting situation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentBet, myBet, chips]);
  const raiseTo = parseRaiseTo(raiseText);
  const validRaise = canRaiseTo(raiseTo, betCtx);
  const canRaiseAtAll = betCtx.maxRaiseTo > betCtx.currentBet;
  const allIn = getAllInAction(betCtx);
  const isWaiting = phase === 'WAITING';
  const canStart = activeCount >= 2 && chips > 0;

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
    border: '1px solid rgba(217,70,239,0.35)',
    opacity: canAct ? 1 : 0.5,
  };

  const drawBtn: React.CSSProperties = {
    ...btnBase,
    background: canAct
      ? 'linear-gradient(135deg, #86198F, #D946EF)'
      : 'rgba(60,30,90,0.5)',
    color: canAct ? '#fff' : 'rgba(255,255,255,0.25)',
    boxShadow: canAct ? '0 0 18px rgba(217,70,239,0.5), 0 4px 12px rgba(0,0,0,0.4)' : 'none',
    opacity: (canAct && (selectedCount > 0 || true)) ? 1 : 0.5,
  };

  return (
    <div className="yard-action-bar" style={{ width: '100%' }}>
      {/* ── Action buttons ───────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px 0' }}>
        {/* Draw phase */}
        {isDrawPhase && (
          <div className="yard-action-buttons" style={{ display: 'flex', gap: 10 }}>
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
        {isBetPhase && chips <= 0 && isMyTurn && (
          <div data-testid="all-in-waiting" role="status" style={{ padding: '16px 12px', color: '#c084fc', fontFamily: 'monospace', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textAlign: 'center' }}>
            ALL IN · WAITING FOR THE HAND TO FINISH
          </div>
        )}
        {isBetPhase && chips > 0 && isMyTurn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {canRaiseAtAll && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(240,171,252,0.8)', letterSpacing: '0.1em' }}>
                    {currentBet > 0 ? 'RAISE TO' : 'BET AMOUNT'}
                  </span>
                  <span style={{ fontSize: 16, fontFamily: 'monospace', fontWeight: 800, color: '#FDE68A' }}>
                    ${raiseTo?.toLocaleString() ?? '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range"
                    min={Math.min(betCtx.minRaiseTo, betCtx.maxRaiseTo)}
                    max={betCtx.maxRaiseTo}
                    step={5}
                    value={raiseTo ?? betCtx.minRaiseTo}
                    onChange={e => setRaiseText(e.target.value)}
                    aria-label="Raise amount"
                    data-testid="input-raise-slider"
                    style={{ flex: 1, accentColor: '#D946EF' }}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={raiseText}
                    onChange={e => setRaiseText(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
                    aria-label="Exact raise amount"
                    data-testid="input-raise-amount"
                    style={{
                      width: 76, padding: '8px 6px', borderRadius: 8, textAlign: 'right',
                      background: 'rgba(20,12,40,0.9)', color: '#FDE68A',
                      border: '1px solid rgba(217,70,239,0.4)',
                      fontFamily: 'monospace', fontSize: 13, fontWeight: 700, outline: 'none',
                    }}
                  />
                </div>
              </>
            )}
            <div className="yard-action-buttons" style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ ...btnBase, background: 'rgba(20,12,40,0.9)', color: canAct ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)', border: '1px solid rgba(217,70,239,0.3)', opacity: canAct ? 1 : 0.5 }}
                disabled={!canAct}
                onClick={canAct ? () => onAction('fold') : undefined}
                data-testid="button-fold"
              >
                FOLD
              </button>
              <button
                style={{ ...btnBase, background: canAct ? 'linear-gradient(135deg, #86198F, #D946EF)' : 'rgba(60,30,90,0.5)', color: canAct ? '#fff' : 'rgba(255,255,255,0.25)', opacity: canAct ? 1 : 0.5 }}
                disabled={!canAct}
                onClick={canAct ? () => onAction(getCheckCallAction(betCtx)) : undefined}
                data-testid={betCtx.callAmount === 0 ? 'button-check' : 'button-call'}
              >
                {betCtx.callAmount === 0 ? 'CHECK' : `CALL $${betCtx.payableCall.toLocaleString()}`}
              </button>
              {canRaiseAtAll && (
                <button
                  style={{ ...btnBase, background: 'rgba(20,12,40,0.9)', color: '#F0ABFC', border: '1px solid rgba(217,70,239,0.6)', opacity: canAct && validRaise ? 1 : 0.45 }}
                  disabled={!canAct || !validRaise}
                  onClick={canAct && validRaise ? () => onAction('raise', raiseTo) : undefined}
                  data-testid="button-raise"
                >
                  {currentBet > 0 ? 'RAISE' : 'BET'} ${raiseTo?.toLocaleString() ?? '—'}
                </button>
              )}
              <button
                style={{ ...btnBase, background: 'linear-gradient(135deg,#4a0b0b,#991b1b)', color: '#fff', opacity: canAct ? 1 : 0.5 }}
                disabled={!canAct}
                onClick={canAct ? () => onAction(allIn.action, allIn.amount) : undefined}
                data-testid="button-all-in"
              >
                ALL IN
              </button>
            </div>
          </div>
        )}

        {/* Waiting phase */}
        {isWaiting && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingTop: 4 }}>
            <button
              disabled={!canStart}
              onClick={canStart ? () => onAction('start') : undefined}
              data-testid="button-deal-me-in"
              style={{
                width: '100%',
                padding: '10px 8px',
                borderRadius: 10,
                fontSize: 14,
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: canStart ? 'pointer' : 'not-allowed',
                border: 'none',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                background: canStart
                  ? 'linear-gradient(135deg, #86198F, #D946EF)'
                  : 'rgba(50,20,80,0.45)',
                color: canStart ? '#fff' : 'rgba(255,255,255,0.28)',
                boxShadow: canStart
                  ? '0 0 24px rgba(217,70,239,0.6), 0 4px 16px rgba(0,0,0,0.4)'
                  : 'none',
                opacity: canStart ? 1 : 0.65,
                transition: 'all 0.2s',
              }}
            >
              {chips <= 0 ? 'REBUY BEFORE STARTING' : canStart ? 'DEAL ME IN' : 'NEED 1 MORE PLAYER'}
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
            color: 'rgba(217,70,239,0.7)', letterSpacing: '0.12em',
          }}>
            {phase === 'ANTE' ? 'POSTING ANTE...' : ''}
          </div>
        )}
      </div>

    </div>
  );
}
