import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
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
