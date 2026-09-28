-- Upgrade databases where 0011_push_notifications.sql was already applied.
-- Assign an isolated stable identity to each pre-existing token registration.
ALTER TABLE notification_devices
  ADD COLUMN IF NOT EXISTS installation_id varchar(128);

UPDATE notification_devices
SET installation_id = gen_random_uuid()::text
WHERE installation_id IS NULL;

ALTER TABLE notification_devices
  ALTER COLUMN installation_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_devices_installation_unique
  ON notification_devices (installation_id);