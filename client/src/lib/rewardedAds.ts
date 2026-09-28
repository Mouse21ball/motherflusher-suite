import { Capacitor } from "@capacitor/core";
import { AdMob } from "@capacitor-community/admob";
import { apiUrl } from "./apiConfig";
import { apiFetch } from "./session";

interface RewardedAdSession {
  sessionId: string;
  adUnitId: string;
  testMode: boolean;
  rewardChips: number;
}

type RewardStatus = {
  completed: boolean;
  expired: boolean;
  chipBalance?: number;
};

let admobReady: Promise<void> | null = null;

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(apiUrl(url), options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? `Ad reward request failed (${response.status}).`);
  }
  return data as T;
}

async function waitForServerCredit(sessionId: string): Promise<RewardStatus> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const status = await requestJson<RewardStatus>(`/api/ads/rewarded/${encodeURIComponent(sessionId)}`);
    if (status.completed || status.expired) return status;
    await new Promise(resolve => window.setTimeout(resolve, 1_000));
  }
  return { completed: false, expired: false };
}

export async function watchRewardedAd(onTestMode?: (testMode: boolean) => void): Promise<{
  chipBalance?: number;
  testMode: boolean;
  pendingVerification: boolean;
}> {
  const platform = Capacitor.getPlatform();
  if (platform !== "android" && platform !== "ios") {
    throw new Error("Rewarded videos are available in the native app only.");
  }

  const session = await requestJson<RewardedAdSession>("/api/ads/rewarded/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform }),
  });
  onTestMode?.(session.testMode);

  // AdMob test units and the test completion endpoint are issued only by an
  // explicitly opted-in non-production server. In production, the SSV callback
  // is the sole authority that completes the reward session.
  if (!admobReady) {
    admobReady = AdMob.initialize({ initializeForTesting: session.testMode });
  }
  await admobReady;
  await AdMob.prepareRewardVideoAd({
    adId: session.adUnitId,
    isTesting: session.testMode,
    immersiveMode: true,
    ssv: { customData: session.sessionId },
  });

  // The SDK result can trigger completion only for the explicitly marked
  // development test session. Production ignores this client callback entirely.
  await AdMob.showRewardVideoAd();
  if (session.testMode) {
    await requestJson("/api/ads/rewarded/complete-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.sessionId }),
    });
  }

  const status = await waitForServerCredit(session.sessionId);
  if (status.expired) throw new Error("This ad reward session expired before it was verified.");
  return {
    chipBalance: status.chipBalance,
    testMode: session.testMode,
    pendingVerification: !status.completed,
  };
}