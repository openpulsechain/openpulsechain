-- Token Monitoring: cross-source audit table
-- Tracks values from OpenPulsechain (V1, V2, displayed) vs competitors (DexScreener, CoinGecko)
-- with coherence scores per token per snapshot

CREATE TABLE IF NOT EXISTS token_monitoring (
  id BIGSERIAL PRIMARY KEY,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  token_type TEXT, -- 'native', 'bridged', 'fork', 'dex', 'meme', 'other'

  -- ═══════════════════════════════════════════════════════════════
  -- OPENPULSECHAIN: valeurs actuellement AFFICHÉES sur le site
  -- ═══════════════════════════════════════════════════════════════
  op_price_usd NUMERIC,
  op_price_source TEXT,           -- 'pulsex_v1_derivedUSD', 'coingecko'
  op_volume_24h_usd NUMERIC,
  op_volume_source TEXT,          -- 'pulsex_v1_tokenDayDatas', 'token_price_history'
  op_liquidity_usd NUMERIC,
  op_liquidity_source TEXT,       -- 'pulsex_v1_totalLiquidity*derivedUSD', 'token_discovery'
  op_market_cap_usd NUMERIC,
  op_mcap_source TEXT,            -- 'pulsex_v1_derivedUSD*totalSupply'
  op_mcap_supply_used NUMERIC,    -- supply value used in calculation (for audit)
  op_change_24h_pct NUMERIC,
  op_change_7d_pct NUMERIC,
  op_holder_count INTEGER,
  op_holder_source TEXT,          -- 'blockscout_api_v2'
  op_has_logo BOOLEAN DEFAULT FALSE,
  op_has_sparkline BOOLEAN DEFAULT FALSE,
  op_safety_score INTEGER,
  op_safety_grade TEXT,
  op_category TEXT,               -- 'Native','DEX','DeFi','Meme','Bridge','Fork','Other'

  -- ═══════════════════════════════════════════════════════════════
  -- PULSEX V1 SUBGRAPH: valeurs brutes
  -- Source: graph.pulsechain.com/.../pulsex
  -- ═══════════════════════════════════════════════════════════════
  v1_price_usd NUMERIC,
  v1_derived_usd NUMERIC,         -- raw derivedUSD from subgraph
  v1_volume_alltime_usd NUMERIC,  -- tradeVolumeUSD (cumulative lifetime)
  v1_volume_24h_usd NUMERIC,      -- tokenDayDatas.dailyVolumeUSD
  v1_liquidity_tokens NUMERIC,    -- totalLiquidity (in token units)
  v1_liquidity_usd NUMERIC,       -- totalLiquidityUSD from tokenDayDatas
  v1_total_supply NUMERIC,        -- totalSupply / 10^decimals
  v1_market_cap_usd NUMERIC,      -- derivedUSD * total_supply

  -- ═══════════════════════════════════════════════════════════════
  -- PULSEX V2 SUBGRAPH: valeurs brutes
  -- Source: graph.pulsechain.com/.../pulsexv2
  -- ═══════════════════════════════════════════════════════════════
  v2_price_usd NUMERIC,
  v2_derived_usd NUMERIC,
  v2_volume_alltime_usd NUMERIC,
  v2_volume_24h_usd NUMERIC,
  v2_liquidity_tokens NUMERIC,
  v2_liquidity_usd NUMERIC,
  v2_total_supply NUMERIC,
  v2_market_cap_usd NUMERIC,

  -- ═══════════════════════════════════════════════════════════════
  -- COMBINÉ V1+V2: valeurs théoriques correctes
  -- ═══════════════════════════════════════════════════════════════
  combined_price_usd NUMERIC,         -- V1 preferred, V2 fallback
  combined_volume_24h_usd NUMERIC,    -- V1 + V2
  combined_liquidity_usd NUMERIC,     -- V1 + V2
  combined_market_cap_usd NUMERIC,    -- prix * max(v1_supply, v2_supply)

  -- ═══════════════════════════════════════════════════════════════
  -- DEXSCREENER: source de vérité principale
  -- Source: api.dexscreener.com/latest/dex/tokens/{addr}
  -- Agrège PulseX V1+V2 + 9mm + PDEX + EazySwap + pulse-rate + 9inch
  -- ═══════════════════════════════════════════════════════════════
  dx_price_usd NUMERIC,
  dx_volume_24h_usd NUMERIC,          -- somme toutes paires
  dx_liquidity_usd NUMERIC,           -- somme toutes paires
  dx_fdv NUMERIC,
  dx_market_cap_usd NUMERIC,
  dx_change_24h_pct NUMERIC,
  dx_pair_count INTEGER,              -- nombre de paires listées
  dx_dex_list TEXT,                   -- 'pulsex_v1,pulsex_v2,9mm,pdex,...'

  -- ═══════════════════════════════════════════════════════════════
  -- COINGECKO: source alternative
  -- Source: api.coingecko.com/api/v3/simple/price
  -- Note: MCap souvent $0 pour PulseChain natifs
  -- ═══════════════════════════════════════════════════════════════
  cg_price_usd NUMERIC,
  cg_volume_24h_usd NUMERIC,
  cg_market_cap_usd NUMERIC,
  cg_change_24h_pct NUMERIC,
  cg_id TEXT,                         -- coingecko token ID ('hex','pulsechain','pulsex')

  -- ═══════════════════════════════════════════════════════════════
  -- SCORES DE COHÉRENCE (0-100, 100 = parfait)
  -- Vérité = DexScreener (agrégé multi-DEX, multi-version)
  -- ═══════════════════════════════════════════════════════════════

  -- OpenPulsechain vs DexScreener
  op_coherence_global INTEGER,        -- score global pondéré
  op_coherence_price INTEGER,         -- 100 si <1%, 80 si <5%, 50 si <10%, 0 si >50%
  op_coherence_volume INTEGER,        -- idem sur volume 24h
  op_coherence_liquidity INTEGER,     -- idem sur liquidité
  op_coherence_mcap INTEGER,          -- idem sur market cap
  op_coherence_details JSONB,         -- détails des écarts en %

  -- CoinGecko vs DexScreener
  cg_coherence_global INTEGER,
  cg_coherence_price INTEGER,
  cg_coherence_volume INTEGER,
  cg_coherence_mcap INTEGER,

  -- V1+V2 combiné vs DexScreener (mesure de ce qu'on DEVRAIT afficher)
  combined_coherence_global INTEGER,
  combined_coherence_volume INTEGER,
  combined_coherence_liquidity INTEGER,
  combined_coherence_mcap INTEGER,

  -- ═══════════════════════════════════════════════════════════════
  -- FLAGS D'ANOMALIES
  -- ═══════════════════════════════════════════════════════════════
  flag_mcap_broken BOOLEAN DEFAULT FALSE,       -- MCap écart > ×10
  flag_volume_underreported BOOLEAN DEFAULT FALSE, -- Vol écart > -50%
  flag_liquidity_underreported BOOLEAN DEFAULT FALSE, -- Liq écart > -50%
  flag_price_divergent BOOLEAN DEFAULT FALSE,   -- Prix écart > 5%
  flag_v2_dominant BOOLEAN DEFAULT FALSE,       -- V2 volume > 50% du total
  flag_no_logo BOOLEAN DEFAULT FALSE,
  flag_no_sparkline BOOLEAN DEFAULT FALSE,

  UNIQUE(token_address, snapshot_at)
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_token_monitoring_addr ON token_monitoring(token_address);
CREATE INDEX IF NOT EXISTS idx_token_monitoring_snapshot ON token_monitoring(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_monitoring_coherence ON token_monitoring(op_coherence_global);
CREATE INDEX IF NOT EXISTS idx_token_monitoring_flags ON token_monitoring(flag_mcap_broken, flag_volume_underreported);

-- Vue pour le dernier snapshot de chaque token
CREATE OR REPLACE VIEW token_monitoring_latest AS
SELECT DISTINCT ON (token_address) *
FROM token_monitoring
ORDER BY token_address, snapshot_at DESC;

-- Vue résumé anomalies
CREATE OR REPLACE VIEW token_monitoring_anomalies AS
SELECT
  token_address, token_symbol, token_name, snapshot_at,
  op_coherence_global,
  op_price_usd, dx_price_usd,
  op_volume_24h_usd, dx_volume_24h_usd, combined_volume_24h_usd,
  op_liquidity_usd, dx_liquidity_usd, combined_liquidity_usd,
  op_market_cap_usd, dx_market_cap_usd, combined_market_cap_usd,
  flag_mcap_broken, flag_volume_underreported, flag_liquidity_underreported,
  flag_price_divergent, flag_v2_dominant
FROM token_monitoring
WHERE flag_mcap_broken OR flag_volume_underreported OR flag_liquidity_underreported OR flag_price_divergent
ORDER BY snapshot_at DESC, op_coherence_global ASC;

-- RLS
ALTER TABLE token_monitoring ENABLE ROW LEVEL SECURITY;
CREATE POLICY "token_monitoring_read" ON token_monitoring FOR SELECT USING (true);

COMMENT ON TABLE token_monitoring IS 'Cross-source token data monitoring: OpenPulsechain vs DexScreener vs CoinGecko with coherence scores. Populated every 6h by token_monitoring indexer.';
