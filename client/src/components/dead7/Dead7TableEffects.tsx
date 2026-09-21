import type { GameState } from '@/lib/poker/types';
import {
  BadugiTableEffects,
  deriveBadugiVisualIntents,
  snapshotBadugiVisualState,
  type BadugiVisualIntent,
  type BadugiVisualTracker,
} from '../badugi/BadugiTableEffects';

export type Dead7VisualTracker = BadugiVisualTracker;
export type Dead7VisualIntent = BadugiVisualIntent;

export const snapshotDead7VisualState = snapshotBadugiVisualState;

export function deriveDead7AwardAmounts(
  baselineChips: Record<string, number>,
  state: GameState,
): Record<string, number> {
  return state.players.reduce<Record<string, number>>((awards, player) => {
    if (!player.isWinner) return awards;
    const amount = Math.max(0, player.chips - (baselineChips[player.id] ?? player.chips));
    if (amount > 0) awards[player.id] = amount;
    return awards;
  }, {});
}

export function deriveDead7VisualIntents(
  previous: Dead7VisualTracker | null,
  state: GameState,
): Dead7VisualIntent[] {
  return deriveBadugiVisualIntents(previous, state);
}

export function Dead7TableEffects({
  state,
  tableRoot,
}: {
  state: GameState;
  tableRoot: HTMLElement | null;
}) {
  return <BadugiTableEffects state={state} tableRoot={tableRoot} variant="dead7" />;
}