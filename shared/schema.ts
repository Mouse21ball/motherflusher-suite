import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Player Profiles ──────────────────────────────────────────────────────────
export const playerProfiles = pgTable("player_profiles", {
  id:                 text("id").primaryKey(),
  displayName:        text("display_name").notNull().default("Guest"),
  chipBalance:        integer("chip_balance").notNull().default(1000),
  stripes:            integer("stripes").notNull().default(0),
  activeTableId:      text("active_table_id"),
  activeSeatId:       text("active_seat_id"),
  activeModeId:       text("active_mode_id"),
  handsPlayed:        integer("hands_played").notNull().default(0),
  handsWon:           integer("hands_won").notNull().default(0),
  lifetimeProfit:     integer("lifetime_profit").notNull().default(0),
  email:              text("email").unique(),
  passwordHash:       text("password_hash"),
  // ── Avatar & customisation ──────────────────────────────────────────────────
  avatarId:           text("avatar_id"),                    // null → use initials
  // ── Name change cooldown (90 days) ─────────────────────────────────────────
  lastNameChangeAt:   timestamp("last_name_change_at"),     // null → never changed
  // ── Guest reset tracking ────────────────────────────────────────────────────
  lastResetAt:        timestamp("last_reset_at"),           // null → never reset
  createdAt:          timestamp("created_at").defaultNow().notNull(),
  updatedAt:          timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlayerProfileSchema = createInsertSchema(playerProfiles).omit({
  lastNameChangeAt: true,
  lastResetAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlayerProfile = z.infer<typeof insertPlayerProfileSchema>;
export type PlayerProfile = typeof playerProfiles.$inferSelect;

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
