// ─── Guest Account 24-hour Reset Job ─────────────────────────────────────────
// Runs on a periodic interval (every hour).
// Resets guest accounts (no email / no passwordHash) that are 24+ hours old.
//
// SAFETY GUARANTEE: Accounts with email OR passwordHash are NEVER touched.
// The check is applied at BOTH the query layer (WHERE clause) AND inside the
// loop (explicit double-check), so a schema anomaly cannot cause a logged-in
// account to be reset.
//
// DRY_RUN MODE: set env var GUEST_RESET_DRY_RUN=true to log what would be
// reset without actually writing anything to the database.

import { storage } from "./storage";

const DRY_RUN           = process.env.GUEST_RESET_DRY_RUN === "true";
const RESET_WINDOW_MS   = 24 * 60 * 60 * 1000;   // 24 hours
const JOB_INTERVAL_MS   = 60 * 60 * 1000;         // run every 1 hour

let jobHandle: ReturnType<typeof setInterval> | null = null;

// ── Core reset logic ──────────────────────────────────────────────────────────

async function runGuestResetJob(): Promise<void> {
  const cutoff = new Date(Date.now() - RESET_WINDOW_MS);
  const tag    = DRY_RUN ? "[guestReset:DRY_RUN]" : "[guestReset]";

  let candidates: Awaited<ReturnType<typeof storage.getEligibleGuestResets>>;
  try {
    candidates = await storage.getEligibleGuestResets(cutoff);
  } catch (err) {
    console.error(`${tag} Failed to query eligible guests:`, err);
    return;
  }

  if (candidates.length === 0) {
    console.log(`${tag} No guest accounts eligible for reset.`);
    return;
  }

  console.log(`${tag} Found ${candidates.length} guest account(s) eligible for reset.`);

  let resetCount = 0;
  let skipCount  = 0;
  let errorCount = 0;

  for (const guest of candidates) {
    // ── SAFETY: double-check auth status ──────────────────────────────────────
    // This must never be removed. Even if the DB query returns a row that
    // somehow has auth credentials, we stop here and never touch it.
    if (guest.email !== null || guest.passwordHash !== null) {
      console.log(
        `${tag} SKIP id=${guest.id} reason=has_auth email=${guest.email ?? "(none)"}`
      );
      skipCount++;
      continue;
    }

    const ref = guest.lastResetAt ?? guest.createdAt;
    const ageMs = Date.now() - ref.getTime();
    const ageHours = (ageMs / 3_600_000).toFixed(1);

    if (DRY_RUN) {
      console.log(
        `${tag} WOULD_RESET id=${guest.id} ` +
        `createdAt=${guest.createdAt.toISOString()} ` +
        `lastResetAt=${guest.lastResetAt?.toISOString() ?? "null"} ` +
        `ageHours=${ageHours}`
      );
      resetCount++;
      continue;
    }

    try {
      await storage.resetGuestAccount(guest.id);
      console.log(
        `${tag} RESET id=${guest.id} ` +
        `createdAt=${guest.createdAt.toISOString()} ` +
        `lastResetAt=${guest.lastResetAt?.toISOString() ?? "null"} ` +
        `ageHours=${ageHours}`
      );
      resetCount++;
    } catch (err) {
      // One failure must never abort the rest.
      console.error(`${tag} ERROR resetting id=${guest.id}:`, err);
      errorCount++;
    }
  }

  console.log(
    `${tag} Job complete. ` +
    `reset=${resetCount} skip=${skipCount} error=${errorCount}`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startGuestResetJob(): void {
  if (jobHandle) return; // already running

  if (DRY_RUN) {
    console.log("[guestReset] DRY_RUN mode enabled — no writes will occur.");
  }

  // Run once immediately on startup (after a short delay for DB to be ready)
  setTimeout(() => { void runGuestResetJob(); }, 5_000);

  // Then run every hour
  jobHandle = setInterval(() => { void runGuestResetJob(); }, JOB_INTERVAL_MS);
  console.log(`[guestReset] Job scheduled (interval=${JOB_INTERVAL_MS / 60_000}m, dryRun=${DRY_RUN})`);
}

export function stopGuestResetJob(): void {
  if (jobHandle) {
    clearInterval(jobHandle);
    jobHandle = null;
  }
}
