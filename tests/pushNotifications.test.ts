import { describe, expect, it, vi } from "vitest";
import {
  createSingleFlightRunner,
  getDuePushEvents,
  refreshDuePushEvent,
  runPushNotificationJob,
  runPushNotificationTick,
  type PushJobDependencies,
  type PushProfile,
} from "../server/pushNotifications";

const profile = (overrides: Partial<PushProfile> = {}): PushProfile => ({
  id: "player-1",
  lastBonusClaimedAt: null,
  lastHourlyRewardAt: null,
  lastActivityAt: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  preferences: {},
  tokens: ["a-valid-fcm-device-token"],
  ...overrides,
});

const immediatePlayerLock: PushJobDependencies["withPlayerLock"] = (_event, work) => work(undefined);

describe("push notification scheduling", () => {
  it("runs the production job without a Firebase key and safely no-ops", async () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "");
    await expect(runPushNotificationJob(new Date("2025-01-03T00:00:00.000Z"))).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("does not attempt sends or create claims without Firebase credentials", async () => {
    const profiles = vi.fn(async () => [profile()]);
    const claim = vi.fn(async () => true);
    const send = vi.fn(async () => 1);
    const deps: PushJobDependencies = {
      isConfigured: async () => false,
      getProfiles: profiles,
      withPlayerLock: immediatePlayerLock,
      claim,
      refresh: async event => event,
      release: vi.fn(async () => {}),
      send,
      logError: vi.fn(),
    };

    await runPushNotificationTick(deps, new Date("2025-01-03T00:00:00.000Z"));
    expect(profiles).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("warns for a daily streak before the actual second-next UTC midnight", () => {
    const claimedAt = new Date("2025-01-01T12:00:00.000Z");
    expect(getDuePushEvents(profile({ lastBonusClaimedAt: claimedAt }), new Date("2025-01-02T20:59:00.000Z"))).toEqual([]);
    const [event] = getDuePushEvents(profile({ lastBonusClaimedAt: claimedAt }), new Date("2025-01-02T21:00:00.000Z"));
    expect(event).toMatchObject({ kind: "streakAtRisk", eventKey: "streak-risk:1735862400000" });
    expect(getDuePushEvents(
      profile({ lastBonusClaimedAt: claimedAt }),
      new Date("2025-01-03T00:00:00.000Z"),
    )).toEqual([]);
  });

  it("uses hourly cooldown timestamps, suppresses stale reminders, honors opt-outs, and dedupes", async () => {
    const now = new Date("2025-01-02T13:00:00.000Z");
    const player = profile({
      lastHourlyRewardAt: new Date("2025-01-02T12:00:00.000Z"),
      preferences: { hourlyReady: true, streakAtRisk: false, winBack: false },
    });
    expect(getDuePushEvents(player, now).map(event => event.kind)).toEqual(["hourlyReady"]);
    expect(getDuePushEvents({ ...player, preferences: { hourlyReady: false } }, now)).toEqual([]);
    expect(getDuePushEvents(
      profile({ lastHourlyRewardAt: new Date("2025-01-02T06:00:00.000Z") }),
      now,
    )).toEqual([]);

    const claimedKeys = new Set<string>();
    const send = vi.fn(async () => 1);
    const deps: PushJobDependencies = {
      isConfigured: async () => true,
      getProfiles: async () => [player],
      withPlayerLock: immediatePlayerLock,
      claim: async event => {
        if (claimedKeys.has(event.eventKey)) return false;
        claimedKeys.add(event.eventKey);
        return true;
      },
      refresh: async event => event,
      release: vi.fn(async () => {}),
      send,
      logError: vi.fn(),
    };
    await runPushNotificationTick(deps, now);
    await runPushNotificationTick(deps, now);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("uses last authenticated activity rather than profile updatedAt for win-back thresholds", () => {
    const player = profile({
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      lastActivityAt: new Date("2025-01-10T00:00:00.000Z"),
      preferences: { winBack: true },
    });
    const due = getDuePushEvents(player, new Date("2025-01-13T00:00:00.000Z"));
    expect(due.map(event => event.eventKey)).toEqual(["win-back:3d:1736467200000"]);
  });

  it("sends only the latest win-back stage, including for long-inactive guests", () => {
    const activityAt = new Date("2025-01-01T00:00:00.000Z");
    expect(getDuePushEvents(
      profile({ lastActivityAt: activityAt }),
      new Date(activityAt.getTime() + 6 * 24 * 60 * 60 * 1000),
    ).map(event => event.eventKey)).toEqual([`win-back:3d:${activityAt.getTime()}`]);
    expect(getDuePushEvents(
      profile({ lastActivityAt: activityAt }),
      new Date(activityAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    ).map(event => event.eventKey)).toEqual([`win-back:7d:${activityAt.getTime()}`]);
    const due = getDuePushEvents(profile({ lastActivityAt: activityAt }), new Date("2025-01-16T00:00:00.000Z"));
    expect(due.filter(event => event.kind === "winBack").map(event => event.eventKey))
      .toEqual([`win-back:14d:${activityAt.getTime()}`]);
  });

  it("revalidates a claimed event immediately before sending and releases obsolete claims", async () => {
    const eventProfile = profile({
      lastHourlyRewardAt: new Date("2025-01-02T12:00:00.000Z"),
      preferences: { hourlyReady: true },
    });
    const claim = vi.fn(async () => true);
    const release = vi.fn(async () => {});
    const send = vi.fn(async () => 1);
    const deps: PushJobDependencies = {
      isConfigured: async () => true,
      getProfiles: async () => [eventProfile],
      withPlayerLock: immediatePlayerLock,
      claim,
      refresh: async () => null, // preference, token owner, or reward state changed
      release,
      send,
      logError: vi.fn(),
    };
    await runPushNotificationTick(deps, new Date("2025-01-02T13:00:00.000Z"));
    expect(claim).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("refreshes eligibility through a read-only profile loader without requiring a row lock", async () => {
    const now = new Date("2025-01-02T13:00:00.000Z");
    const currentProfile = profile({
      lastHourlyRewardAt: new Date("2025-01-02T12:00:00.000Z"),
      preferences: { hourlyReady: true },
      tokens: ["current-device-token"],
    });
    const [candidate] = getDuePushEvents(currentProfile, now);
    const loadProfiles = vi.fn(async (_at: Date, _playerId: string) => [currentProfile]);

    const refreshed = await refreshDuePushEvent(candidate, now, loadProfiles);

    expect(loadProfiles).toHaveBeenCalledWith(now, currentProfile.id);
    expect(refreshed).toMatchObject({ eventKey: candidate.eventKey, tokens: ["current-device-token"] });
  });

  it("sends to the fresh device-owner token set returned by revalidation", async () => {
    const eventProfile = profile({
      lastHourlyRewardAt: new Date("2025-01-02T12:00:00.000Z"),
      preferences: { hourlyReady: true },
    });
    const currentTokenSet = ["new-owner-device-token"];
    const send = vi.fn(async (event: { tokens: string[] }) => event.tokens.length);
    const deps: PushJobDependencies = {
      isConfigured: async () => true,
      getProfiles: async () => [eventProfile],
      withPlayerLock: immediatePlayerLock,
      claim: async () => true,
      refresh: async event => ({ ...event, tokens: currentTokenSet }),
      release: vi.fn(async () => {}),
      send,
      logError: vi.fn(),
    };
    await runPushNotificationTick(deps, new Date("2025-01-02T13:00:00.000Z"));
    expect(send.mock.calls[0]?.[0]).toMatchObject({ tokens: currentTokenSet });
  });

  it("releases a claim after total send failure but keeps it after any successful device delivery", async () => {
    const eventProfile = profile({
      lastHourlyRewardAt: new Date("2025-01-02T12:00:00.000Z"),
      preferences: { hourlyReady: true },
    });
    const now = new Date("2025-01-02T13:00:00.000Z");
    const makeDeps = (successfulDeliveries: number) => ({
      isConfigured: async () => true,
      getProfiles: async () => [eventProfile],
      withPlayerLock: immediatePlayerLock,
      claim: async () => true,
      refresh: async (event: Parameters<PushJobDependencies["refresh"]>[0]) => event,
      release: vi.fn(async () => {}),
      send: async () => successfulDeliveries,
      logError: vi.fn(),
    } satisfies PushJobDependencies);
    const failed = makeDeps(0);
    await runPushNotificationTick(failed, now);
    expect(failed.release).toHaveBeenCalledTimes(1);
    const partialSuccess = makeDeps(1);
    await runPushNotificationTick(partialSuccess, now);
    expect(partialSuccess.release).not.toHaveBeenCalled();
  });

  it("does not overlap scheduled job runs while a prior run is still pending", async () => {
    let activeRuns = 0;
    let maxActiveRuns = 0;
    const releases: (() => void)[] = [];
    const job = vi.fn(async () => {
      activeRuns++;
      maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
      await new Promise<void>(resolve => releases.push(resolve));
      activeRuns--;
    });
    const runSingleFlight = createSingleFlightRunner(job);

    const first = runSingleFlight();
    const overlapping = runSingleFlight();
    expect(overlapping).toBe(first);
    await Promise.resolve();
    expect(job).toHaveBeenCalledTimes(1);
    expect(maxActiveRuns).toBe(1);

    releases[0]();
    await first;
    const next = runSingleFlight();
    await Promise.resolve();
    expect(job).toHaveBeenCalledTimes(2);
    expect(maxActiveRuns).toBe(1);
    releases[1]();
    await next;
  });
});