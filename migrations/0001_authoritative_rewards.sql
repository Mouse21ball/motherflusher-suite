-- Additive schema migration for authoritative XP and bonus claims.
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS xp_backfilled boolean NOT NULL DEFAULT false;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS xp_win_streak integer NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS xp_loss_streak integer NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS xp_biggest_pot integer NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS xp_badugis_won integer NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS xp_modes_played jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS xp_achievements jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS last_daily_reward_at timestamp;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS daily_reward_streak integer NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS last_hourly_reward_at timestamp;
CREATE TABLE IF NOT EXISTS hand_xp_awards (
  player_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  game_id text NOT NULL,
  hand_id text NOT NULL,
  xp_granted integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS hand_xp_awards_unique ON hand_xp_awards(player_id, game_id, hand_id);
-- Historical results are not reconstructable. Backfill base XP only.
-- Keep historical welcome_kit_claimed flags unchanged: no retroactive forfeiture
-- of an unclaimed kit and no re-grant for already-claimed profiles.
UPDATE player_profiles SET xp = hands_played * 10, xp_backfilled = true WHERE xp_backfilled = false;