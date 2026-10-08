import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fire: vi.fn() }));
vi.mock("../client/src/lib/analytics", () => ({ fire2: mocks.fire, trackModePlay: vi.fn() }));
vi.mock("../client/src/lib/persistence", () => ({ ensurePlayerIdentity: () => ({ id: "actor" }) }));
beforeEach(() => {
  vi.resetModules(); mocks.fire.mockClear();
  vi.stubGlobal("window", { location: { pathname: "/badugi" } });
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("deduplicates across multiple rendering surfaces and reconnects", async () => {
  const event = { type: "hand_started" as const, props: { mode: "badugi", table_id: "TABLE1", hand_id: "1" } };
  const first = await import("../client/src/lib/useHandAnalytics");
  first.emitHandEventOnce(event); first.emitHandEventOnce(event);
  expect(mocks.fire).toHaveBeenCalledTimes(1);
  vi.resetModules();
  const reconnect = await import("../client/src/lib/useHandAnalytics");
  reconnect.emitHandEventOnce(event);
  expect(mocks.fire).toHaveBeenCalledTimes(1);
  reconnect.emitHandEventOnce({ ...event, type: "hand_completed" });
  expect(mocks.fire).toHaveBeenCalledTimes(2);
});
it("still deduplicates when session storage is unavailable", async () => {
  vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  const { emitHandEventOnce } = await import("../client/src/lib/useHandAnalytics");
  const event = { type: "hand_started" as const, props: { mode: "lady_luck", table_id: "LLTEST", hand_id: "race1" } };
  emitHandEventOnce(event); emitHandEventOnce(event);
  expect(mocks.fire).toHaveBeenCalledTimes(1);
});
it("does not create hand caches or emit events in practice", async () => {
  window.location.pathname = "/practice/badugi";
  const { emitHandEventOnce } = await import("../client/src/lib/useHandAnalytics");
  emitHandEventOnce({ type: "hand_started", props: { mode: "badugi", table_id: "TABLE1", hand_id: "1" } });
  expect(mocks.fire).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("cgp_hand_analytics_seen")).toBeNull();
});
