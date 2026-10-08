-- Additive: preserve legacy events and their payloads.
ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS properties jsonb,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS app_version text;
CREATE INDEX IF NOT EXISTS analytics_events_player_event_idx
  ON analytics_events (player_id, event_type);
CREATE INDEX IF NOT EXISTS analytics_events_date_event_idx
  ON analytics_events (event_date, event_type);
