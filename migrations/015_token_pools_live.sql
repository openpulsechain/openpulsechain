-- Token Pools Live: cache temps réel des LP via DexScreener
-- UNE seule row par (token_address, pair_address) — mise à jour in-place
-- Pas d'historique, juste le dernier état live
-- Alimenté par token_pools_live.py (cron 30s)

CREATE TABLE IF NOT EXISTS token_pools_live (
  -- Clé primaire composite (pas de snapshot_at = 1 row par pool)
  token_address TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  PRIMARY KEY (token_address, pair_address),

  -- ═══════════════════════════════════════════════════════════════
  -- FRAÎCHEUR
  -- ═══════════════════════════════════════════════════════════════
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tier TEXT NOT NULL DEFAULT 'cold',  -- 'hot', 'warm', 'cold'

  -- ═══════════════════════════════════════════════════════════════
  -- TOKEN HEADER (dénormalisé pour éviter un JOIN)
  -- ═══════════════════════════════════════════════════════════════
  token_symbol TEXT,
  token_name TEXT,

  -- ═══════════════════════════════════════════════════════════════
  -- DONNÉES DEXSCREENER PAR PAIRE (live)
  -- ═══════════════════════════════════════════════════════════════
  dex_id TEXT,                          -- 'pulsex', '9mm', 'pulse-rate', etc.
  base_token_address TEXT,
  base_token_symbol TEXT,
  quote_token_address TEXT,
  quote_token_symbol TEXT,

  price_usd NUMERIC,
  volume_24h_usd NUMERIC,
  liquidity_usd NUMERIC,
  liquidity_base NUMERIC,              -- quantité base token dans la pool
  liquidity_quote NUMERIC,             -- quantité quote token dans la pool
  buys_24h INTEGER,
  sells_24h INTEGER,
  txns_24h INTEGER,
  fdv NUMERIC,
  market_cap_usd NUMERIC,
  price_change_5m NUMERIC,
  price_change_1h NUMERIC,
  price_change_6h NUMERIC,
  price_change_24h NUMERIC,

  pair_created_at BIGINT,
  dx_url TEXT,

  -- ═══════════════════════════════════════════════════════════════
  -- VALIDATION (copié du dernier monitoring snapshot)
  -- ═══════════════════════════════════════════════════════════════
  pool_is_legitimate BOOLEAN DEFAULT TRUE,
  pool_confidence TEXT DEFAULT 'medium',
  pool_spam_reason TEXT
);

-- Index pour requêtes frontend
CREATE INDEX IF NOT EXISTS idx_tpl_token ON token_pools_live(token_address);
CREATE INDEX IF NOT EXISTS idx_tpl_tier ON token_pools_live(tier);
CREATE INDEX IF NOT EXISTS idx_tpl_updated ON token_pools_live(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpl_liq ON token_pools_live(liquidity_usd DESC);

-- Vue: toutes les pools live d'un token (pour le frontend)
CREATE OR REPLACE VIEW token_pools_live_view AS
SELECT
  tpl.*,
  -- Âge des données en secondes
  EXTRACT(EPOCH FROM (NOW() - tpl.updated_at))::INTEGER AS data_age_seconds,
  -- Flag fraîcheur
  CASE
    WHEN tpl.tier = 'hot' AND tpl.updated_at > NOW() - INTERVAL '1 minute' THEN 'fresh'
    WHEN tpl.tier = 'warm' AND tpl.updated_at > NOW() - INTERVAL '10 minutes' THEN 'fresh'
    WHEN tpl.tier = 'cold' AND tpl.updated_at > NOW() - INTERVAL '2 hours' THEN 'fresh'
    ELSE 'stale'
  END AS freshness
FROM token_pools_live tpl
WHERE tpl.pool_is_legitimate = TRUE
ORDER BY tpl.token_address, tpl.liquidity_usd DESC NULLS LAST;

-- Vue: résumé par token (agrégats pour le header)
CREATE OR REPLACE VIEW token_live_summary AS
SELECT
  token_address,
  token_symbol,
  MAX(updated_at) AS last_updated,
  MIN(tier) AS tier,
  -- Prix consensus = prix de la pool la plus liquide
  (ARRAY_AGG(price_usd ORDER BY liquidity_usd DESC NULLS LAST))[1] AS price_usd,
  (ARRAY_AGG(fdv ORDER BY liquidity_usd DESC NULLS LAST))[1] AS fdv,
  (ARRAY_AGG(market_cap_usd ORDER BY liquidity_usd DESC NULLS LAST))[1] AS market_cap_usd,
  (ARRAY_AGG(price_change_24h ORDER BY liquidity_usd DESC NULLS LAST))[1] AS price_change_24h,
  -- Agrégats
  SUM(liquidity_usd) FILTER (WHERE pool_is_legitimate) AS total_liquidity_usd,
  SUM(volume_24h_usd) FILTER (WHERE pool_is_legitimate) AS total_volume_24h_usd,
  SUM(buys_24h) FILTER (WHERE pool_is_legitimate) AS total_buys_24h,
  SUM(sells_24h) FILTER (WHERE pool_is_legitimate) AS total_sells_24h,
  COUNT(*) FILTER (WHERE pool_is_legitimate) AS pool_count_legitimate,
  COUNT(*) AS pool_count_total,
  COUNT(DISTINCT dex_id) AS dex_count,
  ARRAY_AGG(DISTINCT dex_id) AS dex_list,
  -- Freshness
  EXTRACT(EPOCH FROM (NOW() - MAX(updated_at)))::INTEGER AS data_age_seconds
FROM token_pools_live
GROUP BY token_address, token_symbol;

-- RLS
ALTER TABLE token_pools_live ENABLE ROW LEVEL SECURITY;
CREATE POLICY "token_pools_live_read" ON token_pools_live FOR SELECT USING (true);

COMMENT ON TABLE token_pools_live IS 'Live LP cache from DexScreener. Updated in-place (no history). Hot tokens every 30s, warm every 5min, cold every 1h. Frontend reads this table for real-time pool data.';
