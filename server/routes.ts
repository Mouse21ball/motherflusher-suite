import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, hashPassword, verifyPassword } from "./storage";
import {
  loginRateLimit,
  registrationRateLimit,
  guestInitRateLimit,
  dailyBonusRateLimit,
  purchaseVerificationRateLimit,
  generalApiRateLimit,
  reportRateLimit,
  ladyLuckTableCreateLimit,
  forgotPasswordRateLimit,
} from "./middleware/rateLimits";
import { Resend } from "resend";
import { z } from "zod";
import {
  getActiveBadugiTables,
  getBadugiTableMinBet,
  extendBadugiTurnTimer,
  getBadugiTimeBankSessionUsed,
  incrementBadugiTimeBankSessionUsed,
} from "./gameEngine";
import {
  getActiveGenericTables,
  getGenericTableMinBet,
  extendGenericTurnTimer,
  getGenericTimeBankSessionUsed,
  incrementGenericTimeBankSessionUsed,
} from "./genericEngine";
import { db } from "./db";
import { sql as drizzleSql } from "drizzle-orm";
import { requireAuth, requireAdmin, requireSelf } from "./middleware/auth";
import { makePubSubAuthMiddleware } from "./middleware/pubsubAuth";

const verifyPlayWebhook         = makePubSubAuthMiddleware("PUBSUB_AUDIENCE_PLAY");
// Deprecated — kept for backward-compat while old Pub/Sub configs are migrated to play-webhook.
const verifyRefundWebhook       = makePubSubAuthMiddleware("PUBSUB_AUDIENCE_REFUND");
const verifySubscriptionWebhook = makePubSubAuthMiddleware("PUBSUB_AUDIENCE_SUBSCRIPTION");
import { generateUniqueInviteCode, checkChatRateLimit, validateCrewName } from "./crews";
import { createLLTable, getLLActiveTables, findOrCreateLLTable } from "./ladyluckEngine";
import { issueWsTicket } from "./wsTickets";
import { filterChatMessage } from "./chatFilter";
import {
  STRIPES_PACKS,
  CLUB_CHIP_PACKS,
  SUBSCRIPTION_PRODUCTS,
  verifyGooglePlayPurchase,
  acknowledgeGooglePlayPurchase,
  processSubscriptionPurchase,
  handleSubscriptionRenewal,
  handleSubscriptionCancellation,
  handleSubscriptionExpiration,
  handleSubscriptionGracePeriod,
  handleSubscriptionOnHold,
  handleSubscriptionRecovered,
  handleSubscriptionRefund,
  verifyAppleAppStorePurchase,
  type ApplePurchaseData,
} from "./billing";
import { randomBytes } from "crypto";

function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY || process.env.Resend_key_secret;
  if (!key) throw new Error("[resend] RESEND_API_KEY / Resend_key_secret not set");
  return new Resend(key);
}

// ─── In-memory table registry ─────────────────────────────────────────────────
// Ephemeral — lives for the server process lifetime.
// Tables are keyed by their 6-char code. When server restarts, tables clear.
// This is intentional for the alpha: sessions are short-lived.
// Future: migrate to DB-backed storage when persistent lobbies are needed.

interface TableRecord {
  tableId:     string;
  modeId:      string;
  createdBy:   string;
  createdAt:   number;
  playerCount: number;
  // Host-configurable settings (set at creation, locked after first hand)
  maxPlayers:  number;   // 2-5 seats available to humans
  botsEnabled: boolean;  // false = no bots ever, even if seats are empty
  isInviteOnly: boolean; // true = invite code required; false = appears in public list
  hostId:      string;   // session/identity id of creator (for authority checks)
  crewId?:     string;   // club this table belongs to (if any)
}

const tables = new Map<string, TableRecord>();

// Auto-expire tables after 4 hours to prevent memory growth
const TABLE_TTL_MS = 4 * 60 * 60 * 1000;

function pruneExpiredTables(): void {
  const cutoff = Date.now() - TABLE_TTL_MS;
  for (const [code, table] of tables.entries()) {
    if (table.createdAt < cutoff) tables.delete(code);
  }
}

// ─── Exported helpers for rooms.ts ────────────────────────────────────────────

export function getTableRecord(tableId: string): TableRecord | null {
  pruneExpiredTables();
  return tables.get(tableId.toUpperCase()) ?? null;
}

