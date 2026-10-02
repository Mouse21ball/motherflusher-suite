import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocation } from 'wouter';
import { GameStatusBar } from '@/components/game/GameStatusBar';
import { ServerProfileProvider } from '@/lib/useServerProfile';
import type { GamePhase, GameState } from '@/lib/poker/types';

function Harness() {
  const [phase, setPhase] = useState<GamePhase>('WAITING');
  const [location] = useLocation();
  const [leaveCalls, setLeaveCalls] = useState(0);
  const [forfeitCalls, setForfeitCalls] = useState(0);
  const resolveLeave = useRef<(() => void) | null>(null);
  const rejectLeave = useRef<((error: Error) => void) | null>(null);
  const resolveForfeit = useRef<(() => void) | null>(null);
  const rejectForfeit = useRef<((error: Error) => void) | null>(null);
  const hangLeave = useRef(false);
  const hangForfeit = useRef(false);

  useEffect(() => {
    const complete = () => resolveLeave.current?.();
    const reject = () => rejectLeave.current?.(new Error('Balance save failed'));
    const completeForfeit = () => resolveForfeit.current?.();
    const rejectForfeitCall = () => rejectForfeit.current?.(new Error('Forfeit acknowledgement failed'));
    const configureHang = (event: Event) => {
      const detail = (event as CustomEvent<{ leave?: boolean; forfeit?: boolean }>).detail;
      hangLeave.current = !!detail?.leave;
      hangForfeit.current = !!detail?.forfeit;
    };
    window.addEventListener('qa:complete-leave', complete);
    window.addEventListener('qa:reject-leave', reject);
    window.addEventListener('qa:complete-forfeit', completeForfeit);
    window.addEventListener('qa:reject-forfeit', rejectForfeitCall);
    window.addEventListener('qa:set-hanging', configureHang);
    return () => {
      window.removeEventListener('qa:complete-leave', complete);
      window.removeEventListener('qa:reject-leave', reject);
      window.removeEventListener('qa:complete-forfeit', completeForfeit);
      window.removeEventListener('qa:reject-forfeit', rejectForfeitCall);
      window.removeEventListener('qa:set-hanging', configureHang);
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
    if (hangLeave.current) return new Promise<void>(() => {});
    return new Promise<void>((resolve, reject) => {
      resolveLeave.current = resolve;
      rejectLeave.current = reject;
    });
  };
  const forfeitAndSettle = () => {
    setForfeitCalls(count => count + 1);
    if (hangForfeit.current) return new Promise<void>(() => {});
    return new Promise<void>((resolve, reject) => {
      resolveForfeit.current = resolve;
      rejectForfeit.current = reject;
    });
  };
  const displayedLocation = location === '/game-status-bar-test.html' ? '/table' : location;

  return (
    <main style={{ minHeight: '100vh', background: '#111', paddingTop: 80 }}>
      <output data-testid="route">{displayedLocation}</output>
      <output data-testid="leave-calls">{leaveCalls}</output>
      <output data-testid="forfeit-calls">{forfeitCalls}</output>
      <button data-testid="use-waiting-phase" onClick={() => setPhase('WAITING')}>Waiting phase</button>
      <button data-testid="use-betting-phase" onClick={() => setPhase('BET_1')}>Betting phase</button>
      <GameStatusBar
        modeId="badugi"
        gameState={gameState}
        chips={500}
        phase={phase}
        onForfeit={forfeitAndSettle}
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