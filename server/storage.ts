import {
  questProgress,
  type User, type InsertUser,
  type InsertAnalyticsEvent, type AnalyticsEvent,
  type PlayerProfile,
  type Session,
  type PurchaseTransaction,
  type CosmeticItem,
  type Subscription,
  type Crew,
  type ChipTxReason,
  type ChipTransaction,
  type StripeTransaction,
  type AdminAction,
  analyticsEvents, playerProfiles, stripeTransactions, sessions, playerReferrals, purchaseTransactions,
  bustRescueOffers, firstPurchaseOffers, rewardedAdSessions,
  dailyBonusClaims, cosmeticItems, playerInventory, cosmeticPurchases,
  subscriptions, subscriptionEvents,
  crews, crewMembers, crewChatMessages, crewEvents, clubChipRequests,
  timeBankEvents,
  chipTransactions,
  personalChipGifts,
  friendRequests,
  recentCoSeatedPlayers,
  blockedPlayers,
  type BlockedPlayer,
  playerReports,
  type PlayerReport,
  adminActions,
  houseRakeLogs,
  ladyluckRaceResults,
  handXpAwards,
  type LLSeatResult,
} from "@shared/schema";
import { GOOGLE_SUBSCRIPTION_PRODUCT_IDS } from "@shared/billingProducts";
import type { SubscriptionTier } from "./billing";
import { SUBSCRIPTION_PRODUCTS } from "./billing";
import { randomUUID, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { eq, ne, notLike, sql, and, or, gte, isNull, lt, lte, gt, desc, ilike, asc, inArray, notInArray } from "drizzle-orm";
import { handXP, hourlyChips, levelFromXP } from "@shared/progressionRules";
import { LEADERBOARD_LIMIT, type LeaderboardResponse } from "@shared/leaderboard";
import { applyRake } from "./utils/rake";

const scryptAsync = promisify(scrypt);
const chipSyncQueue = new Map<string, Promise<void>>();

/** Reserved internal profile: its balance is the available Lady Luck house reserve.
 * Bot profile balances are house-owned stacks held separately from this reserve. */
export const LADY_LUCK_HOUSE_ID = '__ladyluck_house__';
export const LADY_LUCK_BOT_STACK = 10_000;
const LADY_LUCK_HOUSE_SEED = 100_000_000;

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
  getLeaderboard(viewerId: string): Promise<LeaderboardResponse>;
  getPlayerByEmail(email: string): Promise<PlayerProfile | undefined>;
  setPlayerAuth(id: string, email: string, passwordHash: string): Promise<void>;
  registerPlayerAuth(data: { id: string; email: string; passwordHash: string; displayName?: string; referralCode?: string }): Promise<PlayerProfile>;
  getPlayerReferralCode(id: string): Promise<string | null>;
  setPasswordResetToken(id: string, token: string, expires: Date): Promise<void>;
  getPlayerByResetToken(token: string): Promise<PlayerProfile | undefined>;
  clearPasswordResetToken(id: string): Promise<void>;
  syncPlayerChips(id: string, sessionDelta: number, handResult?: { won: boolean; deltaChips?: number; gameId?: string | null; handId?: string | null; modeId: string; potSize: number }): Promise<void>;
  setPlayerActiveTable(id: string, tableId: string, seatId: string, modeId: string): Promise<void>;
  clearPlayerActiveTable(id: string): Promise<void>;
  getPlayerActiveTable(id: string): Promise<string | null>;
  deletePlayer(id: string): Promise<void>;
  getPlayerIsAdmin(id: string): Promise<boolean>;
  addChipsToPlayer(id: string, chips: number, opts?: { reason?: ChipTxReason; source?: string; gameId?: string | null; handId?: string | null; metadata?: Record<string, any> | null }): Promise<void>;
  fundLadyLuckBot(botId: string, tableId: string): Promise<number>;
  rebalanceLadyLuckBot(botId: string, tableId: string): Promise<number>;
  releaseLadyLuckBot(botId: string, tableId: string): Promise<void>;
  transferLadyLuckChips(fromId: string, toId: string, amount: number, source: string, tableId: string, rake?: number, handId?: string): Promise<boolean>;
  ensureLadyLuckHouse(): Promise<void>;
  settleLadyLuckPot(winnerId: string, grossPot: number, tableId: string): Promise<{ winnerPot: number; rake: number }>;
  settleLadyLuckRace(params: {
    tableId: string; raceId: string; winnerId: string; winningSuit: string; grossPot: number;
    seatedBets: { playerId: string; suit: string; amount: number }[];
    seatedPlayers: string[];
    spectatorBets: { userId: string; suit: string; amount: number }[];
  }): Promise<{ winnerPot: number; rake: number; seatedPayouts: { playerId: string; net: number }[]; spectatorPayouts: { userId: string; net: number; gross: number }[] }>;
  wasLadyLuckRaceSettled(raceId: string): Promise<boolean>;
  debitLadyLuckWager(playerId: string, amount: number, tableId: string, raceId: string): Promise<boolean>;
  getLadyLuckOpenStakes(tableId: string, raceId: string): Promise<{
    wagers: Map<string, number>; seated: Map<string, number>; spectators: Map<string, number>;
  }>;
  refundLadyLuckWager(playerId: string, amount: number, tableId: string, raceId: string): Promise<boolean>;
  refundLadyLuckSideBet(playerId: string, amount: number, tableId: string, raceId: string, spectator: boolean): Promise<boolean>;
  recordChipTransaction(params: { playerId: string; beforeBalance: number; amountChange: number; afterBalance: number; reason: ChipTxReason; source: string; gameId?: string | null; handId?: string | null; metadata?: Record<string, any> | null }): Promise<void>;
  verifyPlayerBalanceConsistency(playerId: string): Promise<{ consistent: boolean; currentBalance: number; computedBalance: number; drift: number }>;
  logHouseRake(params: { tableId: string; gameMode: string; handOrRaceId?: string | null; grossPot: number; rakeAmount: number; netPot: number }): Promise<void>;
  getRakeStats(): Promise<{ totalAllTime: number; byMode: Record<string, number>; today: number; thisWeek: number }>;
  // ── Avatar & customisation ─────────────────────────────────────────────────
  updatePlayerAvatar(id: string, avatarId: string | null): Promise<void>;
  // ── Display name change (90-day cooldown) ──────────────────────────────────
  updatePlayerDisplayName(id: string, name: string): Promise<void>;
  // ── Welcome kit ────────────────────────────────────────────────────────────
  claimWelcomeKit(id: string): Promise<{ chips: number; stripes: number }>;
  getBonusStatus(id: string): Promise<{ hourly: { available: boolean; chips: number; nextAt: string | null }; welcomeKitClaimed: boolean }>;
  claimHourlyReward(id: string): Promise<{ chips: number }>;
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
    chipsGranted?:      number;
    crewId?:            string;
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
  completePersonalChipPurchase(params: {
    purchaseTransactionId: string;
    playerId: string;
    productId: string;
    chips: number;
    orderId?: string;
  }): Promise<{ idempotent: boolean; newBalance: number }>;
  debitChipsForRefund(purchaseTransactionId: string): Promise<boolean>;
  claimPurchaseVerification(purchaseTransactionId: string, now: Date, leaseMs: number): Promise<boolean>;
  refundConsumablePurchase(purchaseTransactionId: string, playerId: string, productId: string): Promise<boolean>;
  hasPriorPaidPurchase(playerId: string): Promise<boolean>;
  issueFirstPurchaseOffer(playerId: string, now: Date, durationMs: number): Promise<{
    issuedAt: Date; expiresAt: Date; claimedAt: Date | null;
  } | null>;
  claimFirstPurchaseOffer(playerId: string, now: Date): Promise<{
    issuedAt: Date; expiresAt: Date; claimedAt: Date | null;
  } | null>;
  getFirstPurchaseOffer(playerId: string): Promise<{
    issuedAt: Date; expiresAt: Date; claimedAt: Date | null;
  } | null>;
  completeFirstPurchaseBundle(params: {
    purchaseTransactionId: string; playerId: string; productId: string;
    chips: number; stripes: number; purchaseAt: Date; orderId?: string;
  }): Promise<{ idempotent: boolean; chipBalance: number; stripesBalance: number }>;
  completeCrewChipPurchase(params: {
    purchaseTransactionId: string; playerId: string; productId: string;
    crewId: string; chips: number; orderId?: string;
  }): Promise<{ idempotent: boolean; newBankBalance: number }>;
  completeStripePurchase(params: {
    purchaseTransactionId: string; playerId: string; productId: string;
    stripes: number; source: "google_play" | "apple_appstore"; orderId?: string;
  }): Promise<{ idempotent: boolean; newBalance: number }>;
  issueBustRescueOffer(playerId: string, now: Date, durationMs: number): Promise<{
    issuedAt: Date; expiresAt: Date; claimedAt: Date | null;
  }>;
  claimBustRescueOffer(playerId: string, now: Date): Promise<{
    issuedAt: Date; expiresAt: Date; claimedAt: Date | null;
  } | null>;
  getBustRescueOffer(playerId: string): Promise<{
    issuedAt: Date; expiresAt: Date; claimedAt: Date | null;
  } | null>;
  createRewardedAdSession(params: {
    id: string; playerId: string; adUnitId: string; testMode: boolean; createdAt: Date; expiresAt: Date;
  }): Promise<void>;
  getRewardedAdSessionForSsv(id: string): Promise<{ id: string; adUnitId: string; testMode: boolean } | null>;
  getRewardedAdSession(id: string, playerId: string): Promise<{
    id: string; testMode: boolean; expiresAt: Date; completedAt: Date | null;
  } | null>;
  completeRewardedAdSession(params: {
    id: string; transactionId: string; completedAt: Date;
  }): Promise<{ completed: boolean; idempotent: boolean; playerId?: string; newBalance?: number }>;
  // ── Cosmetics ──────────────────────────────────────────────────────────────
  getCosmeticCatalog(): Promise<CosmeticItem[]>;
  getPlayerInventory(playerId: string): Promise<PlayerInventoryResult>;
  purchaseCosmetic(playerId: string, cosmeticItemId: string): Promise<PurchaseCosmeticResult>;
  equipCosmetic(playerId: string, cosmeticItemId: string): Promise<EquipResult>;
  unequipCosmetic(playerId: string, category: string): Promise<void>;
  // ── Music ──────────────────────────────────────────────────────────────────
  getMusicEquipped(playerId: string): Promise<{ lobby: string | null; game: string | null; ladyluck: string | null }>;
  setEquippedMusicTrack(playerId: string, context: 'lobby' | 'game' | 'ladyluck', trackId: string | null): Promise<void>;
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
  isCrewMember(crewId: string, playerId: string): Promise<boolean>;
  // ── Time Bank ───────────────────────────────────────────────────────────────
  debitChipsForBuyin(playerId: string, amount: number): Promise<boolean>;
  giftTableChips(params: { requestId: string; senderId: string; recipientId: string; tableId: string }): Promise<{
    replayed: boolean; senderBalance: number; recipientBalance: number;
  }>;
  getTimeBankStatus(playerId: string): Promise<{ freeRemaining: number; purchased: number; tier: string | null }>;
  consumeTimeBankSlot(playerId: string, source: 'free' | 'subscription' | 'purchased', tableId?: string): Promise<void>;
  purchaseTimeBankUses(playerId: string, quantity: number): Promise<{ success: boolean; newStripes: number; newPurchasedUses: number }>;
  // ── Blocked Players ─────────────────────────────────────────────────────────
  blockPlayer(blockerId: string, blockedId: string): Promise<BlockedPlayer>;
  unblockPlayer(blockerId: string, blockedId: string): Promise<boolean>;
  getBlockedPlayers(blockerId: string): Promise<Array<{ id: string; displayName: string }>>;
  isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
  sendFriendRequest(requesterId: string, recipientId: string): Promise<{ id: string; status: string }>;
  respondToFriendRequest(actorId: string, requestId: string, action: "accepted" | "declined"): Promise<{ id: string; status: string }>;
  getFriendRequests(playerId: string): Promise<{
    friends: Array<{ id: string; displayName: string; avatarId: string | null }>;
    received: Array<{ id: string; player: { id: string; displayName: string; avatarId: string | null } }>;
    sent: Array<{ id: string; player: { id: string; displayName: string; avatarId: string | null } }>;
    recent: Array<{ player: { id: string; displayName: string; avatarId: string | null }; lastPlayedAt: Date }>;
  }>;
  recordRecentCoSeatedPlayers(playerIds: string[]): Promise<void>;
  // ── Player Reports ──────────────────────────────────────────────────────────
  createReport(reporterId: string, reportedId: string, reason: string, context: string | null, contextType: string | null, notes: string | null): Promise<PlayerReport>;
  getReportsByReporter(reporterId: string, limit?: number): Promise<PlayerReport[]>;
  getReportsAgainst(reportedId: string): Promise<PlayerReport[]>;
  listPendingReports(limit: number, offset: number): Promise<Array<PlayerReport & { reporterName: string; reportedName: string }>>;
  // ── Admin operations ────────────────────────────────────────────────────────
  getPlayerBanStatus(id: string): Promise<BanStatus | null>;
  clearExpiredBan(playerId: string): Promise<void>;
  deletePlayerSessions(playerId: string): Promise<void>;
  listMembers(limit: number, offset: number): Promise<PlayerSearchResult[]>;
  searchPlayers(query: string): Promise<PlayerSearchResult[]>;
  getPlayerFullDetails(id: string): Promise<AdminPlayerDetails | null>;
  getPlayerChipHistory(playerId: string, limit: number, offset: number): Promise<ChipTransaction[]>;
  getPlayerStripesHistory(playerId: string, limit: number, offset: number): Promise<StripeTransaction[]>;
  getPlayerAdminActionHistory(playerId: string, limit: number, offset: number): Promise<AdminAction[]>;
  adminGrantChips(adminId: string, targetPlayerId: string, amount: number, reason: string): Promise<void>;
  adminDebitChips(adminId: string, targetPlayerId: string, amount: number, reason: string): Promise<void>;
  adminGrantStripes(adminId: string, targetPlayerId: string, amount: number, reason: string): Promise<void>;
  adminDebitStripes(adminId: string, targetPlayerId: string, amount: number, reason: string): Promise<void>;
  adminGrantCosmetic(adminId: string, targetPlayerId: string, cosmeticId: string, reason: string): Promise<void>;
  adminRevokeCosmetic(adminId: string, targetPlayerId: string, cosmeticId: string, reason: string): Promise<void>;
  adminGrantSubscription(adminId: string, targetPlayerId: string, tier: string, durationDays: number, reason: string): Promise<void>;
  adminRevokeSubscription(adminId: string, targetPlayerId: string, reason: string): Promise<void>;
  adminBanPlayer(adminId: string, targetPlayerId: string, durationDays: number | null, reason: string): Promise<void>;
  adminUnbanPlayer(adminId: string, targetPlayerId: string, reason: string): Promise<void>;
  adminDeleteAccount(adminId: string, targetPlayerId: string, reason: string): Promise<void>;
  adminTriggerPasswordReset(adminId: string, targetPlayerId: string, reason: string): Promise<{ resetToken: string }>;
  getAdminAuditLog(opts: { limit: number; offset: number; actionType?: string; adminId?: string }): Promise<AdminAuditLogEntry[]>;
  // ── Quests ─────────────────────────────────────────────────────────────────
  incrementHandsPlayed(playerId: string, modeId: string): Promise<void>;
  getClaimedQuests(playerId: string): Promise<string[]>;
  claimQuest(playerId: string, questId: string, stripesReward: number): Promise<{ newStripes: number }>;
  awardWinStripes(playerId: string): Promise<{ awarded: number; dailyTotal: number }>;
  // ── Chip loan ───────────────────────────────────────────────────────────────
  grantChipLoan(playerId: string): Promise<{ success: boolean; error?: string; newBalance?: number }>;
  repayChipLoan(playerId: string, chipsEarned: number): Promise<number>;
  // ── Club (PokerBros-style) ───────────────────────────────────────────────────
  fundClubBank(crewId: string, ownerId: string, amount: number): Promise<{ success: boolean; newBankBalance: number }>;
  addChipsToCrewBank(crewId: string, ownerId: string, amount: number): Promise<{ newBankBalance: number }>;
  distributeChips(crewId: string, agentId: string, targetPlayerId: string, amount: number): Promise<{ success: boolean; newBankBalance: number }>;
  requestChips(crewId: string, playerId: string, amount: number): Promise<{ success: boolean; requestId: number }>;
  resolveChipRequest(requestId: number, agentId: string, approve: boolean): Promise<{ success: boolean }>;
  appointAgent(crewId: string, ownerId: string, targetPlayerId: string): Promise<void>;
  removeAgent(crewId: string, ownerId: string, targetPlayerId: string): Promise<void>;
  getPublicClubs(): Promise<{ id: string; name: string; clubId: string; memberCount: number; chipBank: number; inviteCode: string }[]>;
  getClubChipRequests(crewId: string, options: { pendingOnly: boolean; playerId?: string }): Promise<{ id: number; playerId: string; playerName: string; amount: number; status: string; requestedAt: Date; resolvedAt: Date | null }[]>;
  // ── Lady Luck Race History ──────────────────────────────────────────────────
  logLadyLuckRace(params: {
    tableId: string;
    roomType: string;
    winningSuit: string;
    flippedCards: { rank: string; suit: string }[];
    seatResults: LLSeatResult[];
  }): Promise<void>;
  getLadyLuckPersonalHistory(playerId: string, limit: number): Promise<{
    id: number; tableId: string; roomType: string; winningSuit: string; playedAt: Date;
    myResult: { pickedSuit: string; wager: number; won: boolean; chipChange: number } | null;
  }[]>;
  getLadyLuckStats(): Promise<{
    queens: Record<string, number>;
    totalRaces: number;
    cards: Record<string, Record<string, number>>;
  }>;
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
  chipBank:    number;
  clubId:      string;
  isPublic:    boolean;
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

export interface BanStatus {
  isDeleted:    boolean;
  bannedAt:     Date | null;
  banExpiresAt: Date | null;
  banReason:    string | null;
}

export interface PlayerSearchResult {
  id:          string;
  displayName: string;
  email:       string | null;
  chipBalance: number;
  stripes:     number;
  isAdmin:     boolean;
  isBanned:    boolean;
  isDeleted:   boolean;
  createdAt:   Date;
}

export interface AdminPlayerDetails {
  profile:              PlayerProfile;
  recentChipHistory:    ChipTransaction[];
  recentStripesHistory: StripeTransaction[];
  recentAdminActions:   AdminAction[];
  ownedCosmetics:       CosmeticInventoryItem[];
}

export interface AdminAuditLogEntry {
  id:             string;
  adminId:        string;
  adminName:      string;
  targetPlayerId: string;
  targetName:     string;
  actionType:     string;
  reason:         string;
  beforeState:    Record<string, any> | null;
  afterState:     Record<string, any> | null;
  metadata:       Record<string, any> | null;
  createdAt:      Date;
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
  // Older catalogs can be partially seeded. Ensure this existing entitlement
  // ID has the current display name without resetting ownership or assets.
  await db.insert(cosmeticItems).values({
    id: 'frame_gold_subscription',
    category: 'subscription_exclusive',
    displayName: 'Chain Pro Frame',
    description: 'Exclusive animated gold border. Auto-equipped while Chain Pro subscription is active.',
    stripesCost: null,
    assetPath: '/cosmetics/frames/frame-gold-subscription.png',
    colorValue: null,
    active: true,
  }).onConflictDoUpdate({
    target: cosmeticItems.id,
    set: {
      displayName: 'Chain Pro Frame',
      description: 'Exclusive animated gold border. Auto-equipped while Chain Pro subscription is active.',
    },
  });
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
    { id: 'frame_gold_subscription',     category: 'subscription_exclusive', displayName: 'Chain Pro Frame',     description: 'Exclusive animated gold border. Auto-equipped while Chain Pro subscription is active.',                      stripesCost: null, assetPath: '/cosmetics/frames/frame-gold-subscription.png',         colorValue: null, active: true },
  ]).onConflictDoNothing();
}

