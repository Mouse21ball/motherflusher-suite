import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initRooms } from "./rooms";
import { initEngine } from "./gameEngine";
import { initGenericEngine } from "./genericEngine";
import { flushAllPending, flushAllGenericPending } from "./tablePersistence";

// Flush all debounced persistence writes before the process exits
// so mid-hand state is not lost on graceful restart (SIGTERM from nodemon/pm2).
function onShutdown(signal: string): void {
  console.log(`[server] ${signal} received — flushing persistence...`);
  flushAllPending();
  flushAllGenericPending();
  process.exit(0);
}
process.once('SIGTERM', () => onShutdown('SIGTERM'));
process.once('SIGINT',  () => onShutdown('SIGINT'));

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ── Stripe webhook — MUST be registered BEFORE express.json() ────────────────
// express.raw() keeps the body as a Buffer; express.json() would destroy it.
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }
    try {
      const { WebhookHandlers } = await import('./webhookHandlers');
      await WebhookHandlers.processWebhook(
        req.body as Buffer,
        Array.isArray(sig) ? sig[0] : sig,
      );
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error('[stripe] webhook error:', err.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  },
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

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
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // ── Stripe init: run migrations + set up managed webhook ─────────────────
  // Non-fatal — server starts cleanly even if Stripe is not yet connected.
  try {
    const { runMigrations } = await import('stripe-replit-sync');
    const { getStripeSync } = await import('./stripeClient');
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      await runMigrations({ databaseUrl });
      const stripeSync = await getStripeSync();
      const domain = process.env.REPLIT_DOMAINS?.split(',')[0];
      if (domain) {
        await stripeSync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
      }
      stripeSync.syncBackfill().catch((e: any) =>
        console.warn('[stripe] backfill warning:', e.message)
      );
      log('Stripe initialised', 'stripe');
    }
  } catch (e: any) {
    console.warn('[stripe] init skipped (not connected yet):', e.message);
  }

  initEngine();              // restore persisted Badugi tables before WS server opens
  initGenericEngine();       // restore persisted Dead7/Fifteen35/SuitsPoker tables
  initRooms(httpServer);
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
