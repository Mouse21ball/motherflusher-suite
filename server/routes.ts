import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, hashPassword, verifyPassword } from "./storage";
import { z } from "zod";
import { getActiveBadugiTables } from "./gameEngine";
import { getActiveGenericTables } from "./genericEngine";
import { db } from "./db";
import { sql as drizzleSql } from "drizzle-orm";
import { requireAuth, requireSelf } from "./middleware/auth";
import { generateUniqueInviteCode, containsProfanity, checkChatRateLimit, validateCrewName } from "./crews";
import {
  STRIPES_PACKS,
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
} from "./billing";

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

  app.get("/api/analytics/stats", async (_req, res) => {
    try {
      const stats = await storage.getDailyStats(30);
      res.json(stats);
    } catch (err) {
      console.error("Analytics stats error:", err);
      res.status(500).json({ error: "Failed to load stats" });
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
        botsEnabled: parsed.botsEnabled,
        isInviteOnly: parsed.isInviteOnly,
        hostId:      parsed.hostId ?? parsed.createdBy,
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
  app.get("/api/tables", (_req, res) => {
    pruneExpiredTables();
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
        };
      });
    const all = [
      ...badugi,
      ...generic.sort((a, b) => b.humanCount - a.humanCount),
    ];
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
    res.json({ tableId: table.tableId, modeId: table.modeId, createdAt: table.createdAt });
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

  // GET /api/players/:id — fetch existing player profile
  app.get("/api/players/:id", async (req, res) => {
    try {
      const profile = await storage.getPlayerProfile(req.params.id);
      if (!profile) {
        res.status(404).json({ error: "Player not found" });
        return;
      }
      res.json(profile);
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
  app.post("/api/auth/register", async (req, res) => {
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
  app.post("/api/auth/login", async (req, res) => {
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

  // GET /api/auth/me/:profileId
  // Returns current profile data for a given identity (used on app load to refresh state).
  app.get("/api/auth/me/:profileId", async (req, res) => {
    try {
      const profile = await storage.getPlayerProfile(req.params.profileId);
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      const level = Math.floor(profile.handsPlayed / 50);
      const isGuest = !profile.email && !profile.passwordHash;
      // Compute when this guest account will next be reset (null for auth accounts)
      const resetRef = profile.lastResetAt ?? profile.createdAt;
      const nextResetAt = isGuest
        ? new Date(resetRef.getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null;
      // Issue session token (7 days guests, 30 days registered)
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
        avatarId:            profile.avatarId ?? null,
        equippedAvatarId:    profile.equippedAvatarId    ?? null,
        equippedFrameId:     profile.equippedFrameId     ?? null,
        equippedNameColorId: profile.equippedNameColorId ?? null,
        lastNameChangeAt:    profile.lastNameChangeAt?.toISOString() ?? null,
        nextResetAt,
        sessionToken,
        activeSubscriptionTier:  profile.activeSubscriptionTier  ?? null,
        subscriptionExpiresAt:   profile.subscriptionExpiresAt?.toISOString() ?? null,
      });
    } catch (err) {
      console.error("Auth me error:", err);
      res.status(500).json({ error: "Failed to fetch profile" });
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
      await storage.addChipsToPlayer(id, chips);
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
  app.post("/api/players/:id/daily-bonus/claim", requireAuth, requireSelf, async (req, res) => {
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
        await storage.addChipsToPlayer(id, subBonusChips);
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

  // POST /api/billing/verify-purchase
  // Called by the native client after Google Play returns a purchase token.
  // Performs server-side verification via Play Developer API, credits Stripes,
  // and records the transaction for audit + refund handling.
  app.post("/api/billing/verify-purchase", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        productId:     z.string().min(1),
        purchaseToken: z.string().min(1),
      });
      const { productId, purchaseToken } = schema.parse(req.body);

      const pack = STRIPES_PACKS[productId];
      if (!pack) {
        res.status(400).json({ error: `Unknown product: ${productId}` });
        return;
      }

      const playerId = req.sessionPlayerId!;

      // Idempotency guard — reject duplicate tokens
      const existing = await storage.getPurchaseTransactionByToken(purchaseToken);
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
        res.status(409).json({ error: "Purchase token already used or rejected." });
        return;
      }

      // Create pending transaction record first (for audit trail)
      const txn = await storage.createPurchaseTransaction({
        playerId,
        productId,
        stripesGranted:     pack.stripes,
        priceUsdCents:      pack.priceCents,
        purchaseToken,
        verificationStatus: "pending",
      });

      // Server-side Google Play verification
      let purchaseData;
      try {
        purchaseData = await verifyGooglePlayPurchase(productId, purchaseToken);
      } catch (verifyErr: any) {
        console.error(`[billing] Verification failed: ${verifyErr.message}`);
        await storage.updatePurchaseTransactionStatus(txn.id, "rejected");
        res.status(402).json({ error: `Purchase verification failed: ${verifyErr.message}` });
        return;
      }

      if (purchaseData.purchaseState !== 0) {
        const state = purchaseData.purchaseState === 1 ? "canceled" : "pending";
        await storage.updatePurchaseTransactionStatus(txn.id, "rejected");
        res.status(402).json({ error: `Purchase is ${state} — not completed.` });
        return;
      }

      // Credit Stripes (atomic via stripe_transactions audit table)
      await storage.creditStripes(playerId, pack.stripes, `purchase:${productId}`);

      // Mark verified with Google's orderId
      await storage.updatePurchaseTransactionStatus(
        txn.id,
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

  // POST /api/billing/refund-webhook
  // Receives Google Play Real-Time Developer Notifications (RTDN) via Pub/Sub.
  // Configure in Play Console → Monetize → Subscriptions & in-app products → Notifications.
  // The Pub/Sub push subscription must point to this URL.
  app.post("/api/billing/refund-webhook", async (req, res) => {
    try {
      const message = req.body?.message;
      if (!message?.data) {
        res.status(400).json({ error: "Missing Pub/Sub message data" });
        return;
      }

      const raw = Buffer.from(message.data, "base64").toString("utf-8");
      const notification = JSON.parse(raw);
      console.log("[billing] RTDN webhook received:", JSON.stringify(notification));

      // Handle voided purchase (refund / chargeback)
      const voidedPurchase = notification?.voidedPurchaseNotification;
      if (voidedPurchase?.purchaseToken) {
        const txn = await storage.getPurchaseTransactionByToken(voidedPurchase.purchaseToken);
        if (txn && txn.verificationStatus === "verified") {
          await storage.debitStripesForRefund(txn.playerId, txn.stripesGranted, txn.id);
          console.log(
            `[billing] Refund processed: player=${txn.playerId} ` +
            `product=${txn.productId} stripes=${txn.stripesGranted}`,
          );
        }
      }

      // Always ACK the Pub/Sub message to prevent re-delivery
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[billing] refund-webhook error:", err);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ── Subscription endpoints ──────────────────────────────────────────────────

  // POST /api/billing/verify-subscription
  // Called by native client after Google Play subscription flow completes.
  // Verifies token, activates subscription, credits initial Stripes, equips frame.
  app.post("/api/billing/verify-subscription", requireAuth, async (req, res) => {
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
      const result = await processSubscriptionPurchase(playerId, productId, purchaseToken);

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

  // POST /api/billing/subscription-webhook
  // Google Real-Time Developer Notifications (RTDN) via Cloud Pub/Sub.
  // Push subscription must point to this URL.
  // Handles all subscription lifecycle events.
  app.post("/api/billing/subscription-webhook", async (req, res) => {
    try {
      const message = req.body?.message;
      if (!message?.data) {
        res.status(400).json({ error: "Missing Pub/Sub message data" });
        return;
      }

      const raw = Buffer.from(message.data, "base64").toString("utf-8");
      const notification = JSON.parse(raw);
      console.log("[billing:sub] RTDN received:", JSON.stringify(notification));

      const subNotif = notification?.subscriptionNotification;
      if (subNotif?.purchaseToken) {
        const { purchaseToken, notificationType } = subNotif;
        // notificationType values from Google:
        // 1=RECOVERED 2=RENEWED 3=CANCELED 4=PURCHASED 5=ON_HOLD
        // 6=IN_GRACE_PERIOD 7=RESTARTED 12=EXPIRED 13=REVOKED (refund)
        switch (notificationType) {
          case 1:  await handleSubscriptionRecovered(purchaseToken);  break;
          case 2:  await handleSubscriptionRenewal(purchaseToken);    break;
          case 3:  await handleSubscriptionCancellation(purchaseToken); break;
          case 4:
            console.log("[billing:sub] PURCHASED notification — handled by verify-subscription endpoint");
            break;
          case 5:  await handleSubscriptionOnHold(purchaseToken);     break;
          case 6:  await handleSubscriptionGracePeriod(purchaseToken); break;
          case 7:  await handleSubscriptionRecovered(purchaseToken);  break;
          case 12: await handleSubscriptionExpiration(purchaseToken); break;
          case 13: await handleSubscriptionRefund(purchaseToken);     break;
          default:
            console.log(`[billing:sub] Unknown notificationType: ${notificationType}`);
        }
      }

      // Also handle voided purchases (consumable refunds) in the same webhook
      const voidedPurchase = notification?.voidedPurchaseNotification;
      if (voidedPurchase?.purchaseToken) {
        const txn = await storage.getPurchaseTransactionByToken(voidedPurchase.purchaseToken);
        if (txn && txn.verificationStatus === "verified") {
          await storage.debitStripesForRefund(txn.playerId, txn.stripesGranted, txn.id);
          console.log(`[billing] consumable refund: player=${txn.playerId} stripes=-${txn.stripesGranted}`);
        }
      }

      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[billing:sub] subscription-webhook error:", err);
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
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "com.dgmentertainment.chaingangpoker";
    const deepLink = `https://play.google.com/store/account/subscriptions?sku=&package=${packageName}`;
    res.json({ deepLink, message: "Open Play Store to manage or cancel your subscription." });
  });

  // ── Test-mode simulation endpoints (BILLING_TEST_MODE=true only) ────────────

  const TEST_MODE = process.env.BILLING_TEST_MODE === "true";

  // POST /api/billing/test/simulate-renewal
  app.post("/api/billing/test/simulate-renewal", async (req, res) => {
    if (!TEST_MODE) { res.status(404).json({ error: "Not found" }); return; }
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
    if (!TEST_MODE) { res.status(404).json({ error: "Not found" }); return; }
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
    if (!TEST_MODE) { res.status(404).json({ error: "Not found" }); return; }
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
    if (!TEST_MODE) { res.status(404).json({ error: "Not found" }); return; }
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
      if (stripes < 500) { res.status(402).json({ error: "Insufficient Stripes. Need 500◆ to create a Crew." }); return; }

      // Check name uniqueness (case-insensitive)
      // The DB unique index on LOWER(name) enforces this — we catch the error.
      const inviteCode = await generateUniqueInviteCode();

      // Transaction: debit Stripes + create crew
      const ok = await storage.debitStripes(playerId, 500, "crew:create");
      if (!ok) { res.status(402).json({ error: "Insufficient Stripes." }); return; }

      let crew;
      try {
        crew = await storage.createCrewTx({ playerId, name: name.trim(), description, inviteCode });
      } catch (txErr: any) {
        // Refund if crew creation failed
        await storage.creditStripes(playerId, 500, "crew:create:refund");
        if (txErr.message?.includes("unique") || txErr.code === "23505") {
          res.status(409).json({ error: "A Crew with that name already exists." }); return;
        }
        throw txErr;
      }

      await storage.logCrewEvent({ crewId: crew.id, playerId, eventType: "created" });
      await storage.logCrewEvent({ crewId: crew.id, playerId, eventType: "stripes_paid", eventData: { amount: 500 } });
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
      if (mem.role !== "captain") { res.status(403).json({ error: "Only the Captain can kick members." }); return; }
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
      if (mem.role !== "captain") { res.status(403).json({ error: "Only the Captain can rename the Crew." }); return; }

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
      if (mem.role !== "captain") { res.status(403).json({ error: "Only the Captain can regenerate the invite code." }); return; }

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
      res.json({ messages });
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

      if (containsProfanity(message)) {
        res.status(422).json({ error: "Message blocked — please keep it clean." }); return;
      }

      if (!checkChatRateLimit(playerId)) {
        res.status(429).json({ error: "Too many messages — slow down." }); return;
      }

      const { id, createdAt } = await storage.sendChatMessage(crewId, playerId, message);
      res.json({ id, created_at: createdAt });
    } catch (err: any) {
      if (err.name === "ZodError") { res.status(422).json({ error: "Invalid request." }); return; }
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
