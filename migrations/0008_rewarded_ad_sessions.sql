CREATE TABLE IF NOT EXISTS rewarded_ad_sessions (
  id text PRIMARY KEY,
  player_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  ad_unit_id text NOT NULL,
  test_mode boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  completed_at timestamp,
  transaction_id text UNIQUE
);

CREATE INDEX IF NOT EXISTS rewarded_ad_sessions_player_created_idx
  ON rewarded_ad_sessions(player_id, created_at);