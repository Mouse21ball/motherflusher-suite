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
      [0, 65, 130, 195, 260].forEach(d => setTimeout(() => sfx.dealSingle(), d));
    }

    if (phase === 'DRAW_1' || phase === 'DRAW_2' || phase === 'DRAW_3') {
      sfx.drawCards();
    }

    if (phase.startsWith('REVEAL') || phase === 'REVEAL_LOWER_CENTER') {
      sfx.reveal();
    }

    if (phase === 'SHOWDOWN') {
      [150, 260, 390].forEach(d => setTimeout(() => sfx.cardFlip(), d));
      if (isWinner) {
        setTimeout(() => sfx.bigWin(), 500);
      } else if (isLoser) {
        setTimeout(() => sfx.lose(), 400);
      }
    }

    if (phase === 'ANTE') {
      sfx.chipClink();
    }

    if (
      phase === 'BET_1' || phase === 'BET_2' || phase === 'BET_3' ||
      phase === 'BET_4' || phase === 'BET_5' || phase === 'BET_6' ||
      phase === 'BET_7' || phase === 'BET_8' || phase === 'DECLARE_AND_BET'
    ) {
      setTimeout(() => sfx.betPlace(), 80);
    }
  }, [phase]);
}
