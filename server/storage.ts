import {
  type User, type InsertUser,
  type InsertAnalyticsEvent, type AnalyticsEvent,
  type PlayerProfile,
  type Session,
  type PurchaseTransaction,
  type CosmeticItem,
  type Subscription,
  analyticsEvents, playerProfiles, stripeTransactions, sessions, purchaseTransactions,
  dailyBonusClaims, cosmeticItems, playerInventory, cosmeticPurchases,
  subscriptions, subscriptionEvents,
} from "@shared/schema";
import type { SubscriptionTier } from "./billing";
import { randomUUID, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { eq, sql, and, or, gte, isNull, lt, gt, desc } from "drizzle-orm";

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
  deletePlayer(id: string): Promise<void>;
  addChipsToPlayer(id: string, chips: number): Promise<void>;
  // ── Avatar & customisation ─────────────────────────────────────────────────
  updatePlayerAvatar(id: string, avatarId: string | null): Promise<void>;
  // ── Display name change (90-day cooldown) ──────────────────────────────────
  updatePlayerDisplayName(id: string, name: string): Promise<void>;
  // ── Guest reset job ────────────────────────────────────────────────────────
  getEligibleGuestResets(cutoff: Date): Promise<PlayerProfile[]>;
  resetGuestAccount(id: string): Promise<void>;
  // ── Stripes ────────────────────────────────────────────────────────────────
  getPlayerStripes(id: string): Promise<{ stripes: number; updatedAt: Date | null }>;
  creditStripes(playerId: string, amount: number, reason: string): Promise<number>;
  debitStripes(playerId: string, amount: number, reason: string): Promise<boolean>;
  // ── Daily bonus ────────────────────────────────────────────────────────────
  getDailyBonusStatus(playerId: string): Promise<DailyBonusStatus>;
  claimDailyBonus(playerId: string): Promise<DailyBonusClaimResult>;
  // ── Sessions ───────────────────────────────────────────────────────────────
  createSession(playerId: string, expiresAt: Date): Promise<string>;
  getSession(token: string): Promise<Session | undefined>;
  invalidateSession(token: string): Promise<void>;
  cleanExpiredSessions(): Promise<void>;
  // ── Purchase transactions ──────────────────────────────────────────────────
  createPurchaseTransaction(data: {
    playerId:           string;
    productId:          string;
    stripesGranted:     number;
    priceUsdCents:      number;
    purchaseToken:      string;
    verificationStatus?: string;
    googleOrderId?:     string;
  }): Promise<PurchaseTransaction>;
  getPurchaseTransactionByToken(token: string): Promise<PurchaseTransaction | undefined>;
  updatePurchaseTransactionStatus(
    id:            string,
    status:        string,
    googleOrderId?: string,
    verifiedAt?:   Date,
  ): Promise<void>;
  debitStripesForRefund(playerId: string, amount: number, purchaseTransactionId: string): Promise<void>;
  // ── Cosmetics ──────────────────────────────────────────────────────────────
  getCosmeticCatalog(): Promise<CosmeticItem[]>;
  getPlayerInventory(playerId: string): Promise<PlayerInventoryResult>;
  purchaseCosmetic(playerId: string, cosmeticItemId: string): Promise<PurchaseCosmeticResult>;
  equipCosmetic(playerId: string, cosmeticItemId: string): Promise<EquipResult>;
  unequipCosmetic(playerId: string, category: string): Promise<void>;
  // ── Subscriptions ──────────────────────────────────────────────────────────
  getSubscriptionByToken(purchaseToken: string): Promise<Subscription | undefined>;
  getPlayerActiveSubscription(playerId: string): Promise<Subscription | undefined>;
  upsertSubscription(data: {
    playerId:                   string;
    tier:                       string;
    billingPeriod:              string;
    productId:                  string;
    purchaseToken:              string;
    status:                     string;
    expiresAt:                  Date;
    autoRenewing:               boolean;
    previousFrameId:            string | null;
    stripesGrantedCurrentCycle: number;
  }): Promise<Subscription>;
  updateSubscriptionOnRenewal(id: string, newExpiry: Date, stripesGranted: number): Promise<void>;
  updateSubscriptionStatus(id: string, status: string, extra: {
    autoRenewing?: boolean;
    canceledAt?: Date;
  }): Promise<void>;
  setPlayerSubscriptionTier(playerId: string, tier: SubscriptionTier, expiresAt: Date): Promise<void>;
  clearPlayerSubscriptionTier(playerId: string): Promise<void>;
  updateSubscriptionLastStripesGrant(playerId: string): Promise<void>;
  forceEquipFrame(playerId: string, frameId: string): Promise<void>;
  restorePreviousFrame(playerId: string, previousFrameId: string | null): Promise<void>;
  logSubscriptionEvent(data: {
    playerId:       string;
    subscriptionId: string;
    eventType:      string;
    eventData?:     Record<string, unknown>;
  }): Promise<void>;
}

