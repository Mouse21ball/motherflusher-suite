export function getBuyInBigBlinds(amount: number, bigBlind: number): number {
  return bigBlind > 0 ? Math.round(amount / bigBlind) : 0;
}

export function formatBuyInBigBlinds(amount: number, bigBlind: number): string {
  if (bigBlind <= 0) return "0";
  return (amount / bigBlind).toFixed(3).replace(/\.?0+$/, "");
}

export function reconcileBuyInAmount(
  amount: number,
  previousBigBlind: number,
  bigBlind: number,
  minimum: number,
  maximum: number,
  safeDefault: number,
): number {
  if (previousBigBlind !== bigBlind) return safeDefault;
  if (maximum < minimum) return minimum;
  const maxStep = Math.floor(maximum / bigBlind) * bigBlind;
  const snapped = Math.floor(amount / bigBlind) * bigBlind;
  return Math.max(minimum, Math.min(maxStep, snapped));
}