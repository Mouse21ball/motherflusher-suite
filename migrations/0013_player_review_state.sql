ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS has_rated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_review_prompt_at timestamp;