export function updateTableRecord(
  tableId: string,
  updates: Partial<Pick<TableRecord, 'maxPlayers' | 'botsEnabled' | 'isInviteOnly'>>
): boolean {
  const record = tables.get(tableId.toUpperCase());
  if (!record) return false;
  Object.assign(record, updates);
  return true;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const trackEventSchema = z.object({
  eventType: z.enum(["session_start", "session_end", "mode_play"]),
  playerId: z.string().min(1),
  mode: z.string().optional(),
  durationMs: z.number().int().optional(),
});

const createTableSchema = z.object({
  tableId:     z.string().length(6).regex(/^[A-Z0-9]+$/),
  modeId:      z.string().min(1),
  createdBy:   z.string().min(1),
  maxPlayers:  z.number().int().min(2).max(5).default(5),
  botsEnabled: z.boolean().default(true),
  isInviteOnly: z.boolean().default(true),
  hostId:      z.string().min(1).optional(),
  crewId:      z.string().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Analytics — unchanged
  app.post("/api/analytics/track", async (req, res) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch {}
      }
      if (!body || (typeof body === "object" && Object.keys(body).length === 0)) {
        const raw =
          typeof (req as any).rawBody === "object"
            ? Buffer.isBuffer((req as any).rawBody)
              ? (req as any).rawBody.toString("utf-8")
              : String((req as any).rawBody)
            : typeof (req as any).rawBody === "string"
              ? (req as any).rawBody
              : null;
        if (raw) {
          try { body = JSON.parse(raw); } catch {}
        }
      }
      const parsed = trackEventSchema.parse(body);
      const eventDate = new Date().toISOString().split("T")[0];
      await storage.insertAnalyticsEvent({
        eventType: parsed.eventType,
        playerId: parsed.playerId,
        mode: parsed.mode ?? null,
        durationMs: parsed.durationMs ?? null,
        eventDate,
      });
      res.status(204).end();
    } catch (err: any) {
      if (err?.name === "ZodError") {
        console.error("Analytics validation error:", JSON.stringify(err.issues));
        res.status(400).json({ error: "Invalid event data" });
      } else {
        console.error("Analytics insert error:", err.message, err.stack);
        res.status(500).json({ error: "Failed to record event" });
      }
    }
  });

  app.get("/api/analytics/stats", requireAdmin, async (_req, res) => {
    try {
      const stats = await storage.getDailyStats(30);
      res.json(stats);
    } catch (err) {
      console.error("Analytics stats error:", err);
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  app.get("/api/admin/rake-stats", requireAdmin, async (_req, res) => {
    try {
      const stats = await storage.getRakeStats();
      res.json(stats);
    } catch (err) {
      console.error("Rake stats error:", err);
      res.status(500).json({ error: "Failed to load rake stats" });
    }
  });

  // ── Table management ──────────────────────────────────────────────────────

  // POST /api/tables — register a new table
  // Called by the client when a player starts a session.
  // Returns 201 on success, 409 if the code is already taken.
  app.post("/api/tables", (req, res) => {
    pruneExpiredTables();
    try {
      const parsed = createTableSchema.parse(req.body);
      console.log(`[table-create] crewId received: ${parsed.crewId ?? 'none'} botsEnabled forced: ${parsed.crewId ? false : parsed.botsEnabled}`);
      const code = parsed.tableId.toUpperCase();

      if (tables.has(code)) {
        res.status(409).json({ error: "Table code already in use" });
        return;
      }

      const record: TableRecord = {
        tableId:     code,
        modeId:      parsed.modeId,
        createdBy:   parsed.createdBy,
        createdAt:   Date.now(),
        playerCount: 1,
        maxPlayers:  parsed.maxPlayers,
        botsEnabled: parsed.crewId ? false : parsed.botsEnabled,
        isInviteOnly: parsed.isInviteOnly,
        hostId:      parsed.hostId ?? parsed.createdBy,
        crewId:      parsed.crewId,
      };
      tables.set(code, record);
      res.status(201).json({
        tableId:     code,
        modeId:      record.modeId,
        createdAt:   record.createdAt,
        maxPlayers:  record.maxPlayers,
        botsEnabled: record.botsEnabled,
        isInviteOnly: record.isInviteOnly,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "Invalid table data" });
      } else {
        console.error("Create table error:", err);
        res.status(500).json({ error: "Failed to create table" });
      }
    }
  });

  // GET /api/tables — list ALL active tables across every mode, human players only.
  // Merges the Badugi engine and the generic engine into one sorted list.
  // Includes maxPlayers and isInviteOnly so the client can render "X/Y" counts
  // and filter out invite-only tables from the public lobby.
  app.get("/api/tables", (req, res) => {
    pruneExpiredTables();
    const filterCrewId = req.query.crewId as string | undefined;
    const badugi = getActiveBadugiTables()
      .filter(t => t.humanCount > 0)
      .map(t => {
        const rec = tables.get(t.tableId);
        return {
          tableId:      t.tableId,
          modeId:       "badugi",
          humanCount:   t.humanCount,
          phase:        t.phase,
          maxPlayers:   rec?.maxPlayers  ?? 5,
          isInviteOnly: rec?.isInviteOnly ?? false,
          crewId:       rec?.crewId,
        };
      });
    const generic = getActiveGenericTables()
      .filter(t => t.humanCount > 0)
      .map(t => {
        const rec = tables.get(t.tableId);
        return {
          tableId:      t.tableId,
          modeId:       t.modeId,
          humanCount:   t.humanCount,
          phase:        t.phase,
          maxPlayers:   rec?.maxPlayers  ?? 5,
          isInviteOnly: rec?.isInviteOnly ?? false,
          crewId:       rec?.crewId,
        };
      });
    let all: Array<{ tableId: string; modeId: string; humanCount: number; phase: string; maxPlayers: number; isInviteOnly: boolean; crewId?: string }> = [
      ...badugi,
      ...generic.sort((a, b) => b.humanCount - a.humanCount),
    ];
    if (filterCrewId) {
      // Keep matching active tables (humanCount > 0 already included above)
      all = all.filter(t => t.crewId === filterCrewId);
      // Also include crew tables that are registered but have 0 active WS connections
      // (just opened, or everyone navigated away — invisible to the humanCount filter).
      const seenIds = new Set(all.map(t => t.tableId));
      for (const [tid, rec] of tables.entries()) {
        if (rec.crewId !== filterCrewId || seenIds.has(tid)) continue;
        all.push({
          tableId:      tid,
          modeId:       rec.modeId,
          humanCount:   0,
          phase:        'WAITING',
          maxPlayers:   rec.maxPlayers,
          isInviteOnly: rec.isInviteOnly ?? false,
          crewId:       rec.crewId,
        });
      }
      console.log(`[club-tables] crewId=${filterCrewId} total=${all.length}`, all.map(t => `${t.tableId}(h=${t.humanCount})`));
    }
    res.json(all);
  });

  // GET /api/tables/badugi — list currently active authoritative Badugi tables
  // Used by the lobby to show live tables with human players.
  app.get("/api/tables/badugi", (_req, res) => {
    res.json(getActiveBadugiTables());
  });

  // GET /api/tables/:code — look up a table by its 6-char code
  // Returns the table record or 404 if not found / expired.
  app.get("/api/tables/:code", (req, res) => {
    pruneExpiredTables();
    const code = (req.params.code || "").toUpperCase();
    const table = tables.get(code);
    if (!table) {
      res.status(404).json({ error: "Table not found" });
      return;
    }
    res.json({ tableId: table.tableId, modeId: table.modeId, createdAt: table.createdAt, crewId: table.crewId ?? null });
  });

  // DELETE /api/tables/:tableId — close a club table (host or crew owner/agent only)
  app.delete("/api/tables/:tableId", requireAuth, async (req, res) => {
    try {
      const tableId  = (req.params.tableId as string).toUpperCase();
      const callerId = req.sessionPlayerId!;

      const record = tables.get(tableId);
      if (!record) {
        res.status(404).json({ error: "Table not found." });
        return;
      }

      const isHost = record.hostId === callerId || record.createdBy === callerId;
      let authorized = isHost;

      if (!authorized && record.crewId) {
        const mem = await requireCrewMember(record.crewId, callerId);
        authorized = !!mem && ['owner', 'captain', 'agent'].includes(mem.role);
      }

      if (!authorized) {
        res.status(403).json({ error: "Not authorized to close this table." });
        return;
      }

      tables.delete(tableId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete table error:", err);
      res.status(500).json({ error: "Failed to close table." });
    }
  });

  // ── Player Profiles ───────────────────────────────────────────────────────
  // POST /api/players — create or return existing profile (idempotent guest upsert).
  // Body: { id: string, displayName?: string }
  const playerUpsertSchema = z.object({
    id:          z.string().uuid(),
    displayName: z.string().min(1).max(32).optional(),
  });

  app.post("/api/players", async (req, res) => {
    try {
      const parsed = playerUpsertSchema.parse(req.body);
      const profile = await storage.getOrCreatePlayer(parsed.id, parsed.displayName);
      res.status(200).json(profile);
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "Invalid player data" });
      } else {
        console.error("Player upsert error:", err);
        res.status(500).json({ error: "Failed to create player" });
      }
    }
  });

  // ── Player Block List ───────────────────────────────────────────────────────
  // Registered before GET /api/players/:id so Express does not swallow the
  // literal path segment "blocks" as a dynamic :id parameter.

  // POST /api/players/blocks — block another player
  app.post("/api/players/blocks", requireAuth, generalApiRateLimit, async (req, res) => {
    try {
      const blockerId = req.sessionPlayerId!;
      const { blockedId } = z.object({ blockedId: z.string().min(1) }).parse(req.body);

      if (blockerId === blockedId) {
        res.status(400).json({ error: "Cannot block yourself." }); return;
      }
      const target = await storage.getPlayerProfile(blockedId);
      if (!target) {
        res.status(404).json({ error: "Player not found." }); return;
      }
      const row = await storage.blockPlayer(blockerId, blockedId);
      res.json({ id: row.id, blockerId: row.blockerId, blockedId: row.blockedId, createdAt: row.createdAt });
    } catch (err: any) {
      if (err?.name === "ZodError") { res.status(400).json({ error: "Invalid request." }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/players/blocks/:blockedId — unblock a player
  app.delete("/api/players/blocks/:blockedId", requireAuth, generalApiRateLimit, async (req, res) => {
    try {
      const blockerId = req.sessionPlayerId!;
      const blockedId = req.params.blockedId as string;
      const unblocked = await storage.unblockPlayer(blockerId, blockedId);
      res.json({ unblocked });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Player Reports ────────────────────────────────────────────────────────
  // Registered before /api/players/:id to avoid Express param shadowing.

  const REPORT_REASONS = ['harassment', 'cheating', 'spam', 'offensive_language', 'impersonation', 'other'] as const;
  const reportBodySchema = z.object({
    reportedId:  z.string().min(1),
    reason:      z.enum(REPORT_REASONS),
    context:     z.string().optional(),
    contextType: z.enum(['table_chat', 'crew_chat', 'player_profile', 'gameplay']).optional(),
    notes:       z.string().max(500).optional(),
  });

  // POST /api/players/reports — submit a report
  app.post("/api/players/reports", requireAuth, reportRateLimit, generalApiRateLimit, async (req, res) => {
    try {
      const reporterId = req.sessionPlayerId!;
      const { reportedId, reason, context, contextType, notes } = reportBodySchema.parse(req.body);
      if (reporterId === reportedId) {
        res.status(400).json({ error: "Cannot report yourself." }); return;
      }
      const target = await storage.getPlayerProfile(reportedId);
      if (!target) {
        res.status(404).json({ error: "Player not found." }); return;
      }
      const report = await storage.createReport(
        reporterId, reportedId, reason,
        context ?? null, contextType ?? null, notes ?? null,
      );
      res.json(report);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request." }); return;
      }
      console.error("[reports] POST error:", err);
      res.status(500).json({ error: "Failed to submit report." });
    }
  });

  // GET /api/players/reports/mine — authenticated user's filed reports
  app.get("/api/players/reports/mine", requireAuth, generalApiRateLimit, async (req, res) => {
    try {
      const reports = await storage.getReportsByReporter(req.sessionPlayerId!, 20);
      res.json({ reports });
    } catch (err) {
      console.error("[reports] GET mine error:", err);
      res.status(500).json({ error: "Failed to fetch reports." });
    }
  });

  // GET /api/players/blocks — authenticated player's block list (id + displayName)
  app.get("/api/players/blocks", requireAuth, generalApiRateLimit, async (req, res) => {
    try {
      const blockerId = req.sessionPlayerId!;
      const blocked = await storage.getBlockedPlayers(blockerId);
      res.json({ blocked });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/players/:id — fetch player profile (authentication required)
  // Never exposes passwordHash. Email and other self-only fields are only
  // returned when the authenticated session belongs to the requested player.
  app.get("/api/players/:id", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getPlayerProfile(req.params.id as string);
      if (!profile) {
        res.status(404).json({ error: "Player not found" });
        return;
      }
      const isSelf = req.sessionPlayerId === profile.id;
      res.json({
        id:                  profile.id,
        displayName:         profile.displayName,
        chipBalance:         profile.chipBalance,
        stripes:             profile.stripes,
        handsPlayed:         profile.handsPlayed,
        lifetimeProfit:      profile.lifetimeProfit,
        avatarId:            profile.avatarId            ?? null,
        equippedAvatarId:    profile.equippedAvatarId    ?? null,
        equippedFrameId:     profile.equippedFrameId     ?? null,
        equippedNameColorId: profile.equippedNameColorId ?? null,
        activeSubscriptionTier: profile.activeSubscriptionTier ?? null,
        ...(isSelf ? {
          email:                 profile.email                          ?? null,
          lastNameChangeAt:      profile.lastNameChangeAt?.toISOString() ?? null,
          subscriptionExpiresAt: profile.subscriptionExpiresAt?.toISOString() ?? null,
        } : {}),
      });
    } catch (err) {
      console.error("Player fetch error:", err);
      res.status(500).json({ error: "Failed to fetch player" });
    }
  });

  // GET /api/players/:id/reconnect — check if player has an active table
  // Returns { tableId, seatId, modeId } if present, else { tableId: null }.
  app.get("/api/players/:id/reconnect", requireAuth, requireSelf, async (req, res) => {
    try {
      const profile = await storage.getPlayerProfile(req.params.id as string);
      if (!profile) {
        res.json({ tableId: null });
        return;
      }
      res.json({
        tableId:  profile.activeTableId ?? null,
        seatId:   profile.activeSeatId  ?? null,
        modeId:   profile.activeModeId  ?? null,
        chips:    profile.chipBalance,
      });
    } catch (err) {
      console.error("Reconnect check error:", err);
      res.status(500).json({ error: "Failed to check reconnect" });
    }
  });

  // DELETE /api/players/:id — permanently delete a player account and all data.
  // App Store requirement: users must be able to delete their own account from within the app.
  app.delete("/api/players/:id", requireAuth, requireSelf, async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') {
        res.status(400).json({ error: "Invalid player ID" });
        return;
      }
      const profile = await storage.getPlayerProfile(id);
      if (!profile) {
        res.status(404).json({ error: "Player not found" });
        return;
      }
      await storage.deletePlayer(id);
      res.status(200).json({ deleted: true });
    } catch (err) {
      console.error("Delete player error:", err);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // ── Auth — Register / Login ────────────────────────────────────────────────
  // Auth is layered on top of the existing guest identity system.
  // On register: the client sends their existing identityId (UUID from localStorage)
  //   so the auth account is linked to their current profile, preserving chips/history.
  // On login: server returns the canonical profileId so the client can adopt it
  //   as their new localStorage identity (cross-device chip restoration).

  const registerSchema = z.object({
    identityId:  z.string().uuid("identityId must be a valid UUID"),
    email:       z.string().email("Invalid email"),
    password:    z.string().min(8, "Password must be at least 8 characters"),
    displayName: z.string().min(1).max(32).optional(),
  });

  const loginSchema = z.object({
    email:    z.string().email(),
    password: z.string().min(1),
  });

  // POST /api/auth/register
  // Links email+password credentials to an existing guest profile.
  // Returns the profile so the client can confirm identity.
  app.post("/api/auth/register", registrationRateLimit, async (req, res) => {
    try {
      const parsed = registerSchema.parse(req.body);

      // Check if email is already claimed by a different profile
      const existing = await storage.getPlayerByEmail(parsed.email);
      if (existing && existing.id !== parsed.identityId) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      // Ensure the guest profile exists, then link the auth credentials
      const profile = await storage.getOrCreatePlayer(parsed.identityId, parsed.displayName);
      const hash = await hashPassword(parsed.password);
      await storage.setPlayerAuth(profile.id, parsed.email, hash);

      const level = Math.floor(profile.handsPlayed / 50);
      const regExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const sessionToken = await storage.createSession(profile.id, regExpiresAt);
      res.status(201).json({
        profileId:    profile.id,
        displayName:  profile.displayName,
        chipBalance:  profile.chipBalance,
        handsPlayed:  profile.handsPlayed,
        lifetimeProfit: profile.lifetimeProfit,
        level,
        sessionToken,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: err.issues[0]?.message ?? "Invalid data" });
      } else {
        console.error("Register error:", err);
        res.status(500).json({ error: "Registration failed" });
      }
    }
  });

  // POST /api/auth/login
  // Verifies credentials and returns the canonical profile.
  // Client should adopt the returned profileId as their localStorage identity UUID.
  app.post("/api/auth/login", ...loginRateLimit, async (req, res) => {
    try {
      const parsed = loginSchema.parse(req.body);

      const profile = await storage.getPlayerByEmail(parsed.email);
      if (!profile || !profile.passwordHash) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await verifyPassword(parsed.password, profile.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Account-status gate — check before issuing any session token
      if (profile.isDeleted) {
        res.status(410).json({ error: "Account has been deleted" });
        return;
      }
      if (profile.bannedAt) {
        const now = new Date();
        if (profile.banExpiresAt && profile.banExpiresAt <= now) {
          // Temporary ban expired — clear it transparently
          await storage.clearExpiredBan(profile.id);
        } else {
          res.status(403).json({
            error:        "banned",
            banReason:    profile.banReason,
            banExpiresAt: profile.banExpiresAt?.toISOString() ?? null,
          });
          return;
        }
      }

      const level = Math.floor(profile.handsPlayed / 50);
      const loginExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const sessionToken = await storage.createSession(profile.id, loginExpiresAt);
      res.json({
        profileId:      profile.id,
        displayName:    profile.displayName,
        chipBalance:    profile.chipBalance,
        handsPlayed:    profile.handsPlayed,
        lifetimeProfit: profile.lifetimeProfit,
        level,
        sessionToken,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "Invalid request" });
      } else {
        console.error("Login error:", err);
        res.status(500).json({ error: "Login failed" });
      }
    }
  });

  // GET /api/auth/me
  // Returns the current player profile for the authenticated session.
  // The player ID is resolved server-side from the X-Session-Token header —
  // never from a URL parameter or request body.
  // Also refreshes the session token TTL on every successful call.
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getPlayerProfile(req.sessionPlayerId!);
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      const level = Math.floor(profile.handsPlayed / 50);
      const isGuest = !profile.email && !profile.passwordHash;
      const resetRef = profile.lastResetAt ?? profile.createdAt;
      const nextResetAt = isGuest
        ? new Date(resetRef.getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null;
      // Refresh session token TTL (7 days guests, 30 days registered)
      const meTtlMs = isGuest ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
      const sessionToken = await storage.createSession(profile.id, new Date(Date.now() + meTtlMs));
      res.json({
        profileId:        profile.id,
        displayName:      profile.displayName,
        chipBalance:      profile.chipBalance,
        stripes:          profile.stripes,
        handsPlayed:      profile.handsPlayed,
        lifetimeProfit:   profile.lifetimeProfit,
        email:            profile.email ?? null,
        hasAuth:          !!profile.passwordHash,
        level,
        avatarId:            profile.avatarId            ?? null,
        equippedAvatarId:    profile.equippedAvatarId    ?? null,
        equippedFrameId:     profile.equippedFrameId     ?? null,
        equippedNameColorId: profile.equippedNameColorId ?? null,
        lastNameChangeAt:    profile.lastNameChangeAt?.toISOString() ?? null,
        nextResetAt,
        sessionToken,
        activeSubscriptionTier:  profile.activeSubscriptionTier  ?? null,
        subscriptionExpiresAt:   profile.subscriptionExpiresAt?.toISOString() ?? null,
        isAdmin:                 profile.isAdmin,
        welcomeKitClaimed:       profile.welcomeKitClaimed,
        equippedLobbyTrack:    (profile as any).equippedLobbyTrack    ?? null,
        equippedGameTrack:     (profile as any).equippedGameTrack     ?? null,
        equippedLadyLuckTrack: (profile as any).equippedLadyLuckTrack ?? null,
      });
    } catch (err) {
      console.error("Auth me error:", err);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // GET /api/auth/ws-ticket
  // Issues a short-lived (60 s), single-use WebSocket connection ticket for
  // the authenticated player. The client passes this ticket in the WS upgrade
  // URL (?ticket=) instead of the long-lived session token, so the session
  // credential is never exposed in server access logs or proxy logs.
  // requireAuth has already validated the session token before this handler runs.
  app.get("/api/auth/ws-ticket", requireAuth, (req, res) => {
    const t0     = Date.now();
    const ticket = issueWsTicket(req.sessionPlayerId!);
    console.log(`[LL-TIMING-SERVER] GET /api/auth/ws-ticket — issued in ${Date.now() - t0}ms`);
    res.json({ ticket });
  });

  // POST /api/auth/guest-init
  // Bootstrap endpoint for new guest players who have no session token yet.
  // Accepts { profileId, displayName? } in the request body (never in the URL).
  // Creates the server-side profile if it doesn't exist yet, then issues a
  // short-lived (7-day) session token — but ONLY for accounts that have no
  // email/password credentials. Callers with registered accounts must use
  // POST /api/auth/login instead.
  // This endpoint intentionally has no requireAuth so brand-new guests can
  // bootstrap their first session. UUID entropy (122 bits) prevents brute-force.
  app.post("/api/auth/guest-init", guestInitRateLimit, async (req, res) => {
    try {
      const guestInitSchema = z.object({
        profileId:   z.string().uuid(),
        displayName: z.string().max(32).optional(),
      });
      const { profileId, displayName } = guestInitSchema.parse(req.body);

      // getOrCreatePlayer ensures the profile row exists before issuing a token.
      const profile = await storage.getOrCreatePlayer(profileId, displayName ?? "Player");

      // Refuse to issue a guest token if this account has email/password auth.
      // Those accounts must go through POST /api/auth/login.
      if (profile.email || profile.passwordHash) {
        res.status(403).json({ error: "Account has credentials — use /api/auth/login" });
        return;
      }

      const level = Math.floor(profile.handsPlayed / 50);
      const resetRef = profile.lastResetAt ?? profile.createdAt;
      const nextResetAt = new Date(resetRef.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const sessionToken = await storage.createSession(profile.id, expiresAt);

      res.json({
        profileId:        profile.id,
        displayName:      profile.displayName,
        chipBalance:      profile.chipBalance,
        stripes:          profile.stripes,
        handsPlayed:      profile.handsPlayed,
        lifetimeProfit:   profile.lifetimeProfit,
        email:            null,
        hasAuth:          false,
        level,
        avatarId:            profile.avatarId            ?? null,
        equippedAvatarId:    profile.equippedAvatarId    ?? null,
        equippedFrameId:     profile.equippedFrameId     ?? null,
        equippedNameColorId: profile.equippedNameColorId ?? null,
        lastNameChangeAt:    profile.lastNameChangeAt?.toISOString() ?? null,
        nextResetAt,
        sessionToken,
        activeSubscriptionTier:  profile.activeSubscriptionTier  ?? null,
        subscriptionExpiresAt:   profile.subscriptionExpiresAt?.toISOString() ?? null,
        welcomeKitClaimed:       profile.welcomeKitClaimed,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "Invalid request" });
      } else {
        console.error("Guest init error:", err);
        res.status(500).json({ error: "Failed to initialize guest session" });
      }
    }
  });

  // POST /api/auth/forgot-password
  // Public — accepts email, generates a reset token, sends email via Resend.
  // Always returns 200 with a generic message to prevent email enumeration.
  app.post("/api/auth/forgot-password", forgotPasswordRateLimit, async (req, res) => {
    const GENERIC_OK = "If that email exists you will receive a reset link.";
    try {
      const schema = z.object({ email: z.string().email() });
      const { email } = schema.parse(req.body);

      const profile = await storage.getPlayerByEmail(email.trim().toLowerCase());
      if (!profile || !profile.passwordHash) {
        // No account or guest account — still return 200 to prevent enumeration
        res.json({ message: GENERIC_OK });
        return;
      }

      const token   = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.setPasswordResetToken(profile.id, token, expires);

      const resetUrl = `https://chainggangpoker.com/reset-password?token=${token}`;

      const resendResult = await getResendClient().emails.send({
        from:    "Chain Gang Poker <noreply@chainggangpoker.com>",
        to:      email.trim().toLowerCase(),
        subject: "Reset your Chain Gang Poker password",
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#05050A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#05050A;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#0D0D14;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px 32px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <div style="font-size:48px;line-height:1;">♛</div>
              <p style="margin:8px 0 0;font-size:11px;font-family:monospace;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.3);">⛓️ Chain Gang Poker</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#F0B829;letter-spacing:-0.02em;">Reset Your Password</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.55);">
                Someone requested a password reset for your account.<br />
                This link expires in <strong style="color:rgba(255,255,255,0.75);">1 hour</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:36px;">
              <a href="${resetUrl}"
                style="display:inline-block;padding:14px 36px;background-color:#F0B829;color:#05050A;font-weight:700;font-size:14px;text-decoration:none;border-radius:12px;letter-spacing:0.06em;text-transform:uppercase;box-shadow:0 4px 20px rgba(240,184,41,0.35);">
                Reset Password
              </a>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:11px;font-family:monospace;color:rgba(255,255,255,0.2);line-height:1.6;">
                If you didn't request this, ignore this email.<br />
                <em>Loyalty Never Leaves.</em>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      });
      console.log("RESEND-DEBUG send result:", JSON.stringify(resendResult));

      res.json({ message: GENERIC_OK });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "Invalid email address." });
      } else {
        console.log("RESEND-DEBUG send error:", err?.message, err?.stack);
        console.error("[forgot-password] error:", err);
        // Still return generic OK — don't leak internal errors to caller
        res.json({ message: GENERIC_OK });
      }
    }
  });

  // POST /api/auth/reset-password
  // Public — validates token, hashes new password, clears token.
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const schema = z.object({
        token:       z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      });
      const { token, newPassword } = schema.parse(req.body);

      const profile = await storage.getPlayerByResetToken(token);
      if (!profile || !profile.passwordResetExpires) {
        res.status(400).json({ error: "Invalid or expired reset link." });
        return;
      }

      if (profile.passwordResetExpires < new Date()) {
        await storage.clearPasswordResetToken(profile.id);
        res.status(400).json({ error: "Invalid or expired reset link." });
        return;
      }

      const hash = await hashPassword(newPassword);
      await storage.setPlayerAuth(profile.id, profile.email!, hash);
      await storage.clearPasswordResetToken(profile.id);

      res.json({ message: "Password reset successfully." });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: err.issues[0]?.message ?? "Invalid request." });
      } else {
        console.error("[reset-password] error:", err);
        res.status(500).json({ error: "Password reset failed. Please try again." });
      }
    }
  });

  // PUT /api/players/:id/avatar
  // Saves the player's selected avatar preset. avatarId=null clears to initials default.
  app.put("/api/players/:id/avatar", requireAuth, requireSelf, async (req, res) => {
    try {
      const avatarSchema = z.object({ avatarId: z.string().nullable() });
      const { avatarId } = avatarSchema.parse(req.body);
      const profile = await storage.getPlayerProfile(req.params.id as string);
      if (!profile) {
        res.status(404).json({ error: "Player not found" });
        return;
      }
      await storage.updatePlayerAvatar(req.params.id as string, avatarId);
      res.json({ avatarId });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "Invalid avatar data" });
      } else {
        console.error("Avatar update error:", err);
        res.status(500).json({ error: "Failed to update avatar" });
      }
    }
  });

  // PUT /api/players/:id/name
  // Changes the display name. Server-enforced 90-day cooldown applies to ALL accounts.
  const NAME_CHANGE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

  app.put("/api/players/:id/name", requireAuth, requireSelf, async (req, res) => {
    try {
      const nameSchema = z.object({
        name: z.string().min(1).max(32).trim(),
      });
      const { name } = nameSchema.parse(req.body);
      const profile = await storage.getPlayerProfile(req.params.id as string);
      if (!profile) {
        res.status(404).json({ error: "Player not found" });
        return;
      }
      // Enforce cooldown
      if (profile.lastNameChangeAt) {
        const elapsed = Date.now() - profile.lastNameChangeAt.getTime();
        if (elapsed < NAME_CHANGE_COOLDOWN_MS) {
          const remainingMs = NAME_CHANGE_COOLDOWN_MS - elapsed;
          const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
          res.status(429).json({
            error: `Name change on cooldown. Try again in ${remainingDays} day${remainingDays === 1 ? "" : "s"}.`,
            remainingMs,
          });
          return;
        }
      }
      await storage.updatePlayerDisplayName(req.params.id as string, name);
      res.json({ displayName: name, lastNameChangeAt: new Date().toISOString() });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: err.issues[0]?.message ?? "Invalid name" });
      } else {
        console.error("Name change error:", err);
        res.status(500).json({ error: "Failed to update name" });
      }
    }
  });

  // GET /api/players/:id/stripes
  // Returns the player's current Stripes balance.
  // Auth-protection: players self-identify via their UUID (stored in localStorage).
  // UUID guessing is computationally infeasible — sufficient for this auth model.
  app.get("/api/players/:id/stripes", requireAuth, requireSelf, async (req, res) => {
    try {
      const result = await storage.getPlayerStripes(req.params.id as string);
      res.json({ stripes: result.stripes, lastUpdated: result.updatedAt?.toISOString() ?? null });
    } catch (err) {
      console.error("Get stripes error:", err);
      res.status(500).json({ error: "Failed to fetch stripes" });
    }
  });

  // POST /api/players/:id/bonus-chips
  // Credits virtual chips from in-app bonuses (daily reward, hourly bonus, starter pack)
  // directly to the DB bankroll. Fire-and-forget safe — client already updates local state.
  // Max 100,000 chips per call guards against accidental over-grant.
  app.post("/api/players/:id/bonus-chips", requireAuth, requireSelf, async (req, res) => {
    try {
      const id = req.params.id as string;
      const bonusSchema = z.object({ chips: z.number().int().positive().max(100000) });
      const { chips } = bonusSchema.parse(req.body);
      const profile = await storage.getPlayerProfile(id);
      if (!profile) {
        res.status(404).json({ error: "Player not found" });
        return;
      }
      await storage.addChipsToPlayer(id, chips, { reason: 'other', source: 'bonusChips' });
      const updated = await storage.getPlayerProfile(id);
      res.json({ chipBalance: updated?.chipBalance ?? profile.chipBalance + chips });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "chips must be a positive integer ≤ 100,000" });
      } else {
        console.error("bonus-chips error:", err);
        res.status(500).json({ error: "Failed to add bonus chips" });
      }
    }
  });

  // POST /api/players/:id/chip-loan
  // Grants a one-time 1,000 chip loan to a broke player (chipBalance ≤ 500, no existing loan).
  // The loan balance is tracked and auto-repaid from subsequent chip earnings.
  app.post("/api/players/:id/chip-loan", requireAuth, requireSelf, async (req, res) => {
    try {
      const id = req.params.id as string;
      const result = await storage.grantChipLoan(id);
      if (!result.success) {
        const status = result.error === 'player_not_found' ? 404 : 409;
        res.status(status).json({ error: result.error });
        return;
      }
      res.json({ success: true, newBalance: result.newBalance });
    } catch (err) {
      console.error("chip-loan error:", err);
      res.status(500).json({ error: "Failed to grant chip loan" });
    }
  });

  // POST /api/players/:id/claim-welcome-kit
  // Marks the new-player welcome kit as claimed in the DB.
  // Idempotent: calling it again on an already-claimed account is a no-op.
  app.post("/api/players/:id/claim-welcome-kit", requireAuth, requireSelf, async (req, res) => {
    try {
      const id = req.params.id as string;
      const profile = await storage.getPlayerProfile(id);
      if (!profile) { res.status(404).json({ error: "Player not found" }); return; }
      if (profile.welcomeKitClaimed) {
        res.status(409).json({ error: "Welcome kit already claimed" });
        return;
      }
      await storage.claimWelcomeKit(id);
      const newStripes = await storage.creditStripes(id, 250, 'welcome_kit');
      console.log(`[welcome-kit] player=${id} welcomeKitClaimed=true stripes=+250 newTotal=${newStripes}`);
      res.json({ ok: true });
    } catch (err) {
      console.error("claim-welcome-kit error:", err);
      res.status(500).json({ error: "Failed to claim welcome kit" });
    }
  });

  // GET /api/players/:id/daily-bonus/status
  // Returns claim availability, current streak day, today's reward, and next claim time.
  app.get("/api/players/:id/daily-bonus/status", requireAuth, requireSelf, async (req, res) => {
    try {
      const id = req.params.id as string;
      const profile = await storage.getPlayerProfile(id);
      if (!profile) { res.status(404).json({ error: "Player not found" }); return; }
      const status = await storage.getDailyBonusStatus(id);
      res.json(status);
    } catch (err) {
      console.error("[daily-bonus] status error:", err);
      res.status(500).json({ error: "Failed to fetch daily bonus status" });
    }
  });

  // POST /api/players/:id/daily-bonus/claim
  // Atomically credits chips + Stripes, writes audit row, updates streak.
  // 409 if already claimed today. Server validates — never trusts client.
  app.post("/api/players/:id/daily-bonus/claim", dailyBonusRateLimit, requireAuth, requireSelf, async (req, res) => {
    try {
      const id = req.params.id as string;
      const profile = await storage.getPlayerProfile(id);
      if (!profile) { res.status(404).json({ error: "Player not found" }); return; }
      const result = await storage.claimDailyBonus(id);

      // ── Subscription chip bonus (credited on top of base daily bonus) ──────
      const tier = profile.activeSubscriptionTier;
      const subBonusChips =
        tier === "diamond_elite" ? 2500 :
        tier === "gold_pro"      ? 1000 : 0;

      if (subBonusChips > 0) {
        await storage.addChipsToPlayer(id, subBonusChips, { reason: 'subscription_grant', source: 'subscription' });
        console.log(
          `[daily-bonus] sub bonus player=${id} tier=${tier} chips=+${subBonusChips}`,
        );
      }

      console.log(
        `[daily-bonus] claimed player=${id} day=${result.newStreakDay}`,
        `chips=+${result.chipsGranted} stripes=+${result.stripesGranted}`,
        tier ? `sub_bonus=+${subBonusChips}` : "",
      );
      res.json({
        success: true,
        ...result,
        subBonusChips,
        newChipBalance: result.newChipBalance + subBonusChips,
      });
    } catch (err: any) {
      if (err?.code === "ALREADY_CLAIMED") {
        res.status(409).json({ error: "Already claimed today", code: "ALREADY_CLAIMED" });
        return;
      }
      console.error("[daily-bonus] claim error:", err);
      res.status(500).json({ error: "Failed to claim daily bonus" });
    }
  });

  // ── Real-player priority join ──────────────────────────────────────────────
  // GET /api/tables/mode/:modeId/join
  // Returns the best existing public table for a mode (most humans, at least 1 open seat),
  // or { tableId: null } if no suitable table exists and the client must create a new one.
  // Client should use the returned tableId as the WS join target when non-null.
  app.get("/api/tables/mode/:modeId/join", (req, res) => {
    const { modeId } = req.params;
    const MAX_SEATS = 5;
    // Subscribers (gold_pro / diamond_elite) get priority access: they can join
    // tables with only 1 seat remaining, while free players cannot (that seat is
    // effectively reserved for subscribers, functioning as a priority queue).
    const subTier = (req.query.subTier as string | undefined) ?? '';
    const isSubscriber = subTier === 'gold_pro' || subTier === 'diamond_elite';
    const maxHumanThreshold = isSubscriber ? MAX_SEATS : MAX_SEATS - 1;

    if (modeId === "badugi") {
      const tables = getActiveBadugiTables()
        .filter(t => t.humanCount > 0 && t.humanCount < maxHumanThreshold)
        .sort((a, b) => b.humanCount - a.humanCount);
      if (tables.length > 0) {
        res.json({ tableId: tables[0].tableId, humanCount: tables[0].humanCount });
      } else {
        res.json({ tableId: null });
      }
      return;
    }

    const tables = getActiveGenericTables()
      .filter(t => t.modeId === modeId && t.humanCount > 0 && t.humanCount < maxHumanThreshold)
      .sort((a, b) => b.humanCount - a.humanCount);

    if (tables.length > 0) {
      res.json({ tableId: tables[0].tableId, humanCount: tables[0].humanCount });
    } else {
      res.json({ tableId: null });
    }
  });

  // POST /api/auth/logout — invalidate the current session token
  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
      const token = req.headers["x-session-token"] as string;
      await storage.invalidateSession(token);
      res.json({ loggedOut: true });
    } catch (err) {
      console.error("Logout error:", err);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // ── Cosmetics ────────────────────────────────────────────────────────────────

  // GET /api/cosmetics/catalog
  // Returns all active cosmetic items, grouped by category.
  app.get("/api/cosmetics/catalog", async (_req, res) => {
    try {
      const items = await storage.getCosmeticCatalog();
      const grouped = { avatar: items.filter(i => i.category === 'avatar'), frame: items.filter(i => i.category === 'frame'), name_color: items.filter(i => i.category === 'name_color') };
      res.json({ items, grouped });
    } catch (err) {
      console.error("[cosmetics] catalog error:", err);
      res.status(500).json({ error: "Failed to load catalog" });
    }
  });

  // GET /api/players/:id/inventory
  app.get("/api/players/:id/inventory", requireAuth, requireSelf, async (req, res) => {
    try {
      const result = await storage.getPlayerInventory(req.params.id as string);
      res.json(result);
    } catch (err) {
      console.error("[cosmetics] inventory error:", err);
      res.status(500).json({ error: "Failed to load inventory" });
    }
  });

  // POST /api/players/:id/cosmetics/purchase
  app.post("/api/players/:id/cosmetics/purchase", requireAuth, requireSelf, async (req, res) => {
    try {
      const { cosmetic_item_id } = z.object({ cosmetic_item_id: z.string().min(1) }).parse(req.body);
      const result = await storage.purchaseCosmetic(req.params.id as string, cosmetic_item_id);
      res.json({ success: true, newStripesBalance: result.newStripesBalance, ownedItem: result.item });
    } catch (err: any) {
      if (err?.name === "ZodError") { res.status(400).json({ error: "Invalid request" }); return; }
      if (err?.code === "ALREADY_OWNED")          { res.status(409).json({ error: "Already owned", code: "ALREADY_OWNED" }); return; }
      if (err?.code === "INSUFFICIENT_STRIPES")   { res.status(402).json({ error: "Insufficient Stripes", code: "INSUFFICIENT_STRIPES", balance: err.balance }); return; }
      if (err?.code === "NOT_FOUND")              { res.status(404).json({ error: "Item not found" }); return; }
      console.error("[cosmetics] purchase error:", err);
      res.status(500).json({ error: "Purchase failed" });
    }
  });

  // POST /api/players/:id/cosmetics/equip
  app.post("/api/players/:id/cosmetics/equip", requireAuth, requireSelf, async (req, res) => {
    try {
      const { cosmetic_item_id } = z.object({ cosmetic_item_id: z.string().min(1) }).parse(req.body);
      const result = await storage.equipCosmetic(req.params.id as string, cosmetic_item_id);
      res.json({ success: true, equipped: result.equipped });
    } catch (err: any) {
      if (err?.code === "NOT_OWNED") { res.status(403).json({ error: "Item not owned" }); return; }
      console.error("[cosmetics] equip error:", err);
      res.status(500).json({ error: "Equip failed" });
    }
  });

  // POST /api/players/:id/cosmetics/unequip
  app.post("/api/players/:id/cosmetics/unequip", requireAuth, requireSelf, async (req, res) => {
    try {
      const { category } = z.object({ category: z.enum(["avatar", "frame", "name_color"]) }).parse(req.body);
      await storage.unequipCosmetic(req.params.id as string, category);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.name === "ZodError") { res.status(400).json({ error: "Invalid category" }); return; }
      console.error("[cosmetics] unequip error:", err);
      res.status(500).json({ error: "Unequip failed" });
    }
  });

  // ── Music ────────────────────────────────────────────────────────────────────

  // GET /api/players/:id/music — returns equipped track IDs per context
  app.get("/api/players/:id/music", requireAuth, requireSelf, async (req, res) => {
    try {
      const equipped = await storage.getMusicEquipped(req.params.id as string);
      res.json({ equipped });
    } catch (err) {
      console.error("[music] get equipped error:", err);
      res.status(500).json({ error: "Failed to load music settings" });
    }
  });

  // Tracks that are free for all players — no inventory check required.
  const FREE_MUSIC_IDS = new Set(['music_chain_gang_poker', 'music_chain_gang_nights']);

  // POST /api/players/:id/music/equip — assign a track to a context
  app.post("/api/players/:id/music/equip", requireAuth, requireSelf, async (req, res) => {
    try {
      const { context, track_id } = z.object({
        context:  z.enum(['lobby', 'game', 'ladyluck']),
        track_id: z.string().nullable(),
      }).parse(req.body);

      // Free tracks are always equippable; paid tracks require ownership.
      if (track_id !== null && !FREE_MUSIC_IDS.has(track_id)) {
        const inv = await storage.getPlayerInventory(req.params.id as string);
        const owns = inv.items.some((i: any) => i.id === track_id && i.category === 'music');
        if (!owns) { res.status(403).json({ error: "Track not owned" }); return; }
      }

      await storage.setEquippedMusicTrack(req.params.id as string, context, track_id);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.name === 'ZodError') { res.status(400).json({ error: "Invalid request" }); return; }
      console.error("[music] equip error:", err);
      res.status(500).json({ error: "Failed to equip track" });
    }
  });

  // ── Quest definitions ──────────────────────────────────────────────────────
  const DAILY_QUESTS: Record<number, { questId: string; description: string; modeId: string | null; requiredHands: number; stripes: number }> = {
    1: { questId: 'daily_monday',    description: 'Play 10 hands in Badugi',              modeId: 'badugi', requiredHands: 10, stripes: 5 },
    2: { questId: 'daily_tuesday',   description: 'Play 10 hands in Dead 7',              modeId: 'dead7',  requiredHands: 10, stripes: 5 },
    3: { questId: 'daily_wednesday', description: 'Play 10 hands in 15/35',               modeId: '1535',   requiredHands: 10, stripes: 5 },
    4: { questId: 'daily_thursday',  description: 'Play 10 hands in Suits & Poker',       modeId: 'suits',  requiredHands: 10, stripes: 5 },
    5: { questId: 'daily_friday',    description: 'Play 15 hands in any mode',            modeId: null,     requiredHands: 15, stripes: 5 },
    6: { questId: 'daily_saturday',  description: 'Win 15 hands in any mode',             modeId: null,     requiredHands: 15, stripes: 5 },
    0: { questId: 'daily_sunday',    description: 'Play 10 hands in two different modes', modeId: null,     requiredHands: 10, stripes: 5 },
  };
  const MILESTONE_QUESTS: Record<string, { requiredHands: number; modeId: string | null; stripes: number }> = {
    milestone_10:         { requiredHands: 10,   modeId: null,     stripes: 5   },
    milestone_50:         { requiredHands: 50,   modeId: null,     stripes: 10  },
    milestone_100:        { requiredHands: 100,  modeId: null,     stripes: 25  },
    milestone_500:        { requiredHands: 500,  modeId: null,     stripes: 50  },
    milestone_1000:       { requiredHands: 1000, modeId: null,     stripes: 100 },
    milestone_2500:       { requiredHands: 2500, modeId: null,     stripes: 150 },
    milestone_badugi_100: { requiredHands: 100,  modeId: 'badugi', stripes: 15  },
    milestone_dead7_100:  { requiredHands: 100,  modeId: 'dead7',  stripes: 15  },
    milestone_1535_100:   { requiredHands: 100,  modeId: '1535',   stripes: 15  },
    milestone_suits_100:  { requiredHands: 100,  modeId: 'suits',  stripes: 15  },
  };

  // GET /api/players/:id/quests
  app.get("/api/players/:id/quests", requireAuth, requireSelf, async (req, res) => {
    try {
      const playerId = req.params.id as string;
      const [profile, claimed] = await Promise.all([
        storage.getPlayerProfile(playerId),
        storage.getClaimedQuests(playerId),
      ]);
      if (!profile) { res.status(404).json({ error: "Player not found" }); return; }
      res.json({
        claimed,
        handsPlayed:       profile.handsPlayed,
        handsPlayedBadugi: profile.handsPlayedBadugi,
        handsPlayedDead7:  profile.handsPlayedDead7,
        handsPlayed1535:   profile.handsPlayed1535,
        handsPlayedSuits:  profile.handsPlayedSuits,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/players/:id/quests/claim
  app.post("/api/players/:id/quests/claim", requireAuth, requireSelf, async (req, res) => {
    try {
      const { questId } = z.object({ questId: z.string().min(1) }).parse(req.body);
      const playerId = req.params.id as string;

      const profile = await storage.getPlayerProfile(playerId);
      if (!profile) { res.status(404).json({ error: "Player not found" }); return; }

      // Locate the quest definition
      const todayDow = new Date().getUTCDay(); // 0=Sunday … 6=Saturday
      const dailyDef = Object.values(DAILY_QUESTS).find(q => q.questId === questId);
      const milestoneDef = MILESTONE_QUESTS[questId];
      if (!dailyDef && !milestoneDef) { res.status(400).json({ error: "Unknown quest" }); return; }

      // Check eligibility
      if (dailyDef) {
        const hands = dailyDef.modeId === 'badugi' ? profile.handsPlayedBadugi
                    : dailyDef.modeId === 'dead7'  ? profile.handsPlayedDead7
                    : dailyDef.modeId === '1535'   ? profile.handsPlayed1535
                    : dailyDef.modeId === 'suits'  ? profile.handsPlayedSuits
                    : profile.handsPlayed;
        if (hands < dailyDef.requiredHands) {
          res.status(400).json({ error: "Not enough hands played", required: dailyDef.requiredHands, current: hands }); return;
        }
        // Only valid on the matching day of the week
        const questDow = Object.entries(DAILY_QUESTS).find(([, v]) => v.questId === questId)?.[0];
        if (questDow !== undefined && parseInt(questDow, 10) !== todayDow) {
          res.status(400).json({ error: "This daily quest is not active today" }); return;
        }
        const { newStripes } = await storage.claimQuest(playerId, questId, dailyDef.stripes);
        res.json({ stripesGranted: dailyDef.stripes, newTotal: newStripes });
      } else if (milestoneDef) {
        const hands = milestoneDef.modeId === 'badugi' ? profile.handsPlayedBadugi
                    : milestoneDef.modeId === 'dead7'  ? profile.handsPlayedDead7
                    : milestoneDef.modeId === '1535'   ? profile.handsPlayed1535
                    : milestoneDef.modeId === 'suits'  ? profile.handsPlayedSuits
                    : profile.handsPlayed;
        if (hands < milestoneDef.requiredHands) {
          res.status(400).json({ error: "Not enough hands played", required: milestoneDef.requiredHands, current: hands }); return;
        }
        const { newStripes } = await storage.claimQuest(playerId, questId, milestoneDef.stripes);
        res.json({ stripesGranted: milestoneDef.stripes, newTotal: newStripes });
      }
    } catch (err: any) {
      if (err?.code === 'already_claimed') { res.status(409).json({ error: "Quest already claimed" }); return; }
      if (err?.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message }); return; }
      console.error("[quests] claim error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/billing/verify-purchase
  // Called by the native client after Google Play returns a purchase token.
  // Performs server-side verification via Play Developer API, credits Stripes,
  // and records the transaction for audit + refund handling.
  app.post("/api/billing/verify-purchase", ...purchaseVerificationRateLimit, requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        productId:     z.string().min(1),
        purchaseToken: z.string().min(1),
        crewId:        z.string().optional(),
      });
      const { productId, purchaseToken, crewId } = schema.parse(req.body);

      // ── Club chip IAP: credits chips directly to the crew bank ───────────────
      const clubPack = CLUB_CHIP_PACKS[productId];
      if (clubPack) {
        if (!crewId) {
          res.status(400).json({ error: 'crewId required for club chip purchases' });
          return;
        }
        const clubPlayerId = req.sessionPlayerId!;
        let clubPurchaseData;
        try {
          clubPurchaseData = await verifyGooglePlayPurchase(productId, purchaseToken);
        } catch (verifyErr: any) {
          res.status(402).json({ error: `Purchase verification failed: ${verifyErr.message}` });
          return;
        }
        if (clubPurchaseData.purchaseState !== 0) {
          const state = clubPurchaseData.purchaseState === 1 ? 'canceled' : 'pending';
          res.status(402).json({ error: `Purchase is ${state} — not completed.` });
          return;
        }
        await storage.addChipsToCrewBank(crewId, clubPlayerId, clubPack.chips);
        await acknowledgeGooglePlayPurchase(productId, purchaseToken);
        console.log(
          `[billing] club-chips: player=${clubPlayerId} crewId=${crewId} chips=+${clubPack.chips}`
        );
        res.json({ chipsGranted: clubPack.chips, crewId });
        return;
      }

      const pack = STRIPES_PACKS[productId];
      if (!pack) {
        res.status(400).json({ error: `Unknown product: ${productId}` });
        return;
      }

      const playerId = req.sessionPlayerId!;

      // Idempotency guard — handle duplicate tokens by status
      const existing = await storage.getPurchaseTransactionByToken(purchaseToken);
      let txnId: string;
      if (existing) {
        if (existing.verificationStatus === "verified") {
          res.json({
            stripesGranted: existing.stripesGranted,
            orderId:        existing.googleOrderId ?? "",
            idempotent:     true,
          });
          return;
        }
        if (existing.verificationStatus === "pending") {
          res.status(409).json({ error: "Purchase is still being processed. Please wait." });
          return;
        }
        if (existing.verificationStatus === "failed_retryable") {
          // Previous attempt crashed before Google responded (e.g. missing googleapis bundle).
          // Reset to pending and allow this attempt to proceed through full verification.
          await storage.updatePurchaseTransactionStatus(existing.id, "pending");
          txnId = existing.id;
        } else {
          // "rejected" (Google confirmed bad) or "refunded" — permanently blocked.
          res.status(409).json({ error: "Purchase token already used or rejected." });
          return;
        }
      } else {
        // No prior record — create pending transaction for audit trail.
        const txn = await storage.createPurchaseTransaction({
          playerId,
          productId,
          stripesGranted:     pack.stripes,
          priceUsdCents:      pack.priceCents,
          purchaseToken,
          verificationStatus: "pending",
        });
        txnId = txn.id;
      }

      // Server-side Google Play verification
      let purchaseData;
      try {
        purchaseData = await verifyGooglePlayPurchase(productId, purchaseToken);
      } catch (verifyErr: any) {
        // Distinguish infrastructure failures (no Google response received) from
        // Google API HTTP errors (Google responded with 4xx/5xx).
        // Infrastructure failures are retryable; Google API errors are permanent.
        const hasGoogleResponse = !!(verifyErr as any)?.response;
        const failStatus = hasGoogleResponse ? "rejected" : "failed_retryable";
        console.error(`[billing] Verification failed (${failStatus}): ${verifyErr.message}`);
        await storage.updatePurchaseTransactionStatus(txnId, failStatus);
        res.status(402).json({ error: `Purchase verification failed: ${verifyErr.message}` });
        return;
      }

      if (purchaseData.purchaseState !== 0) {
        const state = purchaseData.purchaseState === 1 ? "canceled" : "pending";
        await storage.updatePurchaseTransactionStatus(txnId, "rejected");
        res.status(402).json({ error: `Purchase is ${state} — not completed.` });
        return;
      }

      // Fix C: bind purchase to the authenticated player (fail closed).
      // Skip only when running in TEST_MODE with a test_ token (no real Google data).
      if (!(process.env.BILLING_TEST_MODE === "true" && purchaseToken.startsWith("test_"))) {
        if (!purchaseData.obfuscatedExternalAccountId) {
          console.log(
            `[BILLING_AUTHZ] obfuscatedExternalAccountId missing — ` +
            `player=${playerId.slice(0, 8)} product=${productId}`,
          );
          await storage.updatePurchaseTransactionStatus(txnId, "rejected");
          res.status(403).json({ error: "Purchase authorization failed: account identifier missing" });
          return;
        }
        if (purchaseData.obfuscatedExternalAccountId !== playerId) {
          console.log(
            `[BILLING_AUTHZ] mismatch: session=${playerId.slice(0, 8)} ` +
            `purchase=${purchaseData.obfuscatedExternalAccountId.slice(0, 8)} product=${productId}`,
          );
          await storage.updatePurchaseTransactionStatus(txnId, "rejected");
          res.status(403).json({ error: "Purchase authorization failed: account ID mismatch" });
          return;
        }
      }

      // Credit Stripes (atomic via stripe_transactions audit table)
      await storage.creditStripes(playerId, pack.stripes, `purchase:${productId}`);

      // Fix B: chip_transactions audit row for IAP (amountChange=0 — Stripes grant, not chips).
      // Provides a single ledger trail linking every IAP event to a chip_transactions row.
      const iapProfile = await storage.getPlayerProfile(playerId);
      await storage.recordChipTransaction({
        playerId,
        beforeBalance: iapProfile?.chipBalance ?? 0,
        amountChange:  0,
        afterBalance:  iapProfile?.chipBalance ?? 0,
        reason:        'iap_purchase',
        source:        'google_play',
        metadata:      { productId, purchaseToken: purchaseToken.slice(0, 20) },
      });

      // Mark verified with Google's orderId
      await storage.updatePurchaseTransactionStatus(
        txnId,
        "verified",
        purchaseData.orderId,
        new Date(),
      );

      // Acknowledge (consume) so Google allows re-purchase and doesn't auto-refund
      try {
        await acknowledgeGooglePlayPurchase(productId, purchaseToken);
      } catch (ackErr: any) {
        // Non-fatal: Google auto-refunds after 3 days if not consumed. Log for manual action.
        console.error(`[billing] Acknowledge failed (manual action needed): ${ackErr.message}`);
      }

      console.log(
        `[billing] SUCCESS: player=${playerId} product=${productId} ` +
        `stripes=${pack.stripes} order=${purchaseData.orderId}`,
      );

      res.json({
        stripesGranted: pack.stripes,
        orderId:        purchaseData.orderId,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "Invalid purchase data" });
      } else {
        console.error("[billing] verify-purchase error:", err);
        res.status(500).json({ error: "Purchase processing failed" });
      }
    }
  });

  // POST /api/billing/verify-apple-purchase
  // Called by the native iOS client after Apple StoreKit returns a transaction.
  // Verifies the transaction via the App Store Server API, credits Stripes or
  // club chips, and records an audit row. No server-side acknowledge needed for
  // Apple consumables — the client calls transaction.finish() to complete StoreKit.
  app.post("/api/billing/verify-apple-purchase", ...purchaseVerificationRateLimit, requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        productId:     z.string().min(1),
        transactionId: z.string().min(1),
        crewId:        z.string().optional(),
      });
      const { productId, transactionId, crewId } = schema.parse(req.body);
      const playerId = req.sessionPlayerId!;

      // ── Club chip IAP: credits chips directly to the crew bank ────────────────
      const clubPack = CLUB_CHIP_PACKS[productId];
      if (clubPack) {
        if (!crewId) {
          res.status(400).json({ error: 'crewId required for club chip purchases' });
          return;
        }
        let appleClubData: ApplePurchaseData;
        try {
          appleClubData = await verifyAppleAppStorePurchase(transactionId);
        } catch (verifyErr: any) {
          res.status(402).json({ error: `Apple purchase verification failed: ${verifyErr.message}` });
          return;
        }
        if (appleClubData.revocationReason !== undefined) {
          res.status(402).json({ error: 'Apple purchase was refunded or revoked.' });
          return;
        }
        await storage.addChipsToCrewBank(crewId, playerId, clubPack.chips);
        console.log(`[billing:apple] club-chips: player=${playerId} crewId=${crewId} chips=+${clubPack.chips}`);
        res.json({ chipsGranted: clubPack.chips, crewId });
        return;
      }

      // ── Stripes pack IAP ─────────────────────────────────────────────────────
      const pack = STRIPES_PACKS[productId];
      if (!pack) {
        res.status(400).json({ error: `Unknown product: ${productId}` });
        return;
      }

      // Idempotency: use Apple transactionId as the dedup key (stored in purchaseToken column)
      const existing = await storage.getPurchaseTransactionByToken(transactionId);
      let txnId: string;
      if (existing) {
        if (existing.verificationStatus === 'verified') {
          res.json({ stripesGranted: existing.stripesGranted, orderId: existing.googleOrderId ?? transactionId, idempotent: true });
          return;
        }
        if (existing.verificationStatus === 'pending') {
          res.status(409).json({ error: 'Purchase is still being processed. Please wait and try again.' });
          return;
        }
        if (existing.verificationStatus === 'failed_retryable') {
          await storage.updatePurchaseTransactionStatus(existing.id, 'pending');
          txnId = existing.id;
        } else {
          res.status(409).json({ error: 'Purchase token already used or rejected.' });
          return;
        }
      } else {
        const txn = await storage.createPurchaseTransaction({
          playerId,
          productId,
          stripesGranted:     pack.stripes,
          priceUsdCents:      pack.priceCents,
          purchaseToken:      transactionId,
          verificationStatus: 'pending',
        });
        txnId = txn.id;
      }

      // Verify with Apple App Store Server API
      let appleData: ApplePurchaseData;
      try {
        appleData = await verifyAppleAppStorePurchase(transactionId);
      } catch (verifyErr: any) {
        console.error(`[billing:apple] Verification error: ${verifyErr.message}`);
        await storage.updatePurchaseTransactionStatus(txnId, 'failed_retryable');
        res.status(402).json({ error: `Apple purchase verification failed: ${verifyErr.message}` });
        return;
      }

      // Reject refunded / revoked purchases
      if (appleData.revocationReason !== undefined) {
        await storage.updatePurchaseTransactionStatus(txnId, 'rejected');
        res.status(402).json({ error: 'Apple purchase was refunded or revoked.' });
        return;
      }

      // Validate the product ID returned by Apple matches what the client sent
      if (appleData.productId !== productId) {
        console.warn(`[billing:apple] productId mismatch: expected=${productId} got=${appleData.productId}`);
        await storage.updatePurchaseTransactionStatus(txnId, 'rejected');
        res.status(402).json({ error: 'Product ID mismatch in Apple transaction.' });
        return;
      }

      // Bind purchase to the authenticated player via appAccountToken (Apple equivalent of
      // Google's obfuscatedExternalAccountId — set by store.applicationUsername on the client).
      if (appleData.appAccountToken) {
        if (appleData.appAccountToken !== playerId) {
          console.log(
            `[BILLING_AUTHZ:apple] mismatch: session=${playerId.slice(0, 8)} ` +
            `appAccountToken=${appleData.appAccountToken.slice(0, 8)} product=${productId}`,
          );
          await storage.updatePurchaseTransactionStatus(txnId, 'rejected');
          res.status(403).json({ error: 'Purchase authorization failed: account ID mismatch' });
          return;
        }
      } else {
        // Log a warning but proceed — first-release Apple builds may not always populate this
        console.warn(`[BILLING_AUTHZ:apple] appAccountToken absent for player=${playerId.slice(0, 8)} product=${productId}`);
      }

      // Credit Stripes to the player's account
      await storage.creditStripes(playerId, pack.stripes, `purchase:${productId}`);

      const iapProfile = await storage.getPlayerProfile(playerId);
      await storage.recordChipTransaction({
        playerId,
        beforeBalance: iapProfile?.chipBalance ?? 0,
        amountChange:  0,
        afterBalance:  iapProfile?.chipBalance ?? 0,
        reason:        'iap_purchase',
        source:        'apple_appstore',
        metadata:      { productId, transactionId: transactionId.slice(0, 40), environment: appleData.environment },
      });

      // Mark verified using Apple's originalTransactionId as the orderId
      await storage.updatePurchaseTransactionStatus(
        txnId,
        'verified',
        appleData.originalTransactionId,
        new Date(),
      );

      // No server-side acknowledgement needed for Apple consumables:
      // the client calls transaction.finish() which tells StoreKit to remove the transaction
      // from the pending queue and mark it as consumed (equivalent of Google's consume call).

      console.log(
        `[billing:apple] SUCCESS: player=${playerId} product=${productId} ` +
        `stripes=${pack.stripes} originalTxn=${appleData.originalTransactionId} env=${appleData.environment}`,
      );

      res.json({ stripesGranted: pack.stripes, orderId: appleData.originalTransactionId });
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid purchase data' });
      } else {
        console.error('[billing:apple] verify-apple-purchase error:', err);
        res.status(500).json({ error: 'Purchase processing failed' });
      }
    }
  });

  // POST /api/billing/verify-apple-subscription
  // Called by the native iOS client after an Apple auto-renewable subscription
  // flow completes. Verifies the Apple transactionId via the App Store Server API,
  // then activates the subscription tier and credits the initial Stripes grant.
  // Uses originalTransactionId for idempotency — stable across renewals.
  // In BILLING_TEST_MODE the Apple API check is skipped so sandbox IAP can be
  // exercised without real App Store credentials configured in Secrets.
  app.post("/api/billing/verify-apple-subscription", ...purchaseVerificationRateLimit, requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        productId:     z.string().min(1),
        transactionId: z.string().min(1),
      });
      const { productId, transactionId } = schema.parse(req.body);

      const product = SUBSCRIPTION_PRODUCTS[productId];
      if (!product) {
        res.status(400).json({ error: `Unknown Apple subscription product: ${productId}` });
        return;
      }

      const playerId = req.sessionPlayerId!;

      let tokenForRecord = transactionId;
      let appleData: ApplePurchaseData | undefined;
      if (!TEST_MODE) {
        try {
          appleData = await verifyAppleAppStorePurchase(transactionId);
        } catch (verifyErr: any) {
          console.error('[billing:apple-sub] Apple API verification failed:', verifyErr.message);
          res.status(402).json({ error: `Apple subscription verification failed: ${verifyErr.message}` });
          return;
        }
        if (appleData.revocationReason !== undefined) {
          res.status(402).json({ error: 'Apple subscription was refunded or revoked.' });
          return;
        }
        // Use originalTransactionId so the idempotency key is stable across renewals
        tokenForRecord = appleData.originalTransactionId ?? transactionId;
        console.log(
          `[billing:apple-sub] verified: player=${playerId} product=${productId}` +
          ` tier=${product.tier} env=${appleData.environment}`
        );
      } else {
        const testDurationMs = product.billingPeriod === 'yearly'
          ? 365 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;
        appleData = {
          transactionId,
          originalTransactionId: transactionId,
          productId,
          bundleId: 'test',
          purchaseDate: Date.now(),
          expiresDate: Date.now() + testDurationMs,
          quantity: 1,
          type: 'Auto-Renewable Subscription',
          appAccountToken: playerId,
          environment: 'Sandbox',
        };
        console.log(
          `[billing:apple-sub] TEST_MODE: skipping Apple verification ` +
          `player=${playerId} product=${productId}`
        );
      }

      const result = await processSubscriptionPurchase(
        playerId,
        productId,
        tokenForRecord,
        'apple_app_store',
        appleData,
      );

      res.json({
        success:        true,
        idempotent:     result.idempotent,
        tier:           result.tier,
        expiresAt:      result.expiresAt.toISOString(),
        stripesGranted: result.stripesGranted,
      });
    } catch (err: any) {
      if (err?.name === 'ZodError') { res.status(400).json({ error: 'Invalid request' }); return; }
      console.error('[billing:apple-sub] verify-apple-subscription error:', err);
      res.status(500).json({ error: err.message ?? 'Subscription activation failed' });
    }
  });

  // POST /api/billing/play-webhook
  // Unified Google Play Real-Time Developer Notification (RTDN) endpoint.
  // All Play Console notification types (subscription lifecycle, voided purchases,
  // one-time products, test pings) arrive here from a single Pub/Sub push subscription.
  // Configure in Play Console → Monetize → Subscriptions & in-app products → Real-time
  // developer notifications → Topic URL, then create ONE Pub/Sub push subscription
  // pointing to this URL.
  // Auth: JWT verified against PUBSUB_AUDIENCE_PLAY (value = this endpoint's full URL).
  app.post("/api/billing/play-webhook", verifyPlayWebhook, async (req, res) => {
    // Always ACK with 200 so Pub/Sub does not retry the same message indefinitely.
    // Errors are logged but never bubble up to a 5xx.
    try {
      const message = req.body?.message;
      if (!message?.data) {
        console.warn("[billing:play] play-webhook: missing Pub/Sub message.data — ACK and skip");
        res.status(200).json({ received: true });
        return;
      }

      const raw = Buffer.from(message.data, "base64").toString("utf-8");
      const notification = JSON.parse(raw);
      const at = new Date().toISOString();

      // ── Test ping ────────────────────────────────────────────────────────────
      if (notification?.testNotification) {
        console.log(`[billing:play] play-webhook: event=testNotification (test ping) at=${at}`);
        res.status(200).json({ received: true });
        return;
      }

      // ── Voided purchase (consumable refund / chargeback) ─────────────────────
      // Player identity is resolved from purchase_transaction table — never from
      // the webhook body. Guard on verificationStatus==="verified" ensures
      // debitStripesForRefund is not called twice for the same token.
      const voidedPurchase = notification?.voidedPurchaseNotification;
      if (voidedPurchase?.purchaseToken) {
        const token = voidedPurchase.purchaseToken as string;
        const txn = await storage.getPurchaseTransactionByToken(token);
        if (txn && txn.verificationStatus === "verified") {
          await storage.debitStripesForRefund(txn.playerId, txn.stripesGranted, txn.id);
          console.log(
            `[billing:play] play-webhook: event=voidedPurchase ` +
            `token=...${token.slice(-8)} player=${txn.playerId} ` +
            `action=debit_stripes amount=${txn.stripesGranted} at=${at}`
          );
        } else {
          console.log(
            `[billing:play] play-webhook: event=voidedPurchase ` +
            `token=...${token.slice(-8)} action=no_op ` +
            `reason=${!txn ? "transaction_not_found" : "not_verified"} at=${at}`
          );
        }
        res.status(200).json({ received: true });
        return;
      }

      // ── Subscription lifecycle ───────────────────────────────────────────────
      const subNotif = notification?.subscriptionNotification;
      if (subNotif?.purchaseToken) {
        const { purchaseToken, notificationType } = subNotif;
        const tokenTail = (purchaseToken as string).slice(-8);
        // notificationType values from Google:
        // 1=RECOVERED 2=RENEWED 3=CANCELED 4=PURCHASED 5=ON_HOLD
        // 6=IN_GRACE_PERIOD 7=RESTARTED 12=EXPIRED 13=REVOKED (subscription refund)
        switch (notificationType) {
          case 1:
            console.log(`[billing:play] play-webhook: event=RECOVERED token=...${tokenTail} at=${at}`);
            await handleSubscriptionRecovered(purchaseToken);
            break;
          case 2:
            console.log(`[billing:play] play-webhook: event=RENEWED token=...${tokenTail} at=${at}`);
            await handleSubscriptionRenewal(purchaseToken);
            break;
          case 3:
            console.log(`[billing:play] play-webhook: event=CANCELED token=...${tokenTail} at=${at}`);
            await handleSubscriptionCancellation(purchaseToken);
            break;
          case 4:
            // PURCHASED is a no-op here — handled client-side by /verify-subscription.
            console.log(`[billing:play] play-webhook: event=PURCHASED token=...${tokenTail} at=${at} action=no_op (handled by verify-subscription)`);
            break;
          case 5:
            console.log(`[billing:play] play-webhook: event=ON_HOLD token=...${tokenTail} at=${at}`);
            await handleSubscriptionOnHold(purchaseToken);
            break;
          case 6:
            console.log(`[billing:play] play-webhook: event=IN_GRACE_PERIOD token=...${tokenTail} at=${at}`);
            await handleSubscriptionGracePeriod(purchaseToken);
            break;
          case 7:
            console.log(`[billing:play] play-webhook: event=RESTARTED token=...${tokenTail} at=${at}`);
            await handleSubscriptionRecovered(purchaseToken);
            break;
          case 12:
            console.log(`[billing:play] play-webhook: event=EXPIRED token=...${tokenTail} at=${at}`);
            await handleSubscriptionExpiration(purchaseToken);
            break;
          case 13:
            console.log(`[billing:play] play-webhook: event=REVOKED token=...${tokenTail} at=${at}`);
            await handleSubscriptionRefund(purchaseToken);
            break;
          default:
            console.log(`[billing:play] play-webhook: event=UNKNOWN(${notificationType}) token=...${tokenTail} at=${at}`);
        }
        res.status(200).json({ received: true });
        return;
      }

      // ── One-time product notification ────────────────────────────────────────
      // Not yet actioned — consumable purchases are verified client-side via
      // /api/billing/verify-purchase. Log for observability.
      if (notification?.oneTimeProductNotification) {
        const { sku, purchaseToken, notificationType } = notification.oneTimeProductNotification;
        console.log(
          `[billing:play] play-webhook: event=oneTimeProduct ` +
          `sku=${sku} type=${notificationType} token=...${String(purchaseToken).slice(-8)} at=${at} action=no_op`
        );
        res.status(200).json({ received: true });
        return;
      }

      // Unknown notification shape — log and ACK.
      console.warn(`[billing:play] play-webhook: unrecognised notification shape at=${at}`, JSON.stringify(notification).slice(0, 200));
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[billing:play] play-webhook error:", err.message);
      // Still ACK — do not let Pub/Sub retry a message that caused an internal error.
      res.status(200).json({ received: true });
    }
  });

  // POST /api/billing/refund-webhook  [DEPRECATED]
  // Superseded by /api/billing/play-webhook. Kept registered so any existing Pub/Sub
  // push subscriptions pointing here continue to ACK rather than queue up retries.
  // Remove once Play Console is reconfigured to use play-webhook exclusively.
  // Receives Google Play Real-Time Developer Notifications (RTDN) via Pub/Sub.
  // Configure in Play Console → Monetize → Subscriptions & in-app products → Notifications.
  // The Pub/Sub push subscription must point to this URL.
  // JWT signature is verified by verifyRefundWebhook before the handler runs.
  app.post("/api/billing/refund-webhook", verifyRefundWebhook, async (req, res) => {
    console.warn("[billing] DEPRECATED refund-webhook hit — migrate Pub/Sub config to /api/billing/play-webhook");
    try {
      const message = req.body?.message;
      if (!message?.data) {
        res.status(400).json({ error: "Missing Pub/Sub message data" });
        return;
      }

      const raw = Buffer.from(message.data, "base64").toString("utf-8");
      const notification = JSON.parse(raw);

      // Handle voided purchase (refund / chargeback)
      const voidedPurchase = notification?.voidedPurchaseNotification;
      if (voidedPurchase?.purchaseToken) {
        const token = voidedPurchase.purchaseToken as string;
        // Look up the player via the purchase_transaction row — never trust
        // a player ID from the webhook body itself.
        const txn = await storage.getPurchaseTransactionByToken(token);
        if (txn && txn.verificationStatus === "verified") {
          await storage.debitStripesForRefund(txn.playerId, txn.stripesGranted, txn.id);
          console.log(
            `[billing] refund-webhook: event=voidedPurchase ` +
            `token=...${token.slice(-8)} player=${txn.playerId} ` +
            `action=debit_stripes amount=${txn.stripesGranted} at=${new Date().toISOString()}`
          );
        } else {
          console.log(
            `[billing] refund-webhook: event=voidedPurchase ` +
            `token=...${token.slice(-8)} action=no_op ` +
            `reason=${!txn ? "transaction_not_found" : "not_verified"} at=${new Date().toISOString()}`
          );
        }
      }

      // Always ACK the Pub/Sub message to prevent re-delivery
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[billing] refund-webhook error:", err.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ── Subscription endpoints ──────────────────────────────────────────────────

  // POST /api/billing/verify-subscription
  // Called by native client after Google Play subscription flow completes.
  // Verifies token, activates subscription, credits initial Stripes, equips frame.
  app.post("/api/billing/verify-subscription", ...purchaseVerificationRateLimit, requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        productId:     z.string().min(1),
        purchaseToken: z.string().min(1),
      });
      const { productId, purchaseToken } = schema.parse(req.body);

      if (!SUBSCRIPTION_PRODUCTS[productId]) {
        res.status(400).json({ error: `Unknown subscription product: ${productId}` });
        return;
      }

      const playerId = req.sessionPlayerId!;
      const result = await processSubscriptionPurchase(
        playerId,
        productId,
        purchaseToken,
        'google_play',
      );

      res.json({
        success:        true,
        idempotent:     result.idempotent,
        tier:           result.tier,
        expiresAt:      result.expiresAt.toISOString(),
        stripesGranted: result.stripesGranted,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") { res.status(400).json({ error: "Invalid request" }); return; }
      console.error("[billing:sub] verify-subscription error:", err);
      res.status(500).json({ error: err.message ?? "Subscription activation failed" });
    }
  });

  // POST /api/billing/subscription-webhook  [DEPRECATED]
  // Superseded by /api/billing/play-webhook. Kept registered so any existing Pub/Sub
  // push subscriptions pointing here continue to ACK rather than queue up retries.
  // Remove once Play Console is reconfigured to use play-webhook exclusively.
  // Google Real-Time Developer Notifications (RTDN) via Cloud Pub/Sub.
  // Push subscription must point to this URL.
  // Handles all subscription lifecycle events.
  // JWT signature is verified by verifySubscriptionWebhook before the handler runs.
  app.post("/api/billing/subscription-webhook", verifySubscriptionWebhook, async (req, res) => {
    console.warn("[billing:sub] DEPRECATED subscription-webhook hit — migrate Pub/Sub config to /api/billing/play-webhook");
    try {
      const message = req.body?.message;
      if (!message?.data) {
        res.status(400).json({ error: "Missing Pub/Sub message data" });
        return;
      }

      const raw = Buffer.from(message.data, "base64").toString("utf-8");
      const notification = JSON.parse(raw);

      const subNotif = notification?.subscriptionNotification;
      if (subNotif?.purchaseToken) {
        const { purchaseToken, notificationType } = subNotif;
        const tokenTail = (purchaseToken as string).slice(-8);
        const at = new Date().toISOString();
        // notificationType values from Google:
        // 1=RECOVERED 2=RENEWED 3=CANCELED 4=PURCHASED 5=ON_HOLD
        // 6=IN_GRACE_PERIOD 7=RESTARTED 12=EXPIRED 13=REVOKED (refund)
        //
        // Player identity is resolved inside each handler by looking up the
        // subscription row via purchaseToken — not from the webhook body.
        switch (notificationType) {
          case 1:
            console.log(`[billing:sub] subscription-webhook: event=RECOVERED token=...${tokenTail} at=${at}`);
            await handleSubscriptionRecovered(purchaseToken);
            break;
          case 2:
            console.log(`[billing:sub] subscription-webhook: event=RENEWED token=...${tokenTail} at=${at}`);
            await handleSubscriptionRenewal(purchaseToken);
            break;
          case 3:
            console.log(`[billing:sub] subscription-webhook: event=CANCELED token=...${tokenTail} at=${at}`);
            await handleSubscriptionCancellation(purchaseToken);
            break;
          case 4:
            console.log(`[billing:sub] subscription-webhook: event=PURCHASED token=...${tokenTail} at=${at} action=no_op (handled by verify-subscription)`);
            break;
          case 5:
            console.log(`[billing:sub] subscription-webhook: event=ON_HOLD token=...${tokenTail} at=${at}`);
            await handleSubscriptionOnHold(purchaseToken);
            break;
          case 6:
            console.log(`[billing:sub] subscription-webhook: event=IN_GRACE_PERIOD token=...${tokenTail} at=${at}`);
            await handleSubscriptionGracePeriod(purchaseToken);
            break;
          case 7:
            console.log(`[billing:sub] subscription-webhook: event=RESTARTED token=...${tokenTail} at=${at}`);
            await handleSubscriptionRecovered(purchaseToken);
            break;
          case 12:
            console.log(`[billing:sub] subscription-webhook: event=EXPIRED token=...${tokenTail} at=${at}`);
            await handleSubscriptionExpiration(purchaseToken);
            break;
          case 13:
            console.log(`[billing:sub] subscription-webhook: event=REVOKED token=...${tokenTail} at=${at}`);
            await handleSubscriptionRefund(purchaseToken);
            break;
          default:
            console.log(`[billing:sub] subscription-webhook: event=UNKNOWN(${notificationType}) token=...${tokenTail} at=${at}`);
        }
      }

      // Also handle voided purchases (consumable refunds) in the same webhook.
      // Player identity resolved from purchase_transaction table, not the body.
      const voidedPurchase = notification?.voidedPurchaseNotification;
      if (voidedPurchase?.purchaseToken) {
        const token = voidedPurchase.purchaseToken as string;
        const txn = await storage.getPurchaseTransactionByToken(token);
        if (txn && txn.verificationStatus === "verified") {
          await storage.debitStripesForRefund(txn.playerId, txn.stripesGranted, txn.id);
          console.log(
            `[billing:sub] subscription-webhook: event=voidedPurchase ` +
            `token=...${token.slice(-8)} player=${txn.playerId} ` +
            `action=debit_stripes amount=${txn.stripesGranted} at=${new Date().toISOString()}`
          );
        } else {
          console.log(
            `[billing:sub] subscription-webhook: event=voidedPurchase ` +
            `token=...${token.slice(-8)} action=no_op ` +
            `reason=${!txn ? "transaction_not_found" : "not_verified"} at=${new Date().toISOString()}`
          );
        }
      }

      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[billing:sub] subscription-webhook error:", err.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // GET /api/players/:id/subscription
  // Returns current subscription state for badge rendering + UI unlock state.
  app.get("/api/players/:id/subscription", requireAuth, requireSelf, async (req, res) => {
    try {
      const sub = await storage.getPlayerActiveSubscription(req.params.id as string);
      if (!sub) {
        res.json({ active: false, tier: null, status: null, expiresAt: null, autoRenewing: null });
        return;
      }
      res.json({
        active:       sub.status === "active" || sub.status === "in_grace_period",
        tier:         sub.tier,
        status:       sub.status,
        expiresAt:    sub.expiresAt?.toISOString() ?? null,
        autoRenewing: sub.autoRenewing,
        productId:    sub.productId,
        billingPeriod: sub.billingPeriod,
      });
    } catch (err) {
      console.error("[billing:sub] subscription fetch error:", err);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  // POST /api/players/:id/subscription/cancel
  // We cannot cancel directly from the app — this returns the Play Store deep link
  // for the player to manage their subscription themselves.
  app.post("/api/players/:id/subscription/cancel", requireAuth, requireSelf, async (req, res) => {
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "com.dgmentertainment.poker";
    const deepLink = `https://play.google.com/store/account/subscriptions?sku=&package=${packageName}`;
    res.json({ deepLink, message: "Open Play Store to manage or cancel your subscription." });
  });

  // ── Test-mode simulation endpoints (BILLING_TEST_MODE=true only) ────────────

  const TEST_MODE = process.env.BILLING_TEST_MODE === "true";

  // POST /api/billing/test/simulate-renewal
  app.post("/api/billing/test/simulate-renewal", async (req, res) => {
    const testSecret = process.env.BILLING_TEST_SECRET;
    if (!TEST_MODE || !testSecret || req.headers["x-test-secret"] !== testSecret) {
      res.status(404).json({ error: "Not found" }); return;
    }
    try {
      const { purchaseToken } = z.object({ purchaseToken: z.string() }).parse(req.body);
      await handleSubscriptionRenewal(purchaseToken);
      res.json({ success: true, event: "renewal" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/billing/test/simulate-expiration
  app.post("/api/billing/test/simulate-expiration", async (req, res) => {
    const testSecret = process.env.BILLING_TEST_SECRET;
    if (!TEST_MODE || !testSecret || req.headers["x-test-secret"] !== testSecret) {
      res.status(404).json({ error: "Not found" }); return;
    }
    try {
      const { purchaseToken } = z.object({ purchaseToken: z.string() }).parse(req.body);
      await handleSubscriptionExpiration(purchaseToken);
      res.json({ success: true, event: "expiration" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/billing/test/simulate-cancellation
  app.post("/api/billing/test/simulate-cancellation", async (req, res) => {
    const testSecret = process.env.BILLING_TEST_SECRET;
    if (!TEST_MODE || !testSecret || req.headers["x-test-secret"] !== testSecret) {
      res.status(404).json({ error: "Not found" }); return;
    }
    try {
      const { purchaseToken } = z.object({ purchaseToken: z.string() }).parse(req.body);
      await handleSubscriptionCancellation(purchaseToken);
      res.json({ success: true, event: "cancellation" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/billing/test/simulate-refund
  app.post("/api/billing/test/simulate-refund", async (req, res) => {
    const testSecret = process.env.BILLING_TEST_SECRET;
    if (!TEST_MODE || !testSecret || req.headers["x-test-secret"] !== testSecret) {
      res.status(404).json({ error: "Not found" }); return;
    }
    try {
      const { purchaseToken } = z.object({ purchaseToken: z.string() }).parse(req.body);
      await handleSubscriptionRefund(purchaseToken);
      res.json({ success: true, event: "refund" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Crews ──────────────────────────────────────────────────────────────────

  // Helper: check if caller is a member of the crew, return member role.
  async function requireCrewMember(
    crewId: string, playerId: string,
  ): Promise<{ role: string } | null> {
    const crew = await storage.getCrewById(crewId);
    if (!crew || crew.disbandedAt) return null;
    const m = crew.members.find(x => x.playerId === playerId);
    return m ? { role: m.role } : null;
  }

  // GET /api/crews/preview/:code  — unauthenticated, returns name+memberCount
  app.get("/api/crews/preview/:code", async (req, res) => {
    try {
      const code = ((req.params.code ?? "") as string).toUpperCase().slice(0, 6);
      const crew = await storage.getCrewByInviteCode(code);
      if (!crew) { res.status(404).json({ error: "Invalid invite code." }); return; }
      res.json({ id: crew.id, name: crew.name, memberCount: crew.memberCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/create
  app.post("/api/crews/create", requireAuth, async (req, res) => {
    try {
      const playerId = req.sessionPlayerId!;
      const { name, description } = z.object({
        name:        z.string().min(3).max(30),
        description: z.string().max(200).optional(),
      }).parse(req.body);

      const nameErr = validateCrewName(name);
      if (nameErr) { res.status(422).json({ error: nameErr }); return; }

      // Check player not already in a crew
      const existing = await storage.getPlayerCurrentCrew(playerId);
      if (existing) { res.status(409).json({ error: "You are already in a Crew. Leave first." }); return; }

      // Check Stripes
      const { stripes } = await storage.getPlayerStripes(playerId);
      if (stripes < 100) { res.status(402).json({ error: "Insufficient Stripes. Need 100◆ to create a Crew." }); return; }

      // Check name uniqueness (case-insensitive)
      // The DB unique index on LOWER(name) enforces this — we catch the error.
      const inviteCode = await generateUniqueInviteCode();

      // Transaction: debit Stripes + create crew
      const ok = await storage.debitStripes(playerId, 100, "crew:create");
      if (!ok) { res.status(402).json({ error: "Insufficient Stripes." }); return; }

      let crew;
      try {
        crew = await storage.createCrewTx({ playerId, name: name.trim(), description, inviteCode });
      } catch (txErr: any) {
        // Refund if crew creation failed
        await storage.creditStripes(playerId, 100, "crew:create:refund");
        if (txErr.message?.includes("unique") || txErr.code === "23505") {
          res.status(409).json({ error: "A Crew with that name already exists." }); return;
        }
        throw txErr;
      }

      await storage.logCrewEvent({ crewId: crew.id, playerId, eventType: "created" });
      await storage.logCrewEvent({ crewId: crew.id, playerId, eventType: "stripes_paid", eventData: { amount: 100 } });
      console.log(`[crews] ${playerId} created Crew "${crew.name}" (${crew.id})`);

      res.json({ crew_id: crew.id, invite_code: crew.inviteCode, name: crew.name, member_count: 1 });
    } catch (err: any) {
      if (err.name === "ZodError") { res.status(422).json({ error: "Invalid request." }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/join
  app.post("/api/crews/join", requireAuth, async (req, res) => {
    try {
      const playerId = req.sessionPlayerId!;
      const { invite_code } = z.object({ invite_code: z.string().length(6) }).parse(req.body);

      const existing = await storage.getPlayerCurrentCrew(playerId);
      if (existing) { res.status(409).json({ error: "You are already in a Crew. Leave first." }); return; }

      const crew = await storage.getCrewByInviteCode(invite_code.toUpperCase());
      if (!crew) { res.status(404).json({ error: "Invalid invite code." }); return; }
      if (crew.disbandedAt) { res.status(404).json({ error: "This Crew has been disbanded." }); return; }
      if (crew.memberCount >= 25) { res.status(409).json({ error: "This Crew is full (25/25)." }); return; }

      const { stripes } = await storage.getPlayerStripes(playerId);
      if (stripes < 50) { res.status(402).json({ error: "Insufficient Stripes. Need 50◆ to join a Crew." }); return; }

      const ok = await storage.debitStripes(playerId, 50, "crew:join");
      if (!ok) { res.status(402).json({ error: "Insufficient Stripes." }); return; }

      try {
        await storage.joinCrewTx({ playerId, crewId: crew.id });
      } catch (txErr: any) {
        await storage.creditStripes(playerId, 50, "crew:join:refund");
        throw txErr;
      }

      await storage.logCrewEvent({ crewId: crew.id, playerId, eventType: "joined" });
      await storage.logCrewEvent({ crewId: crew.id, playerId, eventType: "stripes_paid", eventData: { amount: 50 } });
      console.log(`[crews] ${playerId} joined Crew "${crew.name}" (${crew.id})`);

      res.json({ crew_id: crew.id, name: crew.name, member_count: crew.memberCount + 1, role: "member" });
    } catch (err: any) {
      if (err.name === "ZodError") { res.status(422).json({ error: "Invalid request." }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/crews/:crew_id
  app.get("/api/crews/:crew_id", requireAuth, async (req, res) => {
    try {
      const playerId = req.sessionPlayerId!;
      const crewId   = req.params.crew_id as string;
      const crew     = await storage.getCrewById(crewId, playerId);
      if (!crew) { res.status(404).json({ error: "Crew not found." }); return; }
      const isMember = crew.members.some(m => m.playerId === playerId);
      if (!isMember) { res.status(403).json({ error: "You are not a member of this Crew." }); return; }
      res.json({ crew });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/players/:id/crew
  app.get("/api/players/:id/crew", requireAuth, requireSelf, async (req, res) => {
    try {
      const playerId = req.params.id as string;
      const crew     = await storage.getPlayerCurrentCrew(playerId);
      res.json({ crew: crew ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:crew_id/leave
  app.post("/api/crews/:crew_id/leave", requireAuth, async (req, res) => {
    try {
      const playerId = req.sessionPlayerId!;
      const crewId   = req.params.crew_id as string;

      const mem = await requireCrewMember(crewId, playerId);
      if (!mem) { res.status(403).json({ error: "You are not a member of this Crew." }); return; }

      const { newCaptainId, disbanded } = await storage.leaveCrewTx({ playerId, crewId });

      if (disbanded) {
        await storage.logCrewEvent({ crewId, playerId, eventType: "disbanded" });
        console.log(`[crews] ${playerId} left + disbanded Crew ${crewId}`);
      } else {
        await storage.logCrewEvent({ crewId, playerId, eventType: "left" });
        if (newCaptainId) {
          await storage.logCrewEvent({ crewId, playerId, eventType: "captain_transferred", eventData: { new_captain_id: newCaptainId } });
        }
        console.log(`[crews] ${playerId} left Crew ${crewId}${newCaptainId ? `, new captain=${newCaptainId}` : ""}`);
      }

      res.json({ success: true, new_captain_id: newCaptainId ?? null, disbanded });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:crew_id/kick
  app.post("/api/crews/:crew_id/kick", requireAuth, async (req, res) => {
    try {
      const captainId  = req.sessionPlayerId!;
      const crewId     = req.params.crew_id as string;
      const { player_id: targetId } = z.object({ player_id: z.string() }).parse(req.body);

      const mem = await requireCrewMember(crewId, captainId);
      if (!mem) { res.status(403).json({ error: "You are not a member of this Crew." }); return; }
      if (!["captain","owner"].includes(mem.role)) { res.status(403).json({ error: "Only the Captain can kick members." }); return; }
      if (targetId === captainId) { res.status(422).json({ error: "Cannot kick yourself. Use leave instead." }); return; }

      const targetMem = await requireCrewMember(crewId, targetId);
      if (!targetMem) { res.status(404).json({ error: "Player is not in this Crew." }); return; }

      await storage.kickMemberTx({ crewId, targetPlayerId: targetId });
      await storage.logCrewEvent({ crewId, playerId: captainId, eventType: "kicked", eventData: { kicked_player_id: targetId } });
      console.log(`[crews] captain=${captainId} kicked ${targetId} from Crew ${crewId}`);

      res.json({ success: true });
    } catch (err: any) {
      if (err.name === "ZodError") { res.status(422).json({ error: "Invalid request." }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:crew_id/rename
  app.post("/api/crews/:crew_id/rename", requireAuth, async (req, res) => {
    try {
      const captainId = req.sessionPlayerId!;
      const crewId    = req.params.crew_id as string;
      const { name, description } = z.object({
        name:        z.string().min(3).max(30).optional(),
        description: z.string().max(200).nullable().optional(),
      }).parse(req.body);

      const mem = await requireCrewMember(crewId, captainId);
      if (!mem) { res.status(403).json({ error: "You are not a member of this Crew." }); return; }
      if (!["captain","owner"].includes(mem.role)) { res.status(403).json({ error: "Only the Captain can rename the Crew." }); return; }

      if (name) {
        const nameErr = validateCrewName(name);
        if (nameErr) { res.status(422).json({ error: nameErr }); return; }
      }

      try {
        await storage.renameCrewTx({ crewId, name: name?.trim(), description });
      } catch (txErr: any) {
        if (txErr.message?.includes("unique") || txErr.code === "23505") {
          res.status(409).json({ error: "A Crew with that name already exists." }); return;
        }
        throw txErr;
      }

      await storage.logCrewEvent({ crewId, playerId: captainId, eventType: "renamed", eventData: { name, description } });
      console.log(`[crews] captain=${captainId} renamed Crew ${crewId} → "${name}"`);

      res.json({ success: true, name, description });
    } catch (err: any) {
      if (err.name === "ZodError") { res.status(422).json({ error: "Invalid request." }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:crew_id/regenerate-invite
  app.post("/api/crews/:crew_id/regenerate-invite", requireAuth, async (req, res) => {
    try {
      const captainId = req.sessionPlayerId!;
      const crewId    = req.params.crew_id as string;

      const mem = await requireCrewMember(crewId, captainId);
      if (!mem) { res.status(403).json({ error: "You are not a member of this Crew." }); return; }
      if (!["captain","owner"].includes(mem.role)) { res.status(403).json({ error: "Only the Captain can regenerate the invite code." }); return; }

      const inviteCode = await generateUniqueInviteCode();
      await storage.regenerateCrewInviteTx({ crewId, inviteCode });
      await storage.logCrewEvent({ crewId, playerId: captainId, eventType: "invite_regenerated", eventData: { new_code: inviteCode } });
      console.log(`[crews] captain=${captainId} regenerated invite for Crew ${crewId}: ${inviteCode}`);

      res.json({ invite_code: inviteCode });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/crews/:crew_id/chat?before=ISO&limit=50
  app.get("/api/crews/:crew_id/chat", requireAuth, async (req, res) => {
    try {
      const playerId = req.sessionPlayerId!;
      const crewId   = req.params.crew_id as string;

      const mem = await requireCrewMember(crewId, playerId);
      if (!mem) { res.status(403).json({ error: "You are not a member of this Crew." }); return; }

      const beforeRaw = req.query.before as string | undefined;
      const limit     = Math.min(parseInt((req.query.limit as string) ?? "50", 10) || 50, 100);
      const before    = beforeRaw ? new Date(beforeRaw) : undefined;

      const messages = await storage.getChatMessages(crewId, before, limit);

      // Filter out messages from players the requester has blocked.
      const blockedList = await storage.getBlockedPlayers(playerId);
      const blockedSet  = new Set(blockedList.map(b => b.id));
      const filtered    = blockedSet.size === 0
        ? messages
        : messages.filter(m => !blockedSet.has(m.playerId));

      res.json({ messages: filtered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:crew_id/chat
  app.post("/api/crews/:crew_id/chat", requireAuth, async (req, res) => {
    try {
      const playerId = req.sessionPlayerId!;
      const crewId   = req.params.crew_id as string;

      const mem = await requireCrewMember(crewId, playerId);
      if (!mem) { res.status(403).json({ error: "You are not a member of this Crew." }); return; }

      const { message } = z.object({ message: z.string().min(1).max(500) }).parse(req.body);

      if (!checkChatRateLimit(playerId)) {
        res.status(429).json({ error: "Too many messages — slow down." }); return;
      }

      const { filtered: filteredMessage, hadProfanity } = filterChatMessage(message);
      if (hadProfanity) console.log(`[CHAT_FILTER] player=${playerId} crew=${crewId} hadProfanity=true`);

      const { id, createdAt } = await storage.sendChatMessage(crewId, playerId, filteredMessage);
      res.json({ id, created_at: createdAt });
    } catch (err: any) {
      if (err.name === "ZodError") { res.status(422).json({ error: "Invalid request." }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // ── Club system (PokerBros-style) ────────────────────────────────────────

  // GET /api/clubs/public — unauthenticated
  app.get("/api/clubs/public", async (_req, res) => {
    try {
      const clubs = await storage.getPublicClubs();
      res.json({ clubs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:id/fund-bank — owner/agent only
  app.post("/api/crews/:id/fund-bank", requireAuth, async (req, res) => {
    try {
      const ownerId = req.sessionPlayerId!;
      const crewId  = req.params.id as string;
      const { amount } = z.object({ amount: z.number().int().positive() }).parse(req.body);
      const result = await storage.fundClubBank(crewId, ownerId, amount);
      res.json(result);
    } catch (err: any) {
      if (err?.code === 'unauthorized')        { res.status(403).json({ error: err.message }); return; }
      if (err?.code === 'insufficient_chips')  { res.status(402).json({ error: err.message }); return; }
      if (err?.code === 'crew_not_found')      { res.status(404).json({ error: err.message }); return; }
      if (err?.name === 'ZodError')            { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:id/distribute — owner/agent only
  app.post("/api/crews/:id/distribute", requireAuth, async (req, res) => {
    try {
      const agentId = req.sessionPlayerId!;
      const crewId  = req.params.id as string;
      const { targetPlayerId, amount } = z.object({
        targetPlayerId: z.string().min(1),
        amount:         z.number().int().positive(),
      }).parse(req.body);
      const result = await storage.distributeChips(crewId, agentId, targetPlayerId, amount);
      res.json(result);
    } catch (err: any) {
      if (err?.code === 'unauthorized')       { res.status(403).json({ error: err.message }); return; }
      if (err?.code === 'not_member')         { res.status(404).json({ error: err.message }); return; }
      if (err?.code === 'insufficient_bank')  { res.status(402).json({ error: err.message }); return; }
      if (err?.name === 'ZodError')           { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:id/request-chips — member only
  app.post("/api/crews/:id/request-chips", requireAuth, async (req, res) => {
    try {
      const playerId = req.sessionPlayerId!;
      const crewId   = req.params.id as string;
      const { amount } = z.object({ amount: z.number().int().positive() }).parse(req.body);
      const result = await storage.requestChips(crewId, playerId, amount);
      res.json(result);
    } catch (err: any) {
      if (err?.code === 'not_member') { res.status(403).json({ error: err.message }); return; }
      if (err?.name === 'ZodError')   { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:id/requests/:requestId/resolve — owner/agent only
  app.post("/api/crews/:id/requests/:requestId/resolve", requireAuth, async (req, res) => {
    try {
      const agentId   = req.sessionPlayerId!;
      const requestId = parseInt(req.params.requestId as string, 10);
      const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
      if (isNaN(requestId)) { res.status(400).json({ error: 'Invalid requestId.' }); return; }
      const result = await storage.resolveChipRequest(requestId, agentId, approve);
      res.json(result);
    } catch (err: any) {
      if (err?.code === 'unauthorized')       { res.status(403).json({ error: err.message }); return; }
      if (err?.code === 'not_found')          { res.status(404).json({ error: err.message }); return; }
      if (err?.code === 'already_resolved')   { res.status(409).json({ error: err.message }); return; }
      if (err?.code === 'insufficient_bank')  { res.status(402).json({ error: err.message }); return; }
      if (err?.name === 'ZodError')           { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:id/appoint-agent — owner only
  app.post("/api/crews/:id/appoint-agent", requireAuth, async (req, res) => {
    try {
      const ownerId = req.sessionPlayerId!;
      const crewId  = req.params.id as string;
      const { targetPlayerId } = z.object({ targetPlayerId: z.string().min(1) }).parse(req.body);
      await storage.appointAgent(crewId, ownerId, targetPlayerId);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.code === 'unauthorized') { res.status(403).json({ error: err.message }); return; }
      if (err?.code === 'not_member')   { res.status(404).json({ error: err.message }); return; }
      if (err?.name === 'ZodError')     { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crews/:id/remove-agent — owner only
  app.post("/api/crews/:id/remove-agent", requireAuth, async (req, res) => {
    try {
      const ownerId = req.sessionPlayerId!;
      const crewId  = req.params.id as string;
      const { targetPlayerId } = z.object({ targetPlayerId: z.string().min(1) }).parse(req.body);
      await storage.removeAgent(crewId, ownerId, targetPlayerId);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.code === 'unauthorized') { res.status(403).json({ error: err.message }); return; }
      if (err?.code === 'not_agent')    { res.status(404).json({ error: err.message }); return; }
      if (err?.name === 'ZodError')     { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/crews/:id/chip-requests — owner/agent sees pending from all; member sees own
  app.get("/api/crews/:id/chip-requests", requireAuth, async (req, res) => {
    try {
      const playerId = req.sessionPlayerId!;
      const crewId   = req.params.id as string;
      const mem = await requireCrewMember(crewId, playerId);
      if (!mem) { res.status(403).json({ error: "Not a member of this club." }); return; }

      const isPrivileged = ['owner', 'captain', 'agent'].includes(mem.role);
      const requests = await storage.getClubChipRequests(crewId, {
        pendingOnly: isPrivileged,
        playerId:    isPrivileged ? undefined : playerId,
      });
      res.json({ requests });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Ticket-7: Buy-in Slider ───────────────────────────────────────────────

  // POST /api/tables/:table_id/join — validate buy-in range and debit chips.
  // Called by client BEFORE opening the WebSocket join. WS join then uses the
  // buyinChips value it already passed; DB balance is already deducted here.
  app.post("/api/tables/:table_id/join", requireAuth, async (req, res) => {
    try {
      const tableId  = (req.params.table_id as string).toUpperCase();
      const playerId = req.sessionPlayerId!;
      const { buyin_chips, mode_id } = z.object({
        buyin_chips: z.number().int().positive(),
        mode_id:     z.string().min(1),
      }).parse(req.body);

      // Lookup minBet from live engine (default 50 if table not yet created)
      const minBet = (mode_id === 'badugi'
        ? getBadugiTableMinBet(tableId)
        : getGenericTableMinBet(tableId, mode_id)) ?? 50;

      const minBuyin = minBet * 20;
      const maxBuyin = minBet * 200;

      if (buyin_chips < minBuyin || buyin_chips > maxBuyin) {
        res.status(400).json({
          error: `Buy-in must be between ${minBuyin.toLocaleString()} and ${maxBuyin.toLocaleString()} chips (20–200 BB)`,
          min_buyin: minBuyin,
          max_buyin: maxBuyin,
        });
        return;
      }

      const ok = await storage.debitChipsForBuyin(playerId, buyin_chips);
      if (!ok) {
        res.status(402).json({ error: 'Insufficient chips for requested buy-in', min_buyin: minBuyin, max_buyin: maxBuyin });
        return;
      }

      res.json({ success: true, buyin_chips, min_buyin: minBuyin, max_buyin: maxBuyin });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tables/:table_id/rebuy — validate rebuy range (does NOT debit; chips come from seatBankroll).
  app.post("/api/tables/:table_id/rebuy", requireAuth, async (req, res) => {
    try {
      const tableId  = (req.params.table_id as string).toUpperCase();
      const playerId = req.sessionPlayerId!;
      const { current_stack, rebuy_chips, mode_id } = z.object({
        current_stack: z.number().int().nonnegative(),
        rebuy_chips:   z.number().int().positive(),
        mode_id:       z.string().min(1),
      }).parse(req.body);

      const minBet = (mode_id === 'badugi'
        ? getBadugiTableMinBet(tableId)
        : getGenericTableMinBet(tableId, mode_id)) ?? 50;

      const maxBuyin = minBet * 200;
      const wouldBeStack = current_stack + rebuy_chips;

      if (wouldBeStack > maxBuyin) {
        res.status(400).json({
          error: `Rebuy would exceed the ${maxBuyin.toLocaleString()}-chip cap (200 BB). Max rebuy: ${(maxBuyin - current_stack).toLocaleString()} chips`,
          max_rebuy: Math.max(0, maxBuyin - current_stack),
        });
        return;
      }

      // Chips come from in-memory seatBankroll — no DB debit here. Just validate OK.
      res.json({ success: true, rebuy_chips, would_be_stack: wouldBeStack });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // ── Ticket-7: Time Bank ───────────────────────────────────────────────────

  // GET /api/players/:id/time-bank/status
  app.get("/api/players/:id/time-bank/status", requireAuth, requireSelf, async (req, res) => {
    try {
      const playerId = req.params.id as string;
      const status   = await storage.getTimeBankStatus(playerId);
      res.json({
        free_remaining: status.freeRemaining,
        purchased:      status.purchased,
        tier:           status.tier,
        // Convenience: can use time bank if any bucket has uses
        has_uses: status.freeRemaining > 0 || status.purchased > 0 || !!status.tier,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/players/:id/time-bank/use
  app.post("/api/players/:id/time-bank/use", requireAuth, requireSelf, async (req, res) => {
    try {
      const playerId = req.params.id as string;
      const { table_id, mode_id } = z.object({
        table_id: z.string().min(1),
        mode_id:  z.string().min(1),
      }).parse(req.body);

      const tId = table_id.toUpperCase();

      // Determine which bucket to consume (priority: diamond_elite > gold_pro > purchased > free)
      const status = await storage.getTimeBankStatus(playerId);
      const tier   = status.tier;

      let source: 'free' | 'subscription' | 'purchased';
      if (tier === 'diamond_elite') {
        // Unlimited subscription uses — only rate-limit (1/turn) applies
        source = 'subscription';
      } else if (tier === 'gold_pro') {
        // 1 use per session for gold_pro
        const sessionUsed = mode_id === 'badugi'
          ? getBadugiTimeBankSessionUsed(tId, playerId)
          : getGenericTimeBankSessionUsed(tId, mode_id, playerId);
        if (sessionUsed < 1) {
          source = 'subscription';
        } else if (status.purchased > 0) {
          source = 'purchased';
        } else if (status.freeRemaining > 0) {
          source = 'free';
        } else {
          res.status(402).json({ error: 'no_uses_available', message: 'No time bank uses remaining.' });
          return;
        }
      } else if (status.purchased > 0) {
        source = 'purchased';
      } else if (status.freeRemaining > 0) {
        source = 'free';
      } else {
        res.status(402).json({ error: 'no_uses_available', message: 'No time bank uses remaining. Purchase more in the shop.' });
        return;
      }

      // Extend the turn timer (20 s = 20_000 ms)
      const result = mode_id === 'badugi'
        ? extendBadugiTurnTimer(tId, playerId, 20_000)
        : extendGenericTurnTimer(tId, mode_id, playerId, 20_000);

      if (!result.success) {
        // 403 for seat/turn-ownership guards; 409 for genuine timer conflicts
        const reason = result.reason ?? 'timer_extend_failed';
        const is403 = reason === 'player_not_at_table' || reason === 'not_your_turn' || reason === 'table_not_found';
        res.status(is403 ? 403 : 409).json({ error: reason, message: 'Could not extend timer.' });
        return;
      }

      // Deduct from the selected bucket + log event
      await storage.consumeTimeBankSlot(playerId, source, tId);

      // Increment in-memory session counter for subscription uses
      if (source === 'subscription') {
        if (mode_id === 'badugi') incrementBadugiTimeBankSessionUsed(tId, playerId);
        else incrementGenericTimeBankSessionUsed(tId, mode_id, playerId);
      }

      res.json({
        success:           true,
        timer_added_seconds: 20,
        new_timer_expires_at: result.newDeadline,
        source,
      });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/players/:id/time-bank/purchase — buy uses with Stripes (25 Stripes each)
  app.post("/api/players/:id/time-bank/purchase", requireAuth, requireSelf, async (req, res) => {
    try {
      const playerId = req.params.id as string;
      const { quantity } = z.object({
        quantity: z.number().int().min(1).max(50),
      }).parse(req.body);

      const result = await storage.purchaseTimeBankUses(playerId, quantity);
      if (!result.success) {
        res.status(402).json({ error: 'insufficient_stripes', message: `Need ${quantity * 25} Stripes for ${quantity} use(s).` });
        return;
      }

      res.json({
        success:           true,
        quantity_purchased: quantity,
        stripes_spent:     quantity * 25,
        new_stripes:       result.newStripes,
        new_purchased_uses: result.newPurchasedUses,
      });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(422).json({ error: 'Invalid request.' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN ROUTES — all under /api/admin/, all behind requireAdmin middleware
  // ─────────────────────────────────────────────────────────────────────────────

  const adminReasonSchema = z.object({ reason: z.string().min(10, "Reason must be at least 10 characters") });
  const adminAmountSchema  = adminReasonSchema.extend({ amount: z.number().int().min(1) });

  // GET /api/admin/members?limit=50&offset=0  — paginated member list, newest first
  app.get("/api/admin/members", requireAdmin, async (req, res) => {
    try {
      const limit  = Math.min(parseInt((req.query.limit  as string) ?? "50", 10) || 50, 200);
      const offset = parseInt((req.query.offset as string) ?? "0",  10) || 0;
      const members = await storage.listMembers(limit, offset);
      res.json({ members, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/players/search?q=  — search players by name / email / UUID
  app.get("/api/admin/players/search", requireAdmin, async (req, res) => {
    try {
      const q = (req.query.q as string ?? "").trim();
      if (!q) { res.status(400).json({ error: "q is required" }); return; }
      const results = await storage.searchPlayers(q);
      res.json({ players: results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/players/:id  — full player details
  app.get("/api/admin/players/:id", requireAdmin, async (req, res) => {
    try {
      const details = await storage.getPlayerFullDetails(req.params.id as string);
      if (!details) { res.status(404).json({ error: "Player not found" }); return; }
      res.json(details);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/players/:id/chip-history
  app.get("/api/admin/players/:id/chip-history", requireAdmin, async (req, res) => {
    try {
      const limit  = Math.min(parseInt(req.query.limit  as string ?? "50", 10) || 50, 200);
      const offset = parseInt(req.query.offset as string ?? "0",  10) || 0;
      const rows = await storage.getPlayerChipHistory(req.params.id as string, limit, offset);
      res.json({ rows, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/players/:id/stripes-history
  app.get("/api/admin/players/:id/stripes-history", requireAdmin, async (req, res) => {
    try {
      const limit  = Math.min(parseInt(req.query.limit  as string ?? "50", 10) || 50, 200);
      const offset = parseInt(req.query.offset as string ?? "0",  10) || 0;
      const rows = await storage.getPlayerStripesHistory(req.params.id as string, limit, offset);
      res.json({ rows, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/players/:id/admin-actions
  app.get("/api/admin/players/:id/admin-actions", requireAdmin, async (req, res) => {
    try {
      const limit  = Math.min(parseInt(req.query.limit  as string ?? "50", 10) || 50, 200);
      const offset = parseInt(req.query.offset as string ?? "0",  10) || 0;
      const rows = await storage.getPlayerAdminActionHistory(req.params.id as string, limit, offset);
      res.json({ rows, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/grant-chips
  app.post("/api/admin/players/:id/grant-chips", requireAdmin, async (req, res) => {
    try {
      const { amount, reason } = adminAmountSchema.parse(req.body);
      await storage.adminGrantChips(req.sessionPlayerId!, req.params.id as string, amount, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/debit-chips
  app.post("/api/admin/players/:id/debit-chips", requireAdmin, async (req, res) => {
    try {
      const { amount, reason } = adminAmountSchema.parse(req.body);
      await storage.adminDebitChips(req.sessionPlayerId!, req.params.id as string, amount, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/grant-stripes
  app.post("/api/admin/players/:id/grant-stripes", requireAdmin, async (req, res) => {
    try {
      const { amount, reason } = adminAmountSchema.parse(req.body);
      await storage.adminGrantStripes(req.sessionPlayerId!, req.params.id as string, amount, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/debit-stripes
  app.post("/api/admin/players/:id/debit-stripes", requireAdmin, async (req, res) => {
    try {
      const { amount, reason } = adminAmountSchema.parse(req.body);
      await storage.adminDebitStripes(req.sessionPlayerId!, req.params.id as string, amount, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/grant-cosmetic
  app.post("/api/admin/players/:id/grant-cosmetic", requireAdmin, async (req, res) => {
    try {
      const { cosmeticId, reason } = adminReasonSchema
        .extend({ cosmeticId: z.string().min(1) })
        .parse(req.body);
      await storage.adminGrantCosmetic(req.sessionPlayerId!, req.params.id as string, cosmeticId, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/revoke-cosmetic
  app.post("/api/admin/players/:id/revoke-cosmetic", requireAdmin, async (req, res) => {
    try {
      const { cosmeticId, reason } = adminReasonSchema
        .extend({ cosmeticId: z.string().min(1) })
        .parse(req.body);
      await storage.adminRevokeCosmetic(req.sessionPlayerId!, req.params.id as string, cosmeticId, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/grant-subscription
  app.post("/api/admin/players/:id/grant-subscription", requireAdmin, async (req, res) => {
    try {
      const { tier, durationDays, reason } = adminReasonSchema
        .extend({
          tier:         z.enum(["gold_pro", "diamond_elite"]),
          durationDays: z.number().int().min(1).max(3650),
        })
        .parse(req.body);
      await storage.adminGrantSubscription(req.sessionPlayerId!, req.params.id as string, tier, durationDays, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/revoke-subscription
  app.post("/api/admin/players/:id/revoke-subscription", requireAdmin, async (req, res) => {
    try {
      const { reason } = adminReasonSchema.parse(req.body);
      await storage.adminRevokeSubscription(req.sessionPlayerId!, req.params.id as string, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/ban
  app.post("/api/admin/players/:id/ban", requireAdmin, async (req, res) => {
    try {
      const { durationDays, reason } = adminReasonSchema
        .extend({ durationDays: z.number().int().min(1).nullable() })
        .parse(req.body);
      await storage.adminBanPlayer(req.sessionPlayerId!, req.params.id as string, durationDays, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/unban
  app.post("/api/admin/players/:id/unban", requireAdmin, async (req, res) => {
    try {
      const { reason } = adminReasonSchema.parse(req.body);
      await storage.adminUnbanPlayer(req.sessionPlayerId!, req.params.id as string, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/players/:id/reset-password
  app.post("/api/admin/players/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      const { reason } = adminReasonSchema.parse(req.body);
      const { resetToken } = await storage.adminTriggerPasswordReset(req.sessionPlayerId!, req.params.id as string, reason);
      // Token logged server-side (see storage). Phase 3 will email it.
      res.json({ ok: true, resetToken });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/players/:id  — soft delete
  app.delete("/api/admin/players/:id", requireAdmin, async (req, res) => {
    try {
      const { reason } = adminReasonSchema.parse(req.body);
      await storage.adminDeleteAccount(req.sessionPlayerId!, req.params.id as string, reason);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // ── Lady Luck endpoints ──────────────────────────────────────────────────────

  // POST /api/ladyluck/tables — find-or-create a Lady Luck table for this tier
  app.post("/api/ladyluck/tables", requireAuth, ladyLuckTableCreateLimit, async (req, res) => {
    const t0 = Date.now();
    console.log(`[LL-TIMING-SERVER] POST /api/ladyluck/tables — request received, requireAuth passed at ${t0}`);
    try {
      const { roomType } = z.object({
        roomType: z.enum(['pony', 'thoroughbred', 'champion']),
      }).parse(req.body);
      const hostId  = req.sessionPlayerId!;
      const t1 = Date.now();
      console.log(`[LL-TIMING-SERVER] POST /api/ladyluck/tables — Zod parse took ${t1 - t0}ms`);
      // Bug fix: reuse an existing open LOBBY table for this tier instead of always
      // creating a fresh one — this is how multiplayer matchmaking works correctly.
      const tableId = findOrCreateLLTable(roomType, hostId);
      console.log(`[LL-TIMING-SERVER] POST /api/ladyluck/tables — findOrCreateLLTable took ${Date.now() - t1}ms, tableId=${tableId}, total=${Date.now() - t0}ms`);
      res.json({ tableId });
    } catch (err: any) {
      if (err.name === 'ZodError') { res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/ladyluck/tables — list active Lady Luck tables
  app.get("/api/ladyluck/tables", async (_req, res) => {
    try {
      res.json(getLLActiveTables());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/ladyluck/history?playerId=X&limit=20
  app.get("/api/ladyluck/history", async (req, res) => {
    try {
      const playerId = (req.query.playerId as string | undefined)?.trim();
      const limit    = Math.min(parseInt((req.query.limit as string) ?? "20", 10) || 20, 50);
      const [personal, stats] = await Promise.all([
        playerId ? storage.getLadyLuckPersonalHistory(playerId, limit) : Promise.resolve([]),
        storage.getLadyLuckStats(),
      ]);
      res.json({ personal, stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/audit-log?limit=&offset=&actionType=&adminId=
  app.get("/api/admin/audit-log", requireAdmin, async (req, res) => {
    try {
      const limit      = Math.min(parseInt(req.query.limit  as string ?? "100", 10) || 100, 500);
      const offset     = parseInt(req.query.offset     as string ?? "0",  10) || 0;
      const actionType = (req.query.actionType as string | undefined)?.trim() || undefined;
      const adminId    = (req.query.adminId    as string | undefined)?.trim() || undefined;
      const rows = await storage.getAdminAuditLog({ limit, offset, actionType, adminId });
      res.json({ rows, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
