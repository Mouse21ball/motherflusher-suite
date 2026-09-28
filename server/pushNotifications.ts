import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { notificationClaims, notificationDevices } from "@shared/schema";
import { lockNotificationPlayers } from "./notificationLocks";

export type PushPreferenceKey = "streakAtRisk" | "hourlyReady" | "winBack";
export type PushNotificationKind = "streakAtRisk" | "hourlyReady" | "winBack";

export interface PushProfile {
  id: string;
  lastBonusClaimedAt: Date | null;
  lastHourlyRewardAt: Date | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  preferences: Partial<Record<PushPreferenceKey, boolean>>;
  tokens: string[];
}

export interface PushEvent {
  playerId: string;
  eventKey: string;
  kind: PushNotificationKind;
  tokens: string[];
}

const UTC_DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_WARNING_LEAD_MS = 3 * 60 * 60 * 1000;
const MAX_HOURLY_REMINDER_AGE_MS = 6 * 60 * 60 * 1000;

export function getDuePushEvents(profile: PushProfile, now: Date): PushEvent[] {
  if (profile.tokens.length === 0) return [];
  const events: PushEvent[] = [];
  const push = (kind: PushNotificationKind, eventKey: string) => {
    const pref = profile.preferences[kind];
    if (pref !== false) events.push({ playerId: profile.id, kind, eventKey, tokens: profile.tokens });
  };

  if (profile.lastBonusClaimedAt && profile.preferences.streakAtRisk !== false) {
    const claimed = profile.lastBonusClaimedAt;
    const resetAt = Date.UTC(claimed.getUTCFullYear(), claimed.getUTCMonth(), claimed.getUTCDate() + 2);
    if (now.getTime() >= resetAt - STREAK_WARNING_LEAD_MS && now.getTime() < resetAt) {
      push("streakAtRisk", `streak-risk:${resetAt}`);
    }
  }

  if (profile.preferences.hourlyReady !== false && profile.lastHourlyRewardAt) {
    const readyAt = profile.lastHourlyRewardAt.getTime() + 60 * 60 * 1000;
    if (now.getTime() >= readyAt && now.getTime() < readyAt + MAX_HOURLY_REMINDER_AGE_MS) {
      push("hourlyReady", `hourly-ready:${readyAt}`);
    }
  }

  if (profile.preferences.winBack !== false) {
    const activityAt = profile.lastActivityAt ?? profile.createdAt;
    const elapsed = now.getTime() - activityAt.getTime();
    const latestStage = [3, 7, 14].filter(days => elapsed >= days * UTC_DAY_MS).at(-1);
    if (latestStage !== undefined) {
      push("winBack", `win-back:${latestStage}d:${activityAt.getTime()}`);
    }
  }
  return events;
}

export async function refreshDuePushEvent(
  event: PushEvent,
  now: Date,
  loadProfiles: (now: Date, playerId: string) => Promise<PushProfile[]>,
): Promise<PushEvent | null> {
  const [profile] = await loadProfiles(now, event.playerId);
  if (!profile) return null;
  return getDuePushEvents(profile, now)
    .find(current => current.kind === event.kind && current.eventKey === event.eventKey) ?? null;
}

export function createSingleFlightRunner<Args extends unknown[]>(
  job: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return (...args) => {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(() => job(...args)).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

type FirebaseMessaging = {
  sendEachForMulticast(message: {
    tokens: string[];
    notification: { title: string; body: string };
    data: Record<string, string>;
  }): Promise<{ responses: { success: boolean; error?: { code?: string } }[] }>;
};

let messagingPromise: Promise<FirebaseMessaging | null> | null = null;
let disabledLogged = false;
let jobHandle: ReturnType<typeof setInterval> | null = null;
const JOB_INTERVAL_MS = 5 * 60 * 1000;

async function getFirebaseMessaging(): Promise<FirebaseMessaging | null> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    if (!disabledLogged) {
      console.info("[push] Disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured; no notifications will be sent.");
      disabledLogged = true;
    }
    return null;
  }
  if (!messagingPromise) {
    messagingPromise = (async () => {
      try {
        const raw: unknown = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!);
        if (!raw || typeof raw !== "object") throw new Error("service account JSON must be an object");
        const account = raw as Record<string, unknown>;
        if (typeof account.project_id !== "string" || typeof account.client_email !== "string" ||
            typeof account.private_key !== "string") {
          throw new Error("service account JSON must include project_id, client_email, and private_key");
        }
        account.private_key = account.private_key.replace(/\\n/g, "\n");
        const [{ cert, getApps, initializeApp }, { getMessaging }] = await Promise.all([
          import("firebase-admin/app"),
          import("firebase-admin/messaging"),
        ]);
        const app = getApps()[0] ?? initializeApp({ credential: cert(account as any) });
        return getMessaging(app);
      } catch (error) {
        const category = error instanceof Error ? error.name : "Error";
        console.error(`[push] Firebase Admin credential initialization failed (${category}); check FIREBASE_SERVICE_ACCOUNT_JSON and service-account permissions. Push is disabled until the server restarts.`);
        return null;
      }
    })();
  }
  return messagingPromise;
}

