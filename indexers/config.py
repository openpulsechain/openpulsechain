import os
from dotenv import load_dotenv

load_dotenv()

# Supabase
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Bridge subgraph endpoints
SUBGRAPH_ETH = "https://graph.ethereum.pulsechain.com/subgraphs/name/ethereum/bridge"
SUBGRAPH_PLS = "https://graph.pulsechain.com/subgraphs/name/pulsechain/bridge"

# PulseChain RPC
RPC_URL = "https://rpc.pulsechain.com"

# DefiLlama
DEFILLAMA_CHAIN_TVL = "https://api.llama.fi/v2/historicalChainTvl/PulseChain"
DEFILLAMA_DEX_VOLUME = "https://api.llama.fi/overview/dexs/PulseChain"

# CoinGecko
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
COINGECKO_API_KEY = os.environ.get("COINGECKO_API_KEY", "")

# Token lists are now defined in indexers/token_prices.py
# PulseChain tokens: GeckoTerminal (same pools as EvaInvest)
# Major tokens (BTC, ETH, stables): CoinGecko

# Subgraph page size
SUBGRAPH_PAGE_SIZE = 1000

# Per-run limits (avoid timeout on Railway cron)
BRIDGE_SYNC_MAX_PAGES = 50  # 50K records per run max
