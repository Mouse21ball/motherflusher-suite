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
  padding: '8px 7px',
  borderRadius: 10,
  border: '1px solid rgba(185,28,28,0.32)',
  background: 'rgba(30,10,10,0.86)',
  color: 'rgba(255,255,255,0.86)',
  fontFamily: 'monospace',
  fontSize: 12,
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

  useEffect(() => {
    setRaiseToText(String(suggestedRaiseTo(context)));
  }, [currentBet, myBet, chips, minBet]);

  const raiseTo = parseRaiseTo(raiseToText);
  const validRaise = canRaiseTo(raiseTo, context);
  const canAct = isMyTurn && !locked;
  const presets = getBetSizePresets(context);
  const sizeError = raiseTo === null
    ? 'Enter a whole-chip amount.'
    : raiseTo <= context.currentBet
      ? `Raise to more than ${context.currentBet}.`
      : raiseTo > context.maxRaiseTo
        ? `Your maximum is ${context.maxRaiseTo}.`
        : !validRaise
          ? `Minimum legal raise is ${context.minRaiseTo}.`
          : '';
  const allIn = getAllInAction(context);
  const callLabel = context.callAmount === 0
    ? 'CHECK'
    : context.callAmount > context.chips
      ? `CALL ALL-IN ${context.payableCall.toLocaleString()}`
      : `CALL ${context.payableCall.toLocaleString()}`;

  const actionButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: '100%',
    opacity: canAct ? 1 : 0.45,
  };

  if (context.chips <= 0) {
    return (
      <section
        data-testid="all-in-waiting"
        role="status"
        aria-label="All in"
        style={{
          width: '100%',
          padding: '16px 12px',
          boxSizing: 'border-box',
          color: '#C9A227',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '0.12em',
          textAlign: 'center',
        }}
      >
        ALL IN · WAITING FOR THE HAND TO FINISH
      </section>
    );
  }

  return (
    <section
      data-testid="betting-controls"
      aria-label="Betting controls"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        width: '100%',
        padding: '10px 12px 12px',
        boxSizing: 'border-box',
        color: '#fff',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
        <span>POT ${context.pot.toLocaleString()}</span>
        {context.callAmount > 0 && <span>TO CALL ${context.payableCall.toLocaleString()}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
        <button
          type="button"
          style={actionButtonStyle}
          disabled={!canAct}
          onClick={canAct ? () => onAction('fold') : undefined}
          data-testid="button-fold"
        >
          FOLD
        </button>
        <button
          type="button"
          style={{ ...actionButtonStyle, borderColor: 'rgba(185,28,28,0.46)', color: '#fca5a5' }}
          disabled={!canAct}
          onClick={canAct ? () => onAction(getCheckCallAction(context)) : undefined}
          data-testid={context.callAmount === 0 ? 'button-check' : 'button-call'}
        >
          {callLabel}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(92px, 0.85fr)', gap: 7, alignItems: 'stretch' }}>
        <label style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, fontSize: 10, lineHeight: 1.2, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.65)' }}>
          BET / RAISE TO
          <input
            type="number"
            min={context.minRaiseTo}
            max={context.maxRaiseTo}
            step={1}
            inputMode="numeric"
            aria-label="Bet or raise amount"
            data-testid="input-bet-amount"
            value={raiseToText}
            onChange={event => setRaiseToText(event.currentTarget.value)}
            style={{
              width: '100%',
              minWidth: 0,
              minHeight: 44,
              boxSizing: 'border-box',
              padding: '8px 10px',
              borderRadius: 9,
              border: `1px solid ${validRaise ? 'rgba(185,28,28,0.4)' : 'rgba(248,113,113,0.55)'}`,
              background: 'rgba(10,5,5,0.96)',
              color: '#fff',
              fontSize: 16,
              fontFamily: 'monospace',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
        </label>
        <button
          type="button"
          style={{
            ...buttonStyle,
            alignSelf: 'end',
            minHeight: 44,
            background: canAct && validRaise ? 'linear-gradient(135deg,#7a1010,#dc2626)' : 'rgba(50,10,10,0.5)',
            color: '#fff',
            opacity: canAct && validRaise ? 1 : 0.45,
          }}
          disabled={!canAct || !validRaise}
          onClick={canAct && validRaise ? () => onAction('raise', raiseTo) : undefined}
          data-testid="button-raise"
        >
          {context.currentBet > 0 ? 'RAISE' : 'BET'} TO ${raiseTo?.toLocaleString() ?? '—'}
        </button>
      </div>
      {!validRaise && (
        <div role="status" data-testid="bet-amount-error" style={{ minHeight: 14, fontSize: 11, color: '#fca5a5' }}>
          {sizeError}
        </div>
      )}
      {validRaise && (
        <div style={{ minHeight: 14, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
          Adds ${(raiseTo! - context.myBet).toLocaleString()} chips from your stack.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5 }}>
        {presets.map(preset => {
          const isSelected = preset.amount === raiseTo;
          const legal = canRaiseTo(preset.amount, context);
          return (
            <button
              key={preset.id}
              type="button"
              style={{
                ...buttonStyle,
                minHeight: 42,
                padding: '6px 2px',
                fontSize: 10,
                letterSpacing: '0.01em',
                background: isSelected ? 'rgba(185,28,28,0.28)' : 'rgba(18,8,8,0.8)',
                borderColor: isSelected ? 'rgba(248,113,113,0.72)' : 'rgba(255,255,255,0.12)',
                color: isSelected ? '#fff' : 'rgba(255,255,255,0.8)',
                opacity: canAct && legal ? 1 : 0.42,
              }}
              disabled={!canAct || !legal}
              onClick={() => setRaiseToText(String(preset.amount))}
              data-testid={`button-bet-${preset.id}`}
            >
              {preset.label}
              <span style={{ display: 'block', marginTop: 2, fontSize: 9, opacity: 0.75 }}>${preset.amount.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        style={{
          ...actionButtonStyle,
          background: 'linear-gradient(135deg,#4a0b0b,#991b1b)',
          borderColor: 'rgba(248,113,113,0.5)',
        }}
        disabled={!canAct || context.chips <= 0}
        onClick={canAct && context.chips > 0 ? () => onAction(allIn.action, allIn.amount) : undefined}
        data-testid="button-all-in"
      >
        ALL IN · ${context.chips.toLocaleString()}
      </button>
    </section>
  );
}