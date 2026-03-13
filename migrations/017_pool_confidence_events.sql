-- Pool Confidence Events: archives every confidence change per LP
-- Populated by token_monitoring.py when a pool's confidence/legitimacy changes
-- Frontend reads this for the "Confidence History" popup

CREATE TABLE IF NOT EXISTS pool_confidence_events (
  id BIGSERIAL PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token_address TEXT NOT NULL,
  pair_address TEXT NOT NULL,

  -- Previous state
  prev_confidence TEXT,          -- null if first observation
  prev_is_legitimate BOOLEAN,
  prev_spam_reason TEXT,

  -- New state
  new_confidence TEXT NOT NULL,
  new_is_legitimate BOOLEAN NOT NULL,
  new_spam_reason TEXT,

  -- Context at time of change
  reserve_usd NUMERIC,
  volume_24h_usd NUMERIC,
  liquidity_usd NUMERIC,
  token0_symbol TEXT,
  token1_symbol TEXT,
  dex_version TEXT,

  -- Human-readable summary
  event_summary TEXT             -- e.g. "Confidence upgraded: suspect → medium (token now known)"
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pce_token ON pool_confidence_events(token_address);
CREATE INDEX IF NOT EXISTS idx_pce_pair ON pool_confidence_events(pair_address);
CREATE INDEX IF NOT EXISTS idx_pce_event_at ON pool_confidence_events(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_pce_token_pair ON pool_confidence_events(token_address, pair_address, event_at DESC);

-- RLS
ALTER TABLE pool_confidence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pool_confidence_events_read" ON pool_confidence_events FOR SELECT USING (true);

COMMENT ON TABLE pool_confidence_events IS 'Historical log of confidence/legitimacy changes per LP pool. Each row = one transition (e.g. suspect→medium). Populated by token_monitoring indexer on each 6h run when values change.';
