import { Capacitor } from "@capacitor/core";
import { AdMob, RewardAdPluginEvents } from "@capacitor-community/admob";
import { apiUrl } from "./apiConfig";
import { apiFetch } from "./session";

interface RewardedAdSession {
  sessionId: string;
  adUnitId: string;
  testMode: boolean;
  rewardChips: number;
  completed: boolean;
  awaitingVerification: boolean;
  chipBalance?: number;
}

type RewardStatus = {
  completed: boolean;
  expired: boolean;
  chipBalance?: number;
};

let admobReady: Promise<void> | null = null;
let adInFlight = false;
const earnedSessions = new Map<string, { sessionId: string; testMode: boolean }>();

export interface RewardedAdContext {
  tableId: string;
  modeId: string;
  bustKey: string;
}

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
    const status = await checkRewardedAdSession(sessionId);
    if (status.completed || status.expired) return status;
    await new Promise(resolve => window.setTimeout(resolve, 1_000));
  }
  return { completed: false, expired: false };
}

export function checkRewardedAdSession(sessionId: string): Promise<RewardStatus> {
  return requestJson<RewardStatus>(`/api/ads/rewarded/${encodeURIComponent(sessionId)}`);
}

// The show promise resolves from the SDK's earned-reward callback, not from
// dismissal. Wait for BOTH eligibility and dismissal before unlocking the UI.
async function playEligibleReward(): Promise<void> {
  let eligible = false;
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const closed = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  const dismissed = await AdMob.addListener(RewardAdPluginEvents.Dismissed, finish);
  const failed = await AdMob.addListener(RewardAdPluginEvents.FailedToShow,
    error => fail(new Error(error.message || "Unable to show the rewarded video.")));
  const timer = window.setTimeout(() => fail(new Error("The rewarded video did not finish. Please try again.")), 5 * 60_000);
  try {
    void AdMob.showRewardVideoAd().then(reward => {
      eligible = !!reward && Number.isFinite(reward.amount) && reward.amount > 0 &&
        typeof reward.type === "string" && reward.type.length > 0;
    }, error => fail(error instanceof Error ? error : new Error("Unable to play the rewarded video.")));
    await closed;
    if (!eligible) throw new Error("The ad was not completed. No reward was granted.");
  } finally {
    window.clearTimeout(timer);
    await dismissed.remove().catch(() => { /* Cleanup must not erase an earned reward. */ });
    await failed.remove().catch(() => {});
  }
}

export async function watchRewardedAd(context: RewardedAdContext, onTestMode?: (testMode: boolean) => void): Promise<{
  chipBalance?: number;
  testMode: boolean;
  pendingVerification: boolean;
  sessionId: string;
}> {
  if (adInFlight) throw new Error("A rewarded video is already in progress.");
  adInFlight = true;
  try {
  const platform = Capacitor.getPlatform();
  if (platform !== "android" && platform !== "ios") {
    throw new Error("Rewarded videos are available in the native app only.");
  }

  const key = `${context.modeId}:${context.tableId}:${context.bustKey}`;
  const earnedSession = earnedSessions.get(key);
  const session = earnedSession ? {
    ...earnedSession, awaitingVerification: true, completed: false,
    adUnitId: "", rewardChips: 500,
  } : await requestJson<RewardedAdSession>("/api/ads/rewarded/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, tableId: context.tableId, modeId: context.modeId }),
  });
  onTestMode?.(session.testMode);

  if (session.completed) {
    return { chipBalance: session.chipBalance, testMode: session.testMode, pendingVerification: false, sessionId: session.sessionId };
  }
  if (!session.awaitingVerification) {
  // AdMob test units and the test completion endpoint are issued only by an
  // explicitly opted-in non-production server. In production, the SSV callback
  // is the sole authority that completes the reward session.
  if (!admobReady) {
    admobReady = AdMob.initialize({ initializeForTesting: session.testMode }).catch(error => {
      admobReady = null;
      throw error;
    });
  }
  await admobReady;
  await AdMob.prepareRewardVideoAd({
    adId: session.adUnitId,
    isTesting: session.testMode,
    immersiveMode: true,
    ssv: { customData: session.sessionId },
  });

  // The SDK result can trigger completion only for the explicitly marked
  // development test session. Production credit remains exclusively SSV-verified.
  await playEligibleReward();
  earnedSessions.set(key, { sessionId: session.sessionId, testMode: session.testMode });
  await requestJson("/api/ads/rewarded/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: session.sessionId }),
  });
  }
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
    sessionId: session.sessionId,
  };
  } finally {
    adInFlight = false;
  }
}