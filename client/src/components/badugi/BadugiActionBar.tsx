/**
 * BadugiActionBar — action controls for Badugi.
 * Mirrors FlushedUpActionBar structure with gold (#C9A227) accent colour.
 * Draws: STAND PAT (draw with []) + DRAW N (draw selected).
 * Bets:  FOLD / CHECK-CALL / RAISE.
 * Auto-ante fires when it is the player's turn in the ANTE phase.
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const G = (a: number) => `rgba(201,162,39,${a})`;

interface BadugiActionBarProps {
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
  myDeclaration?: string | null;
  myHasActed?: boolean;
  onStandPat: () => void;
  onDraw: () => void;
  onAction: (action: string, amount?: number | unknown) => void;
  onRebuy: () => void;
}

function ChipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}>
      <circle cx="6" cy="6" r="5.5" fill="#8a6a00" stroke="#C9A227" strokeWidth="0.75"/>
      <circle cx="6" cy="6" r="3.5" fill="none" stroke="#D4B44A" strokeWidth="0.75"/>
    </svg>
  );
}

function TutorialPanel() {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}
      style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '10px 4px 6px', borderTop: `1px solid ${G(0.18)}` }}>
        {[
          { icon: '🎴', label: 'DRAW UP TO 3', sub: 'Cards per round' },
          { icon: '♠', label: 'ALL 4 SUITS', sub: '4-card Badugi wins' },
          { icon: '🏆', label: 'LOWEST HAND', sub: 'Badugi beats non-Badugi' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 18 }}>{s.icon}</span>
            <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#C9A227', fontWeight: 700, letterSpacing: '0.1em', textAlign: 'center', lineHeight: 1.2 }}>{s.label}</span>
            <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textAlign: 'center' }}>{s.sub}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function BadugiActionBar({
  phase, isDrawPhase, selectedCount, isMyTurn,
  chips, currentBet, myBet, pot,
  ante, humanCount, openSeatsCount, activeCount, isClubTable, locked,
  myDeclaration, myHasActed,
  onStandPat, onDraw, onAction, onRebuy,
}: BadugiActionBarProps) {
  void pot; void openSeatsCount;
  const [tutorialOpen, setTutorialOpen] = useState(false);

  /* Auto-ante: fire once per ANTE phase when it's the player's turn */
  const autoAnteFired = useRef(false);
  useEffect(() => {
    if (phase !== 'ANTE') { autoAnteFired.current = false; return; }
    if (isMyTurn && !locked && !autoAnteFired.current) {
      autoAnteFired.current = true;
      onAction('ante');
    }
  }, [phase, isMyTurn, locked, onAction]);

  const canAct      = isMyTurn && !locked;
  const callAmount  = currentBet - myBet;
  const canCheck    = callAmount === 0;
  const raiseAmount = Math.max(callAmount > 0 ? callAmount * 2 : 50, 50);
  const isBetPhase  = phase.startsWith('BET_');
  const isWaiting   = phase === 'WAITING';
  const isDeclare   = phase === 'DECLARE';

  const base: React.CSSProperties = {
    flex: 1, padding: '13px 8px', borderRadius: 12, fontSize: 13,
    fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', cursor: 'pointer', border: 'none',
    transition: 'opacity 0.15s, transform 0.1s', outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  const standPatBtn: React.CSSProperties = {
    ...base,
    background: 'rgba(20,14,0,0.9)', color: canAct ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)',
    border: `1px solid ${G(0.3)}`, opacity: canAct ? 1 : 0.5,
  };
  const drawBtn: React.CSSProperties = {
    ...base,
    background: canAct ? 'linear-gradient(135deg, #8a6a00, #C9A227)' : 'rgba(60,44,0,0.5)',
    color: canAct ? '#fff' : 'rgba(255,255,255,0.25)',
    boxShadow: canAct ? `0 0 18px ${G(0.45)}, 0 4px 12px rgba(0,0,0,0.4)` : 'none',
  };
  const foldBtn: React.CSSProperties = {
    ...base, flex: 0.7,
    background: 'rgba(30,10,10,0.85)', color: canAct ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(200,50,50,0.25)', opacity: canAct ? 1 : 0.5,
  };
  const checkCallBtn: React.CSSProperties = {
    ...base,
    background: canAct ? 'linear-gradient(135deg, #1c1200, #3a2800)' : 'rgba(20,14,0,0.5)',
    color: canAct ? '#D4B44A' : 'rgba(255,255,255,0.2)',
    border: `1px solid ${G(0.25)}`, boxShadow: canAct ? `0 0 10px ${G(0.2)}` : 'none',
    opacity: canAct ? 1 : 0.5,
  };
  const raiseBtn: React.CSSProperties = {
    ...base, flex: 0.9,
    background: canAct ? 'linear-gradient(135deg, #7a5500, #C9A227)' : 'rgba(50,36,0,0.5)',
    color: canAct ? '#fff' : 'rgba(255,255,255,0.2)',
    boxShadow: canAct ? `0 0 14px ${G(0.35)}` : 'none',
    opacity: canAct && chips > raiseAmount ? 1 : 0.4,
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ padding: '8px 12px 0' }}>
        {/* Draw phase */}
        {isDrawPhase && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={standPatBtn} disabled={!canAct} onClick={canAct ? onStandPat : undefined} data-testid="button-stand-pat">
              STAND PAT
            </button>
            <button style={drawBtn} disabled={!canAct} onClick={canAct ? onDraw : undefined} data-testid="button-draw">
              {selectedCount > 0 ? `DRAW ${selectedCount}` : 'DRAW'}
            </button>
          </div>
        )}

        {/* Bet phase */}
        {isBetPhase && isMyTurn && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={foldBtn} disabled={!canAct} onClick={canAct ? () => onAction('fold') : undefined} data-testid="button-fold">FOLD</button>
            <button style={checkCallBtn} disabled={!canAct}
              onClick={canAct ? () => onAction(canCheck ? 'check' : 'call', canCheck ? 0 : callAmount) : undefined}
              data-testid={canCheck ? 'button-check' : 'button-call'}>
              {canCheck ? 'CHECK' : `CALL ${callAmount}`}
            </button>
            <button style={raiseBtn} disabled={!canAct || chips <= raiseAmount}
              onClick={(canAct && chips > raiseAmount) ? () => onAction('raise', raiseAmount) : undefined}
              data-testid="button-raise">RAISE</button>
          </div>
        )}

        {/* Waiting phase */}
        {isWaiting && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingTop: 4 }}>
            <button disabled={activeCount < 2} onClick={activeCount >= 2 ? () => onAction('start') : undefined}
              data-testid="button-deal-me-in"
              style={{
                width: '100%', padding: '14px 8px', borderRadius: 12, fontSize: 15,
                fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                cursor: activeCount >= 2 ? 'pointer' : 'not-allowed', border: 'none', outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                background: activeCount >= 2 ? 'linear-gradient(135deg, #7a5500, #C9A227)' : 'rgba(50,36,0,0.45)',
                color: activeCount >= 2 ? '#fff' : 'rgba(255,255,255,0.28)',
                boxShadow: activeCount >= 2 ? `0 0 24px ${G(0.55)}, 0 4px 16px rgba(0,0,0,0.4)` : 'none',
                opacity: activeCount >= 2 ? 1 : 0.65, transition: 'all 0.2s',
              }}>
              {activeCount >= 2 ? 'DEAL ME IN' : 'NEED 1 MORE PLAYER'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.14em' }}>
              or wait for players to join
            </div>
          </div>
        )}

        {/* Declare phase — HIGH vs LOW */}
        {isDeclare && (
          !!myDeclaration ? (
            <div style={{ textAlign: 'center', padding: '14px 0 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: G(0.55), letterSpacing: '0.2em' }}>YOU DECLARED</div>
              <div style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em',
                color: myDeclaration === 'HIGH' ? '#C9A227' : 'rgba(255,255,255,0.6)',
                textShadow: myDeclaration === 'HIGH' ? `0 0 16px ${G(0.7)}` : 'none' }}>
                {myDeclaration ?? '—'}
              </div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.14em' }}>
                Waiting for other players…
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: G(0.7), letterSpacing: '0.22em', textAlign: 'center', paddingTop: 4 }}>
                DECLARE HIGH OR LOW
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => onAction('declare', { declaration: 'HIGH' })}
                  data-testid="button-declare-high"
                  style={{ flex: 1, padding: '16px 8px', borderRadius: 12, fontSize: 16, fontFamily: 'monospace', fontWeight: 900,
                    letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #7a5500, #C9A227)',
                    color: '#fff', boxShadow: `0 0 22px ${G(0.55)}, 0 4px 14px rgba(0,0,0,0.4)`,
                    WebkitTapHighlightColor: 'transparent' }}>
                  HIGH
                </button>
                <button
                  onClick={() => onAction('declare', { declaration: 'LOW' })}
                  data-testid="button-declare-low"
                  style={{ flex: 1, padding: '16px 8px', borderRadius: 12, fontSize: 16, fontFamily: 'monospace', fontWeight: 900,
                    letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
                    background: 'rgba(10,7,0,0.9)', color: 'rgba(255,255,255,0.75)',
                    border: `2px solid ${G(0.35)}`, boxShadow: `0 0 10px ${G(0.12)}`,
                    WebkitTapHighlightColor: 'transparent' }}>
                  LOW
                </button>
              </div>
              <button
                onClick={() => onAction('declare', { declaration: 'FOLD' })}
                data-testid="button-declare-fold"
                style={{ width: '100%', padding: '8px 0', borderRadius: 10, fontSize: 11, fontFamily: 'monospace',
                  fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
                  background: 'rgba(30,10,10,0.7)', color: 'rgba(255,100,100,0.6)',
                  border: '1px solid rgba(200,50,50,0.15)', WebkitTapHighlightColor: 'transparent' }}>
                FOLD
              </button>
            </div>
          )
        )}

        {/* Non-action phases */}
        {!isDrawPhase && !isBetPhase && !isWaiting && !isDeclare && (
          <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 10, fontFamily: 'monospace', color: G(0.5), letterSpacing: '0.18em' }}>
            {phase === 'ANTE' ? 'POSTING ANTE...' : ''}
          </div>
        )}
      </div>

      {/* Tutorial toggle */}
      <button onClick={() => setTutorialOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          width: '100%', padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer',
          color: G(0.6), fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.16em', textTransform: 'uppercase',
          WebkitTapHighlightColor: 'transparent' }}
        data-testid="button-tutorial-toggle">
        <span style={{ fontSize: 10 }}>{tutorialOpen ? '▲' : '▼'}</span>
        HOW BADUGI WORKS
      </button>

      <AnimatePresence>{tutorialOpen && <TutorialPanel />}</AnimatePresence>

      {/* Stats bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px 10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>ANTE</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}><ChipIcon />{ante}</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>PLAYERS</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{humanCount}</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>YOUR STACK</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#C9A227', fontWeight: 700 }}><ChipIcon />{chips.toLocaleString()}</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)' }} />
        <button onClick={onRebuy}
          style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #7a5500, #C9A227)',
            border: 'none', cursor: 'pointer', color: '#fff', fontSize: 16, fontWeight: 700, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 10px ${G(0.35)}`, WebkitTapHighlightColor: 'transparent' }}
          data-testid="button-rebuy">+</button>
      </div>
    </div>
  );
}
