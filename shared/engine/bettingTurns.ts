import type { Player } from '../gameTypes';

/** A betting cursor must never fall back to an all-in or already-finished seat. */
export function actionableBettingPlayerId(
  players: Player[],
  currentBet: number,
  activePlayerId: string | null | undefined,
): string | null {
  const start = Math.max(0, players.findIndex(player => player.id === activePlayerId));
  for (let offset = 0; offset < players.length; offset++) {
    const player = players[(start + offset) % players.length];
    if (player.status === 'active' && player.chips > 0 &&
        (!player.hasActed || player.bet < currentBet)) return player.id;
  }
  return null;
}