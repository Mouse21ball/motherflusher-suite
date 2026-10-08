import { describe, expect, it } from "vitest";
import { FUNNEL_EVENT_TYPES, analyticsMode, trackEventSchema } from "../shared/analytics";
import { readAppReleaseInfo } from "../scripts/appReleaseInfo";

describe("first-party analytics contract", () => {
  it.each(["session_start", "session_end", "mode_play"])("preserves legacy %s payloads", eventType => {
    const payload = { eventType, playerId: "legacy-player", mode: "legacy-mode", durationMs: 123 };
    expect(trackEventSchema.parse(payload)).toEqual(payload);
  });
  it.each(FUNNEL_EVENT_TYPES)("accepts %s with native metadata and JSON properties", eventType => {
    const payload = {
      eventType, playerId: "test-player", platform: "ios", appVersion: "1.4",
      properties: { first_open: true, build_number: 13, nested: { supported: true } },
    };
    expect(trackEventSchema.parse(payload)).toEqual(payload);
  });
  it("rejects unknown events and invalid platforms without changing the legacy enum", () => {
    expect(trackEventSchema.safeParse({ eventType: "unknown", playerId: "p" }).success).toBe(false);
    expect(trackEventSchema.safeParse({ eventType: "app_open", playerId: "p", platform: "desktop" }).success).toBe(false);
    expect(trackEventSchema.safeParse({ eventType: "app_open", playerId: "p", properties: [] }).success).toBe(false);
  });
  it("normalizes only kept mode aliases", () => {
    expect(analyticsMode("flushedup")).toBe("flushed_up");
    expect(analyticsMode("ladyluck")).toBe("lady_luck");
    expect(analyticsMode("box-chevy")).toBe("box_chevy");
    expect(analyticsMode("badugi")).toBe("badugi");
    expect(analyticsMode("unsupported")).toBeUndefined();
  });
  it("uses platform release sources, not the unrelated npm package version", () => {
    const info = readAppReleaseInfo(process.cwd());
    expect(info.ios.version).toMatch(/^\d+\.\d+/);
    expect(info.ios.build).toBeGreaterThan(0);
    expect(info.android.version).toMatch(/^\d+\.\d+/);
    expect(info.web).toEqual(info.android);
  });
});
