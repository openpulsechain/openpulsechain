-- Token Pool Events: lifecycle tracking for liquidity pools
-- Detects new pools, removed pools, liquidity changes, price divergence
-- Populated by token_monitoring indexer (diff between consecutive snapshots)

CREATE TABLE IF NOT EXISTS token_pool_events (
  id BIGSERIAL PRIMARY KEY,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  pair_address TEXT NOT NULL,

  -- ═══════════════════════════════════════════════════════════════
  -- TYPE D'ÉVÉNEMENT
  -- ═══════════════════════════════════════════════════════════════
  event_type TEXT NOT NULL,  -- 'pool_created', 'pool_removed', 'liq_spike', 'liq_drain', 'vol_spike', 'price_divergent'
  severity TEXT NOT NULL DEFAULT 'info',  -- 'info', 'warning', 'critical'

  -- ═══════════════════════════════════════════════════════════════
  -- CONTEXTE DE LA POOL
  -- ═══════════════════════════════════════════════════════════════
  dex_version TEXT,           -- 'pulsex_v1', 'pulsex_v2', '9mm', etc.
  base_symbol TEXT,
  quote_symbol TEXT,
  pool_is_legitimate BOOLEAN,
  pool_confidence TEXT,

  -- ═══════════════════════════════════════════════════════════════
  -- VALEURS (avant / après pour les changements)
  -- ═══════════════════════════════════════════════════════════════
  prev_value NUMERIC,         -- valeur précédente (liq, vol, prix)
  curr_value NUMERIC,         -- valeur actuelle
  change_pct NUMERIC,         -- % de changement
  detail TEXT,                 -- description libre (ex: "liquidity $50K → $2K (-96%)")

  -- ═══════════════════════════════════════════════════════════════
  -- SNAPSHOT DE RÉFÉRENCE
  -- ═══════════════════════════════════════════════════════════════
  prev_snapshot_at TIMESTAMPTZ,  -- snapshot précédent
  curr_snapshot_at TIMESTAMPTZ,  -- snapshot actuel

  -- Index
  UNIQUE(token_address, pair_address, event_type, curr_snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_tpe_token ON token_pool_events(token_address);
CREATE INDEX IF NOT EXISTS idx_tpe_event ON token_pool_events(event_type);
CREATE INDEX IF NOT EXISTS idx_tpe_detected ON token_pool_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpe_severity ON token_pool_events(severity);

-- Vue: événements récents (dernières 24h)
CREATE OR REPLACE VIEW token_pool_events_recent AS
SELECT *
FROM token_pool_events
WHERE detected_at > NOW() - INTERVAL '24 hours'
ORDER BY detected_at DESC;

-- Vue: événements critiques non résolus
CREATE OR REPLACE VIEW token_pool_events_critical AS
SELECT *
FROM token_pool_events
WHERE severity IN ('warning', 'critical')
  AND detected_at > NOW() - INTERVAL '7 days'
ORDER BY detected_at DESC;

-- RLS
ALTER TABLE token_pool_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "token_pool_events_read" ON token_pool_events FOR SELECT USING (true);

COMMENT ON TABLE token_pool_events IS 'Pool lifecycle events: new/removed pools, liquidity spikes/drains, price divergence. Auto-detected by token_monitoring indexer via snapshot diff.';
