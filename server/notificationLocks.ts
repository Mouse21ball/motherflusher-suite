import { sql } from "drizzle-orm";

export interface AdvisoryLockExecutor {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

async function lockNamedKeys(tx: AdvisoryLockExecutor, keys: string[]): Promise<void> {
  for (const key of [...new Set(keys)].sort()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}

export function lockNotificationPlayers(tx: AdvisoryLockExecutor, playerIds: string[]): Promise<void> {
  return lockNamedKeys(tx, playerIds.map(playerId => `push-player:${playerId}`));
}

export function lockNotificationBindings(tx: AdvisoryLockExecutor, keys: string[]): Promise<void> {
  return lockNamedKeys(tx, keys.map(key => `push-binding:${key}`));
}