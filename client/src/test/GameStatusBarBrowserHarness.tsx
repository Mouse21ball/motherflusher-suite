import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameStatusBar } from '@/components/game/GameStatusBar';
import { ServerProfileProvider } from '@/lib/useServerProfile';
import type { GamePhase, GameState } from '@/lib/poker/types';

function Harness() {
  const [phase, setPhase] = useState<GamePhase>('WAITING');
  const [location, setLocation] = useState('/table');
  const [leaveCalls, setLeaveCalls] = useState(0);
  const resolveLeave = useRef<(() => void) | null>(null);
  const rejectLeave = useRef<((error: Error) => void) | null>(null);

  useEffect(() => {
    const complete = () => resolveLeave.current?.();
    const reject = () => rejectLeave.current?.(new Error('Balance save failed'));
    window.addEventListener('qa:complete-leave', complete);
    window.addEventListener('qa:reject-leave', reject);
    return () => {
      window.removeEventListener('qa:complete-leave', complete);
      window.removeEventListener('qa:reject-leave', reject);
    };
  }, []);

  const gameState = {
    players: [],
    pot: 500,
    minBet: 25,
    phase,
  } as unknown as GameState;

  const leaveAndSettle = () => {
    setLeaveCalls(count => count + 1);
    return new Promise<void>((resolve, reject) => {
      resolveLeave.current = resolve;
      rejectLeave.current = reject;
    }).then(() => setLocation('/'));
  };

  return (
    <main style={{ minHeight: '100vh', background: '#111', paddingTop: 80 }}>
      <output data-testid="route">{location}</output>
      <output data-testid="leave-calls">{leaveCalls}</output>
      <button data-testid="use-waiting-phase" onClick={() => setPhase('WAITING')}>Waiting phase</button>
      <button data-testid="use-betting-phase" onClick={() => setPhase('BET_1')}>Betting phase</button>
      <GameStatusBar
        modeId="badugi"
        gameState={gameState}
        chips={500}
        phase={phase}
        onLeave={leaveAndSettle}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <ServerProfileProvider>
    <Harness />
  </ServerProfileProvider>,
);