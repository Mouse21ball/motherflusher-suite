import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BadugiActionBar } from '../components/badugi/BadugiActionBar';
import { Dead7ActionBar } from '../components/dead7/Dead7ActionBar';
import { KamikazeActionBar } from '../components/kamikaze/KamikazeActionBar';

type Mode = 'dead7' | 'badugi' | 'kamikaze';
const modes: Array<{ id: Mode; label: string }> = [
  { id: 'dead7', label: 'Dead 7' },
  { id: 'badugi', label: 'Badugi' },
  { id: 'kamikaze', label: 'Kamikaze' },
];

export default function BettingControlsBrowserHarness() {
  const [mode, setMode] = useState<Mode>('dead7');
  const [currentBet, setCurrentBet] = useState(500);
  const [chips, setChips] = useState(1000);
  const [lastAction, setLastAction] = useState('');

  const onAction = (action: string, amount?: number | unknown) => {
    setLastAction(`${mode}:${action}${typeof amount === 'number' ? `:${amount}` : ''}`);
  };

  const common = {
    phase: 'BET_1',
    isDrawPhase: false,
    selectedCount: 0,
    drawLimit: 3,
    isMyTurn: true,
    chips,
    currentBet,
    myBet: 500,
    pot: 1000,
    minBet: 250,
    ante: 25,
    humanCount: 2,
    openSeatsCount: 0,
    activeCount: 2,
    isClubTable: false,
    locked: false,
    myDeclaration: null,
    myHasActed: false,
    onAction,
    onRebuy: () => {},
    onStandPat: () => {},
    onStay: () => {},
    onDraw: () => {},
  };

  return (
    <main style={{ width: '100%', minHeight: '100dvh', background: '#050505', color: '#fff', fontFamily: 'monospace' }}>
      <nav aria-label="Betting mode fixture" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4, padding: 4, boxSizing: 'border-box' }}>
        {modes.map(item => (
          <button key={item.id} type="button" data-testid={`select-mode-${item.id}`} onClick={() => setMode(item.id)}>
            {item.label}
          </button>
        ))}
        <button type="button" data-testid="set-call-state" onClick={() => setCurrentBet(600)}>Call state</button>
        <button type="button" data-testid="set-check-state" onClick={() => setCurrentBet(500)}>Check state</button>
        <button type="button" data-testid="set-zero-chips" onClick={() => setChips(0)}>All-in state</button>
        <button type="button" data-testid="set-funded-chips" onClick={() => setChips(1000)}>Funded state</button>
      </nav>
      <output data-testid="last-action" aria-live="polite">{lastAction}</output>
      <div style={{ width: '100%' }} data-mode={mode}>
        {mode === 'dead7' && (
          <Dead7ActionBar {...common} onStandPat={common.onStandPat} onDraw={common.onDraw} />
        )}
        {mode === 'badugi' && (
          <BadugiActionBar {...common} onStandPat={common.onStandPat} onDraw={common.onDraw} />
        )}
        {mode === 'kamikaze' && (
          <KamikazeActionBar {...common} onStay={common.onStay} onDraw={common.onDraw} />
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<BettingControlsBrowserHarness />);