import type { GameState } from '@shared/gameTypes';

export function readRebuyConfirmation(message: Record<string, unknown>, tableId: string) {
  if (message.tableId !== tableId ||
      !Number.isSafeInteger(message.chips) || (message.chips as number) <= 0 ||
      !Number.isSafeInteger(message.walletBalance) || (message.walletBalance as number) < 0) {
    throw new Error('The server did not confirm your updated balances. Please reconnect and check your stack before retrying.');
  }
  return { chips: message.chips as number, walletBalance: message.walletBalance as number };
}

/** A successful acknowledgement is authoritative even without a separate snapshot. */
export function applyRebuyStack(state: GameState, playerId: string, chips: number): GameState {
  return {
    ...state,
    players: state.players.map(player => player.id === playerId ? { ...player, chips } : player),
  };
}