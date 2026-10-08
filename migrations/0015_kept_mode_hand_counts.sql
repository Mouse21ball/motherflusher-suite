-- Preserve all retired hands_played_* columns and their historical values.
-- New kept-mode counters start at zero; don't relabel retired games as new ones.
ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS hands_played_flushed_up integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hands_played_lady_luck integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hands_played_box_chevy integer NOT NULL DEFAULT 0;
