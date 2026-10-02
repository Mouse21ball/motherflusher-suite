export function shouldShowHomeChipRecovery(
  profile: { chipBalance: number } | null,
  loading: boolean,
): boolean {
  return !loading && profile !== null && profile.chipBalance === 0;
}