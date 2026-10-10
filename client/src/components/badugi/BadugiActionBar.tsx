/**
 * BadugiActionBar — action controls for Badugi.
 * Mirrors FlushedUpActionBar structure with gold (#C9A227) accent colour.
 * Draws: STAND PAT (draw with []) + DRAW N (draw selected).
 * Bets:  FOLD / CHECK-CALL / RAISE.
 * Auto-ante fires when it is the player's turn in the ANTE phase.
 */
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { BettingControls } from '../game/BettingControls';
import { Award, Layers3, Spade } from 'lucide-react';

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
  minBet: number;
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

export function BadugiActionBar({
  phase, isDrawPhase, selectedCount, isMyTurn,
  chips, currentBet, myBet, pot, minBet,
  ante, humanCount, openSeatsCount, activeCount, isClubTable, locked,
  myDeclaration, myHasActed,
  onStandPat, onDraw, onAction, onRebuy,
}: BadugiActionBarProps) {
  void openSeatsCount;

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
  const isBetPhase  = phase.startsWith('BET_');
  const isWaiting   = phase === 'WAITING';
  const isDeclare   = phase === 'DECLARE';
  const canStart = activeCount >= 2 && chips > 0;

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
  return (
    <div className="yard-action-bar" style={{ width: '100%' }}>
      <div style={{ padding: '8px 12px 0' }}>
        {/* Draw phase */}
        {isDrawPhase && (
          <div className="yard-action-buttons" style={{ display: 'flex', gap: 10 }}>
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
          <BettingControls
            isMyTurn={isMyTurn}
            locked={locked}
            chips={chips}
            currentBet={currentBet}
            myBet={myBet}
            pot={pot}
            minBet={minBet}
            onAction={onAction}
          />
        )}

        {/* Waiting phase */}
        {isWaiting && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingTop: 4 }}>
            <button disabled={!canStart} onClick={canStart ? () => onAction('start') : undefined}
              data-testid="button-deal-me-in"
              style={{
                width: 'auto', minWidth: 180, alignSelf: 'center', padding: '10px 28px', borderRadius: 20, fontSize: 13,
                fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                cursor: canStart ? 'pointer' : 'not-allowed', border: 'none', outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                background: canStart ? 'linear-gradient(135deg, #7a5500, #C9A227)' : 'rgba(50,36,0,0.45)',
                color: canStart ? '#fff' : 'rgba(255,255,255,0.28)',
                boxShadow: canStart ? `0 0 24px ${G(0.55)}, 0 4px 16px rgba(0,0,0,0.4)` : 'none',
                opacity: canStart ? 1 : 0.65, transition: 'all 0.2s',
              }}>
              {chips <= 0 ? 'REBUY BEFORE STARTING' : canStart ? 'DEAL ME IN' : 'NEED 1 MORE PLAYER'}
            </button>

          </div>
        )}

        {/* Declare phase — HIGH vs LOW */}
        {isDeclare && (
          !!myDeclaration ? (
            <div style={{ textAlign: 'center', padding: '14px 0 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: G(0.7), letterSpacing: '0.14em' }}>YOU DECLARED</div>
              <div style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.14em',
                color: myDeclaration === 'HIGH' ? '#C9A227' : 'rgba(255,255,255,0.6)',
                textShadow: myDeclaration === 'HIGH' ? `0 0 16px ${G(0.7)}` : 'none' }}>
                {myDeclaration ?? '—'}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>
                Waiting for other players…
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: G(0.7), letterSpacing: '0.12em', textAlign: 'center', paddingTop: 4 }}>
                DECLARE HIGH OR LOW
              </div>
              <div className="yard-action-buttons" style={{ display: 'flex', gap: 10 }}>
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
          <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, fontFamily: 'monospace', color: G(0.7), letterSpacing: '0.12em' }}>
            {phase === 'ANTE' ? 'POSTING ANTE...' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
