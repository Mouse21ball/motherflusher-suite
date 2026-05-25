// ─── Google Cloud Pub/Sub JWT verification middleware ────────────────────────
// Google Pub/Sub push subscriptions attach a signed JWT in every request:
//   Authorization: Bearer <token>
//
// This middleware verifies that JWT before the webhook handler runs, proving
// the request genuinely originated from Google and not an external forger.
//
// Required env var (set in Replit Secrets):
//   PUBSUB_AUDIENCE — the exact webhook URL Google Pub/Sub is configured to
//                     push to, e.g. https://chaing-gang-poker.replit.app/api/billing/refund-webhook
//                     Each webhook endpoint has its own audience value.
//                     If this env var is missing, ALL webhook calls will return 503
//                     (fail closed — no unauthenticated requests pass through).
//
// Google Pub/Sub JWT properties:
//   - Issued by: https://accounts.google.com
//   - Audience:  the push endpoint URL (must match PUBSUB_AUDIENCE exactly)
//   - Signed with Google's OAuth2 keys, rotated automatically
//
// Reference: https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client();

export function makePubSubAuthMiddleware(audienceEnvVar: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const audience = process.env[audienceEnvVar];
    if (!audience) {
      console.error(
        `[pubsubAuth] ${audienceEnvVar} env var not set — ` +
        `rejecting webhook (fail closed). Set this in Replit Secrets.`
      );
      res.status(503).end();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      console.warn(
        `[pubsubAuth] ${new Date().toISOString()} ` +
        `path=${req.path} — missing or malformed Authorization header (401)`
      );
      res.status(401).end();
      return;
    }

    const token = authHeader.slice(7);
    try {
      const ticket = await client.verifyIdToken({ idToken: token, audience });
      const payload = ticket.getPayload();
      if (payload?.iss !== "https://accounts.google.com") {
        console.warn(
          `[pubsubAuth] ${new Date().toISOString()} ` +
          `path=${req.path} — unexpected issuer: ${payload?.iss} (401)`
        );
        res.status(401).end();
        return;
      }
      next();
    } catch (err: any) {
      console.warn(
        `[pubsubAuth] ${new Date().toISOString()} ` +
        `path=${req.path} — JWT verification failed: ${err.message} (401)`
      );
      res.status(401).end();
    }
  };
}
