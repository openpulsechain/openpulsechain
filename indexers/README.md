# Indexers

Lightweight Python scripts that fetch on-chain data from PulseChain and store it in Supabase.

## Data Sources

- PulseChain RPC: `rpc.pulsechain.com` (free, rate-limited)
- DefiLlama API: `api.llama.fi` (free, unlimited)
- CoinGecko API: `api.coingecko.com` (free, 30 calls/min)
- PulseChain Explorer: `scan.pulsechain.com`

## Setup

```bash
cd indexers
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Supabase credentials
python main.py
```

## Environment Variables

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
PULSECHAIN_RPC=https://rpc.pulsechain.com
```
