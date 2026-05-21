import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, hashPassword, verifyPassword } from "./storage";
import { z } from "zod";
import { getActiveBadugiTables } from "./gameEngine";
import { getActiveGenericTables } from "./genericEngine";
import { db } from "./db";
import { sql as drizzleSql } from "drizzle-orm";

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
  app.get("/api/players/:id/reconnect", async (req, res) => {
    try {
      const profile = await storage.getPlayerProfile(req.params.id);
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
  app.delete("/api/players/:id", async (req, res) => {
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
      res.status(201).json({
        profileId:    profile.id,
        displayName:  profile.displayName,
        chipBalance:  profile.chipBalance,
        handsPlayed:  profile.handsPlayed,
        lifetimeProfit: profile.lifetimeProfit,
        level,
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
      res.json({
        profileId:      profile.id,
        displayName:    profile.displayName,
        chipBalance:    profile.chipBalance,
        handsPlayed:    profile.handsPlayed,
        lifetimeProfit: profile.lifetimeProfit,
        level,
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
      res.json({
        profileId:        profile.id,
        displayName:      profile.displayName,
        chipBalance:      profile.chipBalance,
        handsPlayed:      profile.handsPlayed,
        lifetimeProfit:   profile.lifetimeProfit,
        email:            profile.email ?? null,
        hasAuth:          !!profile.passwordHash,
        level,
        avatarId:         profile.avatarId ?? null,
        lastNameChangeAt: profile.lastNameChangeAt?.toISOString() ?? null,
        nextResetAt,
      });
    } catch (err) {
      console.error("Auth me error:", err);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // PUT /api/players/:id/avatar
  // Saves the player's selected avatar preset. avatarId=null clears to initials default.
  app.put("/api/players/:id/avatar", async (req, res) => {
    try {
      const avatarSchema = z.object({ avatarId: z.string().nullable() });
      const { avatarId } = avatarSchema.parse(req.body);
      const profile = await storage.getPlayerProfile(req.params.id);
      if (!profile) {
        res.status(404).json({ error: "Player not found" });
        return;
      }
      await storage.updatePlayerAvatar(req.params.id, avatarId);
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

  app.put("/api/players/:id/name", async (req, res) => {
    try {
      const nameSchema = z.object({
        name: z.string().min(1).max(32).trim(),
      });
      const { name } = nameSchema.parse(req.body);
      const profile = await storage.getPlayerProfile(req.params.id);
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
      await storage.updatePlayerDisplayName(req.params.id, name);
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

  // POST /api/players/:id/bonus-chips
  // Credits virtual chips from in-app bonuses (daily reward, hourly bonus, starter pack)
  // directly to the DB bankroll. Fire-and-forget safe — client already updates local state.
  // Max 100,000 chips per call guards against accidental over-grant.
  app.post("/api/players/:id/bonus-chips", async (req, res) => {
    try {
      const { id } = req.params;
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

  // ── Real-player priority join ──────────────────────────────────────────────
  // GET /api/tables/mode/:modeId/join
  // Returns the best existing public table for a mode (most humans, at least 1 open seat),
  // or { tableId: null } if no suitable table exists and the client must create a new one.
  // Client should use the returned tableId as the WS join target when non-null.
  app.get("/api/tables/mode/:modeId/join", (req, res) => {
    const { modeId } = req.params;
    const MAX_SEATS = 5;

    if (modeId === "badugi") {
      const tables = getActiveBadugiTables()
        .filter(t => t.humanCount > 0 && t.humanCount < MAX_SEATS)
        .sort((a, b) => b.humanCount - a.humanCount);
      if (tables.length > 0) {
        res.json({ tableId: tables[0].tableId, humanCount: tables[0].humanCount });
      } else {
        res.json({ tableId: null });
      }
      return;
    }

    const tables = getActiveGenericTables()
      .filter(t => t.modeId === modeId && t.humanCount > 0 && t.humanCount < MAX_SEATS)
      .sort((a, b) => b.humanCount - a.humanCount);

    if (tables.length > 0) {
      res.json({ tableId: tables[0].tableId, humanCount: tables[0].humanCount });
    } else {
      res.json({ tableId: null });
    }
  });

  return httpServer;
}
