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

const REWARDED_AD_UNITS = {
  production: {
    android: "ca-app-pub-1122384597919929/4402812186",
    ios: "ca-app-pub-1122384597919929/4402812186",
  },
  test: {
    android: "ca-app-pub-3940256099942544/5224354917",
    ios: "ca-app-pub-3940256099942544/1712485313",
  },
} as const;

export function rewardedAdUnitId(platform: "android" | "ios", testMode: boolean): string {
  return REWARDED_AD_UNITS[testMode ? "test" : "production"][platform];
}