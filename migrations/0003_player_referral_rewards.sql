ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS referral_code varchar(16),
  ADD COLUMN IF NOT EXISTS referred_by_player_id text REFERENCES player_profiles(id) ON DELETE SET NULL;

UPDATE player_profiles
SET referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
WHERE referral_code IS NULL;

ALTER TABLE player_profiles
  ALTER COLUMN referral_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  ALTER COLUMN referral_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_referral_code_uidx
  ON player_profiles(referral_code);

CREATE TABLE IF NOT EXISTS player_referrals (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  referrer_player_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  referee_player_id text NOT NULL UNIQUE REFERENCES player_profiles(id) ON DELETE CASCADE,
  code_used varchar(16) NOT NULL,
  referee_rewarded_at timestamp,
  referrer_rewarded_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_referrals_referrer_idx
  ON player_referrals(referrer_player_id);