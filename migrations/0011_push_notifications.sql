ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS last_activity_at timestamp;
UPDATE player_profiles SET last_activity_at = now() WHERE last_activity_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  player_id text PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
  streak_at_risk boolean NOT NULL DEFAULT true,
  hourly_ready boolean NOT NULL DEFAULT true,
  win_back boolean NOT NULL DEFAULT true,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_devices (
  token varchar(4096) PRIMARY KEY,
  installation_id varchar(128),
  player_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  platform varchar(8) NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE notification_devices ADD COLUMN IF NOT EXISTS installation_id varchar(128);
UPDATE notification_devices SET installation_id = gen_random_uuid()::text WHERE installation_id IS NULL;
ALTER TABLE notification_devices ALTER COLUMN installation_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_devices_installation_unique ON notification_devices (installation_id);
CREATE INDEX IF NOT EXISTS notification_devices_player_idx ON notification_devices (player_id);

CREATE TABLE IF NOT EXISTS notification_claims (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  player_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  event_key varchar(128) NOT NULL,
  claimed_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT notification_claims_player_event_unique UNIQUE (player_id, event_key)
);