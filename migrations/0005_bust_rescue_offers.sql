CREATE TABLE IF NOT EXISTS bust_rescue_offers (
  player_id text PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
  issued_at timestamp NOT NULL,
  expires_at timestamp NOT NULL,
  claimed_at timestamp
);