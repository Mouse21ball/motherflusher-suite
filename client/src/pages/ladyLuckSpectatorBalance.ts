export function isResolvedZeroChipBalance(loading: boolean, chipBalance: number | null | undefined) {
  return !loading && chipBalance === 0;
}