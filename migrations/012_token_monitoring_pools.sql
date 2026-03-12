-- Token Monitoring Pools: détail des pools de liquidité par token
-- Pour chaque token monitoré, liste toutes les paires V1/V2 avec validation anti-spam
-- Lié à token_monitoring par (token_address, snapshot_at)

CREATE TABLE IF NOT EXISTS token_monitoring_pools (
  id BIGSERIAL PRIMARY KEY,
  snapshot_at TIMESTAMPTZ NOT NULL,
  token_address TEXT NOT NULL,

  -- ═══════════════════════════════════════════════════════════════
  -- IDENTITÉ DE LA POOL
  -- ═══════════════════════════════════════════════════════════════
  pair_address TEXT NOT NULL,             -- adresse du contrat LP
  dex_version TEXT NOT NULL,             -- 'pulsex_v1', 'pulsex_v2', '9mm', 'pdex', etc.

  -- Token 0
  token0_address TEXT NOT NULL,
  token0_symbol TEXT,
  token0_name TEXT,
  token0_decimals INTEGER,

  -- Token 1
  token1_address TEXT NOT NULL,
  token1_symbol TEXT,
  token1_name TEXT,
  token1_decimals INTEGER,

  -- ═══════════════════════════════════════════════════════════════
  -- VALEURS DE LA POOL (subgraph)
  -- ═══════════════════════════════════════════════════════════════
  reserve0 NUMERIC,                       -- réserve token0 (en unités token)
  reserve1 NUMERIC,                       -- réserve token1
  reserve_usd NUMERIC,                    -- valeur USD combinée des réserves
  volume_alltime_usd NUMERIC,             -- volumeUSD cumulé all-time
  volume_24h_usd NUMERIC,                 -- dailyVolumeUSD (pairDayDatas)
  total_transactions INTEGER,
  created_at_ts BIGINT,                   -- timestamp de création de la paire

  -- ═══════════════════════════════════════════════════════════════
  -- VALEURS DEXSCREENER (si disponible)
  -- ═══════════════════════════════════════════════════════════════
  dx_pair_address TEXT,                   -- adresse vue par DexScreener
  dx_price_usd NUMERIC,
  dx_volume_24h_usd NUMERIC,
  dx_liquidity_usd NUMERIC,
  dx_dex_id TEXT,                         -- 'pulsex_v1', 'pulsex_v2', '9mm', etc.

  -- ═══════════════════════════════════════════════════════════════
  -- VALIDATION ANTI-SPAM
  -- Chaque token de la paire est vérifié individuellement
  -- ═══════════════════════════════════════════════════════════════
  token0_is_known BOOLEAN DEFAULT FALSE,  -- existe dans pulsechain_tokens (filtré spam)
  token0_is_core BOOLEAN DEFAULT FALSE,   -- fait partie des core tokens (WPLS, HEX, PLSX...)
  token0_volume_usd NUMERIC,             -- volume all-time du token0 (seuil anti-spam)
  token0_has_liquidity BOOLEAN DEFAULT FALSE,

  token1_is_known BOOLEAN DEFAULT FALSE,
  token1_is_core BOOLEAN DEFAULT FALSE,
  token1_volume_usd NUMERIC,
  token1_has_liquidity BOOLEAN DEFAULT FALSE,

  -- Verdict global de la pool
  pool_is_legitimate BOOLEAN DEFAULT FALSE,  -- TRUE si les 2 tokens passent la validation
  pool_spam_reason TEXT,                      -- raison si illégitime: 'unknown_token0', 'low_reserve', 'spam_name', etc.
  pool_confidence TEXT,                       -- 'high' (2 core), 'medium' (1 core + 1 known), 'low' (2 known), 'suspect'

  -- ═══════════════════════════════════════════════════════════════
  -- PART DE CETTE POOL DANS LE TOTAL DU TOKEN
  -- ═══════════════════════════════════════════════════════════════
  pct_of_total_liquidity NUMERIC,         -- % de la liquidité totale du token
  pct_of_total_volume NUMERIC,            -- % du volume total du token

  UNIQUE(token_address, pair_address, snapshot_at)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_tmp_token ON token_monitoring_pools(token_address);
CREATE INDEX IF NOT EXISTS idx_tmp_snapshot ON token_monitoring_pools(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_tmp_pair ON token_monitoring_pools(pair_address);
CREATE INDEX IF NOT EXISTS idx_tmp_legit ON token_monitoring_pools(pool_is_legitimate);

-- Vue: dernières pools légitimes par token
CREATE OR REPLACE VIEW token_pools_latest AS
SELECT DISTINCT ON (token_address, pair_address) *
FROM token_monitoring_pools
WHERE pool_is_legitimate = TRUE
ORDER BY token_address, pair_address, snapshot_at DESC;

-- Vue: pools suspectes (pour audit manuel)
CREATE OR REPLACE VIEW token_pools_suspect AS
SELECT
  token_address, pair_address, dex_version, snapshot_at,
  token0_address, token0_symbol, token0_is_known, token0_is_core,
  token1_address, token1_symbol, token1_is_known, token1_is_core,
  reserve_usd, volume_24h_usd,
  pool_spam_reason, pool_confidence
FROM token_monitoring_pools
WHERE pool_is_legitimate = FALSE
ORDER BY snapshot_at DESC, reserve_usd DESC;

-- RLS
ALTER TABLE token_monitoring_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "token_monitoring_pools_read" ON token_monitoring_pools FOR SELECT USING (true);

COMMENT ON TABLE token_monitoring_pools IS 'Per-pool liquidity breakdown for each monitored token. Each pool validated anti-spam (token addresses verified against known tokens). Populated by token_monitoring indexer.';
