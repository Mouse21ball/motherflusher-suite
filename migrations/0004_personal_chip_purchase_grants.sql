ALTER TABLE purchase_transactions
  ADD COLUMN IF NOT EXISTS chips_granted integer NOT NULL DEFAULT 0;