const NOTIFICATION_COPY: Record<PushNotificationKind, { title: string; body: string }> = {
  streakAtRisk: { title: "Daily bonus streak at risk", body: "Claim your daily bonus before the UTC day resets to keep your streak going." },
  hourlyReady: { title: "Hourly bonus ready", body: "Your hourly chip bonus is ready to claim." },
  winBack: { title: "Your table is waiting", body: "Come back and see what’s new at Chain Gang Poker." },
};

async function getEligibleProfiles(now: Date, playerId?: string, executor: any = db): Promise<PushProfile[]> {
  const playerFilter = playerId ? sql`AND p.id = ${playerId}` : sql``;
  const result = await executor.execute(sql`
    SELECT p.id, p.last_bonus_claimed_at, p.last_hourly_reward_at, p.last_activity_at, p.created_at,
           pref.streak_at_risk, pref.hourly_ready, pref.win_back,
           array_agg(d.token) AS tokens
    FROM player_profiles p
    JOIN notification_devices d ON d.player_id = p.id
    LEFT JOIN notification_preferences pref ON pref.player_id = p.id
    WHERE p.is_deleted = false
      AND (p.banned_at IS NULL OR p.ban_expires_at <= ${now}::timestamp)
      ${playerFilter}
      AND (
        (COALESCE(pref.streak_at_risk, true) AND p.last_bonus_claimed_at IS NOT NULL
          AND ${now}::timestamp >= date_trunc('day', p.last_bonus_claimed_at) + interval '2 days' - interval '3 hours'
          AND ${now}::timestamp < date_trunc('day', p.last_bonus_claimed_at) + interval '2 days')
        OR (COALESCE(pref.hourly_ready, true) AND p.last_hourly_reward_at IS NOT NULL
          AND p.last_hourly_reward_at + interval '1 hour' <= ${now}::timestamp
          AND ${now}::timestamp < p.last_hourly_reward_at + interval '7 hours')
        OR (COALESCE(pref.win_back, true)
          AND COALESCE(p.last_activity_at, p.created_at) <= ${now}::timestamp - interval '3 days')
      )
    GROUP BY p.id, pref.streak_at_risk, pref.hourly_ready, pref.win_back
  `) as { rows: {
    id: string;
    last_bonus_claimed_at: Date | null;
    last_hourly_reward_at: Date | null;
    last_activity_at: Date | null;
    created_at: Date;
    streak_at_risk: boolean | null;
    hourly_ready: boolean | null;
    win_back: boolean | null;
    tokens: string[];
  }[] };

  return result.rows.map(row => ({
    id: row.id,
    lastBonusClaimedAt: row.last_bonus_claimed_at ? new Date(row.last_bonus_claimed_at) : null,
    lastHourlyRewardAt: row.last_hourly_reward_at ? new Date(row.last_hourly_reward_at) : null,
    lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at) : null,
    createdAt: new Date(row.created_at),
    preferences: {
      streakAtRisk: row.streak_at_risk ?? true,
      hourlyReady: row.hourly_ready ?? true,
      winBack: row.win_back ?? true,
    },
    tokens: row.tokens,
  }));
}

