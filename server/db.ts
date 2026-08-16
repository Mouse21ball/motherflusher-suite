import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// ── Slow-query logging ────────────────────────────────────────────────────────
// Wraps pool.query so any query that takes longer than SLOW_QUERY_THRESHOLD_MS
// is logged with [db:slow] prefix. Drizzle routes all standard queries through
// pool.query, so this captures the vast majority of database traffic.
const SLOW_QUERY_THRESHOLD_MS = 500;
const _originalPoolQuery = pool.query.bind(pool) as (...args: any[]) => any;
(pool as any).query = function (...args: any[]) {
  const start  = Date.now();
  const result = _originalPoolQuery(...args);
  if (result && typeof (result as any).then === 'function') {
    (result as any).then(
      () => {
        const ms = Date.now() - start;
        if (ms >= SLOW_QUERY_THRESHOLD_MS) {
          const text = (typeof args[0] === 'string' ? args[0] : (args[0]?.text ?? '')).slice(0, 120);
          console.warn(`[db:slow] ${ms}ms — ${text}`);
        }
      },
      () => { /* errors surface via the caller — don't double-log here */ },
    );
  }
  return result;
};

export const db = drizzle(pool, { schema });
