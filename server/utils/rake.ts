export function calculateRake(pot: number, rakePercent: number = 5): number {
  return Math.floor(pot * rakePercent / 100);
}

export function applyRake(
  pot: number,
  rakePercent: number = 5,
): { winnerPot: number; rake: number } {
  const rake = calculateRake(pot, rakePercent);
  return { winnerPot: pot - rake, rake };
}
