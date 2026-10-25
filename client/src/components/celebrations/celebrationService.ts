import { useEffect, useRef } from 'react';
import type { GameState } from '@shared/gameTypes';
import {
  deriveCelebration,
  snapshotForCelebrations,
  type CelebrationEvent,
  type CelebrationSnapshot,
} from './celebrationEvents';

type Listener = (event: CelebrationEvent | null) => void;
const listeners = new Set<Listener>();
const completionListeners = new Set<(event: CelebrationEvent) => void>();
export interface TableActivity { tableId: string; phase: string }
const activityListeners = new Set<(activity: TableActivity | null) => void>();
let latestActivity: TableActivity | null = null;

export function subscribeCelebrationCompletions(listener: (event: CelebrationEvent) => void): () => void {
  completionListeners.add(listener);
  return () => { completionListeners.delete(listener); };
}

export function completeCelebration(event: CelebrationEvent): void {
  for (const listener of completionListeners) listener(event);
}

export function currentTableActivity(): TableActivity | null {
  return latestActivity;
}

export function subscribeTableActivity(listener: (activity: TableActivity | null) => void): () => void {
  activityListeners.add(listener);
  return () => { activityListeners.delete(listener); };
}

function publishTableActivity(activity: TableActivity | null): void {
  latestActivity = activity;
  for (const listener of activityListeners) listener(activity);
}

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
// Modes whose tables own the complete winner moment themselves (winner
// name, amount, and the winning hand, inside the table). The global host
// must not fire for them: in Flushed Up both systems celebrated the same
// showdown — the host's fixed full-viewport "BIG POT" title sits across
// the top pods while the table's own WINNER overlay runs — which
// Detroit's Galaxy QA flagged as a P1 visual failure (2026-10-21).
const TABLE_OWNED_CELEBRATION_MODES = new Set(['flushed_up']);

export function useAuthoritativeCelebrations(state: GameState, modeId: string, messageType?: string | null): void {
  const previousRef = useRef<CelebrationSnapshot | null>(null);

  useEffect(() => {
    publishTableActivity({ tableId: state.tableId, phase: state.phase });
    if (TABLE_OWNED_CELEBRATION_MODES.has(modeId)) {
      previousRef.current = snapshotForCelebrations(state);
      return;
    }
    const previous = previousRef.current;
    // A changed seat order changes the geometry of an in-flight payout.
    const sameSeats = !previous || JSON.stringify(Object.keys(previous.players))
      === JSON.stringify(state.players.map(player => player.id));
    const isInit = messageType?.endsWith(':init') ?? false;
    const event = sameSeats ? deriveCelebration(previous, state, modeId, isInit ? 'init' : 'update') : null;
    previousRef.current = snapshotForCelebrations(state);
    if (isInit || !sameSeats || (previous && previous.tableId !== state.tableId)) dismissCelebration();
    if (previous?.phase === 'SHOWDOWN' && state.phase !== 'SHOWDOWN') dismissCelebration();
    if (event) playCelebration(event);
  }, [state, modeId, messageType]);

  useEffect(() => () => {
    dismissCelebration();
    publishTableActivity(null);
  }, []);
}