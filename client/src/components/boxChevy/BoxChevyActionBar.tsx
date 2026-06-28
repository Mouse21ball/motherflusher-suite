import { useState } from 'react';
import { CardType } from '@/lib/poker/types';
import { hasMadeHand } from '../../../../shared/modes/boxchevy';

const BLU  = '#3b82f6';
const ACT  = '#60a5fa';
const SLV  = '#94a3b8';
const nvA  = (a: number) => `rgba(15,28,46,${a})`;
const blA  = (a: number) => `rgba(59,130,246,${a})`;

type Declaration = 'HIGH' | 'LOW' | 'SWING';

interface Btn {
  label: string;
  sub?: string;
  color: string;
  bg: string;
  border: string;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
}

function ActionButton({ label, sub, color, bg, border, onClick, disabled, testId }: Btn) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        flex: 1, minWidth: 0,
        padding: '9px 6px',
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        color,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        fontFamily: 'monospace',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>{label}</span>
      {sub && <span style={{ fontSize: 9, opacity: 0.7, letterSpacing: '0.05em' }}>{sub}</span>}
    </button>
  );
}

interface BoxChevyActionBarProps {
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
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: () => void;
  onDraw: () => void;
  onStandPat: () => void;
  onDeclare: (d: Declaration) => void;
  onAnte: () => void;
  onDeal: () => void;
  actionLocked?: boolean;
}

