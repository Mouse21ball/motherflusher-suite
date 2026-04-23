import {
  type User, type InsertUser,
  type InsertAnalyticsEvent, type AnalyticsEvent,
  type PlayerProfile,
  analyticsEvents, playerProfiles,
} from "@shared/schema";
import { randomUUID, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { eq, sql, and, gte, desc } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  if (hashBuf.length !== derived.length) return false;
  return timingSafeEqual(hashBuf, derived);
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  insertAnalyticsEvent(event: InsertAnalyticsEvent): Promise<void>;
  getDailyStats(days: number): Promise<DailyStats[]>;
  // ── Player Profiles ────────────────────────────────────────────────────────
  getOrCreatePlayer(id: string, displayName?: string): Promise<PlayerProfile>;
  getPlayerProfile(id: string): Promise<PlayerProfile | undefined>;
  getPlayerByEmail(email: string): Promise<PlayerProfile | undefined>;
  setPlayerAuth(id: string, email: string, passwordHash: string): Promise<void>;
  syncPlayerChips(id: string, chips: number, handResult?: { won: boolean; deltaChips?: number }): Promise<void>;
  setPlayerActiveTable(id: string, tableId: string, seatId: string, modeId: string): Promise<void>;
  clearPlayerActiveTable(id: string): Promise<void>;
}

export interface DailyStats {
  date: string;
  uniquePlayers: number;
  sessionCount: number;
  avgSessionMs: number;
  modeBreakdown: Record<string, number>;
  returningPlayers: number;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async insertAnalyticsEvent(event: InsertAnalyticsEvent): Promise<void> {
    await db.insert(analyticsEvents).values(event);
  }

  async getDailyStats(days: number): Promise<DailyStats[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const rows = await db
      .select()
      .from(analyticsEvents)
      .where(gte(analyticsEvents.eventDate, cutoffStr))
      .orderBy(desc(analyticsEvents.eventDate));

    const byDate = new Map<string, AnalyticsEvent[]>();
    for (const row of rows) {
      const arr = byDate.get(row.eventDate) || [];
      arr.push(row);
      byDate.set(row.eventDate, arr);
    }

    const allDates = Array.from(byDate.keys()).sort().reverse();

    const playerFirstSeen = new Map<string, string>();
    for (const row of rows) {
      const existing = playerFirstSeen.get(row.playerId);
      if (!existing || row.eventDate < existing) {
        playerFirstSeen.set(row.playerId, row.eventDate);
      }
    }

    return allDates.map((date) => {
      const events = byDate.get(date) || [];
      const uniquePlayers = new Set(events.map((e) => e.playerId)).size;

      const sessions = events.filter((e) => e.eventType === "session_end");
      const sessionCount = events.filter((e) => e.eventType === "session_start").length;
      const avgSessionMs =
        sessions.length > 0
          ? Math.round(
              sessions.reduce((sum, e) => sum + (e.durationMs || 0), 0) /
                sessions.length,
            )
          : 0;

      const modePlays = events.filter((e) => e.eventType === "mode_play");
      const modeBreakdown: Record<string, number> = {};
      for (const mp of modePlays) {
        if (mp.mode) {
          modeBreakdown[mp.mode] = (modeBreakdown[mp.mode] || 0) + 1;
        }
      }

      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split("T")[0];
      const prevEvents = byDate.get(prevDateStr) || [];
      const prevPlayerIds = new Set(prevEvents.map((e) => e.playerId));
      const todayPlayerIds = new Set(events.map((e) => e.playerId));
      let returningPlayers = 0;
      for (const pid of todayPlayerIds) {
        if (prevPlayerIds.has(pid)) returningPlayers++;
      }

      return {
        date,
        uniquePlayers,
        sessionCount,
        avgSessionMs,
        modeBreakdown,
        returningPlayers,
      };
    });
  }

  // ── Player Profile methods ─────────────────────────────────────────────────
  // These hit the PostgreSQL DB directly, regardless of the storage class name.
  // "Mem" only refers to the legacy in-memory user store (users table).

  async getOrCreatePlayer(id: string, displayName?: string): Promise<PlayerProfile> {
    const existing = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.id, id))
      .limit(1);

    if (existing.length > 0) {
      // Update display name if a new one was supplied
      if (displayName && displayName !== existing[0].displayName) {
        await db
          .update(playerProfiles)
          .set({ displayName, updatedAt: new Date() })
          .where(eq(playerProfiles.id, id));
        return { ...existing[0], displayName };
      }
      return existing[0];
    }

    const now = new Date();
    const profile: PlayerProfile = {
      id,
      displayName: displayName ?? "Guest",
      chipBalance: 1000,
      activeTableId: null,
      activeSeatId: null,
      activeModeId: null,
      handsPlayed: 0,
      handsWon: 0,
      lifetimeProfit: 0,
      email: null,
      passwordHash: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(playerProfiles).values(profile);
    return profile;
  }

  async getPlayerProfile(id: string): Promise<PlayerProfile | undefined> {
    const rows = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.id, id))
      .limit(1);
    return rows[0];
  }

  async getPlayerByEmail(email: string): Promise<PlayerProfile | undefined> {
    const rows = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.email, email))
      .limit(1);
    return rows[0];
  }

  async setPlayerAuth(id: string, email: string, passwordHash: string): Promise<void> {
    await db
      .update(playerProfiles)
      .set({ email, passwordHash, updatedAt: new Date() })
      .where(eq(playerProfiles.id, id));
  }

  // Atomically write the canonical chip balance + optional hand stats.
  // Called at: (a) end of every hand, (b) disconnect/leave.
  // Safe to call multiple times — last write wins (idempotent per hand end).
  // deltaChips: signed chip delta for this hand (positive=won, negative=lost).
  async syncPlayerChips(id: string, chips: number, handResult?: { won: boolean; deltaChips?: number }): Promise<void> {
    if (handResult) {
      // Use SQL increments so concurrent calls don't clobber each other
      await db
        .update(playerProfiles)
        .set({
          chipBalance: chips,
          updatedAt: new Date(),
          handsPlayed: sql`${playerProfiles.handsPlayed} + 1`,
          handsWon: handResult.won
            ? sql`${playerProfiles.handsWon} + 1`
            : playerProfiles.handsWon,
          lifetimeProfit: handResult.deltaChips != null
            ? sql`${playerProfiles.lifetimeProfit} + ${handResult.deltaChips}`
            : playerProfiles.lifetimeProfit,
        })
        .where(eq(playerProfiles.id, id));
      return;
    }
    await db
      .update(playerProfiles)
      .set({ chipBalance: chips, updatedAt: new Date() })
      .where(eq(playerProfiles.id, id));
  }

  async setPlayerActiveTable(id: string, tableId: string, seatId: string, modeId: string): Promise<void> {
    await db
      .update(playerProfiles)
      .set({ activeTableId: tableId, activeSeatId: seatId, activeModeId: modeId, updatedAt: new Date() })
      .where(eq(playerProfiles.id, id));
  }

  async clearPlayerActiveTable(id: string): Promise<void> {
    await db
      .update(playerProfiles)
      .set({ activeTableId: null, activeSeatId: null, activeModeId: null, updatedAt: new Date() })
      .where(eq(playerProfiles.id, id));
  }
}

export const storage = new MemStorage();
