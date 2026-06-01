// ─── Auth middleware ──────────────────────────────────────────────────────────
// requireAuth   — validates X-Session-Token header, attaches sessionPlayerId
// requireSelf   — ensures the token's player matches :id in the URL (403 otherwise)
// logAuthFailure — writes a timestamped warning for every rejected request

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { storage } from "../storage";

// Extend Express Request to carry the validated player ID
declare global {
  namespace Express {
    interface Request {
      sessionPlayerId?: string;
    }
  }
}

export function logAuthFailure(req: Request, reason: string): void {
  const header = req.headers["x-session-token"];
  const token  = Array.isArray(header) ? header[0] : header;
  console.warn(
    `[AUTH FAIL] ${new Date().toISOString()} ` +
    `method=${req.method} path=${req.path} ` +
    `reason=${reason} ip=${req.ip ?? "unknown"} ` +
    `attempted_id=${req.params?.id ?? "n/a"} ` +
    `token_prefix=${token?.slice(0, 8) ?? "none"}`
  );
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const raw   = req.headers["x-session-token"];
  const token = Array.isArray(raw) ? raw[0] : raw;

  if (!token || token.trim() === "") {
    logAuthFailure(req, "missing_token");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const session = await storage.getSession(token);
  if (!session) {
    logAuthFailure(req, "invalid_or_expired_token");
    res.status(401).json({ error: "Session expired — please re-open the app" });
    return;
  }

  req.sessionPlayerId = session.playerId;

  // ── Account-status checks ─────────────────────────────────────────────────
  const status = await storage.getPlayerBanStatus(session.playerId);
  if (status) {
    if (status.isDeleted) {
      res.status(410).json({ error: "Account has been deleted" });
      return;
    }
    if (status.bannedAt) {
      const now = new Date();
      // Auto-unban: temporary ban has expired — clear it transparently
      if (status.banExpiresAt && status.banExpiresAt <= now) {
        await storage.clearExpiredBan(session.playerId);
        // Fall through: allow the request to proceed
      } else {
        res.status(403).json({
          error:        "banned",
          banReason:    status.banReason,
          banExpiresAt: status.banExpiresAt?.toISOString() ?? null,
        });
        return;
      }
    }
  }

  next();
};

// requireAdmin — validates session token AND confirms the player's isAdmin flag.
// Returns 401 if no valid session, 403 if authenticated but not admin.
// Logs [ADMIN_AUTH] denied for every failed access attempt.
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const raw   = req.headers["x-session-token"];
  const token = Array.isArray(raw) ? raw[0] : raw;

  if (!token || token.trim() === "") {
    logAuthFailure(req, "missing_token");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const session = await storage.getSession(token);
  if (!session) {
    logAuthFailure(req, "invalid_or_expired_token");
    res.status(401).json({ error: "Session expired — please re-open the app" });
    return;
  }

  req.sessionPlayerId = session.playerId;

  const isAdmin = await storage.getPlayerIsAdmin(session.playerId);
  if (!isAdmin) {
    console.warn(`[ADMIN_AUTH] denied playerId=${session.playerId} path=${req.path} at=${new Date().toISOString()}`);
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
};

export const requireSelf: RequestHandler = (req, res, next) => {
  const targetId = req.params.id;
  if (!targetId || req.sessionPlayerId !== targetId) {
    logAuthFailure(req, "cross_player_access");
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};
