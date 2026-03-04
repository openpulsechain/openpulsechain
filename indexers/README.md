# Indexers

Lightweight Python scripts responsible for collecting on-chain and off-chain data from PulseChain and storing it in a PostgreSQL database (Supabase).

---

## Overview

The indexers are designed to run as scheduled cron jobs on Railway (or any equivalent container hosting platform). They aggregate data from multiple free sources into a single normalized database, which serves as the backend for the REST API and the frontend dashboard.

---

## Data Sources

| Provider | Endpoint | Data | Rate Limit |
|----------|----------|------|------------|
| PulseChain RPC | `https://rpc.pulsechain.com` | Block data, gas prices, transaction logs, contract state | Public, rate-limited |
| DefiLlama | `https://api.llama.fi` | TVL, protocol breakdown, DEX volume | Unlimited |
| CoinGecko | `https://api.coingecko.com` | Token prices, market data | 30 requests/min |
| PulseChain Explorer | `https://scan.pulsechain.com/api` | Address balances, contract verification, holder counts | Public, rate-limited |

---

## Prerequisites

- Python >= 3.10
- A Supabase project (free tier)
- Access to a PulseChain RPC endpoint (public endpoint provided by default)

---

## Setup

```bash
cd indexers
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your Supabase credentials.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | -- |
| `SUPABASE_KEY` | Supabase anonymous key (public) | -- |
| `PULSECHAIN_RPC` | PulseChain JSON-RPC endpoint | `https://rpc.pulsechain.com` |
| `COINGECKO_API_KEY` | CoinGecko API key (optional, for higher rate limits) | -- |

---

## Running

```bash
python main.py
```

For production deployment on Railway, configure a cron schedule in the service settings. Recommended intervals:

| Indexer | Interval | Rationale |
|---------|----------|-----------|
| Gas and burn metrics | Every 5 minutes | Tracks real-time network activity |
| Token prices | Every 5 minutes | CoinGecko rate limit allows frequent polling |
| TVL and protocol data | Every 1 hour | DefiLlama updates infrequently |
| Holder counts | Every 24 hours | Explorer rate limits; data changes slowly |

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for coding standards and submission guidelines.
