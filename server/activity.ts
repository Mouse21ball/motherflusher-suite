import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { playerProfiles } from "@shared/schema";

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Record deliberate table play/join activity. Unlike generic authenticated HTTP
 * traffic, this is not refreshed by background status polling.
 */
export async function recordMeaningfulActivity(playerId: string, now = new Date()): Promise<void> {
  try {
    await db.update(playerProfiles)
      .set({ lastActivityAt: now })
      .where(and(
        eq(playerProfiles.id, playerId),
        sql`(${playerProfiles.lastActivityAt} IS NULL OR ${playerProfiles.lastActivityAt} < ${new Date(now.getTime() - ACTIVITY_WRITE_INTERVAL_MS)})`,
      ));
  } catch {
    // Retention tracking must never interrupt a valid game interaction.
  }
}