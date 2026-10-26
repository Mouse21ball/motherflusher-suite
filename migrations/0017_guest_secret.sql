-- Guest-auth fix: guests prove ownership with a server-issued secret (stored hashed), not their public player ID.
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS guest_secret_hash text;
-- No data change needed: existing guests start with NULL (legacy) and are secured on their next authenticated open.
-- Session and reset tokens written after the deploy are stored as SHA-256; older raw rows keep working and are re-keyed on use.
