-- Enrichissement pools DexScreener par paire + freshness tracking
-- Ajoute colonnes manquantes pour matching DexScreener <-> subgraph au niveau LP

-- ═══════════════════════════════════════════════════════════════
-- 1. Colonnes DexScreener par paire (enrichissement)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE token_monitoring_pools
  ADD COLUMN IF NOT EXISTS dx_buys_24h INTEGER,               -- nombre d'achats 24h
  ADD COLUMN IF NOT EXISTS dx_sells_24h INTEGER,              -- nombre de ventes 24h
  ADD COLUMN IF NOT EXISTS dx_txns_24h INTEGER,               -- total transactions 24h
  ADD COLUMN IF NOT EXISTS dx_fdv NUMERIC,                    -- FDV vu par DexScreener pour cette paire
  ADD COLUMN IF NOT EXISTS dx_market_cap_usd NUMERIC,         -- MCap vu par DexScreener pour cette paire
  ADD COLUMN IF NOT EXISTS dx_price_change_24h_pct NUMERIC,   -- variation prix 24h (%)
  ADD COLUMN IF NOT EXISTS dx_liquidity_base NUMERIC,         -- liquidité en base token
  ADD COLUMN IF NOT EXISTS dx_liquidity_quote NUMERIC,        -- liquidité en quote token
  ADD COLUMN IF NOT EXISTS dx_base_token_address TEXT,         -- base token (DexScreener)
  ADD COLUMN IF NOT EXISTS dx_base_token_symbol TEXT,
  ADD COLUMN IF NOT EXISTS dx_quote_token_address TEXT,        -- quote token (DexScreener)
  ADD COLUMN IF NOT EXISTS dx_quote_token_symbol TEXT,
  ADD COLUMN IF NOT EXISTS dx_pair_created_at BIGINT,         -- timestamp création paire (DexScreener)
  ADD COLUMN IF NOT EXISTS dx_url TEXT;                        -- lien DexScreener de la paire

-- ═══════════════════════════════════════════════════════════════
-- 2. Prix calculé par pool (pour vérification cohérence inter-LP)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE token_monitoring_pools
  ADD COLUMN IF NOT EXISTS implied_price_usd NUMERIC,         -- prix implicite calculé depuis reserves
  ADD COLUMN IF NOT EXISTS price_vs_consensus_pct NUMERIC;    -- écart vs prix consensus du token (%)

-- ═══════════════════════════════════════════════════════════════
-- 3. Source de données (traçabilité)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE token_monitoring_pools
  ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'subgraph'; -- 'subgraph', 'dexscreener', 'both'

-- ═══════════════════════════════════════════════════════════════
-- 4. Freshness tracking sur token_monitoring
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE token_monitoring
  ADD COLUMN IF NOT EXISTS v1_subgraph_block BIGINT,          -- numéro block V1 au moment du query
  ADD COLUMN IF NOT EXISTS v2_subgraph_block BIGINT,          -- numéro block V2 au moment du query
  ADD COLUMN IF NOT EXISTS dx_data_age_seconds INTEGER,       -- âge moyen données DexScreener
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT FALSE,    -- TRUE si données possiblement périmées
  ADD COLUMN IF NOT EXISTS data_sources TEXT[];                -- ex: {'v1','v2','dexscreener','coingecko'}
  ADD COLUMN IF NOT EXISTS pool_count_total INTEGER,          -- nombre total de pools
  ADD COLUMN IF NOT EXISTS pool_count_legitimate INTEGER,     -- pools légitimes
  ADD COLUMN IF NOT EXISTS pool_count_dexscreener INTEGER;    -- pools avec données DexScreener

-- ═══════════════════════════════════════════════════════════════
-- 5. Vue enrichie : dernières pools avec toutes les données
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW token_pools_enriched AS
SELECT DISTINCT ON (token_address, pair_address)
  token_address,
  pair_address,
  dex_version,
  snapshot_at,
  -- Identité
  token0_symbol, token1_symbol,
  -- Subgraph
  reserve0, reserve1, reserve_usd,
  volume_24h_usd,
  total_transactions,
  -- DexScreener
  dx_price_usd, dx_volume_24h_usd, dx_liquidity_usd,
  dx_buys_24h, dx_sells_24h, dx_txns_24h,
  dx_fdv, dx_market_cap_usd,
  dx_price_change_24h_pct,
  dx_liquidity_base, dx_liquidity_quote,
  dx_base_token_symbol, dx_quote_token_symbol,
  dx_dex_id,
  dx_url,
  -- Calculé
  implied_price_usd,
  price_vs_consensus_pct,
  -- Validation
  pool_is_legitimate,
  pool_confidence,
  pool_spam_reason,
  data_source,
  -- Part du total
  pct_of_total_liquidity,
  pct_of_total_volume
FROM token_monitoring_pools
WHERE pool_is_legitimate = TRUE
ORDER BY token_address, pair_address, snapshot_at DESC;

COMMENT ON VIEW token_pools_enriched IS 'Latest legitimate pools per token with full DexScreener enrichment (price, buys/sells, FDV, MCap per LP)';
