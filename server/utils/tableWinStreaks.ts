import type { GameState, Player } from '../../shared/gameTypes';

/**
 * Called only when the server settles a hand. A pending or unresolved showdown
 * has no winners and cannot change a streak. Re-resolving an already awarded
 * showdown must not count the same win twice.
 */
export function confirmedWinStreaks(state: GameState, resolvedPlayers: Player[]): Record<string, number> {
  const previous = state.winStreaks ?? {};
  const original = new Map(state.players.map(player => [player.id, player]));
  if (state.players.some(p => p.isWinner)) return previous;
  const paidWinners = new Set(resolvedPlayers
    .filter(player => player.isWinner && player.chips > (original.get(player.id)?.chips ?? player.chips))
    .map(player => player.id));
  if (paidWinners.size === 0) return previous;

  return Object.fromEntries(resolvedPlayers.map(player => {
    const before = original.get(player.id);
    const count = previous[player.id] ?? 0;
    // Seats that did not play this hand do not lose an existing streak.
    if (!before || before.status === 'sitting_out' || before.presence === 'reserved' || before.presence === 'open') {
      return [player.id, count];
    }
    return [player.id, paidWinners.has(player.id) ? count + 1 : player.isWinner ? count : 0];
  }));
}

export function resetSeatWinStreak(state: GameState, seatId: string): Record<string, number> {
  return { ...state.winStreaks, [seatId]: 0 };
}

/** A restored seat is reclaimable only by the identity that owned its streak. */
export function ownedStreakSeat(state: GameState, identityId: string): string | undefined {
  return Object.entries(state.seatStreakOwners ?? {})
    .find(([, owner]) => owner === identityId)?.[0];
}

/** Do not let a different arrival consume a disconnected player's reserved streak. */
export function availableStreakSeat(
  state: GameState,
  seats: readonly string[],
  occupied: { has(seatId: string): boolean },
  identityId?: string,
): string | null {
  const owned = identityId ? ownedStreakSeat(state, identityId) : undefined;
  if (owned && seats.includes(owned) && !occupied.has(owned)) return owned;
  return seats.find(seat => !occupied.has(seat) && !state.seatStreakOwners?.[seat]) ?? null;
}

export function claimSeatStreak(
  state: GameState,
  seatId: string,
  identityId?: string,
  sameSession = false,
  mappedIdentityId?: string,
): Pick<GameState, 'winStreaks' | 'seatStreakOwners'> {
  const knownOwner = mappedIdentityId ?? state.seatStreakOwners?.[seatId];
  const returning = identityId ? knownOwner === identityId : sameSession && !knownOwner;
  const seatStreakOwners = { ...state.seatStreakOwners };
  if (identityId) seatStreakOwners[seatId] = identityId;
  else if (!returning) delete seatStreakOwners[seatId];
  return {
    winStreaks: returning ? (state.winStreaks ?? {}) : resetSeatWinStreak(state, seatId),
    seatStreakOwners,
  };
}

export function releaseSeatStreak(state: GameState, seatId: string): Pick<GameState, 'winStreaks' | 'seatStreakOwners'> {
  const seatStreakOwners = { ...state.seatStreakOwners };
  delete seatStreakOwners[seatId];
  return { winStreaks: resetSeatWinStreak(state, seatId), seatStreakOwners };
}