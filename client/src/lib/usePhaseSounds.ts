import { useEffect, useRef } from 'react';
import { GamePhase } from './poker/types';
import { sfx } from './sounds';

export function usePhaseSounds(phase: GamePhase, isWinner?: boolean, isLoser?: boolean) {
  const prevPhaseRef = useRef<GamePhase>(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (prev === phase) return;

    if (phase === 'DEAL') {
      [0, 80, 160, 240, 320].forEach(d => setTimeout(() => sfx.cardDeal(), d));
    }

    if (phase.startsWith('REVEAL') || phase === 'REVEAL_LOWER_CENTER') {
      sfx.reveal();
    }

    if (phase === 'SHOWDOWN') {
      [200, 320, 460].forEach(d => setTimeout(() => sfx.cardFlip(), d));
    }

    if (phase === 'ANTE') {
      sfx.chipClink();
    }
  }, [phase]);
}
