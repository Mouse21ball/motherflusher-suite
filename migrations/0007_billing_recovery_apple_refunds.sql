ALTER TABLE purchase_transactions
  ADD COLUMN IF NOT EXISTS verification_lease_until timestamp,
  ADD COLUMN IF NOT EXISTS crew_id text;