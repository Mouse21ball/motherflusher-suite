import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Player Profiles ──────────────────────────────────────────────────────────
export const playerProfiles = pgTable("player_profiles", {
  id:                   text("id").primaryKey(),
  displayName:          text("display_name").notNull().default("Guest"),
  chipBalance:          integer("chip_balance").notNull().default(1000),
  stripes:              integer("stripes").notNull().default(0),
  activeTableId:        text("active_table_id"),
  activeSeatId:         text("active_seat_id"),
  activeModeId:         text("active_mode_id"),
  handsPlayed:          integer("hands_played").notNull().default(0),
  handsWon:             integer("hands_won").notNull().default(0),
  lifetimeProfit:       integer("lifetime_profit").notNull().default(0),
  email:                text("email").unique(),
  passwordHash:         text("password_hash"),
  // ── Avatar & customisation ──────────────────────────────────────────────────
  avatarId:             text("avatar_id"),                    // null → use initials
  // ── Equipped cosmetics ──────────────────────────────────────────────────────
  equippedAvatarId:     text("equipped_avatar_id"),           // premium avatar override
  equippedFrameId:      text("equipped_frame_id"),            // decorative border
  equippedNameColorId:  text("equipped_name_color_id"),       // colored display name
  // ── Name change cooldown (90 days) ─────────────────────────────────────────
  lastNameChangeAt:     timestamp("last_name_change_at"),     // null → never changed
  // ── Guest reset tracking ────────────────────────────────────────────────────
  lastResetAt:          timestamp("last_reset_at"),           // null → never reset
  // ── Daily bonus streak tracking ─────────────────────────────────────────────
  lastBonusClaimedAt:   timestamp("last_bonus_claimed_at"),   // null → never claimed
  bonusStreakDay:       integer("bonus_streak_day").notNull().default(1),
  totalBonusClaims:    integer("total_bonus_claims").notNull().default(0),
  // ── Subscription tier (denormalized for fast lookups) ──────────────────────
  activeSubscriptionTier:          text("active_subscription_tier"),          // null | "gold_pro" | "diamond_elite"
  subscriptionExpiresAt:           timestamp("subscription_expires_at"),      // null if no active sub
  subscriptionLastStripesGrantAt:  timestamp("subscription_last_stripes_grant_at"), // last monthly Stripes drop
  // ── Crew (denormalized for fast lookup; source of truth is crew_members) ──
  currentCrewId:        text("current_crew_id"),                             // null if not in a Crew
  // ── Time Bank ───────────────────────────────────────────────────────────────
  timeBankFreeUsesRemaining: integer("time_bank_free_uses_remaining").notNull().default(2),
  timeBankPurchasedUses:     integer("time_bank_purchased_uses").notNull().default(0),
  // ── Admin flag ──────────────────────────────────────────────────────────────
  isAdmin:              boolean("is_admin").notNull().default(false),
  // ── Welcome kit (new player advantage pack) ─────────────────────────────────
  welcomeKitClaimed:    boolean("welcome_kit_claimed").notNull().default(false),
  // ── Account status ───────────────────────────────────────────────────────────
  bannedAt:             timestamp("banned_at"),
  banExpiresAt:         timestamp("ban_expires_at"),
  banReason:            text("ban_reason"),
  isDeleted:            boolean("is_deleted").notNull().default(false),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlayerProfileSchema = createInsertSchema(playerProfiles).omit({
  lastNameChangeAt:               true,
  lastResetAt:                    true,
  lastBonusClaimedAt:             true,
  bonusStreakDay:                 true,
  totalBonusClaims:              true,
  equippedAvatarId:               true,
  equippedFrameId:                true,
  equippedNameColorId:            true,
  activeSubscriptionTier:         true,
  subscriptionExpiresAt:          true,
  subscriptionLastStripesGrantAt: true,
  currentCrewId:                  true,
  timeBankFreeUsesRemaining:      true,
  timeBankPurchasedUses:          true,
  welcomeKitClaimed:              true,
  bannedAt:                       true,
  banExpiresAt:                   true,
  banReason:                      true,
  isDeleted:                      true,
  createdAt:                      true,
  updatedAt:                      true,
});

export type InsertPlayerProfile = z.infer<typeof insertPlayerProfileSchema>;
export type PlayerProfile = typeof playerProfiles.$inferSelect;

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  token:     text("token").primaryKey(),
  playerId:  text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;

// ─── Stripe Transactions (audit log) ─────────────────────────────────────────
export const stripeTransactions = pgTable("stripe_transactions", {
  id:           serial("id").primaryKey(),
  playerId:     text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  amount:       integer("amount").notNull(),
  reason:       text("reason").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export type StripeTransaction = typeof stripeTransactions.$inferSelect;

// ─── Purchase Transactions (real-money billing) ───────────────────────────────
export const purchaseTransactions = pgTable("purchase_transactions", {
  id:                 text("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId:           text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  productId:          text("product_id").notNull(),
  stripesGranted:     integer("stripes_granted").notNull(),
  priceUsdCents:      integer("price_usd_cents").notNull(),
  purchaseToken:      text("purchase_token").notNull().unique(),
  verificationStatus: text("verification_status").notNull().default("pending"),
  googleOrderId:      text("google_order_id"),
  createdAt:          timestamp("created_at").defaultNow().notNull(),
  verifiedAt:         timestamp("verified_at"),
});

export const insertPurchaseTransactionSchema = createInsertSchema(purchaseTransactions).omit({
  id: true,
  createdAt: true,
  verifiedAt: true,
});

export type InsertPurchaseTransaction = z.infer<typeof insertPurchaseTransactionSchema>;
export type PurchaseTransaction = typeof purchaseTransactions.$inferSelect;

// ─── Daily Bonus Claims (audit log) ──────────────────────────────────────────
export const dailyBonusClaims = pgTable("daily_bonus_claims", {
  id:             text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  playerId:       text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  claimedAt:      timestamp("claimed_at").defaultNow().notNull(),
  streakDay:      integer("streak_day").notNull(),
  chipsGranted:   integer("chips_granted").notNull(),
  stripesGranted: integer("stripes_granted").notNull().default(0),
});

export const insertDailyBonusClaimSchema = createInsertSchema(dailyBonusClaims).omit({
  id: true,
  claimedAt: true,
});

export type InsertDailyBonusClaim = z.infer<typeof insertDailyBonusClaimSchema>;
export type DailyBonusClaim = typeof dailyBonusClaims.$inferSelect;

// ─── Cosmetic Items (server-controlled catalog) ───────────────────────────────
export const cosmeticItems = pgTable("cosmetic_items", {
  id:          varchar("id", { length: 64 }).primaryKey(),
  category:    varchar("category", { length: 32 }).notNull(),
  displayName: varchar("display_name", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  stripesCost: integer("stripes_cost"),   // null = subscription_exclusive (not directly purchasable)
  assetPath:   varchar("asset_path", { length: 256 }).notNull(),
  colorValue:  varchar("color_value", { length: 16 }),
  active:      boolean("active").notNull().default(true),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export type CosmeticItem = typeof cosmeticItems.$inferSelect;

// ─── Player Inventory (owned cosmetics) ──────────────────────────────────────
// UNIQUE (player_id, cosmetic_item_id) enforced at DB level in migration.
export const playerInventory = pgTable("player_inventory", {
  id:             text("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId:       text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  cosmeticItemId: varchar("cosmetic_item_id", { length: 64 }).notNull().references(() => cosmeticItems.id),
  acquiredAt:     timestamp("acquired_at").defaultNow().notNull(),
  equipped:       boolean("equipped").notNull().default(false),
});

export type PlayerInventoryRow = typeof playerInventory.$inferSelect;

// ─── Cosmetic Purchases (audit log) ──────────────────────────────────────────
export const cosmeticPurchases = pgTable("cosmetic_purchases", {
  id:             text("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId:       text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  cosmeticItemId: varchar("cosmetic_item_id", { length: 64 }).notNull().references(() => cosmeticItems.id),
  stripesSpent:   integer("stripes_spent").notNull(),
  purchasedAt:    timestamp("purchased_at").defaultNow().notNull(),
});

export type CosmeticPurchase = typeof cosmeticPurchases.$inferSelect;

// ─── Subscriptions ────────────────────────────────────────────────────────────
// One row per active/historical subscription purchase token.
export const subscriptions = pgTable("subscriptions", {
  id:                         text("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId:                   text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  tier:                       varchar("tier", { length: 32 }).notNull(),           // "gold_pro" | "diamond_elite"
  billingPeriod:              varchar("billing_period", { length: 16 }).notNull(), // "monthly" | "yearly"
  productId:                  varchar("product_id", { length: 64 }).notNull(),     // Play Console product ID
  purchaseToken:              text("purchase_token").notNull().unique(),
  status:                     varchar("status", { length: 32 }).notNull().default("active"),
  // ^ "active" | "in_grace_period" | "on_hold" | "paused" | "canceled" | "expired"
  expiresAt:                  timestamp("expires_at"),
  autoRenewing:               boolean("auto_renewing").notNull().default(true),
  startedAt:                  timestamp("started_at").notNull().defaultNow(),
  lastVerifiedAt:             timestamp("last_verified_at").notNull().defaultNow(),
  canceledAt:                 timestamp("canceled_at"),
  previousFrameId:            text("previous_frame_id"),   // frame to restore on expiry
  stripesGrantedCurrentCycle: integer("stripes_granted_current_cycle").notNull().default(0),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  startedAt: true,
  lastVerifiedAt: true,
});

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// ─── Subscription Events (audit log) ─────────────────────────────────────────
export const subscriptionEvents = pgTable("subscription_events", {
  id:             text("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId:       text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  subscriptionId: text("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  eventType:      varchar("event_type", { length: 32 }).notNull(),
  // ^ "purchased" | "renewed" | "canceled" | "grace_period_entered" |
  //   "on_hold" | "recovered" | "expired" | "refunded" | "stripes_granted"
  eventData:      jsonb("event_data"),
  occurredAt:     timestamp("occurred_at").notNull().defaultNow(),
});

export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;

// ─── Crews ────────────────────────────────────────────────────────────────────
export const crews = pgTable("crews", {
  id:          text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  name:        varchar("name", { length: 30 }).notNull(),
  description: varchar("description", { length: 200 }),
  inviteCode:  varchar("invite_code", { length: 6 }).notNull().unique(),
  captainId:   text("captain_id").notNull().references(() => playerProfiles.id),
  memberCount: integer("member_count").notNull().default(1),
  disbandedAt: timestamp("disbanded_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export type Crew = typeof crews.$inferSelect;

// ─── Crew Members ─────────────────────────────────────────────────────────────
// UNIQUE (crew_id, player_id) and UNIQUE (player_id) enforced at DB level (migration).
export const crewMembers = pgTable("crew_members", {
  id:            text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  crewId:        text("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
  playerId:      text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  role:          varchar("role", { length: 16 }).notNull().default("member"), // "captain" | "member"
  joinedAt:      timestamp("joined_at").notNull().defaultNow(),
  totalChipsWon: integer("total_chips_won").notNull().default(0),
});

export type CrewMember = typeof crewMembers.$inferSelect;

// ─── Crew Chat Messages ───────────────────────────────────────────────────────
export const crewChatMessages = pgTable("crew_chat_messages", {
  id:        text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  crewId:    text("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
  playerId:  text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  message:   varchar("message", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CrewChatMessage = typeof crewChatMessages.$inferSelect;

// ─── Crew Events (audit log) ──────────────────────────────────────────────────
export const crewEvents = pgTable("crew_events", {
  id:         text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  crewId:     text("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
  playerId:   text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  eventType:  varchar("event_type", { length: 32 }).notNull(),
  // ^ "created" | "joined" | "left" | "kicked" | "captain_transferred" |
  //   "disbanded" | "renamed" | "invite_regenerated" | "stripes_paid"
  eventData:  jsonb("event_data"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
});

export type CrewEvent = typeof crewEvents.$inferSelect;

// ─── Time Bank Events (audit log) ────────────────────────────────────────────
export const timeBankEvents = pgTable("time_bank_events", {
  id:          text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  playerId:    text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  eventType:   varchar("event_type", { length: 32 }).notNull(),
  // ^ "used_free" | "used_subscription" | "used_purchased" | "purchased"
  tableId:     text("table_id"),      // null for non-table events (purchases)
  stripesCost: integer("stripes_cost"), // null unless eventType === "purchased"
  occurredAt:  timestamp("occurred_at").notNull().defaultNow(),
});

export type TimeBankEvent = typeof timeBankEvents.$inferSelect;

// ─── Chip Transactions (immutable audit ledger) ───────────────────────────────
// Every virtual chip movement writes one row here. Balance updates and ledger
// inserts always share the same database transaction — both commit or neither.
export type ChipTxReason =
  | 'hand_win'
  | 'daily_bonus'
  | 'subscription_grant'
  | 'buy_in'
  | 'guest_reset'
  | 'admin_grant'
  | 'admin_debit'
  | 'refund'
  | 'iap_purchase'   // Fix B: Google Play IAP audit (amountChange=0; Stripes credited separately)
  | 'other';

export const chipTransactions = pgTable("chip_transactions", {
  id:            serial("id").primaryKey(),
  playerId:      text("player_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  beforeBalance: integer("before_balance").notNull(),
  amountChange:  integer("amount_change").notNull(),
  afterBalance:  integer("after_balance").notNull(),
  reason:        text("reason").$type<ChipTxReason>().notNull(),
  gameId:        text("game_id"),
  handId:        text("hand_id"),
  source:        text("source").notNull(),
  metadata:      jsonb("metadata").$type<Record<string, any>>(),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chip_tx_player_created_idx").on(table.playerId, table.createdAt),
  index("chip_tx_reason_idx").on(table.reason),
  index("chip_tx_created_at_idx").on(table.createdAt),
]);

export const insertChipTransactionSchema = createInsertSchema(chipTransactions).omit({
  id:        true,
  createdAt: true,
});

export type InsertChipTransaction = z.infer<typeof insertChipTransactionSchema>;
export type ChipTransaction = typeof chipTransactions.$inferSelect;

// ─── Legacy auth users ────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  playerId: text("player_id").notNull(),
  mode: text("mode"),
  durationMs: integer("duration_ms"),
  eventDate: text("event_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;

// ─── Blocked Players ─────────────────────────────────────────────────────────
export const blockedPlayers = pgTable("blocked_players", {
  id:        text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  blockerId: text("blocker_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  blockedId: text("blocked_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("blocked_players_blocker_blocked_uniq").on(table.blockerId, table.blockedId),
  index("blocked_players_blocker_idx").on(table.blockerId),
]);

export type BlockedPlayer = typeof blockedPlayers.$inferSelect;

// ─── Player Reports ──────────────────────────────────────────────────────────
export const playerReports = pgTable("player_reports", {
  id:          text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  reporterId:  text("reporter_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  reportedId:  text("reported_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  reason:      text("reason").notNull(),
  context:     text("context"),
  contextType: text("context_type"),
  notes:       text("notes"),
  status:      text("status").notNull().default("pending"),
  resolution:  text("resolution"),
  reviewedBy:  text("reviewed_by").references(() => playerProfiles.id),
  reviewedAt:  timestamp("reviewed_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("player_reports_reporter_idx").on(table.reporterId),
  index("player_reports_reported_idx").on(table.reportedId),
  index("player_reports_status_idx").on(table.status),
]);

export type PlayerReport = typeof playerReports.$inferSelect;

// ─── Admin Actions (append-only audit log) ────────────────────────────────────
// One row per admin action. beforeState and afterState are snapshots of the
// relevant fields on the target player. metadata holds action-specific extras
// (e.g. ban duration, cosmetic IDs, chip amount). Append-only — never deleted.
export const adminActions = pgTable("admin_actions", {
  id:             text("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId:        text("admin_id").notNull().references(() => playerProfiles.id),
  targetPlayerId: text("target_player_id").notNull().references(() => playerProfiles.id),
  actionType:     text("action_type").notNull(),
  // ^ grant_chips | debit_chips | grant_stripes | debit_stripes | grant_cosmetic |
  //   revoke_cosmetic | grant_subscription | revoke_subscription | ban | unban |
  //   delete_account | reset_password
  reason:         text("reason").notNull(),
  beforeState:    jsonb("before_state").$type<Record<string, any>>(),
  afterState:     jsonb("after_state").$type<Record<string, any>>(),
  metadata:       jsonb("metadata").$type<Record<string, any>>(),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("admin_actions_target_idx").on(table.targetPlayerId),
  index("admin_actions_admin_idx").on(table.adminId),
  index("admin_actions_type_created_idx").on(table.actionType, table.createdAt),
]);

export type AdminAction = typeof adminActions.$inferSelect;
