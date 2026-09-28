export const STAKE_TIERS = [
  { id: 'micro', label: 'Micro', minBet: 10 },
  { id: 'low', label: 'Low', minBet: 50 },
  { id: 'mid', label: 'Mid', minBet: 250 },
  { id: 'high', label: 'High', minBet: 1000 },
] as const;

export type StakeTierId = typeof STAKE_TIERS[number]['id'];
export const DEFAULT_STAKE_TIER_ID: StakeTierId = 'low';

export function getStakeTierId(value: unknown): StakeTierId {
  return STAKE_TIERS.some(tier => tier.id === value)
    ? value as StakeTierId
    : DEFAULT_STAKE_TIER_ID;
}

export function getStakeTier(value: unknown) {
  const id = getStakeTierId(value);
  return STAKE_TIERS.find(tier => tier.id === id)!;
}

export function getBuyInBounds(bigBlind: number): { minBuyin: number; maxBuyin: number } {
  return { minBuyin: bigBlind * 20, maxBuyin: bigBlind * 200 };
}

export function clampBuyIn(amount: number, bigBlind: number): number {
  const { minBuyin, maxBuyin } = getBuyInBounds(bigBlind);
  const safeAmount = Number.isFinite(amount) ? Math.floor(amount) : minBuyin;
  return Math.max(minBuyin, Math.min(maxBuyin, safeAmount));
}

export function meetsMinimumBet(currentBet: number, targetBet: number, isAllIn: boolean, minBet: number): boolean {
  return isAllIn || targetBet - currentBet >= minBet;
}