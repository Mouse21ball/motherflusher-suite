import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, randomUUID, sign as signPayload } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import { adMobAdUnitMatches, verifyAdMobSsvQuery } from "../server/admobSsv";
import { isRewardedAdTestModeEnabled, rewardedAdUnitId } from "../server/rewardedAdConfig";
import {
  REWARDED_AD_PLAYER_RATE_LIMIT,
  REWARDED_AD_PLAYER_RATE_WINDOW_MS,
  rewardedAdPlayerRateLimitKey,
} from "../server/middleware/rateLimits";
import type { Request } from "express";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const verifierKeys = [{ keyId: 123, pem: publicKey.export({ type: "spki", format: "pem" }).toString() }];
const adUnitId = "ca-app-pub-1234567890123456/1234567890";

describe("rewarded AdMob units", () => {
  it("uses the supplied production units for both native platforms", () => {
    expect(rewardedAdUnitId("android", false)).toBe("ca-app-pub-1122384597919929/4402812186");
    expect(rewardedAdUnitId("ios", false)).toBe("ca-app-pub-1122384597919929/4402812186");
  });

  it("keeps sample units confined to non-production test sessions", () => {
    expect(rewardedAdUnitId("android", true)).toBe("ca-app-pub-3940256099942544/5224354917");
    expect(rewardedAdUnitId("ios", true)).toBe("ca-app-pub-3940256099942544/1712485313");
    expect(isRewardedAdTestModeEnabled("production", "true")).toBe(false);
  });
});

function signedCallback(fields: Record<string, string>, signatureFirst = false): string {
  const signedQuery = new URLSearchParams(fields).toString();
  const signature = signPayload("sha256", Buffer.from(signedQuery), privateKey).toString("base64");
  const suffix = signatureFirst
    ? `signature=${encodeURIComponent(signature)}&key_id=123`
    : `key_id=123&signature=${encodeURIComponent(signature)}`;
  return `${signedQuery}&${suffix}`;
}

