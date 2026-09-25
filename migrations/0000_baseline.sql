-- Schema-only baseline captured from the production PostgreSQL catalog on
-- 2026-09-25. No table data is included and this migration was not applied.
-- Do not replay it against an already initialized production database.

CREATE TABLE "admin_actions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" text NOT NULL,
	"target_player_id" text NOT NULL,
	"action_type" text NOT NULL,
	"reason" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"player_id" text NOT NULL,
	"mode" text,
	"duration_ms" integer,
	"event_date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_players" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chip_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"before_balance" integer NOT NULL,
	"amount_change" integer NOT NULL,
	"after_balance" integer NOT NULL,
	"reason" text NOT NULL,
	"game_id" text,
	"hand_id" text,
	"source" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_chip_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"crew_id" text NOT NULL,
	"player_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "cosmetic_items" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"category" varchar(32) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"description" varchar(512) NOT NULL,
	"stripes_cost" integer,
	"asset_path" varchar(256) NOT NULL,
	"color_value" varchar(16),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cosmetic_items_backup_20260524" (
	"id" varchar(64),
	"category" varchar(32),
	"display_name" varchar(128),
	"description" varchar(512),
	"stripes_cost" integer,
	"asset_path" varchar(256),
	"color_value" varchar(16),
	"active" boolean,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cosmetic_purchases" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"cosmetic_item_id" varchar(64) NOT NULL,
	"stripes_spent" integer NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_chat_messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" text NOT NULL,
	"player_id" text NOT NULL,
	"message" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" text NOT NULL,
	"player_id" text NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"event_data" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_members" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" text NOT NULL,
	"player_id" text NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_chips_won" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(30) NOT NULL,
	"description" varchar(200),
	"invite_code" varchar(6) NOT NULL,
	"captain_id" text NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"disbanded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chip_bank" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"club_id" text DEFAULT '' NOT NULL,
	CONSTRAINT "crews_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "daily_bonus_claims" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"streak_day" integer NOT NULL,
	"chips_granted" integer NOT NULL,
	"stripes_granted" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_table_snapshots" (
	"persist_key" text PRIMARY KEY NOT NULL,
	"mode_id" text NOT NULL,
	"table_id" text NOT NULL,
	"hand_id" integer NOT NULL,
	"data_json" jsonb NOT NULL,
	"saved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "house_rake_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"game_mode" text NOT NULL,
	"hand_or_race_id" text,
	"gross_pot" integer NOT NULL,
	"rake_amount" integer NOT NULL,
	"net_pot" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ladyluck_race_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"room_type" text NOT NULL,
	"winning_suit" text NOT NULL,
	"flipped_cards" jsonb NOT NULL,
	"seat_results" jsonb NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_inventory" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"cosmetic_item_id" varchar(64) NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT 'Guest' NOT NULL,
	"chip_balance" integer DEFAULT 1000 NOT NULL,
	"stripes" integer DEFAULT 0 NOT NULL,
	"active_table_id" text,
	"active_seat_id" text,
	"active_mode_id" text,
	"hands_played" integer DEFAULT 0 NOT NULL,
	"hands_played_badugi" integer DEFAULT 0 NOT NULL,
	"hands_played_dead7" integer DEFAULT 0 NOT NULL,
	"hands_played_1535" integer DEFAULT 0 NOT NULL,
	"hands_played_suits" integer DEFAULT 0 NOT NULL,
	"hands_won" integer DEFAULT 0 NOT NULL,
	"lifetime_profit" integer DEFAULT 0 NOT NULL,
	"email" text,
	"password_hash" text,
	"avatar_id" text,
	"equipped_avatar_id" text,
	"equipped_frame_id" text,
	"equipped_name_color_id" text,
	"equipped_lobby_track" text,
	"equipped_game_track" text,
	"equipped_lady_luck_track" text,
	"last_name_change_at" timestamp,
	"last_reset_at" timestamp,
	"last_bonus_claimed_at" timestamp,
	"bonus_streak_day" integer DEFAULT 1 NOT NULL,
	"total_bonus_claims" integer DEFAULT 0 NOT NULL,
	"active_subscription_tier" text,
	"subscription_expires_at" timestamp with time zone,
	"subscription_last_stripes_grant_at" timestamp with time zone,
	"current_crew_id" text,
	"time_bank_free_uses_remaining" integer DEFAULT 2 NOT NULL,
	"time_bank_purchased_uses" integer DEFAULT 0 NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"welcome_kit_claimed" boolean DEFAULT false NOT NULL,
	"daily_win_stripes" integer DEFAULT 0 NOT NULL,
	"daily_win_stripes_reset_at" timestamp,
	"banned_at" timestamp,
	"ban_expires_at" timestamp,
	"ban_reason" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"chip_loan_balance" integer DEFAULT 0 NOT NULL,
	"chip_loan_granted_at" timestamp,
	"password_reset_token" text,
	"password_reset_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_reports" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text NOT NULL,
	"reported_id" text NOT NULL,
	"reason" text NOT NULL,
	"context" text,
	"context_type" text,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolution" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_transactions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"product_id" text NOT NULL,
	"stripes_granted" integer NOT NULL,
	"price_usd_cents" integer NOT NULL,
	"purchase_token" text NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"google_order_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp,
	CONSTRAINT "purchase_transactions_purchase_token_unique" UNIQUE("purchase_token")
);
--> statement-breakpoint
CREATE TABLE "quest_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"quest_id" text NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"balance_after" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"subscription_id" text,
	"event_type" varchar(32) NOT NULL,
	"event_data" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"tier" varchar(32) NOT NULL,
	"billing_period" varchar(16) NOT NULL,
	"product_id" varchar(64) NOT NULL,
	"purchase_token" text NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"auto_renewing" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone,
	"previous_frame_id" text,
	"stripes_granted_current_cycle" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "subscriptions_purchase_token_unique" UNIQUE("purchase_token")
);
--> statement-breakpoint
CREATE TABLE "time_bank_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"table_id" text,
	"stripes_cost" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_player_profiles_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."player_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_target_player_id_player_profiles_id_fk" FOREIGN KEY ("target_player_id") REFERENCES "public"."player_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_players" ADD CONSTRAINT "blocked_players_blocker_id_player_profiles_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_players" ADD CONSTRAINT "blocked_players_blocked_id_player_profiles_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_transactions" ADD CONSTRAINT "chip_transactions_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_chip_requests" ADD CONSTRAINT "club_chip_requests_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_chip_requests" ADD CONSTRAINT "club_chip_requests_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cosmetic_purchases" ADD CONSTRAINT "cosmetic_purchases_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cosmetic_purchases" ADD CONSTRAINT "cosmetic_purchases_cosmetic_item_id_cosmetic_items_id_fk" FOREIGN KEY ("cosmetic_item_id") REFERENCES "public"."cosmetic_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_chat_messages" ADD CONSTRAINT "crew_chat_messages_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_chat_messages" ADD CONSTRAINT "crew_chat_messages_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_events" ADD CONSTRAINT "crew_events_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_events" ADD CONSTRAINT "crew_events_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_captain_id_player_profiles_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."player_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_bonus_claims" ADD CONSTRAINT "daily_bonus_claims_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_cosmetic_item_id_cosmetic_items_id_fk" FOREIGN KEY ("cosmetic_item_id") REFERENCES "public"."cosmetic_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_reports" ADD CONSTRAINT "player_reports_reporter_id_player_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_reports" ADD CONSTRAINT "player_reports_reported_id_player_profiles_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_reports" ADD CONSTRAINT "player_reports_reviewed_by_player_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."player_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_transactions" ADD CONSTRAINT "purchase_transactions_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_transactions" ADD CONSTRAINT "stripe_transactions_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_bank_events" ADD CONSTRAINT "time_bank_events_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_actions_target_idx" ON "admin_actions" USING btree ("target_player_id");--> statement-breakpoint
