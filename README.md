# OpenPulsechain

Open-source analytics platform for [PulseChain](https://pulsechain.com). Free public API, no auth required.

**Live:** [openpulsechain.com](https://www.openpulsechain.com) · **API Docs:** [/docs](https://api.openpulsechain.com/docs) · **Safety API:** [/docs](https://safety.openpulsechain.com/docs) · **Dune:** [Bridge Analytics](https://dune.com/openpulsechain/pulsechain-bridge-analytics)

> Not affiliated with PulseChain, PulseX, or any related entity. Data is for informational purposes only — not financial advice.

---

## What's included

| Module | Description |
|--------|-------------|
| **Dashboard** | 12-page web app: Overview, DEX, Tokens, Bridge, Whales, Intelligence, Safety, Alerts, Smart Money, Wallet Profiles, API docs |
| **Token Safety API** | FastAPI with 12 endpoints: safety scores, scam radar, deployer reputation, smart money, wallet analysis |
| **REST API** | FastAPI with 7 endpoints: tokens, prices, history, pairs, market overview |
| **Supabase API** | PostgREST access to 24 tables (bridge transfers, token prices, DEX stats, whale data, etc.) |
| **Indexers** | 14 Python cron jobs + 2 standalone services collecting on-chain data every 5-15 min |
| **Dune** | 9 SQL queries + 20 visualizations for bridge analytics (Ethereum-side) |

## Features

### Analytics Dashboard
- **Overview** — PLS price, chain TVL, gas estimates, token prices table
- **DEX Analytics** — PulseX daily volume, liquidity, top 30 trading pairs
- **Token Explorer** — 2500+ browsable tokens with pagination, search, price history charts
- **Bridge Monitor** — OmniBridge + Hyperlane: daily flows, cumulative net flow, whale alerts, TVL by token
- **Whale Tracker** — Top holders, cross-token analysis, funding clusters, connection graph

### Security & Intelligence
- **Token Safety Scanner** — Composite score (0-100, grade A-F) based on honeypot detection, contract analysis, LP health, holder concentration, token age
- **Scam Radar** — Automated alerts for LP removals and whale dumps, scanning every 30 minutes
- **Deployer Reputation** — Serial rugger detection: analyzes deployer's token history, dead token ratio
- **Smart Money Tracker** — Large swaps on PulseX, top wallets by volume, auto-refresh every 60s
- **Wallet Profiler** — Token holdings + swap activity for any address
- **Market Intelligence** — LLM-analyzed Twitter sentiment, risk conclusions, action detection

## Data

- **2,533 tokens** discovered from PulseX Subgraph
- **463K+ price records** (daily, since May 2023)
- **231K+ bridge transfers** (OmniBridge + Hyperlane)
- **100% sovereign** token prices from PulseX `derivedUSD` — no CoinGecko dependency for PulseChain tokens

## Token Safety API (no auth)

```
Base URL: https://safety.openpulsechain.com
```

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/token/{address}/safety` | Token safety score (honeypot, contract, LP, holders, age) |
| `GET /api/v1/tokens/safety/batch` | Recent safety scores for all analyzed tokens |
| `GET /api/v1/alerts/recent` | Scam radar alerts (LP removals, whale dumps) |
| `GET /api/v1/deployer/{address}` | Deployer reputation score |
| `GET /api/v1/token/{address}/deployer` | Deployer reputation for a specific token |
| `GET /api/v1/smart-money/feed` | Smart money feed (top wallets by volume) |
| `GET /api/v1/smart-money/swaps` | Recent large swaps on PulseX |
| `GET /api/v1/wallet/{address}/swaps` | Wallet swap history |
| `GET /api/v1/wallet/{address}/balances` | Wallet token balances |

```bash
# Token safety score
curl 'https://safety.openpulsechain.com/api/v1/token/0x2b591e99afe9f32eaa6214f7b7629768c40eeb39/safety'

# Smart money large swaps (last hour, >$5K)
curl 'https://safety.openpulsechain.com/api/v1/smart-money/swaps?minutes=60&min_usd=5000'

# Scam radar alerts
curl 'https://safety.openpulsechain.com/api/v1/alerts/recent?limit=10'
```

Full Swagger docs: [/docs](https://safety.openpulsechain.com/docs)

## REST API (no auth)

```
Base URL: https://api.openpulsechain.com
```

| Endpoint | Description | Rate |
|----------|-------------|------|
| `GET /api/v1/tokens` | List tokens (paginated, sortable) | 60/min |
| `GET /api/v1/tokens/{address}` | Token detail + price | 120/min |
| `GET /api/v1/tokens/{address}/price` | Current price (fast) | 120/min |
| `GET /api/v1/tokens/{address}/history` | Price history | 30/min |
| `GET /api/v1/pairs` | Top PulseX pairs | 60/min |
| `GET /api/v1/market/overview` | TVL, volume, top movers | 60/min |

```bash
# Get HEX price history (last 30 days)
curl 'https://api.openpulsechain.com/api/v1/tokens/0x2b591e99afe9f32eaa6214f7b7629768c40eeb39/history?days=30'

# Market overview
curl 'https://api.openpulsechain.com/api/v1/market/overview'
```

Full Swagger docs: [/docs](https://api.openpulsechain.com/docs)

## Supabase API

Direct PostgREST access to all tables. Requires the `apikey` header (anon key available on the [API page](https://www.openpulsechain.com)).

```bash
# Whale bridge transfers > $50K
curl 'https://xojdwzmcoiaeydewjrhe.supabase.co/rest/v1/bridge_transfers?amount_usd=gte.50000&order=block_timestamp.desc&limit=20' \
  -H "apikey: YOUR_ANON_KEY"
```

## Architecture

```
PulseX Subgraph ──┐
DefiLlama API ────┤──> Python Indexers (Railway cron) ──> Supabase (PostgreSQL + RLS)
PulseChain RPC ───┤                                           │
CoinGecko API ────┘                                     ┌─────┼──────────┐
                                                        │     │          │
                                                   React SPA  FastAPI   Token Safety
                                                   (Railway)  (Railway)  (Railway)
                                                        │                    │
                                                   Dashboard         Safety API
                                                   12 pages        safety.openpulsechain.com
```

## Getting started

```bash
git clone https://github.com/openpulsechain/openpulsechain.git
cd openpulsechain
```

| Module | Setup |
|--------|-------|
| `frontend/` | `npm install && npm run dev` |
| `indexers/` | `pip install -r requirements.txt` + `.env` config |
| `api/` | `pip install -r requirements.txt && uvicorn main:app` |
| `token_safety/` | `pip install -r requirements.txt && uvicorn main:app` |

## Data sources

| Data | Source | Cost |
|------|--------|------|
| Token prices (PulseChain) | PulseX Subgraph `derivedUSD` | Free |
| Token prices (BTC/ETH/stables) | CoinGecko API | Free |
| TVL, DEX volume | DefiLlama API | Free |
| Gas price, blocks | PulseChain RPC | Free |
| Bridge events (ETH-side) | Dune Analytics | Free (2500 credits/mo) |
| Bridge events (PLS-side) | PulseChain OmniBridge Subgraph | Free |
| Hyperlane transfers | Hyperlane Explorer API | Free |
| Contract analysis | PulseChain Scan API (Blockscout v2) | Free |
| Honeypot detection | FeeChecker contract (on-chain simulation) | Free |

## License

[MIT](LICENSE)