describe("AdMob rewarded-ad SSV", () => {
  it("accepts a correctly signed 500-chip event for the configured ad unit", () => {
    const query = signedCallback({
      ad_unit: adUnitId,
      custom_data: "46a3c61e-0407-41dc-80b5-862d85105cc1",
      reward_amount: "500",
      reward_item: "chips",
      timestamp: "1780000000000",
      transaction_id: "google-ssv-event-unique",
    });

    expect(verifyAdMobSsvQuery(query, verifierKeys, adUnitId, 1_780_000_000_000)).toMatchObject({
      watchSessionId: "46a3c61e-0407-41dc-80b5-862d85105cc1",
      adUnitId,
      rewardAmount: 500,
      rewardItem: "chips",
      transactionId: "google-ssv-event-unique",
    });
    expect(verifyAdMobSsvQuery(
      signedCallback({
        ad_unit: adUnitId,
        custom_data: "46a3c61e-0407-41dc-80b5-862d85105cc1",
        reward_amount: "500",
        reward_item: "chips",
        timestamp: "1780000000000",
        transaction_id: "google-ssv-event-unique-2",
      }, true),
      verifierKeys,
      adUnitId,
      1_780_000_000_000,
    )).not.toBeNull();
  });

  it("rejects altered or unexpected rewards and unknown signing keys", () => {
    const query = signedCallback({
      ad_unit: adUnitId,
      custom_data: "46a3c61e-0407-41dc-80b5-862d85105cc1",
      reward_amount: "500",
      reward_item: "chips",
      timestamp: "1780000000000",
      transaction_id: "google-ssv-event-unique",
    });
    expect(verifyAdMobSsvQuery(query.replace("reward_amount=500", "reward_amount=5000"), verifierKeys, adUnitId, 1_780_000_000_000)).toBeNull();
    expect(verifyAdMobSsvQuery(`${query}&custom_data=46a3c61e-0407-41dc-80b5-862d85105cc1`, verifierKeys, adUnitId, 1_780_000_000_000)).toBeNull();
    expect(verifyAdMobSsvQuery(query.replace("%2F", "/"), verifierKeys, adUnitId, 1_780_000_000_000)).toBeNull();
    expect(verifyAdMobSsvQuery(query, verifierKeys, "another-ad-unit", 1_780_000_000_000)).toBeNull();
    expect(verifyAdMobSsvQuery(query, [], adUnitId, 1_780_000_000_000)).toBeNull();
    expect(verifyAdMobSsvQuery("custom_data=46a3c61e-0407-41dc-80b5-862d85105cc1", verifierKeys, adUnitId)).toBeNull();
  });

  it("accepts Google's signed numeric-slot format without using its configured amount as the chip grant", () => {
    const query = signedCallback({
      ad_unit: "1234567890", custom_data: "46a3c61e-0407-41dc-80b5-862d85105cc1",
      reward_amount: "1", reward_item: "Reward", timestamp: "1780000000000",
      transaction_id: "google-default-reward-configuration",
    });
    expect(verifyAdMobSsvQuery(query, verifierKeys, adUnitId, 1_780_000_000_000))
      .toMatchObject({ rewardAmount: 1, rewardItem: "Reward" });
    expect(adMobAdUnitMatches(adUnitId, "9999999999")).toBe(false);
    expect(adMobAdUnitMatches(adUnitId, "ca-app-pub-9999999999999999/1234567890")).toBe(false);
    expect(verifyAdMobSsvQuery(signedCallback({
      ad_unit: "1234567890", custom_data: "46a3c61e-0407-41dc-80b5-862d85105cc1",
      reward_amount: "0", reward_item: "Reward", timestamp: "1780000000000", transaction_id: "zero",
    }), verifierKeys, adUnitId, 1_780_000_000_000)).toBeNull();
  });

  it("keeps production completion on SSV and labels test completion as non-production-only", () => {
    const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
    const client = readFileSync(new URL("../client/src/lib/rewardedAds.ts", import.meta.url), "utf8");
    expect(routes).toContain("isRewardedAdTestModeEnabled(");
    expect(routes).toContain("verifyAdMobSsvQuery(rawQuery, keys)");
    expect(routes).toContain('if (process.env.NODE_ENV === "production" || !rewardedAdTestModeEnabled)');
    expect(client).toContain("Production credit remains exclusively SSV-verified.");
    expect(client).toContain("ssv: { customData: session.sessionId }");
  });

  it("defaults to test units outside production, supports an opt-out, and never enables test completion in production", () => {
    expect(isRewardedAdTestModeEnabled("development", undefined)).toBe(true);
    expect(isRewardedAdTestModeEnabled("test", undefined)).toBe(true);
    expect(isRewardedAdTestModeEnabled("development", "false")).toBe(false);
    expect(isRewardedAdTestModeEnabled("production", "true")).toBe(false);
    expect(isRewardedAdTestModeEnabled("production", undefined)).toBe(false);
  });

  it("rate-limits by authenticated player identity, independent of rotating session tokens", () => {
    const first = { sessionPlayerId: "player-1", headers: { "x-session-token": "token-a" } } as unknown as Request;
    const rotated = { sessionPlayerId: "player-1", headers: { "x-session-token": "token-b" } } as unknown as Request;
    const anotherPlayer = { sessionPlayerId: "player-2", headers: { "x-session-token": "token-a" } } as unknown as Request;
    expect(rewardedAdPlayerRateLimitKey(first)).toBe(rewardedAdPlayerRateLimitKey(rotated));
    expect(rewardedAdPlayerRateLimitKey(first)).not.toBe(rewardedAdPlayerRateLimitKey(anotherPlayer));
    expect(REWARDED_AD_PLAYER_RATE_LIMIT).toBe(5);
    expect(REWARDED_AD_PLAYER_RATE_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});

let hasRewardedAdTable = false;
if (process.env.DATABASE_URL) {
  const result = await db.execute(sql`SELECT to_regclass('public.rewarded_ad_sessions') IS NOT NULL AS available`);
  hasRewardedAdTable = Boolean(result?.rows?.[0]?.available);
}

describe.skipIf(!hasRewardedAdTable)("rewarded-ad chip credit ledger", () => {
  const playerId = `test-rewarded-ad-${randomUUID()}`;
  const sessionId = randomUUID();
  const transactionId = `test-admob-ssv-${randomUUID()}`;

  afterEach(async () => {
    await storage.deletePlayer(playerId);
  });

  it("credits exactly 500 chips for a watch session even when completion is replayed", async () => {
    const player = await storage.getOrCreatePlayer(playerId);
    await storage.createRewardedAdSession({
      id: sessionId,
      bustEventId: `test-bust:${sessionId}`,
      playerId,
      adUnitId,
      testMode: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const first = await storage.completeRewardedAdSession({
      id: sessionId,
      transactionId,
      completedAt: new Date(),
    });
    const replay = await storage.completeRewardedAdSession({
      id: sessionId,
      transactionId,
      completedAt: new Date(),
    });
    const after = await storage.getPlayerProfile(playerId);

    expect(first).toMatchObject({ completed: true, idempotent: false, newBalance: player.chipBalance + 500 });
    expect(replay).toMatchObject({ completed: true, idempotent: true });
    expect(after?.chipBalance).toBe(player.chipBalance + 500);
  });

  it("does not credit a session after expiry", async () => {
    const player = await storage.getOrCreatePlayer(playerId);
    await storage.createRewardedAdSession({
      id: sessionId,
      bustEventId: `test-bust:${sessionId}`,
      playerId,
      adUnitId,
      testMode: false,
      createdAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const result = await storage.completeRewardedAdSession({
      id: sessionId,
      transactionId,
      completedAt: new Date(),
    });

    expect(result.completed).toBe(false);
    expect((await storage.getPlayerProfile(playerId))?.chipBalance).toBe(player.chipBalance);
  });

  it("deduplicates concurrent session starts and distinct reward callbacks for the same bust", async () => {
    const player = await storage.getOrCreatePlayer(playerId);
    const bustEventId = `bust:${randomUUID()}`;
    const sessions = await Promise.all(Array.from({ length: 8 }, () => storage.createRewardedAdSession({
      id: randomUUID(), playerId, bustEventId, adUnitId, testMode: false,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    })));
    expect(new Set(sessions.map(session => session.id)).size).toBe(1);
    // A forged client notification only locks playback; it never changes money.
    await storage.confirmRewardedAdSession(sessions[0].id, playerId);
    expect((await storage.getPlayerProfile(playerId))?.chipBalance).toBe(player.chipBalance);
    const completions = await Promise.all(Array.from({ length: 8 }, () => storage.completeRewardedAdSession({
      id: sessions[0].id, transactionId: randomUUID(), completedAt: new Date(),
    })));
    expect(completions.filter(result => result.completed && !result.idempotent)).toHaveLength(1);
    expect((await storage.getPlayerProfile(playerId))?.chipBalance).toBe(player.chipBalance + 500);
    const reopened = await storage.createRewardedAdSession({
      id: randomUUID(), playerId, bustEventId, adUnitId, testMode: false,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });
    expect(reopened.id).toBe(sessions[0].id);
    expect(reopened.completedAt).not.toBeNull();
  });

  it("keeps one bust identity across zero-delta spectator hands and rewards, but permits a genuinely new loss", async () => {
    await storage.getOrCreatePlayer(playerId);
    const gameId = `ad-bust-${randomUUID()}`;
    const settle = (deltaChips: number, handId: string) => storage.syncPlayerChips(playerId, deltaChips, {
      won: false, deltaChips, gameId, handId, modeId: "badugi", potSize: 25,
    });
    expect(await storage.getRewardedAdBustEvent(playerId, gameId)).toBeNull();
    await settle(-25, "first-loss");
    const first = await storage.getRewardedAdBustEvent(playerId, gameId);
    expect(first).not.toBeNull();
    await settle(0, "watching-later-hand");
    expect(await storage.getRewardedAdBustEvent(playerId, gameId)).toBe(first);
    await settle(-25, "new-loss-after-funding");
    expect(await storage.getRewardedAdBustEvent(playerId, gameId)).not.toBe(first);
  });

  it("renews an unconfirmed expired session, rejects legacy and foreign sessions, and grants again only for a new bust", async () => {
    const player = await storage.getOrCreatePlayer(playerId);
    const bustEventId = `renewable:${randomUUID()}`;
    const expiredId = randomUUID();
    await storage.createRewardedAdSession({
      id: expiredId, playerId, bustEventId, adUnitId, testMode: false,
      createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000),
    });
    const renewedId = randomUUID();
    const renewed = await storage.createRewardedAdSession({
      id: renewedId, playerId, bustEventId, adUnitId, testMode: false,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });
    expect(renewed.id).toBe(renewedId);
    expect(await storage.getRewardedAdSession(renewedId, "not-the-owner")).toBeNull();
    expect((await storage.completeRewardedAdSession({
      id: expiredId, transactionId: randomUUID(), completedAt: new Date(),
    })).completed).toBe(false);

    const legacyId = randomUUID();
    await db.execute(sql`INSERT INTO rewarded_ad_sessions
      (id, player_id, ad_unit_id, test_mode, created_at, expires_at)
      VALUES (${legacyId}, ${playerId}, ${adUnitId}, false, NOW(), NOW() + interval '1 minute')`);
    expect((await storage.completeRewardedAdSession({
      id: legacyId, transactionId: randomUUID(), completedAt: new Date(),
    })).completed).toBe(false);
    await storage.completeRewardedAdSession({ id: renewedId, transactionId: randomUUID(), completedAt: new Date() });
    const newBust = await storage.createRewardedAdSession({
      id: randomUUID(), playerId, bustEventId: `new-bust:${randomUUID()}`, adUnitId, testMode: false,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });
    await storage.completeRewardedAdSession({ id: newBust.id, transactionId: randomUUID(), completedAt: new Date() });
    expect((await storage.getPlayerProfile(playerId))?.chipBalance).toBe(player.chipBalance + 1_000);
  });
});