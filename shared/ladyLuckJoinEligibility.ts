import type { LadyLuckState } from './modes/ladyluck';

export function canJoinLadyLuckTable(
  state: Pick<LadyLuckState, 'phase' | 'players' | 'sideBets'>,
  playerId: string,
  walletChips: number,
): boolean {
  if (!Number.isSafeInteger(walletChips) || walletChips < 0) return false;
  if (walletChips > 0) return true;

  const existing = state.players.find(player => player.id === playerId);
  const hasCurrentHandCommitment = existing?.presence === 'human'
    && (existing.wagered || state.sideBets.some(sideBet => sideBet.playerId === playerId));
  return (state.phase === 'WAGER'
    || state.phase === 'BET'
    || state.phase === 'RACE'
    || state.phase === 'RESULTS') && !!hasCurrentHandCommitment;
}

export type LadyLuckWagerAmountError =
  | 'invalid_amount'
  | 'must_be_100_increment'
  | 'below_min'
  | 'above_max';

export function validateLadyLuckWagerAmount(
  amount: number,
  minWager: number,
  maxWager: number,
): LadyLuckWagerAmountError | null {
  if (!Number.isSafeInteger(amount)) return 'invalid_amount';
  if (amount % 100 !== 0) return 'must_be_100_increment';
  if (amount < minWager) return 'below_min';
  if (amount > maxWager) return 'above_max';
  return null;
}

export function isValidLadyLuckSideBetAmount(amount: number, maxSideBet: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0 && amount <= maxSideBet;
}