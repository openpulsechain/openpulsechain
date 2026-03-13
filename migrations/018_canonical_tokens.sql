-- Canonical Tokens: curated registry of verified token addresses
-- Replaces unreliable search-by-symbol in pulsechain_tokens (Finding #3)
-- is_core column replaces hardcoded CORE_TOKENS set (Finding #6)

CREATE TABLE IF NOT EXISTS canonical_tokens (
  address TEXT NOT NULL PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT,
  is_canonical BOOLEAN DEFAULT TRUE,
  is_core BOOLEAN DEFAULT FALSE,
  source TEXT,  -- 'native', 'bridge', 'pulsex_top', 'fork', 'manual'
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canonical_symbol ON canonical_tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_canonical_core ON canonical_tokens(is_core) WHERE is_core = TRUE;

-- RLS
ALTER TABLE canonical_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "canonical_tokens_read" ON canonical_tokens FOR SELECT USING (true);

COMMENT ON TABLE canonical_tokens IS 'Curated registry of verified PulseChain token addresses. Used for identity comparison (Canonical/Address differs/Unlisted) and dynamic CORE_TOKENS loading.';

-- Seed: Core tokens (is_core = TRUE)
INSERT INTO canonical_tokens (address, symbol, name, is_core, source) VALUES
  ('0xa1077a294dde1b09bb078844df40758a5d0f9a27', 'WPLS', 'Wrapped Pulse', TRUE, 'native'),
  ('0x95b303987a60c71504d99aa1b13b4da07b0790ab', 'PLSX', 'PulseX', TRUE, 'native'),
  ('0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', 'HEX', 'HEX', TRUE, 'native'),
  ('0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', 'INC', 'Incentive', TRUE, 'native'),
  ('0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', 'WETH', 'Wrapped Ether (bridged)', TRUE, 'bridge'),
  ('0xefd766ccb38eaf1dfd701853bfce31359239f305', 'DAI', 'Dai (bridged)', TRUE, 'bridge'),
  ('0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07', 'USDC', 'USD Coin (bridged)', TRUE, 'bridge'),
  ('0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f', 'USDT', 'Tether (bridged)', TRUE, 'bridge'),
  ('0xb17d901469b9208b17d916112988a3fed19b5ca1', 'WBTC', 'Wrapped Bitcoin (bridged)', TRUE, 'bridge'),
  ('0x3819f64f282bf135d62168c1e513280daf905e06', 'HEDRON', 'Hedron', TRUE, 'pulsex_top'),
  ('0x0d86eb9f43c57f6ff3bc9e23d8f9d82503f0e84b', 'MAXI', 'Maximus', TRUE, 'pulsex_top'),
  ('0x57fde0a71132198bbec939b98976993d8d89d225', 'eHEX', 'HEX (Ethereum)', TRUE, 'bridge')
ON CONFLICT (address) DO NOTHING;

-- Seed: Top tokens by liquidity (is_core = FALSE)
INSERT INTO canonical_tokens (address, symbol, name, is_core, source) VALUES
  ('0x9159f1d2a9f51998fc9ab03fbd8f265ab14a1b3b', 'LOAN', 'Liquid Loans', FALSE, 'pulsex_top'),
  ('0x0defe0442277c3e8e7b0e3c9ca2acac65116ff25', 'USDL', 'USDL Stablecoin', FALSE, 'pulsex_top'),
  ('0x5b44e5891bfa780099c3485e4bdc1161da3a2981', 'CST', 'CST', FALSE, 'pulsex_top'),
  ('0x06e678c8884f136e2a488c027a3ac7520e260749', 'BEAR', 'Bear', FALSE, 'pulsex_top'),
  ('0x98505e3f52c6c810ef4d2de3a6b4bea8e5caa563', 'FLEX', 'FLEX', FALSE, 'pulsex_top'),
  ('0x6386704cd6f7a584ea9d23ccca66af7eba5a727e', 'SPARK', 'SparkSwap', FALSE, 'pulsex_top'),
  ('0x6b175474e89094c44da98b954eedeac495271d0f', 'pDAI', 'DAI (Ethereum fork)', FALSE, 'fork')
ON CONFLICT (address) DO NOTHING;
