import * as Sentry from "@sentry/node";

// Initialize Sentry server-side error tracking.
// Set SENTRY_DSN in Replit Secrets to enable (completely silent when absent).
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
  });
  console.log("[sentry] initialized (server)");
}

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initRooms } from "./rooms";
import { initEngine } from "./gameEngine";
import { initGenericEngine } from "./genericEngine";
import { flushAllPending, flushAllGenericPending } from "./tablePersistence";
import { flushAllLadyLuckPending } from "./ladyluckPersistence";
import { initLadyLuckEngine } from "./ladyluckEngine";
import { startGuestResetJob } from "./guestReset";
import { generalApiRateLimit } from "./middleware/rateLimits";
import { seedCosmeticItems, seedMusicTracks } from "./storage";
import { db } from "./db";
import { purchaseTransactions, playerProfiles } from "../shared/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

// Flush all debounced persistence writes before the process exits
// so mid-hand state is not lost on graceful restart (SIGTERM from nodemon/pm2).
function onShutdown(signal: string): void {
  console.log(`[server] ${signal} received — flushing persistence...`);
  flushAllPending();
  flushAllGenericPending();
  flushAllLadyLuckPending();
  process.exit(0);
}
process.once('SIGTERM', () => onShutdown('SIGTERM'));
process.once('SIGINT',  () => onShutdown('SIGINT'));

const app = express();
const httpServer = createServer(app);

// Trust the first hop proxy (Replit's load balancer) so req.ip resolves to the
// real client IP, not the proxy's IP.  Without this every request looks like it
// comes from the same address and rate limiting becomes useless.
app.set('trust proxy', 1);

