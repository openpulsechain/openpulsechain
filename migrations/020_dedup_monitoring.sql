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
ALTER TABLE token_monitoring_pools
  ADD CONSTRAINT IF NOT EXISTS uq_monitoring_pool_snapshot
  UNIQUE (token_address, pair_address, snapshot_at);
