import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  api: vi.fn(), initialize: vi.fn(), prepare: vi.fn(), show: vi.fn(),
  listeners: new Map<string, (reward?: { amount: number; type: string }) => void>(), remove: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "android" } }));
vi.mock("@capacitor-community/admob", () => ({
  AdMob: {
    initialize: mock.initialize, prepareRewardVideoAd: mock.prepare, showRewardVideoAd: mock.show,
    addListener: async (event: string, callback: (reward?: { amount: number; type: string }) => void) => {
      mock.listeners.set(event, callback);
      return { remove: mock.remove };
    },
  },
  RewardAdPluginEvents: { Dismissed: "dismissed", FailedToShow: "failed", Rewarded: "rewarded" },
}));
vi.mock("../client/src/lib/session", () => ({ apiFetch: mock.api }));
vi.mock("../client/src/lib/apiConfig", () => ({ apiUrl: (url: string) => url }));
const context = { tableId: "table", modeId: "badugi", bustKey: "one-bust" };
const session = {
  sessionId: "watch-session", adUnitId: "ca-app-pub-1122384597919929/4402812186",
  testMode: false, completed: false, awaitingVerification: false, rewardChips: 500,
};

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  mock.listeners.clear();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  mock.initialize.mockResolvedValue(undefined);
  mock.prepare.mockResolvedValue(undefined);
  mock.remove.mockResolvedValue(undefined);
  mock.api.mockImplementation(async (url: string) => new Response(JSON.stringify(
    url.endsWith("/start") ? session : url.includes("/confirm") ? {} :
      { completed: true, expired: false, chipBalance: 500 },
  ), { status: 200 }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function moduleAndPlayback(reward: unknown) {
  const api = await import("../client/src/lib/rewardedAds");
  let resolve!: (value: any) => void;
  mock.show.mockImplementation(() => new Promise(done => { resolve = done; }));
  const result = api.watchRewardedAd(context);
  await vi.waitFor(() => expect(mock.show).toHaveBeenCalledOnce());
  return {
    api, result,
    earn: async () => { resolve(reward); await Promise.resolve(); },
    dismiss: () => mock.listeners.get("dismissed")!(),
  };
}

describe("rewarded ad SDK eligibility and locks", () => {
  it("waits for both earned reward and dismissal; fixed 500 comes from the server, not SDK amount", async () => {
    const playback = await moduleAndPlayback({ type: "coins", amount: 999 });
    await playback.earn();
    expect(mock.api.mock.calls.some(([url]) => url.includes("/confirm"))).toBe(false);
    await expect(playback.api.watchRewardedAd(context)).rejects.toThrow("already in progress");
    playback.dismiss();
    await expect(playback.result).resolves.toMatchObject({ chipBalance: 500, pendingVerification: false });
    expect(mock.api.mock.calls.filter(([url]) => url.includes("/start"))).toHaveLength(1);
    expect(mock.api.mock.calls.some(([url]) => url.includes("complete-test"))).toBe(false);
    expect(mock.prepare).toHaveBeenCalledWith(expect.objectContaining({
      adId: session.adUnitId, ssv: { customData: "watch-session" },
    }));
  });

  it("dismisses a skipped ad without any completion request or reward polling", async () => {
    const playback = await moduleAndPlayback(undefined);
    const rejection = expect(playback.result).rejects.toThrow("not completed");
    await playback.earn();
    playback.dismiss();
    await rejection;
    expect(mock.api.mock.calls.filter(([url]) => !url.endsWith("/trace"))).toHaveLength(1);
    expect(mock.remove).toHaveBeenCalledTimes(3);
  });

  it("does not play a second ad for a server-confirmed, already rewarded bust", async () => {
    mock.api.mockResolvedValue(new Response(JSON.stringify({ ...session, completed: true, chipBalance: 500 })));
    const { watchRewardedAd } = await import("../client/src/lib/rewardedAds");
    await expect(watchRewardedAd(context)).resolves.toMatchObject({ chipBalance: 500, pendingVerification: false });
    expect(mock.show).not.toHaveBeenCalled();
  });

  it("resumes pending SSV verification without preparing or showing another ad", async () => {
    mock.api.mockImplementation(async (url: string) => new Response(JSON.stringify(
      url.endsWith("/start") ? { ...session, awaitingVerification: true } :
        { completed: true, expired: false, chipBalance: 500 },
    )));
    const { watchRewardedAd } = await import("../client/src/lib/rewardedAds");
    await expect(watchRewardedAd(context)).resolves.toMatchObject({ chipBalance: 500 });
    expect(mock.prepare).not.toHaveBeenCalled();
    expect(mock.show).not.toHaveBeenCalled();
  });

  it("retains the lock while the signed server callback is delayed", async () => {
    let checks = 0;
    mock.api.mockImplementation(async (url: string) => new Response(JSON.stringify(
      url.endsWith("/start") ? session : url.endsWith("/confirm") || url.endsWith("/trace") ? {} :
        ++checks === 1 ? { completed: false, expired: false } :
          { completed: true, expired: false, chipBalance: 500 },
    )));
    const playback = await moduleAndPlayback({ type: "coins", amount: 500 });
    await playback.earn();
    playback.dismiss();
    await vi.waitFor(() => expect(checks).toBe(1));
    await expect(playback.api.watchRewardedAd(context)).rejects.toThrow("already in progress");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(playback.result).resolves.toMatchObject({ chipBalance: 500 });
  });

  it("accepts a late SDK reward after dismissal without trusting dismissal itself", async () => {
    const playback = await moduleAndPlayback({ type: "coins", amount: 1 });
    playback.dismiss();
    expect(mock.api.mock.calls.some(([url]) => url.includes("/confirm"))).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    await playback.earn();
    await expect(playback.result).resolves.toMatchObject({ chipBalance: 500 });
  });

  it("handles the Rewarded event even when the native show promise never resolves", async () => {
    const playback = await moduleAndPlayback(undefined);
    mock.listeners.get("rewarded")!({ type: "coins", amount: 1 });
    playback.dismiss();
    await expect(playback.result).resolves.toMatchObject({ chipBalance: 500 });
  });

  it("rejects dismissal without an earned reward after the bounded bridge grace period", async () => {
    const playback = await moduleAndPlayback(undefined);
    const rejection = expect(playback.result).rejects.toThrow("not completed");
    playback.dismiss();
    await vi.advanceTimersByTimeAsync(2_000);
    await rejection;
    expect(mock.api.mock.calls.some(([url]) => url.includes("/confirm"))).toBe(false);
  });

  it("still reads signed server credit when confirmation and telemetry fail", async () => {
    const original = mock.api.getMockImplementation()!;
    mock.api.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/confirm") || url.endsWith("/trace")) throw new Error("offline");
      return original(url, options);
    });
    const playback = await moduleAndPlayback({ type: "coins", amount: 1 });
    await playback.earn();
    playback.dismiss();
    await expect(playback.result).resolves.toMatchObject({ chipBalance: 500 });
  });

  it("recovers a transient status failure instead of losing the earned session", async () => {
    let checks = 0;
    mock.api.mockImplementation(async (url: string) => {
      if (url.includes("/rewarded/watch-session") && ++checks === 1) throw new Error("offline");
      return new Response(JSON.stringify(url.endsWith("/start") ? session :
        url.includes("/rewarded/watch-session") ? { completed: true, expired: false, chipBalance: 500 } : {}));
    });
    const playback = await moduleAndPlayback({ type: "coins", amount: 1 });
    await playback.earn();
    playback.dismiss();
    await vi.waitFor(() => expect(checks).toBe(1));
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(playback.result).resolves.toMatchObject({ chipBalance: 500 });
  });
});