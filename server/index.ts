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
