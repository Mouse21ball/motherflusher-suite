import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "ios", isNativePlatform: () => true },
}));
vi.mock("../client/src/lib/apiConfig", () => ({ apiUrl: (path: string) => `https://test.invalid${path}` }));

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, String(value)),
    removeItem: (key: string) => data.delete(key),
  };
}
let visibility: (() => void) | undefined;
let doc: { visibilityState: string; addEventListener: ReturnType<typeof vi.fn> };
const fetchMock = vi.fn().mockResolvedValue({});

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockClear();
  visibility = undefined;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("window", { location: { pathname: "/badugi" }, addEventListener: vi.fn(), gtag: vi.fn() });
  doc = { visibilityState: "visible", addEventListener: vi.fn((name, fn) => { if (name === "visibilitychange") visibility = fn; }) };
  vi.stubGlobal("document", doc);
});
afterEach(() => vi.unstubAllGlobals());
const bodies = () => fetchMock.mock.calls.map(call => JSON.parse(call[1].body));

describe("additive native funnel helper", () => {
  it("captures creation even when a profile consumer initializes identity first", async () => {
    const persistence = await import("../client/src/lib/persistence");
    persistence.ensurePlayerIdentity();
    const { initAnalytics } = await import("../client/src/lib/analytics");
    initAnalytics(); initAnalytics();
    expect(bodies().map(b => b.eventType)).toEqual(["session_start", "app_open"]);
    expect(bodies()[1]).toMatchObject({ platform: "ios", appVersion: "1.4", properties: { first_open: true, build_number: 13 } });
    expect(bodies()[0]).not.toHaveProperty("properties");
    expect(window.gtag).not.toHaveBeenCalled();
  });
  it("does not label a migrated identity or existing account as a new install", async () => {
    localStorage.setItem("poker_table_player_name", "Existing");
    const { initAnalytics } = await import("../client/src/lib/analytics");
    initAnalytics();
    expect(bodies()[1].properties.first_open).toBe(false);
  });
  it("adds a kept-mode join without replacing legacy mode_play", async () => {
    const { trackModePlay, fire2 } = await import("../client/src/lib/analytics");
    trackModePlay("flushedup");
    fire2("table_joined", { mode: "unsupported" });
    expect(bodies().map(b => b.eventType)).toEqual(["mode_play", "table_joined"]);
    expect(bodies()[1]).toMatchObject({ mode: "flushed_up", properties: { mode: "flushed_up" } });
    expect(fetchMock.mock.calls[1][0]).toBe("https://test.invalid/api/analytics/track");
  });
  it("preserves a session identity bridge when login changes player_id", async () => {
    const { initAnalytics, fire2 } = await import("../client/src/lib/analytics");
    const { savePlayerIdentity } = await import("../client/src/lib/persistence");
    initAnalytics();
    const initial = bodies()[1];
    savePlayerIdentity({ id: "account-id", name: "Name", avatarSeed: "seed", createdAt: 0 });
    fire2("signup_completed", { method: "login", name_length: 4 });
    expect(bodies()[2].playerId).toBe("account-id");
    expect(bodies()[2].properties.session_player_id).toBe(initial.playerId);
    expect(bodies()[2].properties.session_id).toBe(initial.properties.session_id);
  });
  it("tracks first home per identity and emits foreground returns with a new session", async () => {
    const { initAnalytics, trackHomeViewed } = await import("../client/src/lib/analytics");
    initAnalytics(); trackHomeViewed(); trackHomeViewed();
    expect(bodies().filter(b => b.eventType === "home_viewed").map(b => b.properties.is_first_home)).toEqual([true, false]);
    const first = bodies()[1].properties.session_id;
    doc.visibilityState = "hidden"; visibility!();
    doc.visibilityState = "visible"; visibility!();
    expect(bodies().at(-1)).toMatchObject({ eventType: "app_open", properties: { first_open: false } });
    expect(bodies().at(-1).properties.session_id).not.toBe(first);
  });
  it("does not create identities or send first-party events in practice", async () => {
    window.location.pathname = "/practice/badugi";
    const { initAnalytics, fire2 } = await import("../client/src/lib/analytics");
    initAnalytics(); fire2("hand_started", { mode: "badugi" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("poker_table_identity")).toBeNull();
  });
});
