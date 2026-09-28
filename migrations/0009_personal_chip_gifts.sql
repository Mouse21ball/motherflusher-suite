CREATE TABLE IF NOT EXISTS personal_chip_gifts (
  id text PRIMARY KEY,
  sender_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  recipient_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  table_id text NOT NULL,
  amount integer NOT NULL CHECK (amount = 100),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_chip_gifts_cooldown_idx
  ON personal_chip_gifts (table_id, sender_id, recipient_id, created_at);