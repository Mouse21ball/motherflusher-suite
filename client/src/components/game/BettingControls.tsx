import { useEffect, useMemo, useState } from 'react';
import {
  canRaiseTo,
  createBettingContext,
  getAllInAction,
  getBetSizePresets,
  getCheckCallAction,
  parseRaiseTo,
  suggestedRaiseTo,
} from './bettingMath';

interface BettingControlsProps {
  isMyTurn: boolean;
  locked: boolean;
  chips: number;
  currentBet: number;
  myBet: number;
  pot: number;
  minBet: number;
  onAction: (action: string, amount?: number | unknown) => void;
}

const buttonStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 44,
  padding: '6px 4px',
  borderRadius: 10,
  border: 'none',
  background: 'rgba(45,27,105,.55)',
  backdropFilter: 'blur(8px)',
  color: '#FDE68A',
  fontFamily: 'monospace',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

export function BettingControls({
  isMyTurn,
  locked,
  chips,
  currentBet,
  myBet,
  pot,
  minBet,
  onAction,
}: BettingControlsProps) {
  const context = useMemo(
    () => createBettingContext({ currentBet, myBet, chips, pot, minBet }),
    [currentBet, myBet, chips, pot, minBet],
  );
  const [raiseToText, setRaiseToText] = useState(() => String(suggestedRaiseTo(context)));
  const [raiseOpen, setRaiseOpen] = useState(false);

  useEffect(() => {
    setRaiseToText(String(suggestedRaiseTo(context)));
  }, [currentBet, myBet, chips, minBet]);

  const raiseTo = parseRaiseTo(raiseToText);
  const validRaise = canRaiseTo(raiseTo, context);
  const canAct = isMyTurn && !locked;
  const presets = getBetSizePresets(context);
  const allIn = getAllInAction(context);
  const callLabel = context.callAmount === 0
    ? 'CHECK'
    : context.callAmount > context.chips
      ? `CALL ${context.payableCall.toLocaleString()}`
      : `CALL ${context.payableCall.toLocaleString()}`;

  const actionStyle: React.CSSProperties = {
    ...buttonStyle,
    width: '100%',
    opacity: canAct ? 1 : 0.45,
  };

  if (context.chips <= 0) {
    return (
      <section data-testid="all-in-waiting" role="status" aria-label="All in"
        style={{ width: '100%', padding: '12px', boxSizing: 'border-box', color: '#C9A227',
          fontFamily: 'monospace', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textAlign: 'center' }}>
        ALL IN · WAITING
      </section>
    );
  }

  return (
    <section data-testid="betting-controls" aria-label="Betting controls"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%',
        padding: '6px 8px', boxSizing: 'border-box', color: '#fff', fontFamily: 'monospace', position: 'relative' }}>

      {/* Pot info — compact single line */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
        <span>POT ${context.pot.toLocaleString()}</span>
        {context.callAmount > 0 && <span>TO CALL ${context.payableCall.toLocaleString()}</span>}
      </div>

      {/* One-line action row: FOLD | CHECK/CALL | RAISE | ALL IN */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
        <button type="button" style={actionStyle} disabled={!canAct}
          onClick={canAct ? () => onAction('fold') : undefined} data-testid="button-fold">
          FOLD
        </button>
        <button type="button" style={{ ...actionStyle, color: '#fca5a5' }} disabled={!canAct}
          onClick={canAct ? () => onAction(getCheckCallAction(context)) : undefined}
          data-testid={context.callAmount === 0 ? 'button-check' : 'button-call'}>
          {callLabel}
        </button>
        <button type="button"
          style={{ ...actionStyle, background: 'linear-gradient(135deg,#7a1010,#dc2626)', color: '#fff' }}
          disabled={!canAct} onClick={canAct ? () => setRaiseOpen(v => !v) : undefined}
          data-testid="button-raise-toggle">
          RAISE
        </button>
        <button type="button"
          style={{ ...actionStyle, background: 'linear-gradient(135deg,#4a0b0b,#991b1b)' }}
          disabled={!canAct || context.chips <= 0}
          onClick={canAct && context.chips > 0 ? () => onAction(allIn.action, allIn.amount) : undefined}
          data-testid="button-all-in">
          ALL IN
        </button>
      </div>

      {/* Raise popup — slider + presets + confirm */}
      {raiseOpen && canAct && (
        <div data-testid="raise-popup"
          style={{ position: 'absolute', bottom: '100%', left: 8, right: 8, marginBottom: 6,
            background: 'rgba(21,10,46,.96)', backdropFilter: 'blur(16px)',
            borderRadius: 14, padding: '12px', zIndex: 50,
            boxShadow: '0 -4px 24px rgba(0,0,0,.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.08em', color: '#C4B5FD' }}>
              {context.currentBet > 0 ? 'RAISE TO' : 'BET'}
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#FDE68A' }}>
              ${raiseTo?.toLocaleString() ?? '—'}
            </span>
          </div>
          {/* Slider for precise amount */}
          <input type="range" min={context.minRaiseTo} max={context.maxRaiseTo} step={1}
            value={raiseTo ?? context.minRaiseTo}
            onChange={e => setRaiseToText(e.target.value)}
            aria-label="Raise amount"
            data-testid="input-raise-slider"
            style={{ width: '100%', marginBottom: 10, accentColor: '#F59E0B' }} />
          {/* Quick presets */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 10 }}>
            {presets.map(preset => {
              const isSelected = preset.amount === raiseTo;
              const legal = canRaiseTo(preset.amount, context);
              return (
                <button key={preset.id} type="button"
                  style={{ ...buttonStyle, minHeight: 36, fontSize: 11,
                    background: isSelected ? 'rgba(245,158,11,.3)' : 'rgba(45,27,105,.5)',
                    opacity: legal ? 1 : 0.4 }}
                  disabled={!legal} onClick={() => setRaiseToText(String(preset.amount))}
                  data-testid={`button-bet-${preset.id}`}>
                  {preset.label}
                </button>
              );
            })}
          </div>
          {/* Confirm / cancel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 6 }}>
            <button type="button" style={{ ...buttonStyle, minHeight: 40 }}
              onClick={() => setRaiseOpen(false)} data-testid="button-raise-cancel">
              CANCEL
            </button>
            <button type="button"
              style={{ ...buttonStyle, minHeight: 40,
                background: validRaise ? 'linear-gradient(135deg,#7a1010,#dc2626)' : 'rgba(50,10,10,.5)',
                color: '#fff', opacity: validRaise ? 1 : 0.45 }}
              disabled={!validRaise}
              onClick={validRaise ? () => { onAction('raise', raiseTo); setRaiseOpen(false); } : undefined}
              data-testid="button-raise-confirm">
              {context.currentBet > 0 ? 'RAISE' : 'BET'} ${raiseTo?.toLocaleString() ?? '—'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
