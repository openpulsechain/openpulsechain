-- Deduplicate monitoring snapshots (Finding #7)
-- Clean existing duplicates first, then add UNIQUE constraint

-- Step 1: Delete duplicates (keep lowest id)
DELETE FROM token_monitoring_pools a
USING token_monitoring_pools b
WHERE a.id > b.id
  AND a.pair_address = b.pair_address
  AND a.snapshot_at = b.snapshot_at
  AND a.token_address = b.token_address;

-- Step 2: Add UNIQUE constraint to prevent future duplicates
-- Note: UPSERT is already used in token_monitoring.py, but this adds DB-level protection
-- Note: PostgreSQL does not support IF NOT EXISTS for ADD CONSTRAINT
-- Check pg_constraint before running if re-applying
ALTER TABLE token_monitoring_pools
  ADD CONSTRAINT uq_monitoring_pool_snapshot
  UNIQUE (token_address, pair_address, snapshot_at);
