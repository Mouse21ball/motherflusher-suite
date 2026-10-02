-- Legacy unbound sessions cannot receive new credits. New sessions bind to the
-- immutable settled-loss ledger entry, surviving reconnects and server restarts.
ALTER TABLE rewarded_ad_sessions ADD COLUMN IF NOT EXISTS bust_event_id text;
ALTER TABLE rewarded_ad_sessions ADD COLUMN IF NOT EXISTS reward_requested_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS rewarded_ad_player_bust_idx
  ON rewarded_ad_sessions(player_id, bust_event_id);