// ─── Music track seed ─────────────────────────────────────────────────────────
// Always safe to call at startup — uses onConflictDoNothing.
export async function seedMusicTracks(): Promise<void> {
  await db.insert(cosmeticItems).values([
    // ── Free tracks (stripesCost: 0 — unlocked for all players) ──────────────
    { id: 'music_chain_gang_poker',  category: 'music', displayName: 'Chain Gang Poker',  description: 'The original Chain Gang anthem. Yours from day one.', stripesCost: 0,   assetPath: '', colorValue: null, active: true },
    { id: 'music_chain_gang_nights', category: 'music', displayName: 'Chain Gang Nights', description: 'Late-night table vibes. Free for every player.',       stripesCost: 0,   assetPath: '', colorValue: null, active: true },
    // ── Paid tracks (◆ 500 Stripes each) ─────────────────────────────────────
    { id: 'music_no_halfway',        category: 'music', displayName: 'No Halfway',        description: 'No shortcuts, no excuses. Pure fire.',                stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_borrowed_time',     category: 'music', displayName: 'Borrowed Time',     description: 'Every hand dealt is time you didn\'t earn.',           stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_the_mask',          category: 'music', displayName: 'The Mask',          description: 'Everyone\'s wearing one. What\'s yours?',             stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_prove_the_shadow',  category: 'music', displayName: 'Prove the Shadow',  description: 'Outrun the doubt. Outlast the dark.',                 stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_blood_by_choice',   category: 'music', displayName: 'Blood by Choice',   description: 'Every decision has a price.',                         stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_as_bad_as_air',     category: 'music', displayName: 'As Bad As Air',     description: 'Everywhere at once. Impossible to avoid.',            stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_before_you_judge',        category: 'music', displayName: 'Before You Judge',        description: 'Walk the road before you call it wrong.',                   stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_everything_a_test',       category: 'music', displayName: 'Everything a Test',       description: 'Stay sharp. Life keeps score.',                              stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_built_in_the_dark',       category: 'music', displayName: 'Built In The Dark',       description: 'Nobody watched. You built anyway.',                          stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_if_heaven_had_a_hallway', category: 'music', displayName: 'If Heaven Had a Hallway', description: 'A walk between worlds, between decisions.',                   stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_weight_of_my_words',      category: 'music', displayName: 'Weight of My Words',      description: 'Say what you mean. Mean what you say.',      stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_bricks_dont_lie',         category: 'music', displayName: "Bricks Don't Lie",        description: 'The foundation never forgets.',              stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_forged',                  category: 'music', displayName: 'Forged',                  description: 'Pressure makes what lasts.',                 stripesCost: 500, assetPath: '', colorValue: null, active: true },
    { id: 'music_the_war_inside',          category: 'music', displayName: 'The War Inside',           description: 'The hardest fight is the one no one sees.',  stripesCost: 500, assetPath: '', colorValue: null, active: true },
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

  async ensureLadyLuckHouse(): Promise<void> {
    await db.transaction(async tx => {
      const [created] = await tx.insert(playerProfiles).values({
        id: LADY_LUCK_HOUSE_ID, displayName: 'Lady Luck House',
        chipBalance: LADY_LUCK_HOUSE_SEED,
      }).onConflictDoNothing().returning({ id: playerProfiles.id });
      if (created) {
        // One explicit, auditable genesis faucet, never repeated on restart.
        await this._insertChipLedger(tx, {
          playerId: LADY_LUCK_HOUSE_ID, beforeBalance: 0,
          amountChange: LADY_LUCK_HOUSE_SEED, afterBalance: LADY_LUCK_HOUSE_SEED,
          reason: 'other', source: 'ladyluck_house_genesis',
        });
      }
    });
  }

  /** Atomic double-entry transfer, locking accounts in ID order. The bot's
   * stack is held in a regular chip-balance row, never minted in table state. */
  async transferLadyLuckChips(fromId: string, toId: string, amount: number, source: string, tableId: string, rake?: number, handId?: string): Promise<boolean> {
    if (!Number.isSafeInteger(amount) || amount <= 0 || fromId === toId) throw new Error('Invalid Lady Luck transfer');
    return db.transaction(async tx => {
      const accounts = await tx.select({ id: playerProfiles.id, balance: playerProfiles.chipBalance })
        .from(playerProfiles).where(inArray(playerProfiles.id, [fromId, toId]))
        .orderBy(asc(playerProfiles.id)).for('update');
      const from = accounts.find(a => a.id === fromId);
      const to = accounts.find(a => a.id === toId);
      if (!from || !to || from.balance < amount) return false;
      await tx.update(playerProfiles).set({ chipBalance: from.balance - amount, updatedAt: new Date() }).where(eq(playerProfiles.id, fromId));
      await tx.update(playerProfiles).set({ chipBalance: to.balance + amount, updatedAt: new Date() }).where(eq(playerProfiles.id, toId));
      await this._insertChipLedger(tx, { playerId: fromId, beforeBalance: from.balance, amountChange: -amount, afterBalance: from.balance - amount, reason: 'other', source, gameId: tableId, handId, metadata: { counterparty: toId, ...(rake != null ? { rake } : {}) } });
      await this._insertChipLedger(tx, { playerId: toId, beforeBalance: to.balance, amountChange: amount, afterBalance: to.balance + amount, reason: 'other', source, gameId: tableId, handId, metadata: { counterparty: fromId, ...(rake != null ? { rake } : {}) } });
      return true;
    });
  }

  async fundLadyLuckBot(botId: string, tableId: string): Promise<number> {
    if (!botId.startsWith('bot_')) throw new Error('Invalid Lady Luck bot ID');
    await this.ensureLadyLuckHouse();
    await db.transaction(async tx => {
      const [created] = await tx.insert(playerProfiles).values({
        id: botId, displayName: 'Lady Luck Bot', chipBalance: 0,
      }).onConflictDoNothing().returning({ id: playerProfiles.id });
      if (created) await this._insertChipLedger(tx, {
        playerId: botId, beforeBalance: 0, amountChange: 0, afterBalance: 0,
        reason: 'other', source: 'ladyluck_bot_genesis', gameId: tableId,
      });
    });
    return this.rebalanceLadyLuckBot(botId, tableId);
  }

  async rebalanceLadyLuckBot(botId: string, tableId: string): Promise<number> {
    const bot = await this.getPlayerProfile(botId);
    if (!bot) throw new Error('Lady Luck bot has no ledger account');
    const delta = LADY_LUCK_BOT_STACK - bot.chipBalance;
    if (delta !== 0) {
      const moved = delta > 0
        ? await this.transferLadyLuckChips(LADY_LUCK_HOUSE_ID, botId, delta, 'ladyluck_bot_rebuy', tableId)
        : await this.transferLadyLuckChips(botId, LADY_LUCK_HOUSE_ID, -delta, 'ladyluck_bot_sweep', tableId);
      if (!moved) throw new Error('Lady Luck bot stack transfer failed');
    }
    return LADY_LUCK_BOT_STACK;
  }

  async releaseLadyLuckBot(botId: string, tableId: string): Promise<void> {
    const bot = await this.getPlayerProfile(botId);
    if (bot && bot.chipBalance > 0) {
      const moved = await this.transferLadyLuckChips(botId, LADY_LUCK_HOUSE_ID, bot.chipBalance, 'ladyluck_bot_return', tableId);
      if (!moved) throw new Error('Lady Luck bot return failed');
    }
  }

  /** Commit the pot payout and house rake together so neither half can be lost. */
  async settleLadyLuckPot(winnerId: string, grossPot: number, tableId: string): Promise<{ winnerPot: number; rake: number }> {
    if (!Number.isSafeInteger(grossPot) || grossPot < 0) throw new Error('Invalid Lady Luck pot');
    await this.ensureLadyLuckHouse();
    const { winnerPot, rake } = applyRake(grossPot);
    await db.transaction(async tx => {
      const accounts = await tx.select({ id: playerProfiles.id, balance: playerProfiles.chipBalance })
        .from(playerProfiles).where(inArray(playerProfiles.id, [LADY_LUCK_HOUSE_ID, winnerId]))
        .orderBy(asc(playerProfiles.id)).for('update');
      if (!accounts.some(a => a.id === winnerId)) throw new Error('Lady Luck winner account missing');
      for (const account of accounts) {
        const amount = account.id === winnerId ? winnerPot : rake;
        if (!amount) continue;
        await tx.update(playerProfiles).set({ chipBalance: account.balance + amount, updatedAt: new Date() })
          .where(eq(playerProfiles.id, account.id));
        await this._insertChipLedger(tx, {
          playerId: account.id, beforeBalance: account.balance, amountChange: amount,
          afterBalance: account.balance + amount, reason: 'other',
          source: account.id === winnerId ? 'ladyluck_win' : 'ladyluck_main_rake',
          gameId: tableId, metadata: { grossPot },
        });
      }
    });
    return { winnerPot, rake };
  }

  async wasLadyLuckRaceSettled(raceId: string): Promise<boolean> {
    const [row] = await db.select({ id: chipTransactions.id }).from(chipTransactions)
      .where(and(eq(chipTransactions.handId, raceId), eq(chipTransactions.source, 'ladyluck_win'))).limit(1);
    return !!row;
  }

  async debitLadyLuckWager(playerId: string, amount: number, tableId: string, raceId: string): Promise<boolean> {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid Lady Luck wager');
    return db.transaction(async tx => {
      const [updated] = await tx.update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} - ${amount}`, updatedAt: new Date() })
        .where(and(eq(playerProfiles.id, playerId), gte(playerProfiles.chipBalance, amount)))
        .returning({ chipBalance: playerProfiles.chipBalance });
      if (!updated) return false;
      await this._insertChipLedger(tx, { playerId, beforeBalance: updated.chipBalance + amount,
        amountChange: -amount, afterBalance: updated.chipBalance, reason: 'buy_in',
        source: 'ladyluck_wager', gameId: tableId, handId: raceId });
      return true;
    });
  }

  /** The ledger is authoritative when a crash occurs between debit and snapshot. */
  async getLadyLuckOpenStakes(tableId: string, raceId: string): Promise<{
    wagers: Map<string, number>; seated: Map<string, number>; spectators: Map<string, number>;
  }> {
    const entries = await db.select({ playerId: chipTransactions.playerId, source: chipTransactions.source,
      change: chipTransactions.amountChange }).from(chipTransactions)
      .where(and(eq(chipTransactions.gameId, tableId), eq(chipTransactions.handId, raceId),
        inArray(chipTransactions.source, [
          'ladyluck_wager', 'ladyluck_sidebet_stake', 'ladyluck_spectator_stake',
          'ladyluck_late_wager_refund', 'ladyluck_late_sidebet_refund', 'ladyluck_late_spectator_refund',
        ])));
    const wagers = new Map<string, number>();
    const seated = new Map<string, number>();
    const spectators = new Map<string, number>();
    for (const row of entries) {
      if (row.playerId === LADY_LUCK_HOUSE_ID) continue;
      const target = row.source === 'ladyluck_wager' || row.source === 'ladyluck_late_wager_refund'
        ? wagers : row.source === 'ladyluck_sidebet_stake' || row.source === 'ladyluck_late_sidebet_refund'
          ? seated : spectators;
      target.set(row.playerId, (target.get(row.playerId) ?? 0) - row.change);
    }
    return { wagers, seated, spectators };
  }

  /** Retryable crash refund. A race-level advisory lock coordinates this with
   * settlement, and the ledger row is the idempotency record. */
  async refundLadyLuckWager(playerId: string, amount: number, tableId: string, raceId: string): Promise<boolean> {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid Lady Luck refund');
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${raceId}))`);
      const [settled] = await tx.select({ id: chipTransactions.id }).from(chipTransactions)
        .where(and(eq(chipTransactions.handId, raceId), eq(chipTransactions.source, 'ladyluck_win'))).limit(1);
      if (settled) return false;
      const [done] = await tx.select({ id: chipTransactions.id }).from(chipTransactions)
        .where(and(eq(chipTransactions.handId, raceId), eq(chipTransactions.playerId, playerId),
          eq(chipTransactions.source, 'lady_luck_crash_refund'))).limit(1);
      if (done) return true;
      const [account] = await tx.select({ balance: playerProfiles.chipBalance }).from(playerProfiles)
        .where(eq(playerProfiles.id, playerId)).for('update');
      if (!account) throw new Error('Lady Luck refund account missing');
      await tx.update(playerProfiles).set({ chipBalance: account.balance + amount, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));
      await this._insertChipLedger(tx, { playerId, beforeBalance: account.balance, amountChange: amount,
        afterBalance: account.balance + amount, reason: 'refund', source: 'lady_luck_crash_refund',
        gameId: tableId, handId: raceId });
      return true;
    });
  }

  async refundLadyLuckSideBet(playerId: string, amount: number, tableId: string, raceId: string, spectator: boolean): Promise<boolean> {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid Lady Luck side-bet refund');
    const source = spectator ? 'ladyluck_spectator_crash_refund' : 'ladyluck_sidebet_crash_refund';
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${raceId}))`);
      const [settled] = await tx.select({ id: chipTransactions.id }).from(chipTransactions)
        .where(and(eq(chipTransactions.handId, raceId), eq(chipTransactions.source, 'ladyluck_win'))).limit(1);
      if (settled) return false;
      const [done] = await tx.select({ id: chipTransactions.id }).from(chipTransactions)
        .where(and(eq(chipTransactions.handId, raceId), eq(chipTransactions.playerId, playerId),
          eq(chipTransactions.source, source))).limit(1);
      if (done) return true;
      const rows = await tx.select({ id: playerProfiles.id, balance: playerProfiles.chipBalance })
        .from(playerProfiles).where(inArray(playerProfiles.id, [LADY_LUCK_HOUSE_ID, playerId]))
        .orderBy(asc(playerProfiles.id)).for('update');
      const house = rows.find(row => row.id === LADY_LUCK_HOUSE_ID);
      const player = rows.find(row => row.id === playerId);
      if (!house || !player || house.balance < amount) throw new Error('Lady Luck refund reserve insufficient');
      for (const [account, change] of [[house, -amount], [player, amount]] as const) {
        await tx.update(playerProfiles).set({ chipBalance: account.balance + change, updatedAt: new Date() })
          .where(eq(playerProfiles.id, account.id));
        await this._insertChipLedger(tx, { playerId: account.id, beforeBalance: account.balance,
          amountChange: change, afterBalance: account.balance + change, reason: 'refund',
          source, gameId: tableId, handId: raceId, metadata: { counterparty: account.id === playerId ? LADY_LUCK_HOUSE_ID : playerId } });
      }
      return true;
    });
  }

  /** Race pot, winning side bets, and house rake settle as one ledger-backed
   * transaction. The race ID prevents a second settlement after retry/restart. */
  async settleLadyLuckRace(params: {
    tableId: string; raceId: string; winnerId: string; winningSuit: string; grossPot: number;
    seatedBets: { playerId: string; suit: string; amount: number }[];
    seatedPlayers: string[];
    spectatorBets: { userId: string; suit: string; amount: number }[];
  }): Promise<{ winnerPot: number; rake: number; seatedPayouts: { playerId: string; net: number }[]; spectatorPayouts: { userId: string; net: number; gross: number }[] }> {
    const { tableId, raceId, winnerId, winningSuit, grossPot } = params;
    if (!raceId || !Number.isSafeInteger(grossPot) || grossPot < 0) throw new Error('Invalid Lady Luck settlement');
    await this.ensureLadyLuckHouse();
    const { winnerPot, rake } = applyRake(grossPot);
    const seatedPayouts = params.seatedBets.filter(b => b.suit === winningSuit).map(b => ({
      playerId: b.playerId, gross: Math.floor(b.amount * 2.5),
    })).map(b => ({ ...b, ...applyRake(b.gross) }));
    const spectatorPayouts = params.spectatorBets.filter(b => b.suit === winningSuit).map(b => ({
      userId: b.userId, gross: Math.floor(b.amount * 2.5),
    })).map(b => ({ ...b, ...applyRake(b.gross) }));
    const recipients = [...new Set([LADY_LUCK_HOUSE_ID, winnerId, ...params.seatedPlayers,
      ...seatedPayouts.map(b => b.playerId), ...spectatorPayouts.map(b => b.userId)])];

    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${raceId}))`);
      const [done] = await tx.select({ id: chipTransactions.id }).from(chipTransactions)
        .where(and(eq(chipTransactions.handId, raceId), eq(chipTransactions.source, 'ladyluck_win'))).limit(1);
      if (done) return;
      const [refunded] = await tx.select({ id: chipTransactions.id }).from(chipTransactions)
        .where(and(eq(chipTransactions.handId, raceId), inArray(chipTransactions.source, [
          'lady_luck_crash_refund', 'ladyluck_sidebet_crash_refund', 'ladyluck_spectator_crash_refund',
        ]))).limit(1);
      if (refunded) throw new Error('Lady Luck race already refunded');
      const referralRows = params.seatedPlayers.length
        ? await tx.select({ refereeId: playerReferrals.refereePlayerId, referrerId: playerReferrals.referrerPlayerId })
            .from(playerReferrals).where(inArray(playerReferrals.refereePlayerId, params.seatedPlayers))
        : [];
      const allLockIds = [...new Set([...recipients, ...referralRows.map(row => row.referrerId)])].sort();
      const rows = await tx.select({ id: playerProfiles.id, balance: playerProfiles.chipBalance })
        .from(playerProfiles).where(inArray(playerProfiles.id, allLockIds))
        .orderBy(asc(playerProfiles.id)).for('update');
      if (recipients.some(id => !rows.some(row => row.id === id))
        || referralRows.some(referral => !rows.some(row => row.id === referral.referrerId)))
        throw new Error('Lady Luck payout account missing');
      const balances = new Map(rows.map(row => [row.id, row.balance]));
      const post = async (id: string, amount: number, source: string, metadata?: Record<string, any>) => {
        const before = balances.get(id);
        if (before == null || before + amount < 0) throw new Error('Lady Luck house reserve insufficient');
        balances.set(id, before + amount);
        await tx.update(playerProfiles).set({ chipBalance: before + amount, updatedAt: new Date() })
          .where(eq(playerProfiles.id, id));
        await this._insertChipLedger(tx, { playerId: id, beforeBalance: before, amountChange: amount,
          afterBalance: before + amount, reason: 'other', source, gameId: tableId, handId: raceId,
          metadata: metadata ?? null });
      };
      await post(LADY_LUCK_HOUSE_ID, rake, 'ladyluck_main_rake', { grossPot });
      await post(winnerId, winnerPot, 'ladyluck_win', { grossPot, winningSuit });
      for (const b of seatedPayouts) {
        await post(LADY_LUCK_HOUSE_ID, -b.winnerPot, 'ladyluck_sidebet', { counterparty: b.playerId, rake: b.rake });
        await post(b.playerId, b.winnerPot, 'ladyluck_sidebet', { counterparty: LADY_LUCK_HOUSE_ID, rake: b.rake });
      }
      for (const b of spectatorPayouts) {
        await post(LADY_LUCK_HOUSE_ID, -b.winnerPot, 'ladyluck_spectator_win', { counterparty: b.userId, rake: b.rake });
        await post(b.userId, b.winnerPot, 'ladyluck_spectator_win', { counterparty: LADY_LUCK_HOUSE_ID, rake: b.rake });
      }
      const log = async (gameMode: string, gross: number, totalRake: number) => {
        if (!totalRake) return;
        await tx.insert(houseRakeLogs).values({
          tableId, gameMode, handOrRaceId: raceId, grossPot: gross,
          rakeAmount: totalRake, netPot: gross - totalRake,
        });
      };
      await log('ladyluck', grossPot, rake);
      await log('ladyluck_sidebet', seatedPayouts.reduce((sum, b) => sum + b.gross, 0), seatedPayouts.reduce((sum, b) => sum + b.rake, 0));
      await log('spectator_sidebet', spectatorPayouts.reduce((sum, b) => sum + b.gross, 0), spectatorPayouts.reduce((sum, b) => sum + b.rake, 0));

      for (const playerId of params.seatedPlayers) {
        const inserted = await tx.insert(handXpAwards).values({
          playerId, gameId: tableId, handId: raceId, xpGranted: 0,
        }).onConflictDoNothing().returning();
        if (!inserted.length) continue;
        await tx.update(playerProfiles)
          .set({ handsPlayed: sql`${playerProfiles.handsPlayed} + 1`, updatedAt: new Date() })
          .where(eq(playerProfiles.id, playerId));
        const [profile] = await tx.select({ handsPlayed: playerProfiles.handsPlayed })
          .from(playerProfiles).where(eq(playerProfiles.id, playerId)).limit(1);
        await this._awardReferralHandRewards(tx, playerId, profile?.handsPlayed ?? 0, tableId, raceId);
      }
    });
    return {
      winnerPot, rake,
      seatedPayouts: seatedPayouts.map(b => ({ playerId: b.playerId, net: b.winnerPot })),
      spectatorPayouts: spectatorPayouts.map(b => ({ userId: b.userId, net: b.winnerPot, gross: b.gross })),
    };
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
      await this.ensureHistoricalXP(id);
      const player = existing[0].xpBackfilled
        ? existing[0] : { ...existing[0], xp: existing[0].handsPlayed * 10, xpBackfilled: true };
      // Update display name if a new one was supplied
      if (displayName && displayName !== player.displayName) {
        await db
          .update(playerProfiles)
          .set({ displayName, updatedAt: new Date() })
          .where(eq(playerProfiles.id, id));
        return { ...player, displayName };
      }
      return player;
    }

    const now = new Date();
    const profile: PlayerProfile = {
      id,
      referralCode: randomBytes(8).toString("hex").toUpperCase(),
      referredByPlayerId: null,
      displayName: displayName ?? "Guest",
      chipBalance: 25000,
      stripes: 0,
      activeTableId: null,
      activeSeatId: null,
      activeModeId: null,
      handsPlayed: 0,
      handsPlayedBadugi: 0,
      handsPlayedDead7: 0,
      handsPlayed1535: 0,
      handsPlayedSuits: 0,
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
      isAdmin:                        false,
      welcomeKitClaimed:              false,
      dailyWinStripes:                0,
      dailyWinStripesResetAt:         null,
      bannedAt:                       null,
      banExpiresAt:                   null,
      banReason:                      null,
      isDeleted:                      false,
      chipLoanBalance:                0,
      chipLoanGrantedAt:              null,
      passwordResetToken:             null,
      passwordResetExpires:           null,
      equippedLobbyTrack:             null,
      equippedGameTrack:              null,
      equippedLadyLuckTrack:          null,
      createdAt: now,
      updatedAt: now,
      xp: 0, xpWinStreak: 0, xpLossStreak: 0, xpBiggestPot: 0,
      xpBackfilled: true,
      xpBadugisWon: 0, xpModesPlayed: [], xpAchievements: [],
      lastHourlyRewardAt: null,
      lastActivityAt: null,
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
    await this.ensureHistoricalXP(id);
    const rows = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.id, id))
      .limit(1);
    return rows[0];
  }

  private async ensureHistoricalXP(id: string): Promise<void> {
    // An existing profile receives base XP exactly once, including after a
    // publish that applies schema changes without running data migrations.
    await db.update(playerProfiles).set({
      xp: sql`${playerProfiles.handsPlayed} * 10`,
      xpBackfilled: true,
    }).where(and(eq(playerProfiles.id, id), eq(playerProfiles.xpBackfilled, false)));
  }

  async getPlayerIsAdmin(id: string): Promise<boolean> {
    const rows = await db
      .select({ isAdmin: playerProfiles.isAdmin })
      .from(playerProfiles)
      .where(eq(playerProfiles.id, id))
      .limit(1);
    return rows[0]?.isAdmin === true;
  }

  async getPlayerByEmail(email: string): Promise<PlayerProfile | undefined> {
    const rows = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.email, email))
      .limit(1);
    if (!rows[0]) return undefined;
    if (!rows[0].xpBackfilled) {
      await this.ensureHistoricalXP(rows[0].id);
      return { ...rows[0], xp: rows[0].handsPlayed * 10, xpBackfilled: true };
    }
    return rows[0];
  }

  async setPlayerAuth(id: string, email: string, passwordHash: string): Promise<void> {
    await db
      .update(playerProfiles)
      .set({ email, passwordHash, updatedAt: new Date() })
      .where(eq(playerProfiles.id, id));
  }

  async registerPlayerAuth(data: {
    id: string; email: string; passwordHash: string; displayName?: string; referralCode?: string;
  }): Promise<PlayerProfile> {
    return db.transaction(async tx => {
      const [referee] = await tx.select().from(playerProfiles)
        .where(eq(playerProfiles.id, data.id)).limit(1).for("update");
      if (!referee) throw Object.assign(new Error("Player not found"), { code: "NOT_FOUND" });
      if (referee.email || referee.passwordHash)
        throw Object.assign(new Error("This player already has an account"), { code: "ACCOUNT_EXISTS" });
      let inviterId: string | null = null;
      const code = data.referralCode?.trim().toUpperCase();
      if (code) {
        if (referee.handsPlayed > 0)
          throw Object.assign(new Error("Invite codes can only be applied before playing a hand"), { code: "REFERRAL_TOO_LATE" });
        const [playerInviter] = await tx.select({ id: playerProfiles.id })
          .from(playerProfiles)
          .where(and(eq(playerProfiles.referralCode, code), eq(playerProfiles.isDeleted, false)))
          .limit(1);
        if (playerInviter) {
          inviterId = playerInviter.id;
        } else {
          const [crewInviter] = await tx.select({ captainId: crews.captainId })
            .from(crews)
            .where(and(eq(crews.inviteCode, code), isNull(crews.disbandedAt)))
            .limit(1);
          inviterId = crewInviter?.captainId ?? null;
        }
        if (!inviterId)
          throw Object.assign(new Error("Invite code is not valid"), { code: "REFERRAL_INVALID" });
        if (inviterId === data.id)
          throw Object.assign(new Error("You cannot use your own invite code"), { code: "REFERRAL_SELF" });
        const [inviter] = await tx.select({ id: playerProfiles.id, isDeleted: playerProfiles.isDeleted })
          .from(playerProfiles).where(eq(playerProfiles.id, inviterId)).limit(1);
        if (!inviter || inviter.isDeleted)
          throw Object.assign(new Error("Invite code is not valid"), { code: "REFERRAL_INVALID" });
      }

      const [registered] = await tx.update(playerProfiles).set({
        email: data.email,
        passwordHash: data.passwordHash,
        ...(data.displayName ? { displayName: data.displayName } : {}),
        ...(inviterId ? { referredByPlayerId: inviterId } : {}),
        updatedAt: new Date(),
      }).where(eq(playerProfiles.id, data.id)).returning();

      if (inviterId) {
        await tx.insert(playerReferrals).values({
          referrerPlayerId: inviterId,
          refereePlayerId: data.id,
          codeUsed: code!,
        });
      }
      return registered;
    });
  }

  async getPlayerReferralCode(id: string): Promise<string | null> {
    const [profile] = await db.select({ referralCode: playerProfiles.referralCode })
      .from(playerProfiles).where(eq(playerProfiles.id, id)).limit(1);
    return profile?.referralCode ?? null;
  }

  async setPasswordResetToken(id: string, token: string, expires: Date): Promise<void> {
    await db
      .update(playerProfiles)
      .set({ passwordResetToken: token, passwordResetExpires: expires, updatedAt: new Date() })
      .where(eq(playerProfiles.id, id));
  }

  async getPlayerByResetToken(token: string): Promise<PlayerProfile | undefined> {
    const rows = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.passwordResetToken, token))
      .limit(1);
    return rows[0];
  }

  async clearPasswordResetToken(id: string): Promise<void> {
    await db
      .update(playerProfiles)
      .set({ passwordResetToken: null, passwordResetExpires: null, updatedAt: new Date() })
      .where(eq(playerProfiles.id, id));
  }

  async syncPlayerChips(id: string, sessionDelta: number, handResult?: { won: boolean; deltaChips?: number; gameId?: string | null; handId?: string | null; modeId: string; potSize: number }): Promise<void> {
    await this.ensureHistoricalXP(id);
    const preceding = chipSyncQueue.get(id) ?? Promise.resolve();
    const task = preceding.catch(() => {}).then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          await this._syncPlayerChipsOnce(id, sessionDelta, handResult);
          return;
        } catch (err) {
          if (attempt >= 2) throw err;
          await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
        }
      }
    });
    chipSyncQueue.set(id, task);
    void task.finally(() => { if (chipSyncQueue.get(id) === task) chipSyncQueue.delete(id); }).catch(() => {});
    return task;
  }

  private async _syncPlayerChipsOnce(id: string, sessionDelta: number, handResult?: { won: boolean; deltaChips?: number; gameId?: string | null; handId?: string | null; modeId: string; potSize: number }): Promise<void> {
    await db.transaction(async (tx) => {
      // Lock the referee and referrer in one global order. This keeps two
      // reciprocal hand-settlement transactions from deadlocking while one
      // grants the other's delayed referral payout.
      const [attribution] = handResult
        ? await tx.select({ referrerPlayerId: playerReferrals.referrerPlayerId })
            .from(playerReferrals).where(eq(playerReferrals.refereePlayerId, id)).limit(1)
        : [];
      const profileIds = [...new Set([id, ...(attribution ? [attribution.referrerPlayerId] : [])])].sort();
      const profiles = await tx.select().from(playerProfiles)
        .where(inArray(playerProfiles.id, profileIds)).orderBy(asc(playerProfiles.id)).for("update");
      const profile = profiles.find(row => row.id === id);
      if (!profile) throw new Error("Player not found");
      if (handResult) {
        if (!handResult.gameId || !handResult.handId) throw new Error("Hand identity required");
        const inserted = await tx.insert(handXpAwards).values({
          playerId: id, gameId: handResult.gameId, handId: handResult.handId, xpGranted: 0,
        }).onConflictDoNothing().returning();
        if (!inserted.length) return;
      }
      const before = profile.chipBalance;
      const after  = before + sessionDelta;

      if (handResult) {
        const [activeSub] = await tx.select({ tier: subscriptions.tier })
          .from(subscriptions)
          .where(and(eq(subscriptions.playerId, id),
            inArray(subscriptions.status, ["active", "in_grace_period", "canceled"]),
            gt(subscriptions.expiresAt, new Date())))
          .orderBy(asc(subscriptions.tier)).limit(1);
        const { next, gained } = handXP({
          handsPlayed: profile.handsPlayed, handsWon: profile.handsWon,
          winStreak: profile.xpWinStreak, lossStreak: profile.xpLossStreak,
          biggestPot: profile.xpBiggestPot, badugisWon: profile.xpBadugisWon,
          modesPlayed: profile.xpModesPlayed, achievements: profile.xpAchievements,
        }, { won: handResult.won, modeId: handResult.modeId, potSize: handResult.potSize },
        activeSub?.tier ?? null);
        await tx.update(handXpAwards).set({ xpGranted: gained }).where(and(
          eq(handXpAwards.playerId, id), eq(handXpAwards.gameId, handResult.gameId!), eq(handXpAwards.handId, handResult.handId!),
        ));
        const modeCounter =
          handResult.modeId === "badugi" ? { handsPlayedBadugi: sql`${playerProfiles.handsPlayedBadugi} + 1` } :
          handResult.modeId === "dead7" ? { handsPlayedDead7: sql`${playerProfiles.handsPlayedDead7} + 1` } :
          (handResult.modeId === "1535" || handResult.modeId === "fifteen35") ? { handsPlayed1535: sql`${playerProfiles.handsPlayed1535} + 1` } :
          (handResult.modeId === "suits" || handResult.modeId === "suitspoker") ? { handsPlayedSuits: sql`${playerProfiles.handsPlayedSuits} + 1` } : {};
        await tx
          .update(playerProfiles)
          .set({
            ...modeCounter,
            chipBalance: sql`${playerProfiles.chipBalance} + ${sessionDelta}`,
            updatedAt: new Date(),
            handsPlayed: next.handsPlayed, handsWon: next.handsWon,
            xp: sql`${playerProfiles.xp} + ${gained}`,
            xpWinStreak: next.winStreak, xpLossStreak: next.lossStreak,
            xpBiggestPot: next.biggestPot, xpBadugisWon: next.badugisWon,
            xpModesPlayed: next.modesPlayed, xpAchievements: next.achievements,
            lifetimeProfit: handResult.deltaChips != null
              ? sql`${playerProfiles.lifetimeProfit} + ${handResult.deltaChips}`
              : playerProfiles.lifetimeProfit,
          })
          .where(eq(playerProfiles.id, id));
      } else {
        await tx
          .update(playerProfiles)
          .set({ chipBalance: sql`${playerProfiles.chipBalance} + ${sessionDelta}`, updatedAt: new Date() })
          .where(eq(playerProfiles.id, id));
      }

      await this._insertChipLedger(tx, {
        playerId:      id,
        beforeBalance: before,
        amountChange:  sessionDelta,
        afterBalance:  after,
        reason:        handResult ? 'hand_win' : 'other',
        source:        handResult ? 'gameEngine' : 'syncOnDisconnect',
        gameId:        handResult?.gameId ?? null,
        handId:        handResult?.handId ?? null,
      });

      if (handResult) {
        const [nextProfile] = await tx.select({ handsPlayed: playerProfiles.handsPlayed })
          .from(playerProfiles).where(eq(playerProfiles.id, id)).limit(1);
        await this._awardReferralHandRewards(tx, id, nextProfile?.handsPlayed ?? 0, handResult.gameId!, handResult.handId!);
      }
    });
  }

  private async _awardReferralHandRewards(
    tx: any,
    refereeId: string,
    handsPlayed: number,
    gameId: string,
    handId: string,
  ): Promise<void> {
    const [referral] = await tx.select().from(playerReferrals)
      .where(eq(playerReferrals.refereePlayerId, refereeId)).limit(1).for("update");
    if (!referral) return;

    const refereeDue = !referral.refereeRewardedAt && handsPlayed >= 1;
    const referrerDue = !referral.referrerRewardedAt && handsPlayed >= 10;
    if (!refereeDue && !referrerDue) return;

    const recipientIds = [
      ...(refereeDue ? [{ id: refereeId, role: "referee" }] : []),
      ...(referrerDue ? [{ id: referral.referrerPlayerId, role: "referrer" }] : []),
    ];
    for (const recipient of recipientIds) {
      const [profile] = await tx.select().from(playerProfiles).where(eq(playerProfiles.id, recipient.id)).limit(1);
      if (!profile) throw new Error("Referral reward account is missing");
      const chips = 2500;
      const stripes = 100;
      const afterBalance = profile.chipBalance + chips;
      const afterStripes = profile.stripes + stripes;
      await tx.update(playerProfiles).set({
        chipBalance: afterBalance,
        stripes: afterStripes,
        updatedAt: new Date(),
      }).where(eq(playerProfiles.id, recipient.id));
      await this._insertChipLedger(tx, {
        playerId: recipient.id,
        beforeBalance: profile.chipBalance,
        amountChange: chips,
        afterBalance,
        reason: "other",
        source: "referral_reward",
        gameId,
        handId,
        metadata: { referralId: referral.id, role: recipient.role, refereeId, handsPlayed },
      });
      await tx.insert(stripeTransactions).values({
        playerId: recipient.id,
        amount: stripes,
        reason: `referral_reward:${recipient.role}:${referral.id}`,
        balanceAfter: afterStripes,
      });
    }
    await tx.update(playerReferrals).set({
      ...(refereeDue ? { refereeRewardedAt: new Date() } : {}),
      ...(referrerDue ? { referrerRewardedAt: new Date() } : {}),
    }).where(eq(playerReferrals.id, referral.id));
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

  async getPlayerActiveTable(id: string): Promise<string | null> {
    const rows = await db
      .select({ activeTableId: playerProfiles.activeTableId })
      .from(playerProfiles)
      .where(eq(playerProfiles.id, id))
      .limit(1);
    return rows[0]?.activeTableId ?? null;
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

  // ── House Rake ─────────────────────────────────────────────────────────────

  async logHouseRake(params: {
    tableId: string;
    gameMode: string;
    handOrRaceId?: string | null;
    grossPot: number;
    rakeAmount: number;
    netPot: number;
  }): Promise<void> {
    await db.insert(houseRakeLogs).values({
      tableId:      params.tableId,
      gameMode:     params.gameMode,
      handOrRaceId: params.handOrRaceId ?? null,
      grossPot:     params.grossPot,
      rakeAmount:   params.rakeAmount,
      netPot:       params.netPot,
    });
  }

  async getRakeStats(): Promise<{ totalAllTime: number; byMode: Record<string, number>; today: number; thisWeek: number }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [totalRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${houseRakeLogs.rakeAmount}), 0)` })
      .from(houseRakeLogs);

    const [todayRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${houseRakeLogs.rakeAmount}), 0)` })
      .from(houseRakeLogs)
      .where(gte(houseRakeLogs.createdAt, todayStart));

    const [weekRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${houseRakeLogs.rakeAmount}), 0)` })
      .from(houseRakeLogs)
      .where(gte(houseRakeLogs.createdAt, weekStart));

    const modeRows = await db
      .select({
        mode:  houseRakeLogs.gameMode,
        total: sql<string>`COALESCE(SUM(${houseRakeLogs.rakeAmount}), 0)`,
      })
      .from(houseRakeLogs)
      .groupBy(houseRakeLogs.gameMode);

    const byMode: Record<string, number> = {};
    for (const row of modeRows) {
      byMode[row.mode] = Number(row.total);
    }

    return {
      totalAllTime: Number(totalRow?.total ?? 0),
      byMode,
      today:    Number(todayRow?.total ?? 0),
      thisWeek: Number(weekRow?.total  ?? 0),
    };
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

  // ── Welcome kit ────────────────────────────────────────────────────────────

  async claimWelcomeKit(id: string): Promise<{ chips: number; stripes: number }> {
    await this.ensureHistoricalXP(id);
    return db.transaction(async tx => {
      const [p] = await tx.select().from(playerProfiles).where(eq(playerProfiles.id, id)).for("update");
      if (!p) throw Object.assign(new Error("Player not found"), { code: "NOT_FOUND" });
      if (p.welcomeKitClaimed) throw Object.assign(new Error("Already claimed"), { code: "ALREADY_CLAIMED" });
      await tx.update(playerProfiles).set({
        welcomeKitClaimed: true, chipBalance: p.chipBalance + 2500,
        stripes: p.stripes + 250, updatedAt: new Date(),
      }).where(eq(playerProfiles.id, id));
      await tx.insert(stripeTransactions).values({ playerId: id, amount: 250, reason: "welcome_kit", balanceAfter: p.stripes + 250 });
      await this._insertChipLedger(tx, { playerId: id, beforeBalance: p.chipBalance, amountChange: 2500, afterBalance: p.chipBalance + 2500, reason: "other", source: "welcomeKit" });
      return { chips: 2500, stripes: 250 };
    });
  }

  async getBonusStatus(id: string) {
    const p = await this.getPlayerProfile(id);
    if (!p) throw Object.assign(new Error("Player not found"), { code: "NOT_FOUND" });
    const now = new Date();
    const nextAt = p.lastHourlyRewardAt ? new Date(p.lastHourlyRewardAt.getTime() + 3600000) : null;
    return {
      hourly: { available: !nextAt || now >= nextAt, chips: hourlyChips(levelFromXP(p.xp)), nextAt: nextAt?.toISOString() ?? null },
      welcomeKitClaimed: p.welcomeKitClaimed,
    };
  }

  async claimHourlyReward(id: string) {
    await this.ensureHistoricalXP(id);
    return db.transaction(async tx => {
      const [p] = await tx.select().from(playerProfiles).where(eq(playerProfiles.id, id)).for("update");
      if (!p) throw Object.assign(new Error("Player not found"), { code: "NOT_FOUND" });
      const now = new Date();
      if (p.lastHourlyRewardAt && now.getTime() - p.lastHourlyRewardAt.getTime() < 3600000)
        throw Object.assign(new Error("Hourly reward on cooldown"), { code: "ALREADY_CLAIMED" });
      const chips = hourlyChips(levelFromXP(p.xp));
      await tx.update(playerProfiles).set({ chipBalance: p.chipBalance + chips, lastHourlyRewardAt: now, updatedAt: now }).where(eq(playerProfiles.id, id));
      await this._insertChipLedger(tx, { playerId: id, beforeBalance: p.chipBalance, amountChange: chips, afterBalance: p.chipBalance + chips, reason: "other", source: "hourlyReward" });
      return { chips };
    });
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
    chipsGranted?:       number;
    crewId?:             string;
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
      chipsGranted:       data.chipsGranted ?? 0,
      crewId:             data.crewId ?? null,
      verificationLeaseUntil: null,
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
        verificationLeaseUntil: null,
        ...(googleOrderId !== undefined ? { googleOrderId } : {}),
        ...(verifiedAt    !== undefined ? { verifiedAt    } : {}),
      })
      .where(eq(purchaseTransactions.id, id));
  }

  async claimPurchaseVerification(
    purchaseTransactionId: string,
    now: Date,
    leaseMs: number,
  ): Promise<boolean> {
    const [claimed] = await db.update(purchaseTransactions)
      .set({
        verificationStatus: "pending",
        verificationLeaseUntil: new Date(now.getTime() + leaseMs),
      })
      .where(and(
        eq(purchaseTransactions.id, purchaseTransactionId),
        inArray(purchaseTransactions.verificationStatus, ["pending", "failed_retryable"]),
        or(isNull(purchaseTransactions.verificationLeaseUntil), lte(purchaseTransactions.verificationLeaseUntil, now)),
      ))
      .returning({ id: purchaseTransactions.id });
    return !!claimed;
  }

  async completeStripePurchase(params: {
    purchaseTransactionId: string;
    playerId: string;
    productId: string;
    stripes: number;
    source: "google_play" | "apple_appstore";
    orderId?: string;
  }): Promise<{ idempotent: boolean; newBalance: number }> {
    return db.transaction(async (tx) => {
      const [purchase] = await tx.select().from(purchaseTransactions)
        .where(eq(purchaseTransactions.id, params.purchaseTransactionId)).for("update");
      if (!purchase || purchase.playerId !== params.playerId || purchase.productId !== params.productId) {
        throw new Error("Stripe purchase transaction binding mismatch");
      }
      if (purchase.verificationStatus === "verified") {
        const [profile] = await tx.select({ stripes: playerProfiles.stripes })
          .from(playerProfiles).where(eq(playerProfiles.id, params.playerId)).limit(1);
        return { idempotent: true, newBalance: profile?.stripes ?? 0 };
      }
      if (purchase.verificationStatus !== "pending") {
        throw new Error(`Stripe purchase cannot be completed from ${purchase.verificationStatus}`);
      }
      const [profile] = await tx.select({ chipBalance: playerProfiles.chipBalance, stripes: playerProfiles.stripes })
        .from(playerProfiles).where(eq(playerProfiles.id, params.playerId)).for("update");
      if (!profile) throw new Error("Player profile not found for Stripe purchase");
      const newBalance = profile.stripes + params.stripes;
      const now = new Date();
      await tx.update(playerProfiles).set({ stripes: newBalance, updatedAt: now })
        .where(eq(playerProfiles.id, params.playerId));
      await tx.insert(stripeTransactions).values({
        playerId: params.playerId,
        amount: params.stripes,
        reason: `purchase:${params.productId}`,
        balanceAfter: newBalance,
      });
      await this._insertChipLedger(tx, {
        playerId: params.playerId,
        beforeBalance: profile.chipBalance,
        amountChange: 0,
        afterBalance: profile.chipBalance,
        reason: "iap_purchase",
        source: params.source,
        metadata: { productId: params.productId, purchaseTransactionId: purchase.id },
      });
      await tx.update(purchaseTransactions).set({
        verificationStatus: "verified",
        stripesGranted: params.stripes,
        verificationLeaseUntil: null,
        ...(params.orderId ? { googleOrderId: params.orderId } : {}),
        verifiedAt: now,
      }).where(eq(purchaseTransactions.id, purchase.id));
      return { idempotent: false, newBalance };
    });
  }

  async refundConsumablePurchase(
    purchaseTransactionId: string,
    playerId: string,
    productId: string,
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [purchase] = await tx.select().from(purchaseTransactions)
        .where(eq(purchaseTransactions.id, purchaseTransactionId)).for("update");
      if (!purchase || purchase.playerId !== playerId || purchase.productId !== productId) {
        throw new Error("Refund purchase transaction binding mismatch");
      }
      if (purchase.verificationStatus === "refunded") return false;
      if (purchase.verificationStatus !== "verified") {
        if (purchase.verificationStatus === "pending" || purchase.verificationStatus === "failed_retryable") {
          await tx.update(purchaseTransactions).set({
            verificationStatus: "refunded",
            verificationLeaseUntil: null,
          }).where(eq(purchaseTransactions.id, purchase.id));
          return true;
        }
        return false;
      }
      if (purchase.crewId && purchase.chipsGranted > 0) {
        const [crew] = await tx.select({ chipBank: crews.chipBank })
          .from(crews).where(eq(crews.id, purchase.crewId)).for("update");
        if (crew) {
          await tx.update(crews).set({
            chipBank: Math.max(0, crew.chipBank - purchase.chipsGranted),
          }).where(eq(crews.id, purchase.crewId));
        }
        await tx.update(purchaseTransactions).set({
          verificationStatus: "refunded",
          verificationLeaseUntil: null,
        }).where(eq(purchaseTransactions.id, purchase.id));
        return true;
      }
      const [profile] = await tx.select({
        chipBalance: playerProfiles.chipBalance,
        stripes: playerProfiles.stripes,
      }).from(playerProfiles).where(eq(playerProfiles.id, playerId)).for("update");
      if (!profile) {
        await tx.update(purchaseTransactions).set({
          verificationStatus: "refunded",
          verificationLeaseUntil: null,
        }).where(eq(purchaseTransactions.id, purchase.id));
        return true;
      }
      const chipsDebit = Math.min(purchase.chipsGranted, profile.chipBalance);
      const stripesDebit = Math.min(purchase.stripesGranted, profile.stripes);
      const chipBalance = profile.chipBalance - chipsDebit;
      const stripesBalance = profile.stripes - stripesDebit;
      await tx.update(playerProfiles).set({
        chipBalance,
        stripes: stripesBalance,
        updatedAt: new Date(),
      }).where(eq(playerProfiles.id, playerId));
      if (purchase.chipsGranted > 0) {
        await this._insertChipLedger(tx, {
          playerId,
          beforeBalance: profile.chipBalance,
          amountChange: -chipsDebit,
          afterBalance: chipBalance,
          reason: "refund",
          source: "personal_chip_purchase_refund",
          metadata: { productId, purchaseTransactionId: purchase.id },
        });
      }
      if (purchase.stripesGranted > 0) {
        await tx.insert(stripeTransactions).values({
          playerId,
          amount: -stripesDebit,
          reason: `refund:${purchase.id}`,
          balanceAfter: stripesBalance,
        });
      }
      await tx.update(purchaseTransactions).set({
        verificationStatus: "refunded",
        verificationLeaseUntil: null,
      }).where(eq(purchaseTransactions.id, purchase.id));
      return true;
    });
  }

  async completePersonalChipPurchase(params: {
    purchaseTransactionId: string;
    playerId: string;
    productId: string;
    chips: number;
    orderId?: string;
  }): Promise<{ idempotent: boolean; newBalance: number }> {
    return db.transaction(async (tx) => {
      const [purchase] = await tx.select().from(purchaseTransactions)
        .where(eq(purchaseTransactions.id, params.purchaseTransactionId))
        .for("update");
      if (!purchase || purchase.playerId !== params.playerId || purchase.productId !== params.productId) {
        throw new Error("Personal chip purchase transaction binding mismatch");
      }
      if (purchase.verificationStatus === "verified") {
        const [profile] = await tx.select({ chipBalance: playerProfiles.chipBalance })
          .from(playerProfiles).where(eq(playerProfiles.id, params.playerId)).limit(1);
        return { idempotent: true, newBalance: profile?.chipBalance ?? 0 };
      }
      if (purchase.verificationStatus !== "pending") {
        throw new Error(`Personal chip purchase cannot be completed from ${purchase.verificationStatus}`);
      }

      const [profile] = await tx.select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles).where(eq(playerProfiles.id, params.playerId)).for("update");
      if (!profile) throw new Error("Player profile not found for personal chip purchase");
      const beforeBalance = profile.chipBalance;
      const newBalance = beforeBalance + params.chips;
      await tx.update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} + ${params.chips}`, updatedAt: new Date() })
        .where(eq(playerProfiles.id, params.playerId));
      await this._insertChipLedger(tx, {
        playerId: params.playerId,
        beforeBalance,
        amountChange: params.chips,
        afterBalance: newBalance,
        reason: "iap_purchase",
        source: "personal_chip_pack",
        metadata: { productId: params.productId, purchaseTransactionId: purchase.id },
      });
      await tx.update(purchaseTransactions).set({
        verificationStatus: "verified",
        chipsGranted: params.chips,
        verificationLeaseUntil: null,
        ...(params.orderId ? { googleOrderId: params.orderId } : {}),
        verifiedAt: new Date(),
      }).where(eq(purchaseTransactions.id, purchase.id));
      return { idempotent: false, newBalance };
    });
  }

  async debitChipsForRefund(purchaseTransactionId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [purchase] = await tx.select().from(purchaseTransactions)
        .where(eq(purchaseTransactions.id, purchaseTransactionId)).for("update");
      if (!purchase || purchase.verificationStatus === "refunded") return false;
      if (purchase.chipsGranted <= 0) {
        if (purchase.verificationStatus === "pending" || purchase.verificationStatus === "failed_retryable") {
          // A store void notification can beat the client-side receipt verification.
          // Persist it so a later verified callback cannot grant a refunded purchase.
          await tx.update(purchaseTransactions).set({
            verificationStatus: "refunded",
            verificationLeaseUntil: null,
          })
            .where(eq(purchaseTransactions.id, purchase.id));
          return true;
        }
        return false;
      }
      if (purchase.verificationStatus !== "verified") return false;
      const [profile] = await tx.select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles).where(eq(playerProfiles.id, purchase.playerId)).for("update");
      if (!profile) {
        await tx.update(purchaseTransactions).set({
          verificationStatus: "refunded",
          verificationLeaseUntil: null,
        })
          .where(eq(purchaseTransactions.id, purchase.id));
        return true;
      }
      const debit = Math.min(purchase.chipsGranted, profile.chipBalance);
      const newBalance = profile.chipBalance - debit;
      await tx.update(playerProfiles)
        .set({ chipBalance: newBalance, updatedAt: new Date() })
        .where(eq(playerProfiles.id, purchase.playerId));
      await this._insertChipLedger(tx, {
        playerId: purchase.playerId,
        beforeBalance: profile.chipBalance,
        amountChange: -debit,
        afterBalance: newBalance,
        reason: "refund",
        source: "personal_chip_purchase_refund",
        metadata: { productId: purchase.productId, purchaseTransactionId: purchase.id },
      });
      if (purchase.stripesGranted > 0) {
        const [stripeProfile] = await tx.select({ stripes: playerProfiles.stripes })
          .from(playerProfiles).where(eq(playerProfiles.id, purchase.playerId)).for("update");
        if (stripeProfile) {
          const stripeDebit = Math.min(purchase.stripesGranted, stripeProfile.stripes);
          const newStripes = stripeProfile.stripes - stripeDebit;
          await tx.update(playerProfiles)
            .set({ stripes: newStripes, updatedAt: new Date() })
            .where(eq(playerProfiles.id, purchase.playerId));
          await tx.insert(stripeTransactions).values({
            playerId: purchase.playerId,
            amount: -stripeDebit,
            reason: `refund:${purchase.id}`,
            balanceAfter: newStripes,
          });
        }
      }
      await tx.update(purchaseTransactions).set({
        verificationStatus: "refunded",
        verificationLeaseUntil: null,
      })
        .where(eq(purchaseTransactions.id, purchase.id));
      return true;
    });
  }

  async issueBustRescueOffer(playerId: string, now: Date, durationMs: number) {
    await db.insert(bustRescueOffers).values({
      playerId,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + durationMs),
    }).onConflictDoNothing();
    const [offer] = await db.select({
      issuedAt: bustRescueOffers.issuedAt,
      expiresAt: bustRescueOffers.expiresAt,
      claimedAt: bustRescueOffers.claimedAt,
    }).from(bustRescueOffers).where(eq(bustRescueOffers.playerId, playerId)).limit(1);
    if (!offer) throw new Error("Failed to issue bust-rescue offer");
    return offer;
  }

  async claimBustRescueOffer(playerId: string, now: Date) {
    const [offer] = await db.update(bustRescueOffers)
      .set({ claimedAt: now })
      .where(and(
        eq(bustRescueOffers.playerId, playerId),
        isNull(bustRescueOffers.claimedAt),
        gt(bustRescueOffers.expiresAt, now),
      ))
      .returning({
        issuedAt: bustRescueOffers.issuedAt,
        expiresAt: bustRescueOffers.expiresAt,
        claimedAt: bustRescueOffers.claimedAt,
      });
    return offer ?? null;
  }

  async getBustRescueOffer(playerId: string) {
    const [offer] = await db.select({
      issuedAt: bustRescueOffers.issuedAt,
      expiresAt: bustRescueOffers.expiresAt,
      claimedAt: bustRescueOffers.claimedAt,
    }).from(bustRescueOffers).where(eq(bustRescueOffers.playerId, playerId)).limit(1);
    return offer ?? null;
  }

  async createRewardedAdSession(params: {
    id: string; playerId: string; adUnitId: string; testMode: boolean; createdAt: Date; expiresAt: Date;
  }): Promise<void> {
    await db.insert(rewardedAdSessions).values({
      id: params.id,
      playerId: params.playerId,
      adUnitId: params.adUnitId,
      testMode: params.testMode,
      createdAt: params.createdAt,
      expiresAt: params.expiresAt,
    });
  }

  async getRewardedAdSessionForSsv(id: string) {
    const [session] = await db.select({
      id: rewardedAdSessions.id,
      adUnitId: rewardedAdSessions.adUnitId,
      testMode: rewardedAdSessions.testMode,
    }).from(rewardedAdSessions).where(eq(rewardedAdSessions.id, id)).limit(1);
    return session ?? null;
  }

  async getRewardedAdSession(id: string, playerId: string) {
    const [session] = await db.select({
      id: rewardedAdSessions.id,
      testMode: rewardedAdSessions.testMode,
      expiresAt: rewardedAdSessions.expiresAt,
      completedAt: rewardedAdSessions.completedAt,
    }).from(rewardedAdSessions).where(and(
      eq(rewardedAdSessions.id, id),
      eq(rewardedAdSessions.playerId, playerId),
    )).limit(1);
    return session ?? null;
  }

  async completeRewardedAdSession(params: {
    id: string; transactionId: string; completedAt: Date;
  }): Promise<{ completed: boolean; idempotent: boolean; playerId?: string; newBalance?: number }> {
    return db.transaction(async tx => {
      const [session] = await tx.update(rewardedAdSessions).set({
        completedAt: params.completedAt,
        transactionId: params.transactionId,
      }).where(and(
        eq(rewardedAdSessions.id, params.id),
        isNull(rewardedAdSessions.completedAt),
        lte(rewardedAdSessions.createdAt, params.completedAt),
        gt(rewardedAdSessions.expiresAt, params.completedAt),
      )).returning({ playerId: rewardedAdSessions.playerId });

      if (!session) {
        const [existing] = await tx.select({
          playerId: rewardedAdSessions.playerId,
          completedAt: rewardedAdSessions.completedAt,
        }).from(rewardedAdSessions).where(eq(rewardedAdSessions.id, params.id)).limit(1);
        if (existing?.completedAt) {
          return { completed: true, idempotent: true, playerId: existing.playerId };
        }
        return { completed: false, idempotent: false };
      }

      const [updated] = await tx.update(playerProfiles).set({
        chipBalance: sql`${playerProfiles.chipBalance} + 500`,
        updatedAt: params.completedAt,
      }).where(eq(playerProfiles.id, session.playerId))
        .returning({ chipBalance: playerProfiles.chipBalance });
      if (!updated) throw new Error("Rewarded-ad player profile is missing");
      await this._insertChipLedger(tx, {
        playerId: session.playerId,
        beforeBalance: updated.chipBalance - 500,
        amountChange: 500,
        afterBalance: updated.chipBalance,
        reason: 'rewarded_ad',
        source: 'admob_rewarded_video',
        handId: params.id,
        metadata: { watchSessionId: params.id, transactionId: params.transactionId },
      });
      return { completed: true, idempotent: false, playerId: session.playerId, newBalance: updated.chipBalance };
    });
  }

  async hasPriorPaidPurchase(playerId: string): Promise<boolean> {
    const [purchase] = await db.select({ id: purchaseTransactions.id })
      .from(purchaseTransactions)
      .where(and(
        eq(purchaseTransactions.playerId, playerId),
        inArray(purchaseTransactions.verificationStatus, ["verified", "refunded"]),
      )).limit(1);
    if (purchase) return true;
    const [subscription] = await db.select({ id: subscriptions.id })
      .from(subscriptions).where(eq(subscriptions.playerId, playerId)).limit(1);
    return !!subscription;
  }

  async issueFirstPurchaseOffer(playerId: string, now: Date, durationMs: number) {
    if (await this.hasPriorPaidPurchase(playerId)) return null;
    await db.insert(firstPurchaseOffers).values({
      playerId,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + durationMs),
    }).onConflictDoNothing();
    return this.getFirstPurchaseOffer(playerId);
  }

  async claimFirstPurchaseOffer(playerId: string, now: Date) {
    // This is the checkout-time eligibility gate. Receipt finalization still
    // honors a timely claimed bundle if a separate purchase settles afterward.
    if (await this.hasPriorPaidPurchase(playerId)) return null;
    const [offer] = await db.update(firstPurchaseOffers)
      .set({ claimedAt: now })
      .where(and(
        eq(firstPurchaseOffers.playerId, playerId),
        isNull(firstPurchaseOffers.claimedAt),
        gt(firstPurchaseOffers.expiresAt, now),
      ))
      .returning({
        issuedAt: firstPurchaseOffers.issuedAt,
        expiresAt: firstPurchaseOffers.expiresAt,
        claimedAt: firstPurchaseOffers.claimedAt,
      });
    return offer ?? null;
  }

  async getFirstPurchaseOffer(playerId: string) {
    const [offer] = await db.select({
      issuedAt: firstPurchaseOffers.issuedAt,
      expiresAt: firstPurchaseOffers.expiresAt,
      claimedAt: firstPurchaseOffers.claimedAt,
    }).from(firstPurchaseOffers).where(eq(firstPurchaseOffers.playerId, playerId)).limit(1);
    return offer ?? null;
  }

  async completeFirstPurchaseBundle(params: {
    purchaseTransactionId: string;
    playerId: string;
    productId: string;
    chips: number;
    stripes: number;
    purchaseAt: Date;
    orderId?: string;
  }): Promise<{ idempotent: boolean; chipBalance: number; stripesBalance: number }> {
    return db.transaction(async (tx) => {
      const [purchase] = await tx.select().from(purchaseTransactions)
        .where(eq(purchaseTransactions.id, params.purchaseTransactionId)).for("update");
      if (!purchase || purchase.playerId !== params.playerId || purchase.productId !== params.productId) {
        throw new Error("First-purchase bundle transaction binding mismatch");
      }
      if (purchase.verificationStatus === "verified") {
        const [profile] = await tx.select({
          chipBalance: playerProfiles.chipBalance,
          stripes: playerProfiles.stripes,
        }).from(playerProfiles).where(eq(playerProfiles.id, params.playerId)).limit(1);
        return {
          idempotent: true,
          chipBalance: profile?.chipBalance ?? 0,
          stripesBalance: profile?.stripes ?? 0,
        };
      }
      if (purchase.verificationStatus !== "pending") {
        throw new Error(`First-purchase bundle cannot be completed from ${purchase.verificationStatus}`);
      }
      const [offer] = await tx.select({
        issuedAt: firstPurchaseOffers.issuedAt,
        expiresAt: firstPurchaseOffers.expiresAt,
        claimedAt: firstPurchaseOffers.claimedAt,
      }).from(firstPurchaseOffers)
        .where(eq(firstPurchaseOffers.playerId, params.playerId)).for("update");
      if (!offer?.claimedAt
        || params.purchaseAt.getTime() < offer.issuedAt.getTime()
        || params.purchaseAt.getTime() < offer.claimedAt.getTime()
        || params.purchaseAt.getTime() >= offer.expiresAt.getTime()
        || params.purchaseAt.getTime() > Date.now() + 60_000) {
        throw new Error("First-purchase bundle offer is not valid for the verified store timestamp");
      }
      // Eligibility is checked atomically at offer claim. Do not reject a paid,
      // in-window receipt here if another purchase settles after that claim.
      const [profile] = await tx.select({
        chipBalance: playerProfiles.chipBalance,
        stripes: playerProfiles.stripes,
      }).from(playerProfiles).where(eq(playerProfiles.id, params.playerId)).for("update");
      if (!profile) throw new Error("Player profile not found for first-purchase bundle");
      const chipBalance = profile.chipBalance + params.chips;
      const stripesBalance = profile.stripes + params.stripes;
      const now = new Date();
      await tx.update(playerProfiles).set({
        chipBalance: sql`${playerProfiles.chipBalance} + ${params.chips}`,
        stripes: sql`${playerProfiles.stripes} + ${params.stripes}`,
        updatedAt: now,
      }).where(eq(playerProfiles.id, params.playerId));
      await this._insertChipLedger(tx, {
        playerId: params.playerId,
        beforeBalance: profile.chipBalance,
        amountChange: params.chips,
        afterBalance: chipBalance,
        reason: "iap_purchase",
        source: "first_purchase_bundle",
        metadata: { productId: params.productId, purchaseTransactionId: purchase.id },
      });
      await tx.insert(stripeTransactions).values({
        playerId: params.playerId,
        amount: params.stripes,
        reason: `purchase:${params.productId}`,
        balanceAfter: stripesBalance,
      });
      await tx.update(purchaseTransactions).set({
        verificationStatus: "verified",
        chipsGranted: params.chips,
        stripesGranted: params.stripes,
        verificationLeaseUntil: null,
        ...(params.orderId ? { googleOrderId: params.orderId } : {}),
        verifiedAt: now,
      }).where(eq(purchaseTransactions.id, purchase.id));
      return { idempotent: false, chipBalance, stripesBalance };
    });
  }

  async completeCrewChipPurchase(params: {
    purchaseTransactionId: string;
    playerId: string;
    productId: string;
    crewId: string;
    chips: number;
    orderId?: string;
  }): Promise<{ idempotent: boolean; newBankBalance: number }> {
    return db.transaction(async (tx) => {
      const [purchase] = await tx.select().from(purchaseTransactions)
        .where(eq(purchaseTransactions.id, params.purchaseTransactionId)).for("update");
      if (!purchase || purchase.playerId !== params.playerId || purchase.productId !== params.productId
        || purchase.crewId !== params.crewId) {
        throw new Error("Crew chip purchase transaction binding mismatch");
      }
      if (purchase.verificationStatus === "verified") {
        const [crew] = await tx.select({ chipBank: crews.chipBank })
          .from(crews).where(eq(crews.id, params.crewId)).limit(1);
        return { idempotent: true, newBankBalance: crew?.chipBank ?? 0 };
      }
      if (purchase.verificationStatus !== "pending") {
        throw new Error(`Crew chip purchase cannot be completed from ${purchase.verificationStatus}`);
      }
      const [membership] = await tx.select({ role: crewMembers.role })
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, params.crewId), eq(crewMembers.playerId, params.playerId)));
      if (!membership || !["owner", "captain", "agent"].includes(membership.role)) {
        throw Object.assign(new Error("Not authorized to fund this club bank"), { code: "unauthorized" });
      }
      const [crew] = await tx.update(crews)
        .set({ chipBank: sql`COALESCE(${crews.chipBank}, 0) + ${params.chips}` })
        .where(eq(crews.id, params.crewId))
        .returning({ chipBank: crews.chipBank });
      if (!crew) throw Object.assign(new Error("Crew not found"), { code: "crew_not_found" });
      await tx.update(purchaseTransactions).set({
        verificationStatus: "verified",
        chipsGranted: params.chips,
        verificationLeaseUntil: null,
        ...(params.orderId ? { googleOrderId: params.orderId } : {}),
        verifiedAt: new Date(),
      }).where(eq(purchaseTransactions.id, purchase.id));
      return { idempotent: false, newBankBalance: crew.chipBank };
    });
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
    const result = await db.transaction(async (tx) => {
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

      // Apply subscription daily chip multiplier from the catalog.
      // Monthly product IDs are the canonical source per tier — monthly and yearly
      // subscribers share the same dailyChipMultiplier value in SUBSCRIPTION_PRODUCTS.
      const subTier = player.activeSubscriptionTier;
      const subProductKey =
        subTier === 'diamond_elite' ? GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteMonthly
        : subTier === 'gold_pro'    ? GOOGLE_SUBSCRIPTION_PRODUCT_IDS.goldProMonthly
        : null;
      const chipMultiplier = subProductKey
        ? (SUBSCRIPTION_PRODUCTS[subProductKey]?.dailyChipMultiplier ?? 1)
        : 1;
      const chipsAwarded      = Math.round(reward.chips * chipMultiplier);

      const newChipBalance    = player.chipBalance + chipsAwarded;
      const newStripesBalance = player.stripes + reward.stripes;

      await tx
        .update(playerProfiles)
        .set({
          chipBalance:        sql`${playerProfiles.chipBalance} + ${chipsAwarded}`,
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
    // Auto-repay outstanding chip loan from daily bonus earnings
    await this.repayChipLoan(playerId, result.chipsGranted).catch(() => {});
    return result;
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

  // ── Music methods ───────────────────────────────────────────────────────────

  async getMusicEquipped(playerId: string): Promise<{ lobby: string | null; game: string | null; ladyluck: string | null }> {
    const rows = await db
      .select({
        equippedLobbyTrack:    playerProfiles.equippedLobbyTrack,
        equippedGameTrack:     playerProfiles.equippedGameTrack,
        equippedLadyLuckTrack: playerProfiles.equippedLadyLuckTrack,
      })
      .from(playerProfiles)
      .where(eq(playerProfiles.id, playerId))
      .limit(1);
    const p = rows[0] ?? {};
    const lobby    = (p as any).equippedLobbyTrack    ?? null;
    const game     = (p as any).equippedGameTrack     ?? null;
    const ladyluck = (p as any).equippedLadyLuckTrack ?? null;

    // Auto-equip the default free track for brand-new players
    if (lobby === null && game === null && ladyluck === null) {
      const DEFAULT = 'music_chain_gang_poker';
      await db.update(playerProfiles)
        .set({ equippedLobbyTrack: DEFAULT, equippedGameTrack: DEFAULT, equippedLadyLuckTrack: DEFAULT, updatedAt: new Date() })
        .where(eq(playerProfiles.id, playerId));
      console.log(`[music] auto-equipped default track for player=${playerId}`);
      return { lobby: DEFAULT, game: DEFAULT, ladyluck: DEFAULT };
    }

    return { lobby, game, ladyluck };
  }

  async setEquippedMusicTrack(playerId: string, context: 'lobby' | 'game' | 'ladyluck', trackId: string | null): Promise<void> {
    const col =
      context === 'lobby'    ? { equippedLobbyTrack:    trackId, updatedAt: new Date() } :
      context === 'game'     ? { equippedGameTrack:     trackId, updatedAt: new Date() } :
                               { equippedLadyLuckTrack: trackId, updatedAt: new Date() };
    await db.update(playerProfiles).set(col).where(eq(playerProfiles.id, playerId));
    console.log(`[music] equip player=${playerId} context=${context} track=${trackId}`);
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
      chipBank:    crew.chipBank ?? 0,
      clubId:      crew.clubId ?? '',
      isPublic:    crew.isPublic ?? true,
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
        clubId:      crewId.slice(0, 8),
      }).returning();

      await tx.insert(crewMembers).values({
        id:       randomUUID(),
        crewId,
        playerId: data.playerId,
        role:     "owner",
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

      const isOwnerRole = member.role === "captain" || member.role === "owner";
      if (isOwnerRole) {
        if (others.length === 0) {
          // Last member — disband
          await tx.update(crews)
            .set({ disbandedAt: now })
            .where(eq(crews.id, data.crewId));
          disbanded = true;
        } else {
          // Promote longest-tenured non-owner member
          const nextCaptain = others
            .filter(m => m.role === "member" || m.role === "agent")
            .sort((a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0))[0]
            ?? others[0];

          await tx.update(crewMembers)
            .set({ role: "owner" })
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

  async isCrewMember(crewId: string, playerId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: crewMembers.id })
      .from(crewMembers)
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, playerId)))
      .limit(1);
    return !!row;
  }

  // ── Club (PokerBros-style) chip bank methods ─────────────────────────────────

  async fundClubBank(crewId: string, ownerId: string, amount: number): Promise<{ success: boolean; newBankBalance: number }> {
    return db.transaction(async tx => {
      // Verify caller is owner or agent
      const [mem] = await tx.select({ role: crewMembers.role })
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, ownerId)));
      if (!mem || !['owner', 'captain', 'agent'].includes(mem.role)) {
        throw Object.assign(new Error('Not authorized'), { code: 'unauthorized' });
      }

      // Deduct from owner chipBalance
      const [profile] = await tx.select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, ownerId));
      if (!profile || profile.chipBalance < amount) {
        throw Object.assign(new Error('Insufficient chips'), { code: 'insufficient_chips' });
      }
      await tx.update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} - ${amount}`, updatedAt: new Date() })
        .where(eq(playerProfiles.id, ownerId));

      // Add to crew chip_bank (COALESCE guards against any legacy NULL rows)
      const [updated] = await tx.update(crews)
        .set({ chipBank: sql`COALESCE(${crews.chipBank}, 0) + ${amount}` })
        .where(eq(crews.id, crewId))
        .returning({ chipBank: crews.chipBank });
      // If the UPDATE matched no rows the debit must be rolled back
      if (!updated) {
        throw Object.assign(new Error('Crew not found'), { code: 'crew_not_found' });
      }

      return { success: true, newBankBalance: updated.chipBank };
    });
  }

  // IAP-only bank credit — no personal chip deduction.
  // Verifies caller is owner/captain/agent, then adds chips directly to the crew bank.
  async addChipsToCrewBank(crewId: string, ownerId: string, amount: number): Promise<{ newBankBalance: number }> {
    return db.transaction(async tx => {
      const [mem] = await tx
        .select({ role: crewMembers.role })
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, ownerId)));
      if (!mem || !['owner', 'captain', 'agent'].includes(mem.role)) {
        throw Object.assign(new Error('Not authorized to fund this club bank'), { code: 'unauthorized' });
      }
      const [updated] = await tx
        .update(crews)
        .set({ chipBank: sql`COALESCE(${crews.chipBank}, 0) + ${amount}` })
        .where(eq(crews.id, crewId))
        .returning({ chipBank: crews.chipBank });
      if (!updated) {
        throw Object.assign(new Error('Crew not found'), { code: 'crew_not_found' });
      }
      return { newBankBalance: updated.chipBank };
    });
  }


  async distributeChips(crewId: string, agentId: string, targetPlayerId: string, amount: number): Promise<{ success: boolean; newBankBalance: number }> {
    return db.transaction(async tx => {
      // Verify agent role
      const [agentMem] = await tx.select({ role: crewMembers.role })
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, agentId)));
      if (!agentMem || !['owner', 'captain', 'agent'].includes(agentMem.role)) {
        throw Object.assign(new Error('Not authorized'), { code: 'unauthorized' });
      }

      // Verify target is member
      const [targetMem] = await tx.select({ role: crewMembers.role })
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, targetPlayerId)));
      if (!targetMem) {
        throw Object.assign(new Error('Target is not a member of this club'), { code: 'not_member' });
      }

      // Verify bank has enough
      const [crew] = await tx.select({ chipBank: crews.chipBank })
        .from(crews)
        .where(eq(crews.id, crewId));
      if (!crew || crew.chipBank < amount) {
        throw Object.assign(new Error('Insufficient club bank balance'), { code: 'insufficient_bank' });
      }

      // Deduct from bank
      const [updatedCrew] = await tx.update(crews)
        .set({ chipBank: sql`${crews.chipBank} - ${amount}` })
        .where(eq(crews.id, crewId))
        .returning({ chipBank: crews.chipBank });

      // Credit target
      const [targetProfile] = await tx.select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, targetPlayerId));
      const before = targetProfile?.chipBalance ?? 0;
      const after  = before + amount;

      await tx.update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} + ${amount}`, updatedAt: new Date() })
        .where(eq(playerProfiles.id, targetPlayerId));

      // Chip ledger row
      await this._insertChipLedger(tx, {
        playerId:      targetPlayerId,
        beforeBalance: before,
        amountChange:  amount,
        afterBalance:  after,
        reason:        'club_distribution',
        source:        'club',
        metadata:      { crewId, distributedBy: agentId },
      });

      return { success: true, newBankBalance: updatedCrew?.chipBank ?? 0 };
    });
  }

  async requestChips(crewId: string, playerId: string, amount: number): Promise<{ success: boolean; requestId: number }> {
    // Verify member
    const [mem] = await db.select({ role: crewMembers.role })
      .from(crewMembers)
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, playerId)));
    if (!mem) {
      throw Object.assign(new Error('Not a member of this club'), { code: 'not_member' });
    }

    const [row] = await db.insert(clubChipRequests)
      .values({ crewId, playerId, amount, status: 'pending', requestedAt: new Date() })
      .returning({ id: clubChipRequests.id });

    return { success: true, requestId: row!.id };
  }

  async resolveChipRequest(requestId: number, agentId: string, approve: boolean): Promise<{ success: boolean }> {
    return db.transaction(async tx => {
      // Load request
      const [req] = await tx.select()
        .from(clubChipRequests)
        .where(eq(clubChipRequests.id, requestId));
      if (!req) throw Object.assign(new Error('Request not found'), { code: 'not_found' });
      if (req.status !== 'pending') throw Object.assign(new Error('Request already resolved'), { code: 'already_resolved' });

      // Verify agent role
      const [agentMem] = await tx.select({ role: crewMembers.role })
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, req.crewId), eq(crewMembers.playerId, agentId)));
      if (!agentMem || !['owner', 'captain', 'agent'].includes(agentMem.role)) {
        throw Object.assign(new Error('Not authorized'), { code: 'unauthorized' });
      }

      if (approve) {
        // distributeChips handles its own transaction — call storage method directly
        // but we're already inside a tx, so inline the distribution
        const [crew] = await tx.select({ chipBank: crews.chipBank })
          .from(crews)
          .where(eq(crews.id, req.crewId));
        if (!crew || crew.chipBank < req.amount) {
          throw Object.assign(new Error('Insufficient club bank balance'), { code: 'insufficient_bank' });
        }
        await tx.update(crews)
          .set({ chipBank: sql`${crews.chipBank} - ${req.amount}` })
          .where(eq(crews.id, req.crewId));

        const [targetProfile] = await tx.select({ chipBalance: playerProfiles.chipBalance })
          .from(playerProfiles)
          .where(eq(playerProfiles.id, req.playerId));
        const before = targetProfile?.chipBalance ?? 0;
        const after  = before + req.amount;
        await tx.update(playerProfiles)
          .set({ chipBalance: sql`${playerProfiles.chipBalance} + ${req.amount}`, updatedAt: new Date() })
          .where(eq(playerProfiles.id, req.playerId));
        await this._insertChipLedger(tx, {
          playerId:      req.playerId,
          beforeBalance: before,
          amountChange:  req.amount,
          afterBalance:  after,
          reason:        'club_distribution',
          source:        'club',
          metadata:      { crewId: req.crewId, requestId, resolvedBy: agentId },
        });
      }

      await tx.update(clubChipRequests)
        .set({ status: approve ? 'approved' : 'rejected', resolvedAt: new Date(), resolvedBy: agentId })
        .where(eq(clubChipRequests.id, requestId));

      return { success: true };
    });
  }

  async appointAgent(crewId: string, ownerId: string, targetPlayerId: string): Promise<void> {
    const [ownerMem] = await db.select({ role: crewMembers.role })
      .from(crewMembers)
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, ownerId)));
    if (!ownerMem || !['owner', 'captain'].includes(ownerMem.role)) {
      throw Object.assign(new Error('Only the owner can appoint agents'), { code: 'unauthorized' });
    }
    const updated = await db.update(crewMembers)
      .set({ role: 'agent' })
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, targetPlayerId)))
      .returning({ id: crewMembers.id });
    if (updated.length === 0) throw Object.assign(new Error('Target is not a member of this club'), { code: 'not_member' });
  }

  async removeAgent(crewId: string, ownerId: string, targetPlayerId: string): Promise<void> {
    const [ownerMem] = await db.select({ role: crewMembers.role })
      .from(crewMembers)
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, ownerId)));
    if (!ownerMem || !['owner', 'captain'].includes(ownerMem.role)) {
      throw Object.assign(new Error('Only the owner can remove agents'), { code: 'unauthorized' });
    }
    const updated = await db.update(crewMembers)
      .set({ role: 'member' })
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.playerId, targetPlayerId), eq(crewMembers.role, 'agent')))
      .returning({ id: crewMembers.id });
    if (updated.length === 0) throw Object.assign(new Error('Target is not an agent of this club'), { code: 'not_agent' });
  }

  async getPublicClubs(): Promise<{ id: string; name: string; clubId: string; memberCount: number; chipBank: number; inviteCode: string }[]> {
    const rows = await db
      .select({
        id:          crews.id,
        name:        crews.name,
        clubId:      crews.clubId,
        memberCount: crews.memberCount,
        chipBank:    crews.chipBank,
        inviteCode:  crews.inviteCode,
      })
      .from(crews)
      .where(and(eq(crews.isPublic, true), isNull(crews.disbandedAt)))
      .orderBy(desc(crews.memberCount))
      .limit(20);
    return rows;
  }

  async getClubChipRequests(
    crewId: string,
    options: { pendingOnly: boolean; playerId?: string },
  ): Promise<{ id: number; playerId: string; playerName: string; amount: number; status: string; requestedAt: Date; resolvedAt: Date | null }[]> {
    const conditions = [eq(clubChipRequests.crewId, crewId)];
    if (options.pendingOnly) conditions.push(eq(clubChipRequests.status, 'pending'));
    if (options.playerId)    conditions.push(eq(clubChipRequests.playerId, options.playerId));

    const rows = await db
      .select({
        id:          clubChipRequests.id,
        playerId:    clubChipRequests.playerId,
        playerName:  playerProfiles.displayName,
        amount:      clubChipRequests.amount,
        status:      clubChipRequests.status,
        requestedAt: clubChipRequests.requestedAt,
        resolvedAt:  clubChipRequests.resolvedAt,
      })
      .from(clubChipRequests)
      .leftJoin(playerProfiles, eq(playerProfiles.id, clubChipRequests.playerId))
      .where(and(...conditions))
      .orderBy(desc(clubChipRequests.requestedAt))
      .limit(100);

    return rows.map(r => ({ ...r, playerName: r.playerName ?? 'Unknown' }));
  }

  // ── Time Bank ───────────────────────────────────────────────────────────────

  async debitChipsForBuyin(playerId: string, amount: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} - ${amount}`, updatedAt: new Date() })
        .where(and(eq(playerProfiles.id, playerId), gte(playerProfiles.chipBalance, amount)))
        .returning({ chipBalance: playerProfiles.chipBalance });
      if (!updated) return false;
      const after = updated.chipBalance;
      await this._insertChipLedger(tx, {
        playerId,
        beforeBalance: after + amount,
        amountChange:  -amount,
        afterBalance:  after,
        reason:        'buy_in',
        source:        'gameEngine',
      });
      return true;
    });
  }

  async giftTableChips(params: {
    requestId: string;
    senderId: string;
    recipientId: string;
    tableId: string;
  }): Promise<{ replayed: boolean; senderBalance: number; recipientBalance: number }> {
    const amount = 100;
    const cooldownMs = 60_000;
    return db.transaction(async (tx) => {
      // Serialize repeated request ids globally, then sender/recipient/table
      // gifts. Advisory transaction locks make the idempotency and cooldown
      // checks safe against simultaneous requests on separate app workers.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${
        `personal-gift-request:${params.requestId}`
      }, 0))`);
      const [prior] = await tx.select().from(personalChipGifts)
        .where(eq(personalChipGifts.id, params.requestId)).limit(1);
      if (prior) {
        if (prior.senderId !== params.senderId || prior.recipientId !== params.recipientId || prior.tableId !== params.tableId) {
          throw Object.assign(new Error('This gift request ID was already used for another request.'), { code: 'idempotency_conflict' });
        }
        const balances = await tx.select({ id: playerProfiles.id, balance: playerProfiles.chipBalance })
          .from(playerProfiles)
          .where(or(eq(playerProfiles.id, params.senderId), eq(playerProfiles.id, params.recipientId)));
        const senderBalance = balances.find(row => row.id === params.senderId)?.balance;
        const recipientBalance = balances.find(row => row.id === params.recipientId)?.balance;
        if (senderBalance === undefined || recipientBalance === undefined) {
          throw Object.assign(new Error('A gift participant no longer exists.'), { code: 'gift_participant_missing' });
        }
        return { replayed: true, senderBalance, recipientBalance };
      }

      const cooldownLockKey = `personal-gift-pair:${params.tableId}:${params.senderId}:${params.recipientId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${cooldownLockKey}, 0))`);
      const [lastGift] = await tx.select({ createdAt: personalChipGifts.createdAt })
        .from(personalChipGifts)
        .where(and(
          eq(personalChipGifts.tableId, params.tableId),
          eq(personalChipGifts.senderId, params.senderId),
          eq(personalChipGifts.recipientId, params.recipientId),
        ))
        .orderBy(desc(personalChipGifts.createdAt))
        .limit(1);
      if (lastGift && Date.now() - lastGift.createdAt.getTime() < cooldownMs) {
        throw Object.assign(new Error('You can gift this player again after the 60-second cooldown.'), {
          code: 'gift_cooldown',
          retryAfterMs: Math.max(1, cooldownMs - (Date.now() - lastGift.createdAt.getTime())),
        });
      }

      // Lock both profile rows in a stable order so reciprocal transfers cannot
      // deadlock. The balance decrement itself is still guarded in SQL.
      await tx.execute(sql`
        SELECT id FROM player_profiles
        WHERE id IN (${params.senderId}, ${params.recipientId})
        ORDER BY id FOR UPDATE
      `);
      const [debited] = await tx.update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} - ${amount}`, updatedAt: new Date() })
        .where(and(eq(playerProfiles.id, params.senderId), gte(playerProfiles.chipBalance, amount)))
        .returning({ chipBalance: playerProfiles.chipBalance });
      if (!debited) {
        throw Object.assign(new Error('Not enough chips to send this gift.'), { code: 'insufficient_chips' });
      }
      const [credited] = await tx.update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} + ${amount}`, updatedAt: new Date() })
        .where(eq(playerProfiles.id, params.recipientId))
        .returning({ chipBalance: playerProfiles.chipBalance });
      if (!credited) {
        throw Object.assign(new Error('The recipient account could not be found.'), { code: 'gift_participant_missing' });
      }
      const createdAt = new Date();
      await tx.insert(personalChipGifts).values({
        id: params.requestId,
        senderId: params.senderId,
        recipientId: params.recipientId,
        tableId: params.tableId,
        amount,
        createdAt,
      });
      await this._insertChipLedger(tx, {
        playerId: params.senderId,
        beforeBalance: debited.chipBalance + amount,
        amountChange: -amount,
        afterBalance: debited.chipBalance,
        reason: 'personal_gift',
        source: 'table_gift',
        gameId: params.tableId,
        metadata: { giftId: params.requestId, recipientId: params.recipientId },
      });
      await this._insertChipLedger(tx, {
        playerId: params.recipientId,
        beforeBalance: credited.chipBalance - amount,
        amountChange: amount,
        afterBalance: credited.chipBalance,
        reason: 'personal_gift',
        source: 'table_gift',
        gameId: params.tableId,
        metadata: { giftId: params.requestId, senderId: params.senderId },
      });
      return {
        replayed: false,
        senderBalance: debited.chipBalance,
        recipientBalance: credited.chipBalance,
      };
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

  private isReservedBotId(id: string): boolean {
    return /^(?:bot[:_-]|__bot)/i.test(id);
  }

  async sendFriendRequest(requesterId: string, recipientId: string): Promise<{ id: string; status: string }> {
    if (!requesterId || requesterId === recipientId) {
      throw Object.assign(new Error("Cannot send a friend request to yourself"), { code: "invalid_recipient" });
    }
    if (this.isReservedBotId(recipientId)) {
      throw Object.assign(new Error("Bots cannot be added as friends"), { code: "bot_recipient" });
    }
    const [recipient] = await db.select({ id: playerProfiles.id, isDeleted: playerProfiles.isDeleted })
      .from(playerProfiles).where(eq(playerProfiles.id, recipientId)).limit(1);
    if (!recipient || recipient.isDeleted) {
      throw Object.assign(new Error("Player not found"), { code: "not_found" });
    }
    if (await this.isBlocked(requesterId, recipientId) || await this.isBlocked(recipientId, requesterId)) {
      throw Object.assign(new Error("Friend requests are unavailable for blocked players"), { code: "blocked" });
    }

    const [existing] = await db.select().from(friendRequests).where(or(
      and(eq(friendRequests.requesterId, requesterId), eq(friendRequests.recipientId, recipientId)),
      and(eq(friendRequests.requesterId, recipientId), eq(friendRequests.recipientId, requesterId)),
    )).limit(1);
    if (existing?.status === "accepted") return { id: existing.id, status: existing.status };
    if (existing?.status === "pending") {
      if (existing.requesterId === requesterId) return { id: existing.id, status: existing.status };
      throw Object.assign(new Error("A friend request from this player is already pending"), { code: "incoming_pending" });
    }

    if (existing) {
      const [updated] = await db.update(friendRequests).set({
        requesterId, recipientId, status: "pending", createdAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(friendRequests.id, existing.id), eq(friendRequests.status, "declined"))).returning();
      if (updated) return { id: updated.id, status: updated.status };
      const [raced] = await db.select().from(friendRequests).where(eq(friendRequests.id, existing.id)).limit(1);
      if (raced?.status === "accepted" || raced?.status === "pending") return { id: raced.id, status: raced.status };
    }
    await db.insert(friendRequests).values({ requesterId, recipientId }).onConflictDoNothing();
    const [result] = await db.select().from(friendRequests).where(or(
      and(eq(friendRequests.requesterId, requesterId), eq(friendRequests.recipientId, recipientId)),
      and(eq(friendRequests.requesterId, recipientId), eq(friendRequests.recipientId, requesterId)),
    )).limit(1);
    if (!result) throw new Error("Could not create friend request");
    if (result.status === "pending" && result.requesterId !== requesterId) {
      throw Object.assign(new Error("A friend request from this player is already pending"), { code: "incoming_pending" });
    }
    return { id: result.id, status: result.status };
  }

  async respondToFriendRequest(actorId: string, requestId: string, action: "accepted" | "declined"): Promise<{ id: string; status: string }> {
    const [request] = await db.select().from(friendRequests).where(eq(friendRequests.id, requestId)).limit(1);
    if (!request || request.recipientId !== actorId) {
      throw Object.assign(new Error("Friend request not found"), { code: "not_found" });
    }
    if (request.status === action || (action === "accepted" && request.status === "accepted")) {
      return { id: request.id, status: request.status };
    }
    if (request.status !== "pending") {
      throw Object.assign(new Error("Friend request is no longer pending"), { code: "conflict" });
    }
    if (action === "accepted" && (await this.isBlocked(actorId, request.requesterId) || await this.isBlocked(request.requesterId, actorId))) {
      throw Object.assign(new Error("Friend requests are unavailable for blocked players"), { code: "blocked" });
    }
    const [updated] = await db.update(friendRequests)
      .set({ status: action, updatedAt: new Date() })
      .where(and(eq(friendRequests.id, requestId), eq(friendRequests.recipientId, actorId), eq(friendRequests.status, "pending")))
      .returning();
    if (updated) return { id: updated.id, status: updated.status };
    const [raced] = await db.select().from(friendRequests).where(eq(friendRequests.id, requestId)).limit(1);
    if (raced?.recipientId === actorId && raced.status === action) return { id: raced.id, status: raced.status };
    throw Object.assign(new Error("Friend request is no longer pending"), { code: "conflict" });
  }

  async getFriendRequests(playerId: string): Promise<{
    friends: Array<{ id: string; displayName: string; avatarId: string | null }>;
    received: Array<{ id: string; player: { id: string; displayName: string; avatarId: string | null } }>;
    sent: Array<{ id: string; player: { id: string; displayName: string; avatarId: string | null } }>;
    recent: Array<{ player: { id: string; displayName: string; avatarId: string | null }; lastPlayedAt: Date }>;
  }> {
    const [relationships, blockRows] = await Promise.all([
      db.select().from(friendRequests).where(and(
      or(eq(friendRequests.requesterId, playerId), eq(friendRequests.recipientId, playerId)),
      or(eq(friendRequests.status, "accepted"),
        and(eq(friendRequests.status, "pending"), or(eq(friendRequests.recipientId, playerId), eq(friendRequests.requesterId, playerId)))),
      )),
      db.select({ blockerId: blockedPlayers.blockerId, blockedId: blockedPlayers.blockedId })
        .from(blockedPlayers)
        .where(or(eq(blockedPlayers.blockerId, playerId), eq(blockedPlayers.blockedId, playerId))),
    ]);
    const blockedPlayerIds = new Set(blockRows.map(row =>
      row.blockerId === playerId ? row.blockedId : row.blockerId,
    ));
    // A block in either direction suppresses every relationship and presence
    // record. Keeping rows durable means unblocking restores the friendship.
    const rows = relationships.filter(row => !blockedPlayerIds.has(
      row.requesterId === playerId ? row.recipientId : row.requesterId,
    ));
    const accepted = rows.filter(row => row.status === "accepted");
    const friends = await Promise.all(accepted.map(async row => {
      const id = row.requesterId === playerId ? row.recipientId : row.requesterId;
      const [p] = await db.select({ id: playerProfiles.id, displayName: playerProfiles.displayName, avatarId: playerProfiles.avatarId })
        .from(playerProfiles).where(eq(playerProfiles.id, id)).limit(1);
      return p;
    }));
    const received = await Promise.all(rows.filter(row => row.status === "pending" && row.recipientId === playerId).map(async row => ({
      id: row.id,
      player: (await db.select({ id: playerProfiles.id, displayName: playerProfiles.displayName, avatarId: playerProfiles.avatarId })
        .from(playerProfiles).where(eq(playerProfiles.id, row.requesterId)).limit(1))[0],
    })));
    const sent = await Promise.all(rows.filter(row => row.status === "pending" && row.requesterId === playerId).map(async row => ({
      id: row.id,
      player: (await db.select({ id: playerProfiles.id, displayName: playerProfiles.displayName, avatarId: playerProfiles.avatarId })
        .from(playerProfiles).where(eq(playerProfiles.id, row.recipientId)).limit(1))[0],
    })));
    const recentQuery = db.select({
      id: playerProfiles.id, displayName: playerProfiles.displayName, avatarId: playerProfiles.avatarId,
      lastPlayedAt: recentCoSeatedPlayers.lastPlayedAt,
    }).from(recentCoSeatedPlayers)
      .innerJoin(playerProfiles, eq(playerProfiles.id, recentCoSeatedPlayers.otherPlayerId))
      .where(blockedPlayerIds.size > 0
        ? and(
          eq(recentCoSeatedPlayers.playerId, playerId),
          notInArray(recentCoSeatedPlayers.otherPlayerId, [...blockedPlayerIds]),
        )
        : eq(recentCoSeatedPlayers.playerId, playerId));
    const recentRows = await recentQuery
      .orderBy(desc(recentCoSeatedPlayers.lastPlayedAt))
      .limit(20);
    const compact = (p: { id: string; displayName: string; avatarId: string | null } | undefined) =>
      p && ({ id: p.id, displayName: p.displayName, avatarId: p.avatarId });
    return {
      friends: friends.map(compact).filter((p): p is { id: string; displayName: string; avatarId: string | null } => !!p),
      received: received.filter(row => !!row.player).map(row => ({ id: row.id, player: compact(row.player)! })),
      sent: sent.filter(row => !!row.player).map(row => ({ id: row.id, player: compact(row.player)! })),
      recent: recentRows.map(row => ({ player: { id: row.id, displayName: row.displayName, avatarId: row.avatarId }, lastPlayedAt: row.lastPlayedAt })),
    };
  }

  async recordRecentCoSeatedPlayers(playerIds: string[]): Promise<void> {
    const ids = [...new Set(playerIds.filter(id => !!id && !this.isReservedBotId(id)))];
    if (ids.length < 2) return;
    const playedAt = new Date();
    const values: Array<{ playerId: string; otherPlayerId: string; lastPlayedAt: Date }> = [];
    for (const playerId of ids) for (const otherPlayerId of ids) {
      if (playerId !== otherPlayerId) values.push({ playerId, otherPlayerId, lastPlayedAt: playedAt });
    }
    await db.insert(recentCoSeatedPlayers).values(values).onConflictDoUpdate({
      target: [recentCoSeatedPlayers.playerId, recentCoSeatedPlayers.otherPlayerId],
      set: { lastPlayedAt: playedAt },
    });
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

  // ── Admin operations ────────────────────────────────────────────────────────

  async getPlayerBanStatus(id: string): Promise<BanStatus | null> {
    const rows = await db
      .select({
        isDeleted:    playerProfiles.isDeleted,
        bannedAt:     playerProfiles.bannedAt,
        banExpiresAt: playerProfiles.banExpiresAt,
        banReason:    playerProfiles.banReason,
      })
      .from(playerProfiles)
      .where(eq(playerProfiles.id, id))
      .limit(1);
    if (!rows[0]) return null;
    return rows[0];
  }

  async clearExpiredBan(playerId: string): Promise<void> {
    await db
      .update(playerProfiles)
      .set({ bannedAt: null, banExpiresAt: null, banReason: null, updatedAt: new Date() })
      .where(eq(playerProfiles.id, playerId));
  }

  async deletePlayerSessions(playerId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.playerId, playerId));
  }

  async listMembers(limit: number, offset: number): Promise<PlayerSearchResult[]> {
    const rows = await db
      .select({
        id:          playerProfiles.id,
        displayName: playerProfiles.displayName,
        email:       playerProfiles.email,
        chipBalance: playerProfiles.chipBalance,
        stripes:     playerProfiles.stripes,
        isAdmin:     playerProfiles.isAdmin,
        bannedAt:    playerProfiles.bannedAt,
        isDeleted:   playerProfiles.isDeleted,
        createdAt:   playerProfiles.createdAt,
      })
      .from(playerProfiles)
      .orderBy(desc(playerProfiles.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map(r => ({
      ...r,
      isBanned: r.bannedAt !== null,
    }));
  }

  async getLeaderboard(viewerId: string): Promise<LeaderboardResponse> {
    const eligible = and(
      eq(playerProfiles.isDeleted, false),
      isNull(playerProfiles.bannedAt),
      ne(playerProfiles.id, LADY_LUCK_HOUSE_ID),
      notLike(playerProfiles.id, 'bot_%'),
    );
    const publicFields = {
      id: playerProfiles.id,
      displayName: playerProfiles.displayName,
      lifetimeProfit: playerProfiles.lifetimeProfit,
      xp: playerProfiles.xp,
      handsPlayed: playerProfiles.handsPlayed,
      avatarId: playerProfiles.avatarId,
      equippedAvatarId: playerProfiles.equippedAvatarId,
      equippedFrameId: playerProfiles.equippedFrameId,
    };
    const [leaders, [countRow], [viewer]] = await Promise.all([
      db.select(publicFields).from(playerProfiles).where(eligible)
        .orderBy(desc(playerProfiles.lifetimeProfit), asc(playerProfiles.id))
        .limit(LEADERBOARD_LIMIT),
      db.select({ total: sql<number>`count(*)::int` }).from(playerProfiles).where(eligible),
      db.select(publicFields).from(playerProfiles)
        .where(and(eligible, eq(playerProfiles.id, viewerId))).limit(1),
    ]);
    const entries = leaders.map((row, index) => ({ ...row, rank: index + 1 }));
    let me = entries.find(row => row.id === viewerId) ?? null;
    if (!me && viewer) {
      const [ahead] = await db.select({ total: sql<number>`count(*)::int` })
        .from(playerProfiles).where(and(
          eligible,
          or(
            gt(playerProfiles.lifetimeProfit, viewer.lifetimeProfit),
            and(eq(playerProfiles.lifetimeProfit, viewer.lifetimeProfit), lt(playerProfiles.id, viewerId)),
          ),
        ));
      me = { ...viewer, rank: ahead.total + 1 };
    }
    return { entries, total: countRow.total, me };
  }

  async searchPlayers(query: string): Promise<PlayerSearchResult[]> {
    const q = query.trim();
    const rows = await db
      .select({
        id:          playerProfiles.id,
        displayName: playerProfiles.displayName,
        email:       playerProfiles.email,
        chipBalance: playerProfiles.chipBalance,
        stripes:     playerProfiles.stripes,
        isAdmin:     playerProfiles.isAdmin,
        bannedAt:    playerProfiles.bannedAt,
        isDeleted:   playerProfiles.isDeleted,
        createdAt:   playerProfiles.createdAt,
      })
      .from(playerProfiles)
      .where(
        or(
          ilike(playerProfiles.displayName, `%${q}%`),
          ilike(playerProfiles.email,       `%${q}%`),
          eq(playerProfiles.id, q),
        )
      )
      .orderBy(asc(playerProfiles.displayName))
      .limit(50);
    return rows.map(r => ({
      ...r,
      isBanned: r.bannedAt !== null,
    }));
  }

  async getPlayerFullDetails(id: string): Promise<AdminPlayerDetails | null> {
    const profiles = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.id, id))
      .limit(1);
    if (!profiles[0]) return null;
    const [recentChipHistory, recentStripesHistory, recentAdminActions, inventoryResult] = await Promise.all([
      this.getPlayerChipHistory(id, 20, 0),
      this.getPlayerStripesHistory(id, 20, 0),
      this.getPlayerAdminActionHistory(id, 20, 0),
      this.getPlayerInventory(id),
    ]);
    return {
      profile: profiles[0],
      recentChipHistory,
      recentStripesHistory,
      recentAdminActions,
      ownedCosmetics: inventoryResult.items,
    };
  }

  async getPlayerChipHistory(playerId: string, limit: number, offset: number): Promise<ChipTransaction[]> {
    return db
      .select()
      .from(chipTransactions)
      .where(eq(chipTransactions.playerId, playerId))
      .orderBy(desc(chipTransactions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getPlayerStripesHistory(playerId: string, limit: number, offset: number): Promise<StripeTransaction[]> {
    return db
      .select()
      .from(stripeTransactions)
      .where(eq(stripeTransactions.playerId, playerId))
      .orderBy(desc(stripeTransactions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getPlayerAdminActionHistory(playerId: string, limit: number, offset: number): Promise<AdminAction[]> {
    return db
      .select()
      .from(adminActions)
      .where(eq(adminActions.targetPlayerId, playerId))
      .orderBy(desc(adminActions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  // ── Admin chip / stripe operations ─────────────────────────────────────────

  private readonly SUPERADMIN_ID = "d7536cf3-84d8-4e92-a098-fd1478abd354";
  private _guardSelf(adminId: string, targetPlayerId: string): void {
    if (adminId === this.SUPERADMIN_ID) return;
    if (adminId === targetPlayerId) throw new Error('Admin cannot modify their own account via admin actions');
    if (targetPlayerId === this.SUPERADMIN_ID) throw new Error('This account cannot be modified by other admins');
  }

  async adminGrantChips(adminId: string, targetPlayerId: string, amount: number, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
      if (!target) throw new Error(`Player ${targetPlayerId} not found`);
      const before = { chipBalance: target.chipBalance };
      const afterBalance = target.chipBalance + amount;
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'grant_chips',
        reason, beforeState: before, metadata: { amount },
      }).returning();
      await tx.update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} + ${amount}`, updatedAt: new Date() })
        .where(eq(playerProfiles.id, targetPlayerId));
      await this._insertChipLedger(tx, {
        playerId: targetPlayerId, beforeBalance: target.chipBalance,
        amountChange: amount, afterBalance: afterBalance,
        reason: 'admin_grant', source: 'admin', metadata: { adminId, reason },
      });
      await tx.update(adminActions)
        .set({ afterState: { chipBalance: afterBalance } })
        .where(eq(adminActions.id, action.id));
    });
    // Auto-repay outstanding chip loan from admin chip grant
    await this.repayChipLoan(targetPlayerId, amount).catch(() => {});
  }

  async adminDebitChips(adminId: string, targetPlayerId: string, amount: number, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ chipBalance: playerProfiles.chipBalance })
        .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
      if (!target) throw new Error(`Player ${targetPlayerId} not found`);
      const before = { chipBalance: target.chipBalance };
      const debit = Math.min(amount, target.chipBalance); // clamp to 0
      const afterBalance = target.chipBalance - debit;
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'debit_chips',
        reason, beforeState: before, metadata: { amount, actualDebit: debit },
      }).returning();
      await tx.update(playerProfiles)
        .set({ chipBalance: sql`${playerProfiles.chipBalance} - ${debit}`, updatedAt: new Date() })
        .where(eq(playerProfiles.id, targetPlayerId));
      await this._insertChipLedger(tx, {
        playerId: targetPlayerId, beforeBalance: target.chipBalance,
        amountChange: -debit, afterBalance: afterBalance,
        reason: 'admin_debit', source: 'admin', metadata: { adminId, reason },
      });
      await tx.update(adminActions)
        .set({ afterState: { chipBalance: afterBalance } })
        .where(eq(adminActions.id, action.id));
    });
  }

  async adminGrantStripes(adminId: string, targetPlayerId: string, amount: number, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ stripes: playerProfiles.stripes })
        .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
      if (!target) throw new Error(`Player ${targetPlayerId} not found`);
      const before = { stripes: target.stripes };
      const afterStripes = target.stripes + amount;
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'grant_stripes',
        reason, beforeState: before, metadata: { amount },
      }).returning();
      await tx.update(playerProfiles)
        .set({ stripes: afterStripes, updatedAt: new Date() })
        .where(eq(playerProfiles.id, targetPlayerId));
      await tx.insert(stripeTransactions).values({
        playerId: targetPlayerId, amount, reason: `admin_grant: ${reason}`, balanceAfter: afterStripes,
      });
      await tx.update(adminActions)
        .set({ afterState: { stripes: afterStripes } })
        .where(eq(adminActions.id, action.id));
    });
  }

  async adminDebitStripes(adminId: string, targetPlayerId: string, amount: number, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ stripes: playerProfiles.stripes })
        .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
      if (!target) throw new Error(`Player ${targetPlayerId} not found`);
      const before = { stripes: target.stripes };
      const debit = Math.min(amount, target.stripes);
      const afterStripes = target.stripes - debit;
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'debit_stripes',
        reason, beforeState: before, metadata: { amount, actualDebit: debit },
      }).returning();
      await tx.update(playerProfiles)
        .set({ stripes: afterStripes, updatedAt: new Date() })
        .where(eq(playerProfiles.id, targetPlayerId));
      await tx.insert(stripeTransactions).values({
        playerId: targetPlayerId, amount: -debit, reason: `admin_debit: ${reason}`, balanceAfter: afterStripes,
      });
      await tx.update(adminActions)
        .set({ afterState: { stripes: afterStripes } })
        .where(eq(adminActions.id, action.id));
    });
  }

  // ── Admin cosmetic operations ───────────────────────────────────────────────

  async adminGrantCosmetic(adminId: string, targetPlayerId: string, cosmeticId: string, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: playerInventory.id })
        .from(playerInventory)
        .where(and(eq(playerInventory.playerId, targetPlayerId), eq(playerInventory.cosmeticItemId, cosmeticId)))
        .limit(1);
      const before = { hasCosmetic: !!existing[0] };
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'grant_cosmetic',
        reason, beforeState: before, metadata: { cosmeticId },
      }).returning();
      if (!existing[0]) {
        await tx.insert(playerInventory).values({
          id:             randomUUID(),
          playerId:       targetPlayerId,
          cosmeticItemId: cosmeticId,
          acquiredAt:     new Date(),
          equipped:       false,
        });
      }
      await tx.update(adminActions)
        .set({ afterState: { hasCosmetic: true } })
        .where(eq(adminActions.id, action.id));
    });
  }

  async adminRevokeCosmetic(adminId: string, targetPlayerId: string, cosmeticId: string, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: playerInventory.id })
        .from(playerInventory)
        .where(and(eq(playerInventory.playerId, targetPlayerId), eq(playerInventory.cosmeticItemId, cosmeticId)))
        .limit(1);
      const before = { hasCosmetic: !!existing[0] };
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'revoke_cosmetic',
        reason, beforeState: before, metadata: { cosmeticId },
      }).returning();
      if (existing[0]) {
        await tx.delete(playerInventory)
          .where(and(eq(playerInventory.playerId, targetPlayerId), eq(playerInventory.cosmeticItemId, cosmeticId)));
      }
      await tx.update(adminActions)
        .set({ afterState: { hasCosmetic: false } })
        .where(eq(adminActions.id, action.id));
    });
  }

  // ── Admin subscription operations ──────────────────────────────────────────

  async adminGrantSubscription(adminId: string, targetPlayerId: string, tier: string, durationDays: number, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    // Mirror real purchase grants — use the monthly product's stripesOnStart as canonical
    // per-tier amount, matching what processSubscriptionPurchase credits on activation.
    const TIER_TO_PRODUCT_ID: Record<string, string> = {
      gold_pro:      GOOGLE_SUBSCRIPTION_PRODUCT_IDS.goldProMonthly,
      diamond_elite: GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteMonthly,
    };
    const productId = TIER_TO_PRODUCT_ID[tier];
    const stripesGrant = productId ? (SUBSCRIPTION_PRODUCTS[productId]?.stripesOnStart ?? 0) : 0;
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ activeSubscriptionTier: playerProfiles.activeSubscriptionTier, stripes: playerProfiles.stripes })
        .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
      if (!target) throw new Error(`Player ${targetPlayerId} not found`);
      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      const before = { activeSubscriptionTier: target.activeSubscriptionTier, stripes: target.stripes };
      const afterStripes = target.stripes + stripesGrant;
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'grant_subscription',
        reason, beforeState: before, metadata: { tier, durationDays, stripesGrant },
      }).returning();
      await tx.update(playerProfiles)
        .set({ activeSubscriptionTier: tier, subscriptionExpiresAt: expiresAt,
               stripes: afterStripes, updatedAt: new Date() })
        .where(eq(playerProfiles.id, targetPlayerId));
      if (stripesGrant > 0) {
        await tx.insert(stripeTransactions).values({
          playerId: targetPlayerId, amount: stripesGrant,
          reason: `admin_subscription_grant: ${tier}`, balanceAfter: afterStripes,
        });
      }
      await tx.update(adminActions)
        .set({ afterState: { activeSubscriptionTier: tier, subscriptionExpiresAt: expiresAt.toISOString(), stripes: afterStripes } })
        .where(eq(adminActions.id, action.id));
    });
  }

  async adminRevokeSubscription(adminId: string, targetPlayerId: string, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ activeSubscriptionTier: playerProfiles.activeSubscriptionTier })
        .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
      if (!target) throw new Error(`Player ${targetPlayerId} not found`);
      const before = { activeSubscriptionTier: target.activeSubscriptionTier };
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'revoke_subscription',
        reason, beforeState: before,
      }).returning();
      await tx.update(playerProfiles)
        .set({ activeSubscriptionTier: null, subscriptionExpiresAt: null, equippedFrameId: null, updatedAt: new Date() })
        .where(eq(playerProfiles.id, targetPlayerId));
      await tx.update(adminActions)
        .set({ afterState: { activeSubscriptionTier: null } })
        .where(eq(adminActions.id, action.id));
    });
  }

  // ── Admin ban operations ────────────────────────────────────────────────────

  async adminBanPlayer(adminId: string, targetPlayerId: string, durationDays: number | null, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    const now = new Date();
    const banExpiresAt = durationDays !== null
      ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
      : null;
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ bannedAt: playerProfiles.bannedAt, banReason: playerProfiles.banReason })
        .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
      if (!target) throw new Error(`Player ${targetPlayerId} not found`);
      const before = { bannedAt: target.bannedAt?.toISOString() ?? null, banReason: target.banReason };
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'ban',
        reason, beforeState: before,
        metadata: { durationDays, permanent: durationDays === null, banExpiresAt: banExpiresAt?.toISOString() ?? null },
      }).returning();
      await tx.update(playerProfiles)
        .set({ bannedAt: now, banExpiresAt, banReason: reason, updatedAt: now })
        .where(eq(playerProfiles.id, targetPlayerId));
      // Invalidate all existing sessions so the ban takes effect immediately
      await tx.delete(sessions).where(eq(sessions.playerId, targetPlayerId));
      await tx.update(adminActions)
        .set({ afterState: { bannedAt: now.toISOString(), banExpiresAt: banExpiresAt?.toISOString() ?? null } })
        .where(eq(adminActions.id, action.id));
    });
  }

  async adminUnbanPlayer(adminId: string, targetPlayerId: string, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ bannedAt: playerProfiles.bannedAt, banReason: playerProfiles.banReason })
        .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
      if (!target) throw new Error(`Player ${targetPlayerId} not found`);
      const before = { bannedAt: target.bannedAt?.toISOString() ?? null, banReason: target.banReason };
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'unban', reason, beforeState: before,
      }).returning();
      await tx.update(playerProfiles)
        .set({ bannedAt: null, banExpiresAt: null, banReason: null, updatedAt: new Date() })
        .where(eq(playerProfiles.id, targetPlayerId));
      await tx.update(adminActions)
        .set({ afterState: { bannedAt: null } })
        .where(eq(adminActions.id, action.id));
    });
  }

  // ── Admin account deletion ──────────────────────────────────────────────────

  async adminDeleteAccount(adminId: string, targetPlayerId: string, reason: string): Promise<void> {
    this._guardSelf(adminId, targetPlayerId);
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ displayName: playerProfiles.displayName, email: playerProfiles.email,
                  chipBalance: playerProfiles.chipBalance, stripes: playerProfiles.stripes })
        .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
      if (!target) throw new Error(`Player ${targetPlayerId} not found`);
      const before = { displayName: target.displayName, email: target.email,
                       chipBalance: target.chipBalance, stripes: target.stripes };
      const [action] = await tx.insert(adminActions).values({
        adminId, targetPlayerId, actionType: 'delete_account', reason, beforeState: before,
      }).returning();
      // Soft delete: scrub PII, zero balances, set isDeleted flag. Row kept for audit.
      await tx.update(playerProfiles)
        .set({
          isDeleted:    true,
          displayName:  'Deleted User',
          email:        null,
          passwordHash: randomUUID(), // non-matching hash — prevents re-auth
          chipBalance:  0,
          stripes:      0,
          bannedAt:     null, banExpiresAt: null, banReason: null,
          updatedAt:    new Date(),
        })
        .where(eq(playerProfiles.id, targetPlayerId));
      await tx.delete(sessions).where(eq(sessions.playerId, targetPlayerId));
      await tx.update(adminActions)
        .set({ afterState: { isDeleted: true, displayName: 'Deleted User' } })
        .where(eq(adminActions.id, action.id));
    });
  }

  // ── Admin password reset ────────────────────────────────────────────────────

  async adminTriggerPasswordReset(adminId: string, targetPlayerId: string, reason: string): Promise<{ resetToken: string }> {
    this._guardSelf(adminId, targetPlayerId);
    const [target] = await db
      .select({ email: playerProfiles.email, displayName: playerProfiles.displayName })
      .from(playerProfiles).where(eq(playerProfiles.id, targetPlayerId)).limit(1);
    if (!target) throw new Error(`Player ${targetPlayerId} not found`);
    if (!target.email) throw new Error('Player has no email — cannot trigger password reset');
    const resetToken = randomBytes(32).toString('hex');
    // Phase 3: store resetToken in a password_reset_tokens table and email it.
    // For now: return it to the authorized admin for manual delivery. Never log it.
    await db.insert(adminActions).values({
      adminId, targetPlayerId, actionType: 'reset_password', reason,
      beforeState: { email: target.email },
      afterState:  { resetTokenGenerated: true },
      metadata:    { email: target.email },
    });
    console.log(`[ADMIN_RESET] at=${new Date().toISOString()} adminId=${adminId} playerId=${targetPlayerId}`);
    return { resetToken };
  }

  // ── Admin audit log ─────────────────────────────────────────────────────────

  // ── Quest methods ────────────────────────────────────────────────────────────

  async incrementHandsPlayed(playerId: string, modeId: string): Promise<void> {
    const update =
      modeId === 'badugi' ? { handsPlayedBadugi: sql`${playerProfiles.handsPlayedBadugi} + 1` } :
      modeId === 'dead7'  ? { handsPlayedDead7:  sql`${playerProfiles.handsPlayedDead7}  + 1` } :
      modeId === '1535'   ? { handsPlayed1535:   sql`${playerProfiles.handsPlayed1535}   + 1` } :
      modeId === 'suits'  ? { handsPlayedSuits:  sql`${playerProfiles.handsPlayedSuits}  + 1` } :
      null;
    if (!update) return;
    await db.update(playerProfiles).set(update).where(eq(playerProfiles.id, playerId));
  }

  async getClaimedQuests(playerId: string): Promise<string[]> {
    const rows = await db
      .select({ questId: questProgress.questId })
      .from(questProgress)
      .where(eq(questProgress.playerId, playerId));
    return rows.map(r => r.questId);
  }

  async claimQuest(playerId: string, questId: string, stripesReward: number): Promise<{ newStripes: number }> {
    // Check daily re-claim: if questId starts with 'daily_', block if already claimed within the last 48 hours
    const isDailyQuest = questId.startsWith('daily_');
    const fortyEightHoursAgoUtc = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const existing = await db
      .select({ claimedAt: questProgress.claimedAt })
      .from(questProgress)
      .where(and(eq(questProgress.playerId, playerId), eq(questProgress.questId, questId)))
      .limit(1);

    if (existing[0]) {
      if (!isDailyQuest) throw Object.assign(new Error('Quest already claimed'), { code: 'already_claimed' });
      // For daily quests: only block if claimed within the last 48 hours
      if (existing[0].claimedAt >= fortyEightHoursAgoUtc) throw Object.assign(new Error('Quest already claimed today'), { code: 'already_claimed' });
      // Different day — update the claimedAt to today (upsert)
      await db
        .update(questProgress)
        .set({ claimedAt: new Date() })
        .where(and(eq(questProgress.playerId, playerId), eq(questProgress.questId, questId)));
    } else {
      await db
        .insert(questProgress)
        .values({ playerId, questId, claimedAt: new Date() });
    }

    const newStripes = await this.creditStripes(playerId, stripesReward, `quest:${questId}`);
    return { newStripes };
  }

  async awardWinStripes(playerId: string): Promise<{ awarded: number; dailyTotal: number }> {
    const profile = await this.getPlayerProfile(playerId);
    if (!profile) return { awarded: 0, dailyTotal: 0 };

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const needsReset = !profile.dailyWinStripesResetAt || profile.dailyWinStripesResetAt < todayStart;
    const currentTotal = needsReset ? 0 : profile.dailyWinStripes;
    if (currentTotal >= 5) return { awarded: 0, dailyTotal: 5 };

    const newTotal = currentTotal + 1;
    await db.update(playerProfiles)
      .set({
        dailyWinStripes: newTotal,
        dailyWinStripesResetAt: needsReset ? new Date() : profile.dailyWinStripesResetAt,
        stripes: sql`${playerProfiles.stripes} + 1`,
      })
      .where(eq(playerProfiles.id, playerId));

    await db.insert(stripeTransactions).values({
      playerId,
      amount: 1,
      reason: 'win_reward',
      balanceAfter: (profile.stripes ?? 0) + 1,
    });

    return { awarded: 1, dailyTotal: newTotal };
  }

  async grantChipLoan(playerId: string): Promise<{ success: boolean; error?: string; newBalance?: number }> {
    return await db.transaction(async (tx) => {
      // Read eligibility and snapshot inside the transaction to make check-and-write atomic.
      // Any concurrent addChipsToPlayer/adminGrantChips between the old SELECT and UPDATE
      // would have caused an absolute-SET overwrite. The relative SQL below prevents that.
      const [profile] = await tx
        .select({ chipBalance: playerProfiles.chipBalance, chipLoanBalance: playerProfiles.chipLoanBalance })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);
      if (!profile) return { success: false, error: 'player_not_found' };
      if (profile.chipLoanBalance > 0) return { success: false, error: 'existing_loan' };
      if (profile.chipBalance > 500) return { success: false, error: 'not_broke' };

      const loanAmount    = 1000;
      const beforeBalance = profile.chipBalance;
      const afterBalance  = beforeBalance + loanAmount;

      await tx.update(playerProfiles)
        .set({
          chipBalance:       sql`${playerProfiles.chipBalance} + ${loanAmount}`,
          chipLoanBalance:   loanAmount,
          chipLoanGrantedAt: new Date(),
          updatedAt:         new Date(),
        })
        .where(eq(playerProfiles.id, playerId));

      await this._insertChipLedger(tx, {
        playerId,
        beforeBalance,
        amountChange: loanAmount,
        afterBalance,
        reason: 'other',
        source: 'chip_loan_grant',
      });

      return { success: true, newBalance: afterBalance };
    });
  }

  async repayChipLoan(playerId: string, chipsEarned: number): Promise<number> {
    return await db.transaction(async (tx) => {
      // Read loan state and balance snapshot inside the transaction so the relative
      // deduct below cannot race with a concurrent syncPlayerChips or adminGrantChips
      // that commits between our old standalone SELECT and UPDATE.
      const [profile] = await tx
        .select({ chipBalance: playerProfiles.chipBalance, chipLoanBalance: playerProfiles.chipLoanBalance })
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId))
        .limit(1);
      if (!profile || profile.chipLoanBalance <= 0) return chipsEarned;

      const repayAmount    = Math.min(profile.chipLoanBalance, chipsEarned);
      const newLoanBalance = profile.chipLoanBalance - repayAmount;
      const beforeBalance  = profile.chipBalance;
      const afterBalance   = beforeBalance - repayAmount;

      await tx.update(playerProfiles)
        .set({
          chipBalance:    sql`${playerProfiles.chipBalance} - ${repayAmount}`,
          chipLoanBalance: newLoanBalance,
          updatedAt:       new Date(),
        })
        .where(eq(playerProfiles.id, playerId));

      await this._insertChipLedger(tx, {
        playerId,
        beforeBalance,
        amountChange: -repayAmount,
        afterBalance,
        reason: 'other',
        source: 'chip_loan_repayment',
      });

      return chipsEarned - repayAmount;
    });
  }

  async getAdminAuditLog(opts: { limit: number; offset: number; actionType?: string; adminId?: string }): Promise<AdminAuditLogEntry[]> {
    const conditions = [];
    if (opts.actionType) conditions.push(eq(adminActions.actionType, opts.actionType));
    if (opts.adminId)   conditions.push(eq(adminActions.adminId,    opts.adminId));

    return db
      .select({
        id:             adminActions.id,
        adminId:        adminActions.adminId,
        adminName:      sql<string>`(SELECT display_name FROM player_profiles WHERE id = ${adminActions.adminId})`,
        targetPlayerId: adminActions.targetPlayerId,
        targetName:     sql<string>`(SELECT display_name FROM player_profiles WHERE id = ${adminActions.targetPlayerId})`,
        actionType:     adminActions.actionType,
        reason:         adminActions.reason,
        beforeState:    adminActions.beforeState,
        afterState:     adminActions.afterState,
        metadata:       adminActions.metadata,
        createdAt:      adminActions.createdAt,
      })
      .from(adminActions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(adminActions.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  // ── Lady Luck Race History ──────────────────────────────────────────────────

  async logLadyLuckRace(params: {
    tableId: string;
    roomType: string;
    winningSuit: string;
    flippedCards: { rank: string; suit: string }[];
    seatResults: LLSeatResult[];
  }): Promise<void> {
    await db.insert(ladyluckRaceResults).values({
      tableId:      params.tableId,
      roomType:     params.roomType,
      winningSuit:  params.winningSuit,
      flippedCards: params.flippedCards,
      seatResults:  params.seatResults,
    });
  }

  async getLadyLuckPersonalHistory(playerId: string, limit: number): Promise<{
    id: number; tableId: string; roomType: string; winningSuit: string; playedAt: Date;
    myResult: { pickedSuit: string; wager: number; won: boolean; chipChange: number } | null;
  }[]> {
    const rows = await db
      .select()
      .from(ladyluckRaceResults)
      .where(sql`${ladyluckRaceResults.seatResults} @> ${JSON.stringify([{ playerId }])}::jsonb`)
      .orderBy(desc(ladyluckRaceResults.playedAt))
      .limit(limit);

    return rows.map(row => {
      const seats = row.seatResults as LLSeatResult[];
      const seat  = seats.find(s => s.playerId === playerId) ?? null;
      return {
        id:          row.id,
        tableId:     row.tableId,
        roomType:    row.roomType,
        winningSuit: row.winningSuit,
        playedAt:    row.playedAt,
        myResult:    seat ? { pickedSuit: seat.pickedSuit, wager: seat.wager, won: seat.won, chipChange: seat.chipChange } : null,
      };
    });
  }

  async getLadyLuckStats(): Promise<{
    queens: Record<string, number>;
    totalRaces: number;
    cards: Record<string, Record<string, number>>;
  }> {
    const rows = await db
      .select({ winningSuit: ladyluckRaceResults.winningSuit, flippedCards: ladyluckRaceResults.flippedCards })
      .from(ladyluckRaceResults);

    const queens: Record<string, number> = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
    const cards:  Record<string, Record<string, number>> = {};

    for (const row of rows) {
      queens[row.winningSuit] = (queens[row.winningSuit] ?? 0) + 1;
      for (const card of (row.flippedCards as { rank: string; suit: string }[])) {
        if (!cards[card.rank]) cards[card.rank] = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
        cards[card.rank][card.suit] = (cards[card.rank][card.suit] ?? 0) + 1;
      }
    }

    return { queens, totalRaces: rows.length, cards };
  }
}

export const storage = new MemStorage();
