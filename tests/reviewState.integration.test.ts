import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import { playerProfiles } from "../shared/schema";

const playerId = `test-review-state-${randomUUID()}`;

describe.skipIf(!process.env.DATABASE_URL)("review state (development database)", () => {
  afterAll(async () => {
    await db.delete(playerProfiles).where(eq(playerProfiles.id, playerId));
  });

  it("atomically claims one prompt per seven-day window and keeps rated monotonic", async () => {
    await storage.getOrCreatePlayer(playerId);
    expect(await storage.getReviewState(playerId)).toEqual({
      hasRated: false,
      lastReviewPromptAt: null,
    });

    const concurrentClaims = await Promise.all([
      storage.claimReviewPrompt(playerId),
      storage.claimReviewPrompt(playerId),
    ]);
    expect(concurrentClaims.filter(result => result.eligible)).toHaveLength(1);
    expect(concurrentClaims.filter(result => !result.eligible)).toHaveLength(1);
    expect(concurrentClaims[0].state?.lastReviewPromptAt).toBeInstanceOf(Date);

    await db.update(playerProfiles)
      .set({ lastReviewPromptAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1000) })
      .where(eq(playerProfiles.id, playerId));
    expect((await storage.claimReviewPrompt(playerId)).eligible).toBe(true);

    expect(await storage.markPlayerRated(playerId)).toMatchObject({ hasRated: true });
    expect(await storage.markPlayerRated(playerId)).toMatchObject({ hasRated: true });
    await db.update(playerProfiles)
      .set({ lastReviewPromptAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
      .where(eq(playerProfiles.id, playerId));
    const afterRating = await storage.claimReviewPrompt(playerId);
    expect(afterRating.eligible).toBe(false);
    expect(afterRating.state?.hasRated).toBe(true);
  });
});