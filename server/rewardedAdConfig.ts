/**
 * Test ads are the safe default outside production. The explicit "false"
 * override is useful for staging environments that need ads disabled. There is
 * intentionally no setting that can enable client-trusted completion in prod.
 */
export function isRewardedAdTestModeEnabled(
  nodeEnv: string | undefined,
  explicitSetting: string | undefined,
): boolean {
  return nodeEnv !== "production" && explicitSetting !== "false";
}