export function BoxChevyActionBar({
  phase,
  isMyTurn,
  pot,
  currentBet,
  heroChips,
  heroBet,
  raisesThisRound,
  selectedCards,
  maxSelect,
  communityCards,
  heroCards,
  onFold,
  onCheck,
  onCall,
  onRaise,
  onDraw,
  onStandPat,
  onDeclare,
  onAnte,
  onDeal,
  actionLocked,
}: BoxChevyActionBarProps) {
  const [raiseAmt, setRaiseAmt] = useState(50);
  const callAmt   = Math.min(heroChips, currentBet - heroBet);
  const canCheck  = currentBet === heroBet;
  const maxRaises = 3;
  const canRaise  = raisesThisRound < maxRaises && heroChips > callAmt;
  const isDrawPhase = phase === 'DRAW_1' || phase === 'DRAW_2' || phase === 'DRAW_3';

  const heroC   = heroCards.map(c => ({ ...c, isHidden: false }));
  const commC   = communityCards.map(c => ({ ...c, isHidden: false }));
  const isMade  = heroC.length > 0 && commC.length > 0 && hasMadeHand(heroC, commC);

  if (!isMyTurn) {
    return (
      <div style={{
        padding: '10px 12px',
        borderTop: `1px solid ${nvA(0.8)}`,
        background: nvA(0.85),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 64,
      }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>
          WAITING FOR OTHERS…
        </span>
      </div>
    );
  }

  // ── WAITING ───────────────────────────────────────────────────────────────
  if (phase === 'WAITING') {
    return (
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${nvA(0.8)}`, background: nvA(0.85) }}>
        <button
          onClick={onDeal}
          data-testid="button-deal"
          style={{
            width: '100%', padding: '12px', borderRadius: 10,
            background: blA(0.2), border: `1px solid ${blA(0.5)}`,
            color: ACT, fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
            letterSpacing: '0.12em', cursor: 'pointer',
          }}
        >
          DEAL ME IN
        </button>
      </div>
    );
  }

  // ── ANTE ─────────────────────────────────────────────────────────────────
  if (phase === 'ANTE') {
    return (
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${nvA(0.8)}`, background: nvA(0.85) }}>
        <button
          onClick={onAnte}
          disabled={actionLocked}
          data-testid="button-ante"
          style={{
            width: '100%', padding: '12px', borderRadius: 10,
            background: blA(0.2), border: `1px solid ${blA(0.5)}`,
            color: ACT, fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
            letterSpacing: '0.12em', cursor: actionLocked ? 'default' : 'pointer',
            opacity: actionLocked ? 0.5 : 1,
          }}
        >
          POST ANTE — $25
        </button>
      </div>
    );
  }

  // ── DRAW phases ───────────────────────────────────────────────────────────
  if (isDrawPhase) {
    const nSelected = selectedCards.size;
    const drawLabel = nSelected === 0 ? 'STAND PAT' : `DRAW ${nSelected}`;
    const drawColor = nSelected === 0 ? SLV : ACT;
    const drawBg    = nSelected === 0 ? nvA(0.6) : blA(0.2);
    const drawBrd   = nSelected === 0 ? 'rgba(148,163,184,0.3)' : blA(0.5);
    const phaseLabel = phase === 'DRAW_1' ? 'UP TO 3' : phase === 'DRAW_2' ? 'UP TO 2' : 'UP TO 1';

    return (
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${nvA(0.8)}`, background: nvA(0.85) }}>
        <div style={{
          fontSize: 9, fontFamily: 'monospace', color: SLV, letterSpacing: '0.12em',
          textAlign: 'center', marginBottom: 6,
        }}>
          DISCARD {phaseLabel} CARDS&nbsp;
          <span style={{ color: nSelected > 0 ? ACT : 'rgba(255,255,255,0.3)' }}>
            [{nSelected}/{maxSelect}]
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {nSelected > 0 && (
            <ActionButton
              label="STAND PAT"
              sub="keep all"
              color={SLV} bg={nvA(0.6)} border="rgba(148,163,184,0.3)"
              onClick={onStandPat}
              testId="button-stand-pat"
              disabled={actionLocked}
            />
          )}
          <ActionButton
            label={drawLabel}
            sub={nSelected > 0 ? 'replace selected' : 'no discard'}
            color={drawColor} bg={drawBg} border={drawBrd}
            onClick={nSelected === 0 ? onStandPat : onDraw}
            testId="button-draw"
            disabled={actionLocked}
          />
        </div>
      </div>
    );
  }

  // ── DECLARE ───────────────────────────────────────────────────────────────
  if (phase === 'DECLARE') {
    if (!isMade) {
      return (
        <div style={{
          padding: '10px 12px', borderTop: `1px solid ${nvA(0.8)}`, background: nvA(0.85),
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          <div style={{
            fontSize: 10, fontFamily: 'monospace', color: '#fca5a5', letterSpacing: '0.08em',
          }}>
            ✗ NO MADE HAND — YOU WILL BE AUTO-FOLDED
          </div>
        </div>
      );
    }
    return (
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${nvA(0.8)}`, background: nvA(0.85) }}>
        <div style={{
          fontSize: 9, fontFamily: 'monospace', color: SLV, letterSpacing: '0.12em',
          textAlign: 'center', marginBottom: 6,
        }}>
          DECLARE YOUR SIDE
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <ActionButton
            label="HIGH"
            sub="best poker hand"
            color={ACT} bg={blA(0.18)} border={blA(0.5)}
            onClick={() => onDeclare('HIGH')}
            testId="button-declare-high"
            disabled={actionLocked}
          />
          <ActionButton
            label="LOW"
            sub="best lowball"
            color="#86efac" bg="rgba(134,239,172,0.12)" border="rgba(134,239,172,0.4)"
            onClick={() => onDeclare('LOW')}
            testId="button-declare-low"
            disabled={actionLocked}
          />
          <ActionButton
            label="SWING"
            sub="win both"
            color="#fbbf24" bg="rgba(251,191,36,0.12)" border="rgba(251,191,36,0.4)"
            onClick={() => onDeclare('SWING')}
            testId="button-declare-swing"
            disabled={actionLocked}
          />
        </div>
      </div>
    );
  }

  // ── BET phases ─────────────────────────────────────────────────────────────
  if (phase.startsWith('BET')) {
    return (
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${nvA(0.8)}`, background: nvA(0.85), display: 'flex', flexDirection: 'column', gap: 6 }}>
        {canRaise && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: SLV, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>RAISE $</span>
            <input
              type="range"
              min={50} max={Math.min(500, heroChips - callAmt)} step={25}
              value={raiseAmt}
              onChange={e => setRaiseAmt(+e.target.value)}
              data-testid="input-raise-amount"
              style={{ flex: 1, accentColor: BLU }}
            />
            <span style={{ fontSize: 11, color: ACT, fontFamily: 'monospace', minWidth: 36 }}>{raiseAmt}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <ActionButton
            label="FOLD"
            color="#f87171" bg="rgba(248,113,113,0.1)" border="rgba(248,113,113,0.3)"
            onClick={onFold}
            testId="button-fold"
            disabled={actionLocked}
          />
          {canCheck ? (
            <ActionButton
              label="CHECK"
              color={SLV} bg={nvA(0.6)} border="rgba(148,163,184,0.3)"
              onClick={onCheck}
              testId="button-check"
              disabled={actionLocked}
            />
          ) : (
            <ActionButton
              label="CALL"
              sub={`$${callAmt}`}
              color={ACT} bg={blA(0.18)} border={blA(0.4)}
              onClick={onCall}
              testId="button-call"
              disabled={actionLocked}
            />
          )}
          {canRaise && (
            <ActionButton
              label="RAISE"
              sub={`$${raiseAmt + callAmt}`}
              color="#fbbf24" bg="rgba(251,191,36,0.12)" border="rgba(251,191,36,0.35)"
              onClick={onRaise}
              testId="button-raise"
              disabled={actionLocked}
            />
          )}
        </div>
        <div style={{
          fontSize: 9, fontFamily: 'monospace', textAlign: 'center',
          color: `rgba(255,255,255,0.3)`,
        }}>
          POT ${pot} · BET ${currentBet} · RAISES {raisesThisRound}/{maxRaises}
        </div>
      </div>
    );
  }

  return null;
}
