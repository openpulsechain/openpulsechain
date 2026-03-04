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

# Tokens to track prices for (CoinGecko IDs)
TRACKED_TOKENS = {
    "pulsechain": {"symbol": "PLS", "name": "PulseChain"},
    "hex": {"symbol": "HEX", "name": "HEX"},
    "pulsex": {"symbol": "PLSX", "name": "PulseX"},
    "dai": {"symbol": "DAI", "name": "Dai"},
    "usd-coin": {"symbol": "USDC", "name": "USD Coin"},
    "tether": {"symbol": "USDT", "name": "Tether"},
    "weth": {"symbol": "WETH", "name": "Wrapped Ether"},
    "wrapped-bitcoin": {"symbol": "WBTC", "name": "Wrapped Bitcoin"},
    "ethereum": {"symbol": "ETH", "name": "Ethereum"},
    "bitcoin": {"symbol": "BTC", "name": "Bitcoin"},
    "hedron": {"symbol": "HDRN", "name": "Hedron"},
    "icosa": {"symbol": "ICSA", "name": "Icosa"},
    "9inch": {"symbol": "9INCH", "name": "9inch"},
}

# Subgraph page size
SUBGRAPH_PAGE_SIZE = 1000

# Per-run limits (avoid timeout on Railway cron)
BRIDGE_SYNC_MAX_PAGES = 50  # 50K records per run max
