import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPracticeBadugiPath } from "../client/src/lib/practiceRoute";

vi.mock("../client/src/lib/persistence", () => ({
  ensurePlayerIdentity: vi.fn(() => ({ id: "practice-guard-test" })),
  consumeNewIdentityForAnalytics: vi.fn(() => false),
}));

describe("practice-route analytics and referral isolation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("suppresses pre-existing lobby analytics listeners on practice and resumes in lobby", async () => {
    vi.resetModules();
    const windowListeners = new Map<string, EventListener>();
    const documentListeners = new Map<string, EventListener>();
    const location = {
      pathname: "/",
      search: "",
      hostname: "localhost",
      origin: "http://localhost",
    };
    const windowMock = {
      location,
      addEventListener: vi.fn((name: string, listener: EventListener) => windowListeners.set(name, listener)),
    };
    const documentMock = {
      visibilityState: "visible",
      addEventListener: vi.fn((name: string, listener: EventListener) => documentListeners.set(name, listener)),
    };
    const sessionStore = { setItem: vi.fn(), getItem: vi.fn(() => "1234") };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("window", windowMock);
    vi.stubGlobal("document", documentMock);
    vi.stubGlobal("sessionStorage", sessionStore);
    vi.stubGlobal("fetch", fetchMock);

    const analytics = await import("../client/src/lib/analytics");
    analytics.initAnalytics();
    expect(sessionStore.setItem).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // legacy session_start + additive app_open
    const onUnload = windowListeners.get("beforeunload")!;
    const onVisibility = documentListeners.get("visibilitychange")!;

    location.pathname = "/practice/badugi";
    onUnload(new Event("beforeunload"));
    documentMock.visibilityState = "hidden";
    onVisibility(new Event("visibilitychange"));
    analytics.trackSessionEnd();
    expect(sessionStore.getItem).not.toHaveBeenCalled();
    expect(sessionStore.setItem).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    location.pathname = "/";
    onUnload(new Event("beforeunload"));
    expect(sessionStore.getItem).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not persist a referral on query-string practice entry, but preserves lobby capture", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };
    const location = { pathname: "/practice/badugi", search: "?ref=ABC123" };
    vi.stubGlobal("window", { location });
    vi.stubGlobal("localStorage", storage);
    const referrals = await import("../client/src/lib/referralAttribution");

    expect(isPracticeBadugiPath(`${location.pathname}${location.search}`)).toBe(true);
    referrals.captureReferralCodeFromUrl();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values.size).toBe(0);

    location.pathname = "/";
    referrals.captureReferralCodeFromUrl();
    expect(storage.setItem).toHaveBeenCalledWith("cgp_signup_referral_code", "ABC123");
    expect(values.get("cgp_signup_referral_code")).toBe("ABC123");
  });

  it("guards the main-entry referral capture for direct practice URLs", async () => {
    const main = readFileSync("client/src/main.tsx", "utf8");
    expect(main).toMatch(/if \(!isPracticeBadugiRoute\(\)\) captureReferralCodeFromUrl\(\)/);
  });
});