// ─── Daily bonus types ────────────────────────────────────────────────────────
export interface DailyBonusStatus {
  canClaim:             boolean;
  currentStreakDay:     number; // day to claim (canClaim=true) or day already claimed (canClaim=false)
  nextClaimAvailableAt: Date;
  todaysReward:         { chips: number; stripes: number };
}

export interface DailyBonusClaimResult {
  chipsGranted:         number;
  stripesGranted:       number;
  newStreakDay:         number;
  nextClaimAvailableAt: Date;
  newChipBalance:       number;
  newStripesBalance:    number;
}

export interface DailyStats {
  date: string;
  uniquePlayers: number;
  sessionCount: number;
  avgSessionMs: number;
  modeBreakdown: Record<string, number>;
  returningPlayers: number;
}

// ─── Cosmetics types ──────────────────────────────────────────────────────────
export interface CosmeticInventoryItem extends CosmeticItem {
  acquiredAt:          Date;
  equippedInInventory: boolean;
}

export interface PlayerInventoryResult {
  items: CosmeticInventoryItem[];
  equipped: {
    avatarId:    string | null;
    frameId:     string | null;
    nameColorId: string | null;
  };
}

export interface PurchaseCosmeticResult {
  newStripesBalance: number;
  item:              CosmeticItem;
}

export interface EquipResult {
  equipped: {
    avatarId:    string | null;
    frameId:     string | null;
    nameColorId: string | null;
  };
}

// ─── Daily bonus helpers (module-scope so class methods can reference them) ────

const DAILY_BONUS_SCHEDULE = [
  { day: 1, chips: 500,   stripes: 0  },
  { day: 2, chips: 750,   stripes: 0  },
  { day: 3, chips: 1_000, stripes: 0  },
  { day: 4, chips: 1_500, stripes: 0  },
  { day: 5, chips: 2_000, stripes: 5  },
  { day: 6, chips: 3_000, stripes: 0  },
  { day: 7, chips: 5_000, stripes: 15 },
] as const;

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tomorrowUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}

function bonusCanClaimToday(lastBonusClaimedAt: Date | null): boolean {
  if (!lastBonusClaimedAt) return true;
  return utcDateStr(lastBonusClaimedAt) < utcDateStr(new Date());
}

