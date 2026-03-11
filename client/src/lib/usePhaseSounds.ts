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
      sfx.cardDeal();
      setTimeout(() => sfx.cardDeal(), 100);
      setTimeout(() => sfx.cardDeal(), 200);
    }

    if (phase.startsWith('REVEAL') || phase === 'REVEAL_LOWER_CENTER') {
      sfx.reveal();
    }

    if (phase === 'SHOWDOWN') {
      setTimeout(() => sfx.cardFlip(), 200);
    }

    if (phase === 'ANTE') {
      sfx.chipClink();
    }
  }, [phase]);
}
