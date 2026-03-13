import { type User, type InsertUser, type InsertAnalyticsEvent, type AnalyticsEvent, analyticsEvents } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, sql, and, gte, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  insertAnalyticsEvent(event: InsertAnalyticsEvent): Promise<void>;
  getDailyStats(days: number): Promise<DailyStats[]>;
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

    const allDatesSet = new Set(allDates);

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
}

export const storage = new MemStorage();
