import os
from dotenv import load_dotenv

load_dotenv()

# Supabase
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# PulseChain
RPC_URL = "https://rpc.pulsechain.com"
SCAN_API_URL = "https://api.scan.pulsechain.com"

# PulseX Subgraphs
PULSEX_V1_SUBGRAPH = "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex"
PULSEX_V2_SUBGRAPH = "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2"

# PulseX Routers
PULSEX_V1_ROUTER = "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"
PULSEX_V2_ROUTER = "0x165C3410fC91EF562C50559f7d2289fEbed552d9"

# Honeypot checker contract (verified on PulseChain)
FEE_CHECKER_CONTRACT = "0xBe4A121B0fa604438B61e49a4a818A00F50c09e1"

# WPLS (Wrapped PLS) — base token for simulations
WPLS_ADDRESS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27"

# Scoring weights (total = 100)
WEIGHT_HONEYPOT = 30
WEIGHT_CONTRACT = 25
WEIGHT_LP = 20
WEIGHT_HOLDERS = 15
WEIGHT_AGE = 10

# Thresholds
HOLDER_CONCENTRATION_DANGER = 50  # top 10 hold >50% = danger
HOLDER_CONCENTRATION_WARNING = 30  # top 10 hold >30% = warning
LP_LOCK_MIN_DAYS = 30  # minimum LP lock duration for safety
MIN_HOLDERS_FOR_SAFETY = 50
MIN_TOKEN_AGE_DAYS = 7
