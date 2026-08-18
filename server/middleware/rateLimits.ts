import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

// ─── Shared handler factory ───────────────────────────────────────────────────
// Logs a structured fraud-signal line on every 429, then returns the error JSON.
// Logs: timestamp, real client IP, path, limit, and window — never the request body.
function makeHandler(errorMessage: string) {
  return (req: Request, res: Response, _next: NextFunction, options: Options) => {
    const retryAfterSeconds = Math.round((options.windowMs ?? 0) / 1000);
    console.log(
      `[RATE_LIMIT] timestamp=${new Date().toISOString()} ip=${req.ip} path=${req.path}` +
      ` limit=${options.limit} windowSec=${retryAfterSeconds}`,
    );
    res.status(429).json({ error: errorMessage, retryAfterSeconds });
  };
}

// ─── a) Login — short + escalating window ────────────────────────────────────
// Two limiters applied in sequence:
//   1. 5 failed attempts per IP per 15 minutes (normal throttle)
//   2. 10 failed attempts per IP per 1 hour   (escalated lockout)
// skipSuccessfulRequests: true → only failed logins (4xx/5xx) count.

const loginShortLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,
  limit:                  10,   // raised from 5 — server-side 5xx also count as failures,
                                 // and Apple reviewers / shared carrier IPs need more headroom
  skipSuccessfulRequests: true,
  standardHeaders:        true,
  legacyHeaders:          false,
  // Key by normalised IP + email so different email addresses on the same
  // shared IP (corporate Wi-Fi, mobile carrier CGNAT, App Review team) each
  // get their own independent bucket instead of sharing one quota for the
  // whole IP.  ipKeyGenerator() normalises IPv6 to avoid bypass via address
  // variants (required by express-rate-limit v7+ when using req.ip in keys).
  keyGenerator: (req: Request) => {
    const ip    = ipKeyGenerator(req.ip ?? '');
    const email = (req.body?.email as string | undefined)?.toLowerCase().trim() ?? '';
    return `${ip}:${email}`;
  },
  handler:                makeHandler('Too many login attempts. Try again later.'),
});

const loginLongLimiter = rateLimit({
  windowMs:               60 * 60 * 1000,
  limit:                  20,   // raised from 10 for same reason
  skipSuccessfulRequests: true,
  standardHeaders:        true,
  legacyHeaders:          false,
  keyGenerator: (req: Request) => {
    const ip    = ipKeyGenerator(req.ip ?? '');
    const email = (req.body?.email as string | undefined)?.toLowerCase().trim() ?? '';
    return `${ip}:${email}`;
  },
  handler:                makeHandler('Too many login attempts. Try again later.'),
});

export const loginRateLimit = [loginShortLimiter, loginLongLimiter];

// ─── b) Registration ──────────────────────────────────────────────────────────
// 3 attempts per IP per hour — covers /auth/register only (email/password
// account creation). See guestInitRateLimit below for the separate, more
// generous limiter applied to /auth/guest-init.

export const registrationRateLimit = rateLimit({
  windowMs:        60 * 60 * 1000,
  limit:           3,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         makeHandler('Too many registration attempts.'),
});

// ─── b2) Guest bootstrap — 30 per IP per hour ─────────────────────────────────
// Deliberately separate from registrationRateLimit. Guest-init creates a
// lightweight, low-risk guest profile (no email/password) and is the very
// first request every new visitor makes — including many real visitors who
// share a public IP behind CGNAT (mobile carriers, corporate/school Wi-Fi).
// Sharing the strict 3/hour registration bucket with guest-init silently
// hard-blocked the 4th+ legitimate guest behind a shared IP, which looked
// like "guest auth is broken" on the public production domain while never
// showing up in dev (single-machine testing rarely hits 3 requests/hour).
export const guestInitRateLimit = rateLimit({
  windowMs:        60 * 60 * 1000,
  limit:           30,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         makeHandler('Too many session attempts. Please try again shortly.'),
});

// ─── c) Daily bonus claim ─────────────────────────────────────────────────────
// 10 attempts per IP per hour — generous buffer for normal retries.

export const dailyBonusRateLimit = rateLimit({
  windowMs:        60 * 60 * 1000,
  limit:           10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         makeHandler('Too many bonus claim attempts.'),
});

// ─── d) Purchase verification — IP + per-session ─────────────────────────────
// Two limiters:
//   1. 20 per IP per hour
//   2. 30 per session-token (or IP fallback) per hour
//      Uses X-Session-Token header as a stable per-player key without a DB
//      lookup — the token itself is a sufficient unique discriminator.

const purchaseIpLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  limit:           20,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         makeHandler('Too many purchase verification attempts.'),
});

const purchasePlayerLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  limit:           30,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req: Request) =>
    req.get('X-Session-Token') ?? ipKeyGenerator(req.ip ?? ''),
  handler: makeHandler('Too many purchase verification attempts.'),
});

export const purchaseVerificationRateLimit = [purchaseIpLimiter, purchasePlayerLimiter];

// ─── e) General API safety net ────────────────────────────────────────────────
// 300 requests per IP per minute — catches abusive automation, not real users.
// Skips the billing simulation endpoints (test paths are X-Test-Secret gated
// anyway and must not be throttled during integration testing).

export const generalApiRateLimit = rateLimit({
  windowMs:        60 * 1000,
  limit:           300,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            (req: Request) => req.path.startsWith('/api/billing/test/'),
  handler:         makeHandler('Too many requests. Please slow down.'),
});

// ─── f) Report submission — 10 per user per hour ──────────────────────────────
// Keyed by session token so players can't evade via IP rotation.

export const reportRateLimit = rateLimit({
  windowMs:        60 * 60 * 1000,
  limit:           10,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req: Request) =>
    req.get('X-Session-Token') ?? ipKeyGenerator(req.ip ?? ''),
  handler:         makeHandler('You have submitted too many reports. Try again later.'),
});

// ─── g) Forgot password — 3 per IP per 15 minutes ────────────────────────────
// Low limit: email sending is expensive and this endpoint is unauthenticated.

export const forgotPasswordRateLimit = rateLimit({
  windowMs:        15 * 60 * 1000,
  limit:           3,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         makeHandler('Too many reset attempts. Please try again later.'),
});

// ─── g) Lady Luck table creation — 5 per player per 60 seconds ───────────────
// findOrCreateLLTable reuses existing LOBBY tables, so a regular user joining
// a game never creates more than one new table per session. This limit only
// fires for automation / spam that exhausts LOBBY slots faster than bots fill
// them.  Keyed by session token so authenticated players can't evade via proxy.

export const ladyLuckTableCreateLimit = rateLimit({
  windowMs:        60 * 1000,
  limit:           5,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req: Request) =>
    req.get('X-Session-Token') ?? ipKeyGenerator(req.ip ?? ''),
  handler:         makeHandler('Too many table creation attempts. Please wait a moment.'),
});
