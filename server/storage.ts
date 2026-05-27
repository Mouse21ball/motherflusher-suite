import {
  type User, type InsertUser,
  type InsertAnalyticsEvent, type AnalyticsEvent,
  type PlayerProfile,
  type Session,
  type PurchaseTransaction,
  type CosmeticItem,
  type Subscription,
  type Crew,
  type ChipTxReason,
  analyticsEvents, playerProfiles, stripeTransactions, sessions, purchaseTransactions,
  dailyBonusClaims, cosmeticItems, playerInventory, cosmeticPurchases,
  subscriptions, subscriptionEvents,
  crews, crewMembers, crewChatMessages, crewEvents,
  timeBankEvents,
  chipTransactions,
  blockedPlayers,
  type BlockedPlayer,
  playerReports,
  type PlayerReport,
} from "@shared/schema";
import type { SubscriptionTier } from "./billing";
import { SUBSCRIPTION_PRODUCTS } from "./billing";
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
  addChipsToPlayer(id: string, chips: number, opts?: { reason?: ChipTxReason; source?: string; gameId?: string | null; handId?: string | null; metadata?: Record<string, any> | null }): Promise<void>;
  recordChipTransaction(params: { playerId: string; beforeBalance: number; amountChange: number; afterBalance: number; reason: ChipTxReason; source: string; gameId?: string | null; handId?: string | null; metadata?: Record<string, any> | null }): Promise<void>;
  verifyPlayerBalanceConsistency(playerId: string): Promise<{ consistent: boolean; currentBalance: number; computedBalance: number; drift: number }>;
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
  // ── Crews ───────────────────────────────────────────────────────────────────
  getCrewById(crewId: string, requesterId?: string): Promise<CrewDetail | undefined>;
  getCrewByInviteCode(code: string): Promise<Crew | undefined>;
  getPlayerCurrentCrew(playerId: string): Promise<CrewDetail | null>;
  createCrewTx(data: { playerId: string; name: string; description?: string; inviteCode: string }): Promise<Crew>;
  joinCrewTx(data: { playerId: string; crewId: string }): Promise<void>;
  leaveCrewTx(data: { playerId: string; crewId: string }): Promise<{ newCaptainId?: string; disbanded: boolean }>;
  kickMemberTx(data: { crewId: string; targetPlayerId: string }): Promise<void>;
  renameCrewTx(data: { crewId: string; name?: string; description?: string | null }): Promise<void>;
  regenerateCrewInviteTx(data: { crewId: string; inviteCode: string }): Promise<void>;
  getChatMessages(crewId: string, before?: Date, limit?: number): Promise<CrewChatRow[]>;
  sendChatMessage(crewId: string, playerId: string, message: string): Promise<{ id: string; createdAt: Date }>;
  incrementCrewMemberChipsWon(playerId: string, chipsWon: number): Promise<void>;
  logCrewEvent(data: { crewId: string; playerId: string; eventType: string; eventData?: Record<string, unknown> }): Promise<void>;
  // ── Time Bank ───────────────────────────────────────────────────────────────
  debitChipsForBuyin(playerId: string, amount: number): Promise<boolean>;
  getTimeBankStatus(playerId: string): Promise<{ freeRemaining: number; purchased: number; tier: string | null }>;
  consumeTimeBankSlot(playerId: string, source: 'free' | 'subscription' | 'purchased', tableId?: string): Promise<void>;
  purchaseTimeBankUses(playerId: string, quantity: number): Promise<{ success: boolean; newStripes: number; newPurchasedUses: number }>;
  // ── Blocked Players ─────────────────────────────────────────────────────────
  blockPlayer(blockerId: string, blockedId: string): Promise<BlockedPlayer>;
  unblockPlayer(blockerId: string, blockedId: string): Promise<boolean>;
  getBlockedPlayers(blockerId: string): Promise<Array<{ id: string; displayName: string }>>;
  isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
  // ── Player Reports ──────────────────────────────────────────────────────────
  createReport(reporterId: string, reportedId: string, reason: string, context: string | null, contextType: string | null, notes: string | null): Promise<PlayerReport>;
  getReportsByReporter(reporterId: string, limit?: number): Promise<PlayerReport[]>;
  getReportsAgainst(reportedId: string): Promise<PlayerReport[]>;
  listPendingReports(limit: number, offset: number): Promise<Array<PlayerReport & { reporterName: string; reportedName: string }>>;
}

// ─── Crew types ──────────────────────────────────────────────────────────────
export interface CrewMemberRow {
  id:             string;
  playerId:       string;
  displayName:    string;
  avatarId:       string | null;
  equippedFrameId:string | null;
  role:           string;
  joinedAt:       Date;
  totalChipsWon:  number;
}