// CORS — must be registered before any routes or body parsers so that
// preflight OPTIONS requests are handled before they hit auth middleware.
const ALLOWED_ORIGINS = new Set([
  'https://localhost',              // Capacitor Android WebView
  'capacitor://localhost',          // Capacitor iOS WebView
  'https://chaing-gang-poker.replit.app', // production web (Replit domain)
  'https://chainggangpoker.com',    // production web (custom domain, non-www)
  'https://www.chainggangpoker.com',// production web (www variant — some browsers add this)
  'http://localhost:5173',          // Vite dev server
  'http://localhost:5000',          // local server testing
]);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Pub/Sub webhooks)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    // Allow all Replit preview/dev subdomains (dynamic URLs in the editor)
    if (origin.endsWith('.replit.dev') || origin.endsWith('.repl.co')) return callback(null, true);
    callback(new Error(`CORS: origin not allowed — ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Session-Token'],
}));

app.use(express.json());

app.use(express.urlencoded({ extended: false }));
app.use(express.text({ type: "text/plain" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// ─── Response-body redaction ──────────────────────────────────────────────────
// Redacts known-sensitive keys from a response body before it reaches the log.
// Deep-clones the object so the actual HTTP response is never altered.
const REDACTED_KEYS = new Set([
  'sessionToken', 'token', 'password', 'passwordHash', 'hashedPassword',
  'refreshToken', 'accessToken', 'idToken', 'googlePlayServiceAccount',
  'serviceAccountKey',
]);
const SENSITIVE_KEY_PATTERN = /secret|private[_\-]?key/i;

function shouldRedactKey(key: string): boolean {
  return REDACTED_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key);
}

function redactSensitive(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (shouldRedactKey(k)) {
      out[k] = '[REDACTED]';
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactSensitive(v as Record<string, any>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const safe = redactSensitive(capturedJsonResponse);
        logLine += ` :: ${JSON.stringify(safe)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await seedCosmeticItems();
  await seedMusicTracks();
  console.log('[seed] Cosmetic items checked/seeded.');

  // Ensure ladyluck_race_results table exists (direct SQL to avoid interactive db:push)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ladyluck_race_results (
        id            SERIAL PRIMARY KEY,
        table_id      TEXT        NOT NULL,
        room_type     TEXT        NOT NULL,
        winning_suit  TEXT        NOT NULL,
        flipped_cards JSONB       NOT NULL,
        seat_results  JSONB       NOT NULL,
        played_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ll_race_results_played_idx ON ladyluck_race_results (played_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ll_race_results_room_idx   ON ladyluck_race_results (room_type)`);
    console.log('[startup] ladyluck_race_results table ensured.');
  } catch (tableErr: any) {
    console.error('[startup] Failed to ensure ladyluck_race_results table:', tableErr.message);
  }

  // ONE-TIME CLEANUP (2026-05-30): Reset purchase_transaction rows that were marked
  // "rejected" due to the missing googleapis bundle crash (all rows from the era before
  // @googleapis/androidpublisher was introduced). These rows have no googleOrderId or
  // verifiedAt because the Google API was never reached — the crash happened at the
  // dynamic import stage. Resetting to "failed_retryable" allows the approved handler
  // auto-retry on next app launch to re-enter the verification flow.
  // Safe to run on every startup: after this deploy all new infrastructure failures are
  // tagged "failed_retryable" directly, so the only "rejected" rows remaining are
  // ones where Google confirmed the purchase was bad (those will re-reject cleanly on retry).
  try {
    const resetResult = await db
      .update(purchaseTransactions)
      .set({ verificationStatus: "failed_retryable" })
      .where(
        and(
          eq(purchaseTransactions.verificationStatus, "rejected"),
          isNull(purchaseTransactions.googleOrderId),
          isNull(purchaseTransactions.verifiedAt),
        )
      )
      .returning({ id: purchaseTransactions.id, token: purchaseTransactions.purchaseToken });
    if (resetResult.length > 0) {
      console.log(
        `[startup] Reset ${resetResult.length} rejected→failed_retryable purchase_transaction(s):`,
        resetResult.map(r => `${r.id.slice(0, 8)}… token=…${r.token.slice(-8)}`).join(', '),
      );
    }
  } catch (cleanupErr: any) {
    console.error('[startup] Failed to run infrastructure-rejection cleanup:', cleanupErr.message);
  }

  // Grant admin status to the account identified by the ADMIN_EMAIL env var.
  // Safe to run on every startup — UPDATE is a no-op if isAdmin is already true.
  // If ADMIN_EMAIL is not set, this block is skipped entirely.
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    try {
      const adminResult = await db
        .update(playerProfiles)
        .set({ isAdmin: true })
        .where(eq(playerProfiles.email, adminEmail))
        .returning({ id: playerProfiles.id });
      if (adminResult.length > 0) {
        console.log(`[admin] granted isAdmin=true to ${adminEmail}`);
      }
    } catch (adminErr: any) {
      console.error(`[admin] Failed to grant admin to ${adminEmail}:`, adminErr.message);
    }
  } else {
    console.log('[admin] ADMIN_EMAIL not set — skipping admin grant');
  }

  await initEngine();              // restore persisted Badugi tables before WS server opens
  await initGenericEngine();       // restore persisted Dead7/Fifteen35/SuitsPoker tables
  await initLadyLuckEngine(); // restore persisted Lady Luck tables + refund crash wagers
  initRooms(httpServer);
  startGuestResetJob();      // hourly guest-account 24h reset

  // General API safety-net limiter — scoped to /api/ only so Vite's static
  // asset requests are never counted.  Applied AFTER the logging middleware so
  // that requests are logged before being rejected, and BEFORE route definitions
  // so every uncategorized API endpoint inherits this floor.  Simulation
  // endpoints (/api/billing/test/*) are skipped — they're X-Test-Secret gated.
  app.use('/api', generalApiRateLimit);

  await registerRoutes(httpServer, app);

  // Sentry Express error handler — must come before the custom error handler so
  // Sentry can capture the error object before it is converted to JSON.
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // ── Google Search Console ownership verification ─────────────────────────
  // Must be registered BEFORE serveStatic / Vite catch-all so the SPA fallback
  // doesn't intercept this URL and serve the React app instead.
  app.get('/google617a2c28516b9bb1.html', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('google-site-verification: google617a2c28516b9bb1.html');
  });

  // ── Privacy Policy ──────────────────────────────────────────────────────────
  // Registered before serveStatic / Vite catch-all so the SPA doesn't intercept.
  app.get('/privacy', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — Chain Gang Poker</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0e;
      color: #d4d4d8;
      line-height: 1.7;
      padding: 24px 16px 64px;
    }
    .wrap { max-width: 680px; margin: 0 auto; }
    .logo {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #C9A227;
      margin-bottom: 32px;
    }
    h1 {
      font-size: clamp(22px, 5vw, 30px);
      font-weight: 700;
      color: #f4f4f5;
      margin-bottom: 8px;
    }
    .meta {
      font-size: 13px;
      color: rgba(255,255,255,0.35);
      margin-bottom: 40px;
    }
    h2 {
      font-size: 16px;
      font-weight: 600;
      color: #f4f4f5;
      margin: 36px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    p { margin-bottom: 12px; font-size: 15px; }
    ul { padding-left: 20px; margin-bottom: 12px; }
    li { font-size: 15px; margin-bottom: 6px; }
    a { color: #C9A227; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer {
      margin-top: 56px;
      padding-top: 20px;
      border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 13px;
      color: rgba(255,255,255,0.30);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">Chain Gang Poker</div>

    <h1>Privacy Policy</h1>
    <p class="meta">DGM Entertainment LLC &nbsp;·&nbsp; Last updated: August 2026</p>

    <p>
      This Privacy Policy describes how DGM Entertainment LLC ("we", "us", or "our")
      collects, uses, and protects your information when you play Chain Gang Poker.
      By using the app, you agree to the practices described here.
    </p>

    <h2>Information We Collect</h2>
    <p>We collect the following information when you create an account or play the game:</p>
    <ul>
      <li><strong>Email address</strong> — used for account login and password recovery</li>
      <li><strong>Username and User ID</strong> — used to identify you within the game</li>
      <li><strong>Purchase history</strong> — records of in-app purchases made through your app store account</li>
      <li><strong>Gameplay activity</strong> — game results, chip balances, and feature usage to provide and improve the service</li>
    </ul>
    <p>We do not collect payment card numbers. All payment processing is handled by Google Play or the Apple App Store.</p>

    <h2>How We Use Your Information</h2>
    <ul>
      <li>To create and manage your account</li>
      <li>To provide the game service, including multiplayer features and leaderboards</li>
      <li>To process and verify in-app purchases</li>
      <li>To send account-related emails (e.g. password reset)</li>
      <li>To diagnose technical issues and improve the game over time</li>
    </ul>

    <h2>In-App Purchases</h2>
    <p>
      Purchases made within Chain Gang Poker are processed entirely by
      <strong>Google Play</strong> or the <strong>Apple App Store</strong>, depending
      on your device. We receive a transaction receipt to verify and apply your purchase,
      but we do not store your payment card details or billing address.
      Please review Google's and Apple's privacy policies for information on how they
      handle your payment data.
    </p>

    <h2>Data Sharing</h2>
    <p>
      <strong>We do not sell your personal data to third parties.</strong>
      We do not share your information with advertisers or data brokers.
      We may share data only as required by law or to protect the rights and safety of
      our users.
    </p>

    <h2>Data Retention</h2>
    <p>
      We retain your account information for as long as your account is active.
      If you wish to delete your account and associated data, please contact us at
      the email address below.
    </p>

    <h2>Security</h2>
    <p>
      We use industry-standard practices to protect your information, including
      encrypted connections (HTTPS) and hashed password storage. No method of
      transmission over the internet is 100% secure, and we cannot guarantee
      absolute security.
    </p>

    <h2>Children's Privacy</h2>
    <p>
      Chain Gang Poker is not directed at children under the age of 13.
      We do not knowingly collect personal information from children under 13.
      If you believe a child has provided us with personal information, please
      contact us and we will delete it promptly.
    </p>

    <h2>Changes to This Policy</h2>
    <p>
      We may update this Privacy Policy from time to time. When we do, we will
      update the "Last updated" date at the top. Continued use of the app after
      changes are posted constitutes your acceptance of the revised policy.
    </p>

    <h2>Contact Us</h2>
    <p>
      If you have any questions or requests regarding this Privacy Policy, please
      contact us at:<br />
      <a href="mailto:dgm.entertainment2026@gmail.com">dgm.entertainment2026@gmail.com</a>
    </p>
    <p>
      <strong>DGM Entertainment LLC</strong>
    </p>

    <div class="footer">
      &copy; 2026 DGM Entertainment LLC. All rights reserved.
      &nbsp;·&nbsp; <a href="/">Back to Chain Gang Poker</a>
    </div>
  </div>
</body>
</html>`);
  });

  // ── Terms of Use ────────────────────────────────────────────────────────────
  app.get('/terms', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms of Use — Chain Gang Poker</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0e;
      color: #d4d4d8;
      line-height: 1.7;
      padding: 24px 16px 64px;
    }
    .wrap { max-width: 680px; margin: 0 auto; }
    .logo { font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #C9A227; margin-bottom: 32px; }
    h1 { font-size: clamp(22px, 5vw, 30px); font-weight: 700; color: #f4f4f5; margin-bottom: 8px; }
    .meta { font-size: 13px; color: rgba(255,255,255,0.35); margin-bottom: 40px; }
    h2 { font-size: 16px; font-weight: 600; color: #f4f4f5; margin: 36px 0 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08); }
    p { margin-bottom: 12px; font-size: 15px; }
    ul { padding-left: 20px; margin-bottom: 12px; }
    li { font-size: 15px; margin-bottom: 6px; }
    a { color: #C9A227; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .notice { background: rgba(201,162,39,0.10); border: 1px solid rgba(201,162,39,0.25); border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; font-size: 14px; }
    .footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 13px; color: rgba(255,255,255,0.30); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">Chain Gang Poker</div>
    <h1>Terms of Use</h1>
    <p class="meta">DGM Entertainment LLC &nbsp;·&nbsp; Last updated: August 2026</p>

    <div class="notice">
      <strong>Not Real Money Gambling.</strong> Chain Gang Poker is a free-to-play social card game.
      All chips and virtual currency in the game have no real-world monetary value and cannot be
      exchanged for cash, prizes, or anything of value outside the game. No real money is wagered.
    </div>

    <h2>1. Acceptance of Terms</h2>
    <p>
      By downloading, installing, or playing Chain Gang Poker ("the Game"), you agree to be bound
      by these Terms of Use ("Terms"). If you do not agree, do not use the Game.
      These Terms constitute a legal agreement between you and DGM Entertainment LLC ("we", "us", or "our").
    </p>

    <h2>2. Eligibility</h2>
    <p>
      You must be at least 13 years of age to use Chain Gang Poker. If you are between 13 and 18,
      you represent that a parent or legal guardian has reviewed and agrees to these Terms on your behalf.
      We do not knowingly collect information from children under 13.
    </p>

    <h2>3. Description of the Game</h2>
    <p>
      Chain Gang Poker is a free-to-play social poker card game offering multiple poker variants
      for entertainment purposes. The Game uses virtual chips and a virtual currency called Stripes
      (◆) for in-game play. No real money is wagered at any time.
    </p>

    <h2>4. Virtual Currency and Virtual Items</h2>
    <p>
      The Game contains two types of virtual currency:
    </p>
    <ul>
      <li><strong>Chips</strong> — used to place in-game bets. Awarded for free via daily bonuses,
        game wins, and promotional events. May also be purchased indirectly via Stripes.</li>
      <li><strong>Stripes (◆)</strong> — a premium virtual currency used to purchase in-game items,
        cosmetics, and chip packs. Stripes can be purchased through your app store (Google Play or
        Apple App Store) or earned through subscriptions and promotions.</li>
    </ul>
    <p>
      <strong>Virtual currency has no real-world value.</strong> Chips and Stripes cannot be
      transferred, sold, exchanged, or redeemed for real money, goods, or services outside the Game.
      They are licensed to you, not sold, and remain the property of DGM Entertainment LLC.
      Virtual currency balances may be reduced, modified, or removed at our discretion, including
      if your account is terminated for violations of these Terms.
    </p>

    <h2>5. In-App Purchases</h2>
    <p>
      The Game offers optional in-app purchases of Stripes packs through Google Play and the Apple
      App Store. All purchases are:
    </p>
    <ul>
      <li>Processed by the applicable app store (Google or Apple), not by us directly</li>
      <li>Final and non-refundable except as required by applicable law or app store policies</li>
      <li>Subject to the payment terms of the app store through which you make the purchase</li>
    </ul>
    <p>
      To request a refund, contact Google Play or the Apple App Store directly through their
      standard refund processes. We do not process refunds for in-app purchases.
    </p>

    <h2>6. Subscription Terms</h2>
    <p>
      Chain Gang Poker offers two auto-renewing subscription tiers — <strong>Gold Pro</strong>
      and <strong>Diamond Elite</strong> — available on a monthly or yearly basis.
    </p>
    <ul>
      <li>Subscriptions automatically renew at the end of each billing period unless cancelled
        at least 24 hours before the renewal date.</li>
      <li>Your app store account will be charged for renewal within 24 hours prior to the end
        of the current period.</li>
      <li>You may manage or cancel your subscription at any time through your Google Play or
        Apple App Store account settings.</li>
      <li>Cancellation takes effect at the end of the current billing period; you retain access
        to subscription benefits until then.</li>
      <li>Monthly Stripes grants included with subscriptions are applied at the start of each
        billing cycle and are non-refundable once credited.</li>
      <li>We reserve the right to change subscription pricing with reasonable notice. Continued
        use of a subscription after a price change constitutes acceptance of the new price.</li>
    </ul>

    <h2>7. No Real Money Gambling</h2>
    <p>
      Chain Gang Poker is strictly a social entertainment game. All poker gameplay uses virtual
      chips only. There is no real-money wagering, no chance to win real money or prizes, and no
      element of real gambling. The game is intended for adult entertainment and social play.
    </p>
    <p>
      The presence of poker-style mechanics does not constitute gambling under any jurisdiction.
      If you are uncertain about the laws in your jurisdiction, please seek legal advice before
      playing.
    </p>

    <h2>8. Account Terms</h2>
    <p>You are responsible for:</p>
    <ul>
      <li>Maintaining the confidentiality of your account credentials</li>
      <li>All activity that occurs under your account</li>
      <li>Providing accurate information when creating your account</li>
      <li>Notifying us immediately of any unauthorized use of your account</li>
    </ul>
    <p>
      You may not create more than one account, share accounts, or use another player's account.
    </p>

    <h2>9. Prohibited Conduct</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Use any cheat, bot, exploit, automation, or unauthorized third-party software</li>
      <li>Harass, abuse, or threaten other players</li>
      <li>Attempt to manipulate game outcomes through collusion or other means</li>
      <li>Sell, trade, or transfer your account or virtual currency</li>
      <li>Reverse-engineer, decompile, or attempt to extract the Game's source code</li>
      <li>Use the Game for any illegal purpose</li>
    </ul>
    <p>
      Violations may result in suspension or permanent termination of your account and forfeiture
      of any virtual currency balance without refund.
    </p>

    <h2>10. Intellectual Property</h2>
    <p>
      All content in Chain Gang Poker — including graphics, game modes, code, sounds, and text —
      is owned by or licensed to DGM Entertainment LLC and protected by applicable intellectual
      property laws. You may not reproduce, distribute, or create derivative works without our
      express written permission.
    </p>

    <h2>11. Disclaimers</h2>
    <p>
      The Game is provided "as is" without warranties of any kind, express or implied. We do not
      warrant that the Game will be uninterrupted, error-free, or free of viruses or other harmful
      components. We are not responsible for any loss of virtual currency due to technical issues,
      server outages, or game updates.
    </p>

    <h2>12. Limitation of Liability</h2>
    <p>
      To the fullest extent permitted by applicable law, DGM Entertainment LLC shall not be liable
      for any indirect, incidental, special, consequential, or punitive damages arising from your
      use of the Game, including loss of virtual currency or account access.
    </p>

    <h2>13. Changes to These Terms</h2>
    <p>
      We may update these Terms from time to time. When we do, we will revise the "Last updated"
      date above. Continued use of the Game after changes are posted constitutes your acceptance
      of the revised Terms.
    </p>

    <h2>14. Governing Law</h2>
    <p>
      These Terms are governed by the laws of the United States. Any disputes shall be resolved
      in accordance with applicable law.
    </p>

    <h2>15. Contact</h2>
    <p>
      For questions about these Terms, contact us at:<br />
      <a href="mailto:dgm.entertainment2026@gmail.com">dgm.entertainment2026@gmail.com</a>
    </p>
    <p>
      <strong>DGM Entertainment LLC</strong>
    </p>

    <div class="footer">
      &copy; 2026 DGM Entertainment LLC. All rights reserved.
      &nbsp;·&nbsp; <a href="/privacy">Privacy Policy</a>
      &nbsp;·&nbsp; <a href="/support">Support</a>
      &nbsp;·&nbsp; <a href="/">Back to Chain Gang Poker</a>
    </div>
  </div>
</body>
</html>`);
  });

  // ── Support ──────────────────────────────────────────────────────────────────
  app.get('/support', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Support — Chain Gang Poker</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0e;
      color: #d4d4d8;
      line-height: 1.7;
      padding: 24px 16px 64px;
    }
    .wrap { max-width: 680px; margin: 0 auto; }
    .logo { font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #C9A227; margin-bottom: 32px; }
    h1 { font-size: clamp(22px, 5vw, 30px); font-weight: 700; color: #f4f4f5; margin-bottom: 8px; }
    .meta { font-size: 13px; color: rgba(255,255,255,0.35); margin-bottom: 40px; }
    h2 { font-size: 16px; font-weight: 600; color: #f4f4f5; margin: 36px 0 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08); }
    h3 { font-size: 14px; font-weight: 600; color: #e4e4e7; margin: 20px 0 6px; }
    p { margin-bottom: 12px; font-size: 15px; }
    ul { padding-left: 20px; margin-bottom: 12px; }
    li { font-size: 15px; margin-bottom: 6px; }
    a { color: #C9A227; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .contact-card {
      background: rgba(201,162,39,0.08);
      border: 1px solid rgba(201,162,39,0.25);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 32px;
    }
    .contact-card .label { font-size: 11px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase; color: rgba(255,255,255,0.40); margin-bottom: 6px; }
    .contact-card .email { font-size: 18px; font-weight: 700; color: #C9A227; }
    .contact-card .note { font-size: 13px; color: rgba(255,255,255,0.40); margin-top: 6px; }
    .faq-item { margin-bottom: 28px; }
    .footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 13px; color: rgba(255,255,255,0.30); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">Chain Gang Poker</div>
    <h1>Support</h1>
    <p class="meta">DGM Entertainment LLC &nbsp;·&nbsp; We typically respond within 2 business days</p>

    <h2>Contact Us</h2>
    <div class="contact-card">
      <div class="label">Email Support</div>
      <div class="email"><a href="mailto:dgm.entertainment2026@gmail.com">dgm.entertainment2026@gmail.com</a></div>
      <div class="note">For account issues, purchase problems, bug reports, or any other questions.</div>
    </div>
    <p>
      When contacting support, please include your in-game display name and a description of the
      issue. For purchase-related issues, include your order confirmation from the app store.
    </p>

    <h2>Frequently Asked Questions</h2>

    <div class="faq-item">
      <h3>What is Chain Gang Poker?</h3>
      <p>
        Chain Gang Poker is a free-to-play social card game featuring multiple poker variants
        including classic Texas Hold'em, Kamikaze, Bonecrusher, Box Chevy, Dead 7, Suits Poker,
        Lady Luck, and Badugi. All gameplay uses virtual chips — no real money is ever wagered.
      </p>
    </div>

    <div class="faq-item">
      <h3>How do I create an account?</h3>
      <p>
        Open the app and tap <strong>Log In / Register</strong> on the welcome screen. Enter your
        email address, a display name, and a password (at least 8 characters). Your chips and
        progress are saved to your account so you can resume on any device.
      </p>
    </div>

    <div class="faq-item">
      <h3>I forgot my password. How do I reset it?</h3>
      <p>
        Tap <strong>Forgot password?</strong> on the login screen and enter your email address.
        We'll send you a reset link. If you don't receive it within a few minutes, check your
        spam folder or contact support.
      </p>
    </div>

    <div class="faq-item">
      <h3>What are Stripes (◆)?</h3>
      <p>
        Stripes are Chain Gang Poker's premium virtual currency. They can be used to purchase
        chip packs, cosmetic items, and more. Stripes can be earned through subscriptions and
        special promotions, or purchased directly through Google Play or the Apple App Store.
        <strong>Stripes have no real-world monetary value.</strong>
      </p>
    </div>

    <div class="faq-item">
      <h3>How do I buy Stripes?</h3>
      <p>
        Open the app and go to the <strong>Shop</strong> tab. Select a Stripes pack and complete
        the purchase through Google Play or the Apple App Store. Stripes are credited to your
        account immediately after the purchase is verified.
      </p>
    </div>

    <div class="faq-item">
      <h3>What are Gold Pro and Diamond Elite subscriptions?</h3>
      <p>
        These are optional auto-renewing subscription tiers that provide monthly Stripes grants,
        XP boosts, exclusive avatar frames, and other in-game benefits. Subscriptions can be
        managed or cancelled at any time through your Google Play or Apple App Store account
        settings. Cancellation takes effect at the end of the current billing period.
      </p>
    </div>

    <div class="faq-item">
      <h3>How do I cancel my subscription?</h3>
      <ul>
        <li><strong>Android / Google Play:</strong> Open Google Play → tap your profile icon → Payments &amp; subscriptions → Subscriptions → Chain Gang Poker → Cancel.</li>
        <li><strong>iPhone / iPad / Apple App Store:</strong> Open Settings → tap your Apple ID → Subscriptions → Chain Gang Poker → Cancel Subscription.</li>
      </ul>
      <p>You retain subscription benefits until the end of the current billing period.</p>
    </div>

    <div class="faq-item">
      <h3>I made a purchase but didn't receive my Stripes.</h3>
      <p>
        First, wait up to 5 minutes for verification to complete. If Stripes still haven't appeared,
        try closing and reopening the app. If the issue persists, email us at
        <a href="mailto:dgm.entertainment2026@gmail.com">dgm.entertainment2026@gmail.com</a> with
        your display name and your app store order confirmation number.
      </p>
    </div>

    <div class="faq-item">
      <h3>I lost my chips. What happened?</h3>
      <p>
        Chip balances change during normal gameplay. If you believe chips were lost due to a
        technical error (not normal gameplay), contact us with your display name, the approximate
        time the issue occurred, and which game mode you were playing.
      </p>
    </div>

    <div class="faq-item">
      <h3>How do I report a player for cheating or harassment?</h3>
      <p>
        You can report players directly in the game. During a game, open the player menu and tap
        <strong>Report</strong>. Reports are reviewed by our team. You can also email
        <a href="mailto:dgm.entertainment2026@gmail.com">dgm.entertainment2026@gmail.com</a>
        with the offending player's display name and a description of the incident.
      </p>
    </div>

    <div class="faq-item">
      <h3>Is this real money gambling?</h3>
      <p>
        No. Chain Gang Poker is a social entertainment game. All chips are virtual and have no
        real-world value. No real money is wagered at any time, and there is no way to win or
        cash out real money through the game.
      </p>
    </div>

    <div class="faq-item">
      <h3>How do I delete my account?</h3>
      <p>
        Email <a href="mailto:dgm.entertainment2026@gmail.com">dgm.entertainment2026@gmail.com</a>
        with your display name and the email address on your account, and request account deletion.
        We will delete your account and associated data within 30 days.
      </p>
    </div>

    <h2>Legal</h2>
    <p>
      <a href="/terms">Terms of Use</a> &nbsp;·&nbsp; <a href="/privacy">Privacy Policy</a>
    </p>

    <div class="footer">
      &copy; 2026 DGM Entertainment LLC. All rights reserved.
      &nbsp;·&nbsp; <a href="/">Back to Chain Gang Poker</a>
    </div>
  </div>
</body>
</html>`);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  console.log(`[startup] RESEND API key configured: ${!!(process.env.RESEND_API_KEY || process.env.Resend_key_secret)}`);
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
