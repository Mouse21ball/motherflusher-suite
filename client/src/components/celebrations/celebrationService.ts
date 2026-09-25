import { useEffect, useRef } from 'react';
import type { GameState } from '@shared/gameTypes';
import {
  deriveCelebration,
  snapshotForCelebrations,
  streaksAfterCelebration,
  type CelebrationEvent,
  type CelebrationSnapshot,
} from './celebrationEvents';

type Listener = (event: CelebrationEvent | null) => void;
const listeners = new Set<Listener>();

/** Presentation-only event channel; it does not write to or wait for game state. */
export function playCelebration(event: CelebrationEvent): void {
  for (const listener of listeners) listener(event);
}

export function dismissCelebration(): void {
  for (const listener of listeners) listener(null);
}

export function subscribeCelebrations(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Observes committed authoritative snapshots. No game mode resolves payouts here. */
export function useAuthoritativeCelebrations(state: GameState, modeId: string, messageType?: string | null): void {
  const previousRef = useRef<CelebrationSnapshot | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    // A changed seat order changes the geometry of an in-flight payout.
    const sameSeats = !previous || JSON.stringify(Object.keys(previous.players))
      === JSON.stringify(state.players.map(player => player.id));
    const isInit = messageType?.endsWith(':init') ?? false;
    const event = sameSeats ? deriveCelebration(previous, state, modeId, isInit ? 'init' : 'update') : null;
    // Never infer a streak across a reconnect, table change or changed seats.
    const streakBase = isInit || !sameSeats ? null : previous;
    previousRef.current = snapshotForCelebrations(state, streaksAfterCelebration(streakBase, state, event));
    if (isInit || !sameSeats || (previous && previous.tableId !== state.tableId)) dismissCelebration();
    if (previous?.phase === 'SHOWDOWN' && state.phase !== 'SHOWDOWN') dismissCelebration();
    if (event) playCelebration(event);
  }, [state, modeId, messageType]);

  useEffect(() => () => dismissCelebration(), []);
}