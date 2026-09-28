CREATE TABLE IF NOT EXISTS friend_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  requester_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  recipient_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK (requester_id <> recipient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pair_uniq
  ON friend_requests (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id));
CREATE INDEX IF NOT EXISTS friend_requests_requester_idx ON friend_requests (requester_id, status);
CREATE INDEX IF NOT EXISTS friend_requests_recipient_idx ON friend_requests (recipient_id, status);

CREATE TABLE IF NOT EXISTS recent_co_seated_players (
  player_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  other_player_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  last_played_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, other_player_id),
  CHECK (player_id <> other_player_id)
);
CREATE INDEX IF NOT EXISTS recent_co_seated_players_recent_idx
  ON recent_co_seated_players (player_id, last_played_at DESC);