CREATE INDEX "admin_actions_admin_idx" ON "admin_actions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_actions_type_created_idx" ON "admin_actions" USING btree ("action_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_players_blocker_blocked_uniq" ON "blocked_players" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "blocked_players_blocker_idx" ON "blocked_players" USING btree ("blocker_id");--> statement-breakpoint
CREATE INDEX "chip_tx_player_created_idx" ON "chip_transactions" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "chip_tx_reason_idx" ON "chip_transactions" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "chip_tx_created_at_idx" ON "chip_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "game_table_snapshots_mode_idx" ON "game_table_snapshots" USING btree ("mode_id");--> statement-breakpoint
CREATE INDEX "game_table_snapshots_saved_idx" ON "game_table_snapshots" USING btree ("saved_at");--> statement-breakpoint
CREATE INDEX "house_rake_logs_mode_idx" ON "house_rake_logs" USING btree ("game_mode");--> statement-breakpoint
CREATE INDEX "house_rake_logs_created_idx" ON "house_rake_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ll_race_results_played_idx" ON "ladyluck_race_results" USING btree ("played_at");--> statement-breakpoint
CREATE INDEX "ll_race_results_room_idx" ON "ladyluck_race_results" USING btree ("room_type");--> statement-breakpoint
CREATE INDEX "player_reports_reporter_idx" ON "player_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "player_reports_reported_idx" ON "player_reports" USING btree ("reported_id");--> statement-breakpoint
CREATE INDEX "player_reports_status_idx" ON "player_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_progress_player_quest_uniq" ON "quest_progress" USING btree ("player_id","quest_id");--> statement-breakpoint
CREATE INDEX "quest_progress_player_idx" ON "quest_progress" USING btree ("player_id");
--> statement-breakpoint
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_player_id_cosmetic_item_id_key" UNIQUE ("player_id", "cosmetic_item_id");
--> statement-breakpoint
CREATE INDEX idx_cosmetic_purchases_player_id ON public.cosmetic_purchases USING btree (player_id);
--> statement-breakpoint
CREATE INDEX idx_crew_chat_crew_time ON public.crew_chat_messages USING btree (crew_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_crew_events_crew ON public.crew_events USING btree (crew_id, occurred_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_crew_members_crew_player ON public.crew_members USING btree (crew_id, player_id);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_crew_members_player ON public.crew_members USING btree (player_id);
--> statement-breakpoint
CREATE INDEX idx_crews_captain ON public.crews USING btree (captain_id);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_crews_invite ON public.crews USING btree (invite_code) WHERE (disbanded_at IS NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_crews_name_ci ON public.crews USING btree (lower((name)::text)) WHERE (disbanded_at IS NULL);
--> statement-breakpoint
CREATE INDEX idx_daily_bonus_claims_player_id ON public.daily_bonus_claims USING btree (player_id);
--> statement-breakpoint
CREATE INDEX idx_player_inventory_player_id ON public.player_inventory USING btree (player_id);
--> statement-breakpoint
CREATE INDEX idx_player_profiles_current_crew_id ON public.player_profiles USING btree (current_crew_id) WHERE (current_crew_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX player_profiles_email_unique ON public.player_profiles USING btree (email) WHERE (email IS NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_pt_player ON public.purchase_transactions USING btree (player_id);
--> statement-breakpoint
CREATE INDEX idx_pt_token ON public.purchase_transactions USING btree (purchase_token);
--> statement-breakpoint
CREATE INDEX idx_sessions_expires ON public.sessions USING btree (expires_at);
--> statement-breakpoint
CREATE INDEX idx_sessions_player ON public.sessions USING btree (player_id);
--> statement-breakpoint
CREATE INDEX idx_sub_events_player ON public.subscription_events USING btree (player_id);
--> statement-breakpoint
CREATE INDEX idx_sub_events_sub ON public.subscription_events USING btree (subscription_id);
--> statement-breakpoint
CREATE INDEX idx_subscriptions_player_id ON public.subscriptions USING btree (player_id);
--> statement-breakpoint
CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);
--> statement-breakpoint
CREATE INDEX idx_tbe_occurred ON public.time_bank_events USING btree (occurred_at DESC);
--> statement-breakpoint
CREATE INDEX idx_tbe_player ON public.time_bank_events USING btree (player_id);