export interface CrewDetail {
  id:          string;
  name:        string;
  description: string | null;
  inviteCode:  string;
  captainId:   string;
  memberCount: number;
  createdAt:   Date;
  disbandedAt: Date | null;
  members:     CrewMemberRow[];
}

export interface CrewChatRow {
  id:          string;
  playerId:    string;
  playerName:  string;
  avatarId:    string | null;
  role:        string;
  message:     string;
  createdAt:   Date;
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

// ─── Cosmetic catalog seed ────────────────────────────────────────────────────
// Inserts the canonical cosmetic item set if the table is empty.
// Uses onConflictDoNothing so repeated restarts are fully safe.
export async function seedCosmeticItems(): Promise<void> {
  const existing = await db.select({ id: cosmeticItems.id }).from(cosmeticItems).limit(1);
  if (existing.length > 0) return; // already seeded

  await db.insert(cosmeticItems).values([
    // ── Avatars ────────────────────────────────────────────────────────────
    { id: 'avatar_bandana_black',        category: 'avatar',                displayName: 'Black Bandana',        description: 'All-black bandana look.',                                                                                    stripesCost: 125,  assetPath: '/cosmetics/avatars/bandana-black.png',                  colorValue: null, active: true },
    { id: 'avatar_bandana_blue',         category: 'avatar',                displayName: 'Blue Bandana',         description: 'Blue bandana street style.',                                                                                 stripesCost: 125,  assetPath: '/cosmetics/avatars/bandana-blue.png',                   colorValue: null, active: true },
    { id: 'avatar_bandana_ghost',        category: 'avatar',                displayName: 'Ghost Bandana',        description: 'Ghost-white bandana, unseen.',                                                                               stripesCost: 150,  assetPath: '/cosmetics/avatars/bandana-ghost.png',                  colorValue: null, active: true },
    { id: 'avatar_bandana_red',          category: 'avatar',                displayName: 'Red Bandana',          description: 'Red bandana, ride or die.',                                                                                  stripesCost: 125,  assetPath: '/cosmetics/avatars/bandana-red.png',                    colorValue: null, active: true },
    { id: 'avatar_classy_girl',          category: 'avatar',                displayName: 'Classy Girl',          description: 'Dressed to impress at the table.',                                                                           stripesCost: 175,  assetPath: '/cosmetics/avatars/classy-girl.png',                    colorValue: null, active: true },
    { id: 'avatar_gangster_girl',        category: 'avatar',                displayName: 'Gangster Girl',        description: 'She runs the table.',                                                                                        stripesCost: 200,  assetPath: '/cosmetics/avatars/gangster-girl.png',                  colorValue: null, active: true },
    { id: 'avatar_king',                 category: 'avatar',                displayName: 'The King',             description: 'Royalty at every table.',                                                                                    stripesCost: 300,  assetPath: '/cosmetics/avatars/king.png',                           colorValue: null, active: true },
    { id: 'avatar_urban',                category: 'avatar',                displayName: 'Urban',                description: 'Street-ready urban avatar.',                                                                                 stripesCost: 100,  assetPath: '/cosmetics/avatars/urban.png',                          colorValue: null, active: true },
    { id: 'avatar_urban_2',              category: 'avatar',                displayName: 'Urban II',             description: 'Second urban colorway.',                                                                                     stripesCost: 100,  assetPath: '/cosmetics/avatars/urban-2.png',                        colorValue: null, active: true },
    // ── Frames ─────────────────────────────────────────────────────────────
    { id: 'frame_about_her_business',    category: 'frame',                 displayName: 'About Her Business',   description: 'All business, no games.',                                                                                    stripesCost: 250,  assetPath: '/cosmetics/frames/frame-about-her-business.png',        colorValue: null, active: true },
    { id: 'frame_bandana_blue',          category: 'frame',                 displayName: 'Blue Bandana Frame',   description: 'Blue bandana wraps the border.',                                                                             stripesCost: 150,  assetPath: '/cosmetics/frames/frame-bandana-blue.png',              colorValue: null, active: true },
    { id: 'frame_bandana_red',           category: 'frame',                 displayName: 'Red Bandana Frame',    description: 'Red bandana wraps the border.',                                                                              stripesCost: 150,  assetPath: '/cosmetics/frames/frame-bandana-red.png',               colorValue: null, active: true },
    { id: 'frame_classy_lady',           category: 'frame',                 displayName: 'Classy Lady Frame',    description: 'Elegant frame for the refined player.',                                                                      stripesCost: 175,  assetPath: '/cosmetics/frames/frame-classy-lady.png',               colorValue: null, active: true },
    { id: 'frame_diamond',               category: 'frame',                 displayName: 'Diamond Frame',        description: 'Diamond-encrusted prestige border.',                                                                         stripesCost: 500,  assetPath: '/cosmetics/frames/frame-diamond.png',                   colorValue: null, active: true },
    { id: 'frame_fire',                  category: 'frame',                 displayName: 'Fire Frame',           description: 'Ablaze with the rarest fire.',                                                                               stripesCost: 600,  assetPath: '/cosmetics/frames/frame-fire.png',                      colorValue: null, active: true },
    { id: 'frame_firestyle',             category: 'frame',                 displayName: 'Firestyle Frame',      description: 'Fire-styled border, heat at the table.',                                                                     stripesCost: 400,  assetPath: '/cosmetics/frames/frame-firestyle.png',                 colorValue: null, active: true },
    { id: 'frame_gangster_girl',         category: 'frame',                 displayName: 'Gangster Girl Frame',  description: 'Street-style frame, boss energy.',                                                                           stripesCost: 200,  assetPath: '/cosmetics/frames/frame-gangster-girl.png',             colorValue: null, active: true },
    { id: 'frame_gold',                  category: 'frame',                 displayName: 'Gold Frame',           description: 'Classic gold border.',                                                                                       stripesCost: 100,  assetPath: '/cosmetics/frames/frame-gold.png',                      colorValue: null, active: true },
    { id: 'frame_platinum',              category: 'frame',                 displayName: 'Platinum Frame',       description: 'Platinum-grade prestige.',                                                                                   stripesCost: 300,  assetPath: '/cosmetics/frames/frame-platinum.png',                  colorValue: null, active: true },
    { id: 'frame_slime',                 category: 'frame',                 displayName: 'Slime Frame',          description: 'Dripping slime border.',                                                                                     stripesCost: 125,  assetPath: '/cosmetics/frames/frame-slime.png',                     colorValue: null, active: true },
    // ── Name colors ────────────────────────────────────────────────────────
    { id: 'color_crimson',               category: 'name_color',            displayName: 'Crimson',              description: 'Blood money. Your name runs red.',                                                                           stripesCost: 150,  assetPath: '',                                                      colorValue: '#DC143C', active: true },
    { id: 'color_gold',                  category: 'name_color',            displayName: 'Gold',                 description: 'Classic Chain Gang gold — the default flex.',                                                                stripesCost: 100,  assetPath: '',                                                      colorValue: '#FFD700', active: true },
    { id: 'color_purple_royalty',        category: 'name_color',            displayName: 'Purple Royalty',       description: 'Reserved for kings. Are you one?',                                                                           stripesCost: 200,  assetPath: '',                                                      colorValue: '#7B2D8B', active: true },
    { id: 'color_silver',                category: 'name_color',            displayName: 'Silver',               description: 'Your name shines in polished silver.',                                                                       stripesCost: 50,   assetPath: '',                                                      colorValue: '#C0C0C0', active: true },
    // ── Subscription-exclusive ─────────────────────────────────────────────
    { id: 'frame_diamond_animated',      category: 'subscription_exclusive', displayName: 'Diamond Elite Frame', description: 'Exclusive animated diamond border. Auto-equipped while Diamond Elite subscription is active.',                stripesCost: null, assetPath: '/cosmetics/frames/frame-diamond-animated.png',          colorValue: null, active: true },
    { id: 'frame_gold_subscription',     category: 'subscription_exclusive', displayName: 'Gold Pro Frame',      description: 'Exclusive animated gold border. Auto-equipped while Gold Pro subscription is active.',                       stripesCost: null, assetPath: '/cosmetics/frames/frame-gold-subscription.png',         colorValue: null, active: true },
  ]).onConflictDoNothing();
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

  // ── Private chip ledger helper ─────────────────────────────────────────────
  // Insert one immutable row into chip_transactions inside an existing
  // Drizzle transaction context.  `tx` is typed `any` to avoid Drizzle's
  // verbose internal generic — it is ALWAYS a real `db.transaction` callback
  // argument; never called outside a transaction.
  private async _insertChipLedger(
    tx: any,
    params: {
      playerId:      string;
      beforeBalance: number;
      amountChange:  number;
      afterBalance:  number;
      reason:        ChipTxReason;
      source:        string;
      gameId?:       string | null;
      handId?:       string | null;
      metadata?:     Record<string, any> | null;
    },
  ): Promise<void> {
    await tx.insert(chipTransactions).values({
      playerId:      params.playerId,
      beforeBalance: params.beforeBalance,
      amountChange:  params.amountChange,
      afterBalance:  params.afterBalance,
      reason:        params.reason,
      source:        params.source,
      gameId:        params.gameId   ?? null,
      handId:        params.handId   ?? null,
      metadata:      params.metadata ?? null,
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
      currentCrewId:                  null,
      timeBankFreeUsesRemaining:      2,
      timeBankPurchasedUses:          0,
      createdAt: now,
      updatedAt: now,
    };

    // Wrap creation + genesis ledger in one transaction so new players always
    // have a starting ledger entry.  The consistency checker can then compute
    // a correct balance for all players created after this deployment.
    await db.transaction(async (tx) => {
      await tx.insert(playerProfiles).values(profile);
      await this._insertChipLedger(tx, {
        playerId:      id,
        beforeBalance: 0,
        amountChange:  25000,
        afterBalance:  25000,
        reason:        'other',
        source:        'genesis',
      });
    });
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
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, id))
        .limit(1);
      const before = rows[0]?.chipBalance ?? 0;
      const delta  = chips - before;

      if (handResult) {
        await tx
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
      } else {
        await tx
          .update(playerProfiles)
          .set({ chipBalance: chips, updatedAt: new Date() })
          .where(eq(playerProfiles.id, id));
      }

      await this._insertChipLedger(tx, {
        playerId:      id,
        beforeBalance: before,
        amountChange:  delta,
        afterBalance:  chips,
        reason:        handResult ? 'hand_win' : 'other',
        source:        handResult ? 'gameEngine' : 'syncOnDisconnect',
      });
    });
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

  async addChipsToPlayer(
    id: string,
    chips: number,
    opts?: {
      reason?:   ChipTxReason;
      source?:   string;
      gameId?:   string | null;
      handId?:   string | null;
      metadata?: Record<string, any> | null;
    },
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, id))
        .limit(1);
      const before = rows[0]?.chipBalance ?? 0;
      const after  = before + chips;
      await tx
        .update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} + ${chips}`, updatedAt: new Date() })
        .where(eq(playerProfiles.id, id));
      await this._insertChipLedger(tx, {
        playerId:      id,
        beforeBalance: before,
        amountChange:  chips,
        afterBalance:  after,
        reason:        opts?.reason   ?? 'other',
        source:        opts?.source   ?? 'addChipsToPlayer',
        gameId:        opts?.gameId   ?? null,
        handId:        opts?.handId   ?? null,
        metadata:      opts?.metadata ?? null,
      });
    });
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
    const RESET_BALANCE = 25000;
    const now = new Date();
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, id))
        .limit(1);
      const before = rows[0]?.chipBalance ?? 0;
      await tx
        .update(playerProfiles)
        .set({
          chipBalance:    RESET_BALANCE,
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
      await this._insertChipLedger(tx, {
        playerId:      id,
        beforeBalance: before,
        amountChange:  RESET_BALANCE - before,
        afterBalance:  RESET_BALANCE,
        reason:        'guest_reset',
        source:        'guestReset',
        metadata:      { resetReason: '24h_expiry' },
      });
    });
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
          chipBalance:             playerProfiles.chipBalance,
          stripes:                 playerProfiles.stripes,
          lastBonusClaimedAt:      playerProfiles.lastBonusClaimedAt,
          bonusStreakDay:          playerProfiles.bonusStreakDay,
          totalBonusClaims:       playerProfiles.totalBonusClaims,
          activeSubscriptionTier: playerProfiles.activeSubscriptionTier,
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

      // Apply subscription daily chip multiplier (2x Gold Pro, 3x Diamond Elite)
      const subTier = player.activeSubscriptionTier;
      const chipMultiplier =
        subTier === 'diamond_elite' ? 3
        : subTier === 'gold_pro'    ? 2
        : 1;
      const chipsAwarded      = Math.round(reward.chips * chipMultiplier);

      const newChipBalance    = player.chipBalance + chipsAwarded;
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
        chipsGranted:   chipsAwarded,
        stripesGranted: reward.stripes,
      });

      await this._insertChipLedger(tx, {
        playerId,
        beforeBalance: player.chipBalance,
        amountChange:  chipsAwarded,
        afterBalance:  newChipBalance,
        reason:        'daily_bonus',
        source:        'dailyBonus',
        metadata: {
          streakDay:       newStreakDay,
          chipsGranted:    chipsAwarded,
          stripesGranted:  reward.stripes,
          chipMultiplier,
        },
      });

      return {
        chipsGranted:         chipsAwarded,
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

  // ── Crews ────────────────────────────────────────────────────────────────────

  async getCrewById(crewId: string, _requesterId?: string): Promise<CrewDetail | undefined> {
    const [crew] = await db.select().from(crews).where(eq(crews.id, crewId));
    if (!crew) return undefined;

    const rows = await db
      .select({
        id:             crewMembers.id,
        playerId:       crewMembers.playerId,
        displayName:    playerProfiles.displayName,
        avatarId:       playerProfiles.avatarId,
        equippedFrameId:playerProfiles.equippedFrameId,
        role:           crewMembers.role,
        joinedAt:       crewMembers.joinedAt,
        totalChipsWon:  crewMembers.totalChipsWon,
      })
      .from(crewMembers)
      .innerJoin(playerProfiles, eq(crewMembers.playerId, playerProfiles.id))
      .where(eq(crewMembers.crewId, crewId))
      .orderBy(desc(crewMembers.totalChipsWon));

    return {
      id:          crew.id,
      name:        crew.name,
      description: crew.description ?? null,
      inviteCode:  crew.inviteCode,
      captainId:   crew.captainId,
      memberCount: crew.memberCount,
      createdAt:   crew.createdAt,
      disbandedAt: crew.disbandedAt ?? null,
      members:     rows.map(r => ({
        id:              r.id,
        playerId:        r.playerId,
        displayName:     r.displayName,
        avatarId:        r.avatarId ?? null,
        equippedFrameId: r.equippedFrameId ?? null,
        role:            r.role,
        joinedAt:        r.joinedAt!,
        totalChipsWon:   r.totalChipsWon,
      })),
    };
  }

  async getCrewByInviteCode(code: string): Promise<Crew | undefined> {
    const [crew] = await db
      .select()
      .from(crews)
      .where(and(eq(crews.inviteCode, code.toUpperCase()), isNull(crews.disbandedAt)));
    return crew;
  }

  async getPlayerCurrentCrew(playerId: string): Promise<CrewDetail | null> {
    const [profile] = await db
      .select({ currentCrewId: playerProfiles.currentCrewId })
      .from(playerProfiles)
      .where(eq(playerProfiles.id, playerId));
    if (!profile?.currentCrewId) return null;
    return (await this.getCrewById(profile.currentCrewId)) ?? null;
  }

  async createCrewTx(data: {
    playerId: string; name: string; description?: string; inviteCode: string;
  }): Promise<Crew> {
    return db.transaction(async tx => {
      const crewId = randomUUID();
      const now    = new Date();

      const [crew] = await tx.insert(crews).values({
        id:          crewId,
        name:        data.name,
        description: data.description ?? null,
        inviteCode:  data.inviteCode,
        captainId:   data.playerId,
        memberCount: 1,
        createdAt:   now,
      }).returning();

      await tx.insert(crewMembers).values({
        id:       randomUUID(),
        crewId,
        playerId: data.playerId,
        role:     "captain",
        joinedAt: now,
        totalChipsWon: 0,
      });

      await tx.update(playerProfiles)
        .set({ currentCrewId: crewId, updatedAt: now })
        .where(eq(playerProfiles.id, data.playerId));

      return crew;
    });
  }

  async joinCrewTx(data: { playerId: string; crewId: string }): Promise<void> {
    await db.transaction(async tx => {
      const now = new Date();

      await tx.insert(crewMembers).values({
        id:       randomUUID(),
        crewId:   data.crewId,
        playerId: data.playerId,
        role:     "member",
        joinedAt: now,
        totalChipsWon: 0,
      });

      await tx.update(crews)
        .set({ memberCount: sql`${crews.memberCount} + 1` })
        .where(eq(crews.id, data.crewId));

      await tx.update(playerProfiles)
        .set({ currentCrewId: data.crewId, updatedAt: now })
        .where(eq(playerProfiles.id, data.playerId));
    });
  }

  async leaveCrewTx(data: { playerId: string; crewId: string }): Promise<{ newCaptainId?: string; disbanded: boolean }> {
    return db.transaction(async tx => {
      const now = new Date();

      const [member] = await tx
        .select()
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, data.crewId), eq(crewMembers.playerId, data.playerId)));
      if (!member) throw new Error("Not a member of this Crew.");

      const [crew] = await tx.select().from(crews).where(eq(crews.id, data.crewId));
      if (!crew) throw new Error("Crew not found.");

      const allMembers = await tx
        .select()
        .from(crewMembers)
        .where(eq(crewMembers.crewId, data.crewId));

      const others = allMembers.filter(m => m.playerId !== data.playerId);

      let newCaptainId: string | undefined;
      let disbanded = false;

      if (member.role === "captain") {
        if (others.length === 0) {
          // Last member — disband
          await tx.update(crews)
            .set({ disbandedAt: now })
            .where(eq(crews.id, data.crewId));
          disbanded = true;
        } else {
          // Promote longest-tenured member
          const nextCaptain = others
            .filter(m => m.role === "member")
            .sort((a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0))[0]
            ?? others[0];

          await tx.update(crewMembers)
            .set({ role: "captain" })
            .where(and(eq(crewMembers.crewId, data.crewId), eq(crewMembers.playerId, nextCaptain.playerId)));

          await tx.update(crews)
            .set({ captainId: nextCaptain.playerId })
            .where(eq(crews.id, data.crewId));

          newCaptainId = nextCaptain.playerId;
        }
      }

      // Delete leaving member row and decrement count
      await tx.delete(crewMembers)
        .where(and(eq(crewMembers.crewId, data.crewId), eq(crewMembers.playerId, data.playerId)));

      if (!disbanded) {
        await tx.update(crews)
          .set({ memberCount: sql`${crews.memberCount} - 1` })
          .where(eq(crews.id, data.crewId));
      }

      await tx.update(playerProfiles)
        .set({ currentCrewId: null, updatedAt: now })
        .where(eq(playerProfiles.id, data.playerId));

      return { newCaptainId, disbanded };
    });
  }

  async kickMemberTx(data: { crewId: string; targetPlayerId: string }): Promise<void> {
    await db.transaction(async tx => {
      const now = new Date();

      await tx.delete(crewMembers)
        .where(and(eq(crewMembers.crewId, data.crewId), eq(crewMembers.playerId, data.targetPlayerId)));

      await tx.update(crews)
        .set({ memberCount: sql`${crews.memberCount} - 1` })
        .where(eq(crews.id, data.crewId));

      await tx.update(playerProfiles)
        .set({ currentCrewId: null, updatedAt: now })
        .where(eq(playerProfiles.id, data.targetPlayerId));
    });
  }

  async renameCrewTx(data: { crewId: string; name?: string; description?: string | null }): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (data.name        !== undefined) updates.name        = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (Object.keys(updates).length === 0) return;
    await db.update(crews).set(updates as any).where(eq(crews.id, data.crewId));
  }

  async regenerateCrewInviteTx(data: { crewId: string; inviteCode: string }): Promise<void> {
    await db.update(crews)
      .set({ inviteCode: data.inviteCode })
      .where(eq(crews.id, data.crewId));
  }

  async getChatMessages(crewId: string, before?: Date, limit = 50): Promise<CrewChatRow[]> {
    const cond = before
      ? and(eq(crewChatMessages.crewId, crewId), lt(crewChatMessages.createdAt, before))
      : eq(crewChatMessages.crewId, crewId);

    const rows = await db
      .select({
        id:          crewChatMessages.id,
        playerId:    crewChatMessages.playerId,
        playerName:  playerProfiles.displayName,
        avatarId:    playerProfiles.avatarId,
        message:     crewChatMessages.message,
        createdAt:   crewChatMessages.createdAt,
      })
      .from(crewChatMessages)
      .innerJoin(playerProfiles, eq(crewChatMessages.playerId, playerProfiles.id))
      .where(cond)
      .orderBy(desc(crewChatMessages.createdAt))
      .limit(limit);

    // Also look up member role for each message author
    const memberRows = await db
      .select({ playerId: crewMembers.playerId, role: crewMembers.role })
      .from(crewMembers)
      .where(eq(crewMembers.crewId, crewId));
    const roleMap = new Map(memberRows.map(r => [r.playerId, r.role]));

    return rows.reverse().map(r => ({
      id:         r.id,
      playerId:   r.playerId,
      playerName: r.playerName,
      avatarId:   r.avatarId ?? null,
      role:       roleMap.get(r.playerId) ?? "member",
      message:    r.message,
      createdAt:  r.createdAt!,
    }));
  }

  async sendChatMessage(crewId: string, playerId: string, message: string): Promise<{ id: string; createdAt: Date }> {
    const id  = randomUUID();
    const now = new Date();
    await db.insert(crewChatMessages).values({ id, crewId, playerId, message, createdAt: now });
    return { id, createdAt: now };
  }

  async incrementCrewMemberChipsWon(playerId: string, chipsWon: number): Promise<void> {
    if (chipsWon <= 0) return;
    await db.update(crewMembers)
      .set({ totalChipsWon: sql`${crewMembers.totalChipsWon} + ${chipsWon}` })
      .where(eq(crewMembers.playerId, playerId));
  }

  async logCrewEvent(data: {
    crewId: string; playerId: string; eventType: string; eventData?: Record<string, unknown>;
  }): Promise<void> {
    await db.insert(crewEvents).values({
      id:         randomUUID(),
      crewId:     data.crewId,
      playerId:   data.playerId,
      eventType:  data.eventType,
      eventData:  data.eventData ?? {},
      occurredAt: new Date(),
    });
  }

  // ── Time Bank ───────────────────────────────────────────────────────────────

  async debitChipsForBuyin(playerId: string, amount: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);
      if (!rows[0] || rows[0].chipBalance < amount) return false;
      const before = rows[0].chipBalance;
      const after  = before - amount;
      await tx
        .update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} - ${amount}`, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));
      await this._insertChipLedger(tx, {
        playerId,
        beforeBalance: before,
        amountChange:  -amount,
        afterBalance:  after,
        reason:        'buy_in',
        source:        'gameEngine',
      });
      return true;
    });
  }

  // ── Public chip ledger methods ─────────────────────────────────────────────

  // recordChipTransaction: public entry point for callers outside the storage
  // class that need to write a ledger row (e.g., admin tools).  Starts its own
  // transaction so the insert is always atomic.
  async recordChipTransaction(params: {
    playerId:      string;
    beforeBalance: number;
    amountChange:  number;
    afterBalance:  number;
    reason:        ChipTxReason;
    source:        string;
    gameId?:       string | null;
    handId?:       string | null;
    metadata?:     Record<string, any> | null;
  }): Promise<void> {
    await db.transaction(async (tx) => {
      await this._insertChipLedger(tx, params);
    });
  }

  // verifyPlayerBalanceConsistency: forensic tool — read-only, no mutations.
  // Computes the sum of all ledger entries and compares it to the live DB
  // balance.  A drift of 0 means the ledger is complete and correct.
  //
  // Note: players created BEFORE this ledger was deployed will have no ledger
  // entries, so computedBalance will be 0 and drift = currentBalance.  That is
  // expected and correct — it means "no ledger coverage before deployment."
  // Players created AFTER this deployment start with a genesis entry
  // (amountChange=25000, source='genesis') so their computed balance is exact.
  async verifyPlayerBalanceConsistency(playerId: string): Promise<{
    consistent:      boolean;
    currentBalance:  number;
    computedBalance: number;
    drift:           number;
  }> {
    const [playerRow, sumRow] = await Promise.all([
      db.select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1),
      db.select({ total: sql<string>`COALESCE(SUM(${chipTransactions.amountChange}), 0)` })
        .from(chipTransactions)
        .where(eq(chipTransactions.playerId, playerId)),
    ]);

    const currentBalance  = playerRow[0]?.chipBalance ?? 0;
    const computedBalance = Number(sumRow[0]?.total ?? 0);
    const drift           = currentBalance - computedBalance;

    return {
      consistent: drift === 0,
      currentBalance,
      computedBalance,
      drift,
    };
  }

  async getTimeBankStatus(playerId: string): Promise<{ freeRemaining: number; purchased: number; tier: string | null }> {
    const rows = await db
      .select({
        freeRemaining: playerProfiles.timeBankFreeUsesRemaining,
        purchased: playerProfiles.timeBankPurchasedUses,
        tier: playerProfiles.activeSubscriptionTier,
      })
      .from(playerProfiles)
      .where(eq(playerProfiles.id, playerId))
      .limit(1);
    if (!rows[0]) return { freeRemaining: 0, purchased: 0, tier: null };
    return {
      freeRemaining: rows[0].freeRemaining,
      purchased:     rows[0].purchased,
      tier:          rows[0].tier ?? null,
    };
  }

  async consumeTimeBankSlot(
    playerId: string,
    source: 'free' | 'subscription' | 'purchased',
    tableId?: string,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (source === 'free') {
        await tx
          .update(playerProfiles)
          .set({
            timeBankFreeUsesRemaining: sql`GREATEST(0, ${playerProfiles.timeBankFreeUsesRemaining} - 1)`,
            updatedAt: new Date(),
          })
          .where(eq(playerProfiles.id, playerId));
      } else if (source === 'purchased') {
        await tx
          .update(playerProfiles)
          .set({
            timeBankPurchasedUses: sql`GREATEST(0, ${playerProfiles.timeBankPurchasedUses} - 1)`,
            updatedAt: new Date(),
          })
          .where(eq(playerProfiles.id, playerId));
      }
      const eventType =
        source === 'free'         ? 'used_free' :
        source === 'purchased'    ? 'used_purchased' :
                                    'used_subscription';
      await tx.insert(timeBankEvents).values({ playerId, eventType, tableId });
    });
  }

  async purchaseTimeBankUses(
    playerId: string,
    quantity: number,
  ): Promise<{ success: boolean; newStripes: number; newPurchasedUses: number }> {
    const cost = quantity * 25;
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          stripes:   playerProfiles.stripes,
          purchased: playerProfiles.timeBankPurchasedUses,
        })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);
      if (!rows[0] || rows[0].stripes < cost) {
        return { success: false, newStripes: rows[0]?.stripes ?? 0, newPurchasedUses: rows[0]?.purchased ?? 0 };
      }
      const newStripes       = rows[0].stripes   - cost;
      const newPurchasedUses = rows[0].purchased + quantity;
      await tx
        .update(playerProfiles)
        .set({ stripes: newStripes, timeBankPurchasedUses: newPurchasedUses, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));
      await tx.insert(stripeTransactions).values({
        playerId, amount: -cost, reason: 'time_bank:purchase', balanceAfter: newStripes,
      });
      await tx.insert(timeBankEvents).values({
        playerId, eventType: 'purchased', stripesCost: cost,
      });
      return { success: true, newStripes, newPurchasedUses };
    });
  }

  // ── Blocked Players ─────────────────────────────────────────────────────────

  async blockPlayer(blockerId: string, blockedId: string): Promise<BlockedPlayer> {
    if (blockerId === blockedId) {
      throw new Error('Cannot block yourself.');
    }
    // Check for existing row first to satisfy idempotent semantics.
    const existing = await db
      .select()
      .from(blockedPlayers)
      .where(and(
        eq(blockedPlayers.blockerId, blockerId),
        eq(blockedPlayers.blockedId, blockedId),
      ))
      .limit(1);
    if (existing[0]) return existing[0];

    const rows = await db
      .insert(blockedPlayers)
      .values({ blockerId, blockedId })
      .onConflictDoNothing()
      .returning();
    if (rows[0]) return rows[0];

    // Concurrent insert won the race — re-fetch.
    const refetch = await db
      .select()
      .from(blockedPlayers)
      .where(and(
        eq(blockedPlayers.blockerId, blockerId),
        eq(blockedPlayers.blockedId, blockedId),
      ))
      .limit(1);
    return refetch[0]!;
  }

  async unblockPlayer(blockerId: string, blockedId: string): Promise<boolean> {
    const deleted = await db
      .delete(blockedPlayers)
      .where(and(
        eq(blockedPlayers.blockerId, blockerId),
        eq(blockedPlayers.blockedId, blockedId),
      ))
      .returning({ id: blockedPlayers.id });
    return deleted.length > 0;
  }

  async getBlockedPlayers(blockerId: string): Promise<Array<{ id: string; displayName: string }>> {
    return db
      .select({ id: playerProfiles.id, displayName: playerProfiles.displayName })
      .from(blockedPlayers)
      .innerJoin(playerProfiles, eq(blockedPlayers.blockedId, playerProfiles.id))
      .where(eq(blockedPlayers.blockerId, blockerId));
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const rows = await db
      .select({ id: blockedPlayers.id })
      .from(blockedPlayers)
      .where(and(
        eq(blockedPlayers.blockerId, blockerId),
        eq(blockedPlayers.blockedId, blockedId),
      ))
      .limit(1);
    return rows.length > 0;
  }

  // ── Player Reports ──────────────────────────────────────────────────────────

  async createReport(reporterId: string, reportedId: string, reason: string, context: string | null, contextType: string | null, notes: string | null): Promise<PlayerReport> {
    if (reporterId === reportedId) throw new Error('Cannot report yourself.');
    const rows = await db
      .insert(playerReports)
      .values({ reporterId, reportedId, reason, context, contextType, notes })
      .returning();
    return rows[0]!;
  }

  async getReportsByReporter(reporterId: string, limit = 50): Promise<PlayerReport[]> {
    return db
      .select()
      .from(playerReports)
      .where(eq(playerReports.reporterId, reporterId))
      .orderBy(desc(playerReports.createdAt))
      .limit(limit);
  }

  async getReportsAgainst(reportedId: string): Promise<PlayerReport[]> {
    return db
      .select()
      .from(playerReports)
      .where(eq(playerReports.reportedId, reportedId))
      .orderBy(desc(playerReports.createdAt));
  }

  async listPendingReports(limit: number, offset: number): Promise<Array<PlayerReport & { reporterName: string; reportedName: string }>> {
    return db
      .select({
        id:           playerReports.id,
        reporterId:   playerReports.reporterId,
        reportedId:   playerReports.reportedId,
        reason:       playerReports.reason,
        context:      playerReports.context,
        contextType:  playerReports.contextType,
        notes:        playerReports.notes,
        status:       playerReports.status,
        resolution:   playerReports.resolution,
        reviewedBy:   playerReports.reviewedBy,
        reviewedAt:   playerReports.reviewedAt,
        createdAt:    playerReports.createdAt,
        reporterName: sql<string>`(SELECT display_name FROM player_profiles WHERE id = ${playerReports.reporterId})`,
        reportedName: sql<string>`(SELECT display_name FROM player_profiles WHERE id = ${playerReports.reportedId})`,
      })
      .from(playerReports)
      .where(eq(playerReports.status, 'pending'))
      .orderBy(desc(playerReports.createdAt))
      .limit(limit)
      .offset(offset);
  }
}

export const storage = new MemStorage();
