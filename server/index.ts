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
  'https://localhost',            // Capacitor Android WebView
  'capacitor://localhost',        // Capacitor iOS WebView
  'https://chaing-gang-poker.replit.app', // production web (Replit domain)
  'https://chainggangpoker.com',  // production web (custom domain)
  'http://localhost:5173',        // Vite dev server
  'http://localhost:5000',        // local server testing
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

  // ONE-TIME MIGRATION (2026-06-01): Grant admin status to Detroit's primary account.
  // Safe to run on every startup — UPDATE is a no-op if isAdmin is already true.
  try {
    const adminResult = await db
      .update(playerProfiles)
      .set({ isAdmin: true })
      .where(eq(playerProfiles.email, 'bikerguy1930@gmail.com'))
      .returning({ id: playerProfiles.id });
    if (adminResult.length > 0) {
      console.log('[admin] granted isAdmin=true to bikerguy1930@gmail.com');
    }
  } catch (adminErr: any) {
    console.error('[admin] Failed to grant admin to bikerguy1930@gmail.com:', adminErr.message);
  }

  initEngine();              // restore persisted Badugi tables before WS server opens
  initGenericEngine();       // restore persisted Dead7/Fifteen35/SuitsPoker tables
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
