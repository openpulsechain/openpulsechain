-- Update token_live_summary view to add 3 missing aggregates:
-- 1. price_median (median price across legitimate pools)
-- 2. price_min / price_max (price spread)
-- 3. total_liquidity_base / total_liquidity_quote (sum pooled amounts)

CREATE OR REPLACE VIEW token_live_summary AS
WITH medians AS (
  SELECT
    token_address,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_usd) AS price_median
  FROM token_pools_live
  WHERE pool_is_legitimate AND price_usd IS NOT NULL
  GROUP BY token_address
)
SELECT
  tpl.token_address,
  tpl.token_symbol,
  MAX(tpl.updated_at) AS last_updated,
  MIN(tpl.tier) AS tier,
  -- Prix consensus = prix de la pool la plus liquide
  (ARRAY_AGG(tpl.price_usd ORDER BY tpl.liquidity_usd DESC NULLS LAST))[1] AS price_usd,
  (ARRAY_AGG(tpl.fdv ORDER BY tpl.liquidity_usd DESC NULLS LAST))[1] AS fdv,
  (ARRAY_AGG(tpl.market_cap_usd ORDER BY tpl.liquidity_usd DESC NULLS LAST))[1] AS market_cap_usd,
  (ARRAY_AGG(tpl.price_change_24h ORDER BY tpl.liquidity_usd DESC NULLS LAST))[1] AS price_change_24h,
  -- Agrégats existants
  SUM(tpl.liquidity_usd) FILTER (WHERE tpl.pool_is_legitimate) AS total_liquidity_usd,
  SUM(tpl.volume_24h_usd) FILTER (WHERE tpl.pool_is_legitimate) AS total_volume_24h_usd,
  SUM(tpl.buys_24h) FILTER (WHERE tpl.pool_is_legitimate) AS total_buys_24h,
  SUM(tpl.sells_24h) FILTER (WHERE tpl.pool_is_legitimate) AS total_sells_24h,
  COUNT(*) FILTER (WHERE tpl.pool_is_legitimate) AS pool_count_legitimate,
  COUNT(*) AS pool_count_total,
  COUNT(DISTINCT tpl.dex_id) AS dex_count,
  ARRAY_AGG(DISTINCT tpl.dex_id) AS dex_list,
  -- Freshness
  EXTRACT(EPOCH FROM (NOW() - MAX(tpl.updated_at)))::INTEGER AS data_age_seconds,
  -- NEW: 3 missing aggregates
  m.price_median,
  MIN(tpl.price_usd) FILTER (WHERE tpl.pool_is_legitimate AND tpl.price_usd IS NOT NULL) AS price_min,
  MAX(tpl.price_usd) FILTER (WHERE tpl.pool_is_legitimate AND tpl.price_usd IS NOT NULL) AS price_max,
  SUM(tpl.liquidity_base) FILTER (WHERE tpl.pool_is_legitimate) AS total_liquidity_base,
  SUM(tpl.liquidity_quote) FILTER (WHERE tpl.pool_is_legitimate) AS total_liquidity_quote
FROM token_pools_live tpl
LEFT JOIN medians m ON tpl.token_address = m.token_address
GROUP BY tpl.token_address, tpl.token_symbol, m.price_median;