export interface PushJobDependencies {
  isConfigured(): Promise<boolean>;
  getProfiles(now: Date): Promise<PushProfile[]>;
  withPlayerLock(event: PushEvent, work: (context: any) => Promise<void>): Promise<void>;
  claim(event: PushEvent, context: any): Promise<boolean>;
  refresh(event: PushEvent, now: Date, context: any): Promise<PushEvent | null>;
  release(event: PushEvent, context: any): Promise<void>;
  send(event: PushEvent, context: any): Promise<number>;
  logError(error: unknown): void;
}

export async function runPushNotificationTick(deps: PushJobDependencies, now = new Date()): Promise<void> {
  // In particular, do not insert idempotency claims when credentials are absent.
  if (!await deps.isConfigured()) return;
  let profiles: PushProfile[];
  try {
    profiles = await deps.getProfiles(now);
  } catch (error) {
    deps.logError(error);
    return;
  }
  for (const profile of profiles) {
    for (const event of getDuePushEvents(profile, now)) {
      try {
        await deps.withPlayerLock(event, async context => {
          try {
            if (!await deps.claim(event, context)) return;
            const current = await deps.refresh(event, new Date(), context);
            if (!current) {
              await deps.release(event, context);
              return;
            }
            const successfulSends = await deps.send(current, context);
            if (successfulSends <= 0) await deps.release(event, context);
          } catch (error) {
            try {
              await deps.release(event, context);
            } catch (releaseError) {
              deps.logError(releaseError);
            }
            deps.logError(error);
          }
        });
      } catch (error) {
        deps.logError(error);
      }
    }
  }
}

const productionDependencies: PushJobDependencies = {
  isConfigured: async () => Boolean(await getFirebaseMessaging()),
  getProfiles: getEligibleProfiles,
  withPlayerLock: (event, work) => db.transaction(async tx => {
    await lockNotificationPlayers(tx, [event.playerId]);
    await work(tx);
  }),
  refresh: async (event, now, tx) => {
    // The per-player advisory lock serializes privacy changes. Read current
    // eligibility without locking the profile row across the external FCM call.
    return refreshDuePushEvent(event, now, (at, playerId) =>
      getEligibleProfiles(at, playerId, tx));
  },
  claim: async (event, tx) => {
    const inserted = await tx.insert(notificationClaims).values({
      playerId: event.playerId,
      eventKey: event.eventKey,
    }).onConflictDoNothing({
      target: [notificationClaims.playerId, notificationClaims.eventKey],
    }).returning({ id: notificationClaims.id });
    return inserted.length > 0;
  },
  release: async (event, tx) => {
    await tx.delete(notificationClaims).where(and(
      eq(notificationClaims.playerId, event.playerId),
      eq(notificationClaims.eventKey, event.eventKey),
    ));
  },
  send: async (event, tx) => {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return 0;
    let successes = 0;
    for (let start = 0; start < event.tokens.length; start += 500) {
      const tokens = event.tokens.slice(start, start + 500);
      try {
        const result = await messaging.sendEachForMulticast({
          tokens,
          notification: NOTIFICATION_COPY[event.kind],
          data: { type: event.kind },
        });
        successes += result.responses.filter(response => response.success).length;
        const staleTokens = result.responses.flatMap((response, index) =>
          !response.success && (
            response.error?.code === "messaging/registration-token-not-registered" ||
            response.error?.code === "messaging/invalid-registration-token"
          ) ? [tokens[index]] : []);
        if (staleTokens.length) {
          await tx.delete(notificationDevices).where(and(
            eq(notificationDevices.playerId, event.playerId),
            // Delete stale registrations without ever including token values in logs.
            inArray(notificationDevices.token, staleTokens),
          ));
        }
      } catch (error) {
        productionDependencies.logError(error);
      }
    }
    return successes;
  },
  logError: error => console.error("[push] Notification job failed:", error instanceof Error ? error.name : "unknown error"),
};

const runPushNotificationJobSingleFlight = createSingleFlightRunner(
  (now: Date) => runPushNotificationTick(productionDependencies, now),
);

export function runPushNotificationJob(now = new Date()): Promise<void> {
  return runPushNotificationJobSingleFlight(now);
}

export function startPushNotificationJob(): void {
  if (jobHandle) return;
  setTimeout(() => {
    void runPushNotificationJob().catch(productionDependencies.logError);
  }, 5_000);
  jobHandle = setInterval(() => {
    void runPushNotificationJob().catch(productionDependencies.logError);
  }, JOB_INTERVAL_MS);
}