function computeNextStreakDay(lastBonusClaimedAt: Date | null, currentStreakDay: number): number {
  if (!lastBonusClaimedAt) return 1;
  const lastDate  = utcDateStr(lastBonusClaimedAt);
  const yesterday = utcDateStr(new Date(Date.now() - 86_400_000));
  if (lastDate === yesterday) return currentStreakDay >= 7 ? 1 : currentStreakDay + 1;
  return 1;
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
      chipBalance: 25000,
      stripes: 0,
      activeTableId: null,
      activeSeatId: null,
      activeModeId: null,
      handsPlayed: 0,
      handsWon: 0,
      lifetimeProfit: 0,
      email: null,
      passwordHash: null,
      avatarId:            null,
      equippedAvatarId:    null,
      equippedFrameId:     null,
      equippedNameColorId: null,
      lastNameChangeAt:    null,
      lastResetAt:         null,
      lastBonusClaimedAt:  null,
      bonusStreakDay:      1,
      totalBonusClaims:   0,
      activeSubscriptionTier:         null,
      subscriptionExpiresAt:          null,
      subscriptionLastStripesGrantAt: null,
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

  async syncPlayerChips(id: string, chips: number, handResult?: { won: boolean; deltaChips?: number }): Promise<void> {
    if (handResult) {
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

  async deletePlayer(id: string): Promise<void> {
    await db.delete(playerProfiles).where(eq(playerProfiles.id, id));
  }

  async addChipsToPlayer(id: string, chips: number): Promise<void> {
    await db
      .update(playerProfiles)
      .set({
        chipBalance: sql`${playerProfiles.chipBalance} + ${chips}`,
        updatedAt: new Date(),
      })
      .where(eq(playerProfiles.id, id));
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────

  async updatePlayerAvatar(id: string, avatarId: string | null): Promise<void> {
    await db
      .update(playerProfiles)
      .set({ avatarId, updatedAt: new Date() })
      .where(eq(playerProfiles.id, id));
  }

  // ── Display name change ────────────────────────────────────────────────────

  async updatePlayerDisplayName(id: string, name: string): Promise<void> {
    await db
      .update(playerProfiles)
      .set({ displayName: name, lastNameChangeAt: new Date(), updatedAt: new Date() })
      .where(eq(playerProfiles.id, id));
  }

  // ── Guest reset helpers ────────────────────────────────────────────────────

  async getEligibleGuestResets(cutoff: Date): Promise<PlayerProfile[]> {
    const rows = await db
      .select()
      .from(playerProfiles)
      .where(
        and(
          isNull(playerProfiles.email),
          isNull(playerProfiles.passwordHash),
          or(
            and(
              isNull(playerProfiles.lastResetAt),
              lt(playerProfiles.createdAt, cutoff)
            ),
            lt(playerProfiles.lastResetAt, cutoff)
          )
        )
      );
    return rows;
  }

  async resetGuestAccount(id: string): Promise<void> {
    const now = new Date();
    await db
      .update(playerProfiles)
      .set({
        chipBalance:    25000,
        handsPlayed:    0,
        handsWon:       0,
        lifetimeProfit: 0,
        avatarId:       null,
        activeTableId:  null,
        activeSeatId:   null,
        activeModeId:   null,
        lastResetAt:    now,
        updatedAt:      now,
      })
      .where(
        and(
          eq(playerProfiles.id, id),
          isNull(playerProfiles.email),
          isNull(playerProfiles.passwordHash)
        )
      );
  }

  // ── Stripes ────────────────────────────────────────────────────────────────

  async getPlayerStripes(id: string): Promise<{ stripes: number; updatedAt: Date | null }> {
    const rows = await db
      .select({ stripes: playerProfiles.stripes, updatedAt: playerProfiles.updatedAt })
      .from(playerProfiles)
      .where(eq(playerProfiles.id, id))
      .limit(1);
    if (!rows[0]) return { stripes: 0, updatedAt: null };
    return { stripes: rows[0].stripes, updatedAt: rows[0].updatedAt };
  }

  async creditStripes(playerId: string, amount: number, reason: string): Promise<number> {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({ stripes: playerProfiles.stripes })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);
      if (!rows[0]) throw new Error(`Player ${playerId} not found`);
      const newBalance = rows[0].stripes + amount;
      await tx
        .update(playerProfiles)
        .set({ stripes: newBalance, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));
      await tx.insert(stripeTransactions).values({
        playerId,
        amount,
        reason,
        balanceAfter: newBalance,
      });
      return newBalance;
    });
  }

  async debitStripes(playerId: string, amount: number, reason: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({ stripes: playerProfiles.stripes })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);
      if (!rows[0] || rows[0].stripes < amount) return false;
      const newBalance = rows[0].stripes - amount;
      await tx
        .update(playerProfiles)
        .set({ stripes: newBalance, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));
      await tx.insert(stripeTransactions).values({
        playerId,
        amount: -amount,
        reason,
        balanceAfter: newBalance,
      });
      return true;
    });
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async createSession(playerId: string, expiresAt: Date): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await db.insert(sessions).values({ token, playerId, expiresAt });
    return token;
  }

  async getSession(token: string): Promise<Session | undefined> {
    const rows = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.token, token),
          gt(sessions.expiresAt, new Date()),
        )
      )
      .limit(1);
    return rows[0];
  }

  async invalidateSession(token: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  async cleanExpiredSessions(): Promise<void> {
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  }

  // ── Purchase transactions ──────────────────────────────────────────────────

  async createPurchaseTransaction(data: {
    playerId:            string;
    productId:           string;
    stripesGranted:      number;
    priceUsdCents:       number;
    purchaseToken:       string;
    verificationStatus?: string;
    googleOrderId?:      string;
  }): Promise<PurchaseTransaction> {
    const id = randomUUID();
    const row = {
      id,
      playerId:           data.playerId,
      productId:          data.productId,
      stripesGranted:     data.stripesGranted,
      priceUsdCents:      data.priceUsdCents,
      purchaseToken:      data.purchaseToken,
      verificationStatus: data.verificationStatus ?? "pending",
      googleOrderId:      data.googleOrderId ?? null,
      createdAt:          new Date(),
      verifiedAt:         null,
    };
    await db.insert(purchaseTransactions).values(row);
    return row;
  }

  async getPurchaseTransactionByToken(token: string): Promise<PurchaseTransaction | undefined> {
    const rows = await db
      .select()
      .from(purchaseTransactions)
      .where(eq(purchaseTransactions.purchaseToken, token))
      .limit(1);
    return rows[0];
  }

  async updatePurchaseTransactionStatus(
    id:             string,
    status:         string,
    googleOrderId?: string,
    verifiedAt?:    Date,
  ): Promise<void> {
    await db
      .update(purchaseTransactions)
      .set({
        verificationStatus: status,
        ...(googleOrderId !== undefined ? { googleOrderId } : {}),
        ...(verifiedAt    !== undefined ? { verifiedAt    } : {}),
      })
      .where(eq(purchaseTransactions.id, id));
  }

  async debitStripesForRefund(
    playerId:               string,
    amount:                 number,
    purchaseTransactionId:  string,
  ): Promise<void> {
    // Best-effort debit — clamp to zero if the player has already spent their Stripes.
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ stripes: playerProfiles.stripes })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);
      if (!rows[0]) return;
      const debit    = Math.min(amount, rows[0].stripes);
      const newBal   = rows[0].stripes - debit;
      await tx
        .update(playerProfiles)
        .set({ stripes: newBal, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));
      await tx.insert(stripeTransactions).values({
        playerId,
        amount:       -debit,
        reason:       `refund:${purchaseTransactionId}`,
        balanceAfter: newBal,
      });
      await tx
        .update(purchaseTransactions)
        .set({ verificationStatus: "refunded" })
        .where(eq(purchaseTransactions.id, purchaseTransactionId));
    });
  }

  // ── Daily bonus ─────────────────────────────────────────────────────────────

  async getDailyBonusStatus(playerId: string): Promise<DailyBonusStatus> {
    const rows = await db
      .select({
        lastBonusClaimedAt: playerProfiles.lastBonusClaimedAt,
        bonusStreakDay:     playerProfiles.bonusStreakDay,
      })
      .from(playerProfiles)
      .where(eq(playerProfiles.id, playerId))
      .limit(1);

    if (!rows[0]) throw new Error(`Player ${playerId} not found`);
    const { lastBonusClaimedAt, bonusStreakDay } = rows[0];

    const canClaim  = bonusCanClaimToday(lastBonusClaimedAt);
    const displayDay = canClaim
      ? computeNextStreakDay(lastBonusClaimedAt, bonusStreakDay)
      : bonusStreakDay;
    const rewardDay  = displayDay;
    const reward     = DAILY_BONUS_SCHEDULE[rewardDay - 1];

    return {
      canClaim,
      currentStreakDay:     displayDay,
      nextClaimAvailableAt: tomorrowUtcMidnight(),
      todaysReward:         { chips: reward.chips, stripes: reward.stripes },
    };
  }

  async claimDailyBonus(playerId: string): Promise<DailyBonusClaimResult> {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          chipBalance:        playerProfiles.chipBalance,
          stripes:            playerProfiles.stripes,
          lastBonusClaimedAt: playerProfiles.lastBonusClaimedAt,
          bonusStreakDay:     playerProfiles.bonusStreakDay,
          totalBonusClaims:  playerProfiles.totalBonusClaims,
        })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);

      if (!rows[0]) throw Object.assign(new Error(`Player ${playerId} not found`), { code: "NOT_FOUND" });
      const player = rows[0];

      // Idempotency — reject if already claimed today
      const today = utcDateStr(new Date());
      if (player.lastBonusClaimedAt && utcDateStr(player.lastBonusClaimedAt) === today) {
        throw Object.assign(new Error("Already claimed today"), { code: "ALREADY_CLAIMED" });
      }

      const newStreakDay      = computeNextStreakDay(player.lastBonusClaimedAt, player.bonusStreakDay);
      const reward            = DAILY_BONUS_SCHEDULE[newStreakDay - 1];
      const now               = new Date();
      const newChipBalance    = player.chipBalance + reward.chips;
      const newStripesBalance = player.stripes + reward.stripes;

      await tx
        .update(playerProfiles)
        .set({
          chipBalance:        newChipBalance,
          stripes:            newStripesBalance,
          lastBonusClaimedAt: now,
          bonusStreakDay:     newStreakDay,
          totalBonusClaims:  player.totalBonusClaims + 1,
          updatedAt:          now,
        })
        .where(eq(playerProfiles.id, playerId));

      if (reward.stripes > 0) {
        await tx.insert(stripeTransactions).values({
          playerId,
          amount:       reward.stripes,
          reason:       `daily_bonus:day_${newStreakDay}`,
          balanceAfter: newStripesBalance,
        });
      }

      await tx.insert(dailyBonusClaims).values({
        playerId,
        claimedAt:      now,
        streakDay:      newStreakDay,
        chipsGranted:   reward.chips,
        stripesGranted: reward.stripes,
      });

      return {
        chipsGranted:         reward.chips,
        stripesGranted:       reward.stripes,
        newStreakDay,
        nextClaimAvailableAt: tomorrowUtcMidnight(),
        newChipBalance,
        newStripesBalance,
      };
    });
  }

  // ── Cosmetics ──────────────────────────────────────────────────────────────

  async getCosmeticCatalog(): Promise<CosmeticItem[]> {
    // Exclude subscription_exclusive items from the public catalog
    // (they are granted automatically, not purchased with Stripes)
    return await db
      .select()
      .from(cosmeticItems)
      .where(and(
        eq(cosmeticItems.active, true),
        sql`${cosmeticItems.category} != 'subscription_exclusive'`,
      ));
  }

  async getPlayerInventory(playerId: string): Promise<PlayerInventoryResult> {
    const rows = await db
      .select({
        id:                  cosmeticItems.id,
        category:            cosmeticItems.category,
        displayName:         cosmeticItems.displayName,
        description:         cosmeticItems.description,
        stripesCost:         cosmeticItems.stripesCost,
        assetPath:           cosmeticItems.assetPath,
        colorValue:          cosmeticItems.colorValue,
        active:              cosmeticItems.active,
        createdAt:           cosmeticItems.createdAt,
        acquiredAt:          playerInventory.acquiredAt,
        equippedInInventory: playerInventory.equipped,
      })
      .from(playerInventory)
      .innerJoin(cosmeticItems, eq(playerInventory.cosmeticItemId, cosmeticItems.id))
      .where(eq(playerInventory.playerId, playerId));

    const profileRows = await db
      .select({
        equippedAvatarId:    playerProfiles.equippedAvatarId,
        equippedFrameId:     playerProfiles.equippedFrameId,
        equippedNameColorId: playerProfiles.equippedNameColorId,
      })
      .from(playerProfiles)
      .where(eq(playerProfiles.id, playerId))
      .limit(1);

    const p = profileRows[0] ?? { equippedAvatarId: null, equippedFrameId: null, equippedNameColorId: null };
    return {
      items: rows.map(r => ({
        ...r,
        acquiredAt:          r.acquiredAt,
        equippedInInventory: r.equippedInInventory,
      })),
      equipped: {
        avatarId:    p.equippedAvatarId,
        frameId:     p.equippedFrameId,
        nameColorId: p.equippedNameColorId,
      },
    };
  }

  async purchaseCosmetic(playerId: string, cosmeticItemId: string): Promise<PurchaseCosmeticResult> {
    return await db.transaction(async (tx) => {
      // Item must exist and be active
      const itemRows = await tx
        .select()
        .from(cosmeticItems)
        .where(and(eq(cosmeticItems.id, cosmeticItemId), eq(cosmeticItems.active, true)))
        .limit(1);
      if (!itemRows[0]) throw Object.assign(new Error('Item not found'), { code: 'NOT_FOUND' });
      const item = itemRows[0];

      // Idempotency — reject if already owned
      const existingRows = await tx
        .select({ id: playerInventory.id })
        .from(playerInventory)
        .where(and(eq(playerInventory.playerId, playerId), eq(playerInventory.cosmeticItemId, cosmeticItemId)))
        .limit(1);
      if (existingRows[0]) throw Object.assign(new Error('Already owned'), { code: 'ALREADY_OWNED' });

      // Block subscription-exclusive items from direct purchase
      if (item.category === 'subscription_exclusive' || item.stripesCost === null) {
        throw Object.assign(new Error('Item is not purchasable'), { code: 'NOT_PURCHASABLE' });
      }

      // Check balance
      const profileRows = await tx
        .select({ stripes: playerProfiles.stripes })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);
      if (!profileRows[0]) throw Object.assign(new Error('Player not found'), { code: 'NOT_FOUND' });
      if (profileRows[0].stripes < item.stripesCost) {
        throw Object.assign(new Error('Insufficient Stripes'), { code: 'INSUFFICIENT_STRIPES', balance: profileRows[0].stripes });
      }

      const newBalance = profileRows[0].stripes - item.stripesCost;

      // Debit
      await tx.update(playerProfiles)
        .set({ stripes: newBalance, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));

      // Stripe audit
      await tx.insert(stripeTransactions).values({
        playerId,
        amount:       -item.stripesCost,
        reason:       `cosmetic:${cosmeticItemId}`,
        balanceAfter: newBalance,
      });

      // Grant item
      await tx.insert(playerInventory).values({
        id:             randomUUID(),
        playerId,
        cosmeticItemId,
        equipped:       false,
      });

      // Purchase audit
      await tx.insert(cosmeticPurchases).values({
        id:             randomUUID(),
        playerId,
        cosmeticItemId,
        stripesSpent:   item.stripesCost,
      });

      return { newStripesBalance: newBalance, item };
    });
  }

  async equipCosmetic(playerId: string, cosmeticItemId: string): Promise<EquipResult> {
    return await db.transaction(async (tx) => {
      // Verify ownership + get category
      const ownedRows = await tx
        .select({ category: cosmeticItems.category })
        .from(playerInventory)
        .innerJoin(cosmeticItems, eq(playerInventory.cosmeticItemId, cosmeticItems.id))
        .where(and(eq(playerInventory.playerId, playerId), eq(playerInventory.cosmeticItemId, cosmeticItemId)))
        .limit(1);
      if (!ownedRows[0]) throw Object.assign(new Error('Item not owned'), { code: 'NOT_OWNED' });
      const category = ownedRows[0].category;

      // Unequip previous item in same category
      const prevEquipped = await tx
        .select({ cosmeticItemId: playerInventory.cosmeticItemId })
        .from(playerInventory)
        .innerJoin(cosmeticItems, eq(playerInventory.cosmeticItemId, cosmeticItems.id))
        .where(and(
          eq(playerInventory.playerId, playerId),
          eq(cosmeticItems.category, category),
          eq(playerInventory.equipped, true),
        ));
      for (const prev of prevEquipped) {
        await tx.update(playerInventory)
          .set({ equipped: false })
          .where(and(eq(playerInventory.playerId, playerId), eq(playerInventory.cosmeticItemId, prev.cosmeticItemId)));
      }

      // Equip this item
      await tx.update(playerInventory)
        .set({ equipped: true })
        .where(and(eq(playerInventory.playerId, playerId), eq(playerInventory.cosmeticItemId, cosmeticItemId)));

      // Update player_profiles equipped slot
      const profileUpdate =
        category === 'avatar'     ? { equippedAvatarId:    cosmeticItemId } :
        category === 'frame'      ? { equippedFrameId:     cosmeticItemId } :
                                    { equippedNameColorId: cosmeticItemId };
      await tx.update(playerProfiles)
        .set({ ...profileUpdate, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));

      // Read back equipped state
      const profileRows = await tx
        .select({
          equippedAvatarId:    playerProfiles.equippedAvatarId,
          equippedFrameId:     playerProfiles.equippedFrameId,
          equippedNameColorId: playerProfiles.equippedNameColorId,
        })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);
      const p = profileRows[0] ?? { equippedAvatarId: null, equippedFrameId: null, equippedNameColorId: null };
      console.log(`[cosmetics] equip player=${playerId} item=${cosmeticItemId} category=${category}`);
      return { equipped: { avatarId: p.equippedAvatarId, frameId: p.equippedFrameId, nameColorId: p.equippedNameColorId } };
    });
  }

  async unequipCosmetic(playerId: string, category: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Clear inventory equipped flags for this category
      const equipped = await tx
        .select({ cosmeticItemId: playerInventory.cosmeticItemId })
        .from(playerInventory)
        .innerJoin(cosmeticItems, eq(playerInventory.cosmeticItemId, cosmeticItems.id))
        .where(and(
          eq(playerInventory.playerId, playerId),
          eq(cosmeticItems.category, category),
          eq(playerInventory.equipped, true),
        ));
      for (const item of equipped) {
        await tx.update(playerInventory)
          .set({ equipped: false })
          .where(and(eq(playerInventory.playerId, playerId), eq(playerInventory.cosmeticItemId, item.cosmeticItemId)));
      }

      // Clear player_profiles slot
      const profileUpdate =
        category === 'avatar'     ? { equippedAvatarId:    null } :
        category === 'frame'      ? { equippedFrameId:     null } :
                                    { equippedNameColorId: null };
      await tx.update(playerProfiles)
        .set({ ...profileUpdate, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));
      console.log(`[cosmetics] unequip player=${playerId} category=${category}`);
    });
  }

  // ── Subscription methods ────────────────────────────────────────────────────

  async getSubscriptionByToken(purchaseToken: string): Promise<Subscription | undefined> {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.purchaseToken, purchaseToken))
      .limit(1);
    return rows[0];
  }

  async getPlayerActiveSubscription(playerId: string): Promise<Subscription | undefined> {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.playerId, playerId),
        sql`${subscriptions.status} IN ('active','in_grace_period','canceled')`,
      ))
      .orderBy(desc(subscriptions.startedAt))
      .limit(1);
    return rows[0];
  }

  async upsertSubscription(data: {
    playerId:                   string;
    tier:                       string;
    billingPeriod:              string;
    productId:                  string;
    purchaseToken:              string;
    status:                     string;
    expiresAt:                  Date;
    autoRenewing:               boolean;
    previousFrameId:            string | null;
    stripesGrantedCurrentCycle: number;
  }): Promise<Subscription> {
    const id = randomUUID();
    const now = new Date();
    await db.insert(subscriptions).values({
      id,
      playerId:                   data.playerId,
      tier:                       data.tier,
      billingPeriod:              data.billingPeriod,
      productId:                  data.productId,
      purchaseToken:              data.purchaseToken,
      status:                     data.status,
      expiresAt:                  data.expiresAt,
      autoRenewing:               data.autoRenewing,
      startedAt:                  now,
      lastVerifiedAt:             now,
      previousFrameId:            data.previousFrameId,
      stripesGrantedCurrentCycle: data.stripesGrantedCurrentCycle,
    });
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    return rows[0];
  }

  async updateSubscriptionOnRenewal(id: string, newExpiry: Date, stripesGranted: number): Promise<void> {
    await db.update(subscriptions)
      .set({
        expiresAt:                  newExpiry,
        status:                     "active",
        lastVerifiedAt:             new Date(),
        stripesGrantedCurrentCycle: stripesGranted,
      })
      .where(eq(subscriptions.id, id));
  }

  async updateSubscriptionStatus(id: string, status: string, extra: {
    autoRenewing?: boolean;
    canceledAt?: Date;
  }): Promise<void> {
    await db.update(subscriptions)
      .set({
        status,
        lastVerifiedAt: new Date(),
        ...(extra.autoRenewing !== undefined ? { autoRenewing: extra.autoRenewing } : {}),
        ...(extra.canceledAt ? { canceledAt: extra.canceledAt } : {}),
      })
      .where(eq(subscriptions.id, id));
  }

  async setPlayerSubscriptionTier(playerId: string, tier: SubscriptionTier, expiresAt: Date): Promise<void> {
    await db.update(playerProfiles)
      .set({
        activeSubscriptionTier: tier,
        subscriptionExpiresAt:  expiresAt,
        updatedAt:              new Date(),
      })
      .where(eq(playerProfiles.id, playerId));
  }

  async clearPlayerSubscriptionTier(playerId: string): Promise<void> {
    await db.update(playerProfiles)
      .set({
        activeSubscriptionTier: null,
        subscriptionExpiresAt:  null,
        updatedAt:              new Date(),
      })
      .where(eq(playerProfiles.id, playerId));
  }

  async updateSubscriptionLastStripesGrant(playerId: string): Promise<void> {
    await db.update(playerProfiles)
      .set({ subscriptionLastStripesGrantAt: new Date(), updatedAt: new Date() })
      .where(eq(playerProfiles.id, playerId));
  }

  async forceEquipFrame(playerId: string, frameId: string): Promise<void> {
    // Directly update player_profiles.equipped_frame_id
    // This bypasses the normal equip flow (no inventory ownership check)
    // because subscription frames are not in the player's purchasable inventory.
    await db.update(playerProfiles)
      .set({ equippedFrameId: frameId, updatedAt: new Date() })
      .where(eq(playerProfiles.id, playerId));
    console.log(`[sub] force-equipped frame ${frameId} for player=${playerId}`);
  }

  async restorePreviousFrame(playerId: string, previousFrameId: string | null): Promise<void> {
    await db.update(playerProfiles)
      .set({ equippedFrameId: previousFrameId ?? null, updatedAt: new Date() })
      .where(eq(playerProfiles.id, playerId));
    console.log(`[sub] restored frame ${previousFrameId ?? 'none'} for player=${playerId}`);
  }

  async logSubscriptionEvent(data: {
    playerId:       string;
    subscriptionId: string;
    eventType:      string;
    eventData?:     Record<string, unknown>;
  }): Promise<void> {
    await db.insert(subscriptionEvents).values({
      id:             randomUUID(),
      playerId:       data.playerId,
      subscriptionId: data.subscriptionId,
      eventType:      data.eventType,
      eventData:      data.eventData ?? {},
      occurredAt:     new Date(),
    });
  }
}

export const storage = new MemStorage();
