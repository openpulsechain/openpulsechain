# OpenPulsechain

Open-source analytics platform for [PulseChain](https://pulsechain.com). Free public API, no auth required.

**Live:** [openpulsechain.com](https://www.openpulsechain.com) · **API Docs:** [/docs](https://api.openpulsechain.com/docs) · **Dune:** [Bridge Analytics](https://dune.com/openpulsechain/pulsechain-bridge-analytics)

> Not affiliated with PulseChain, PulseX, or any related entity. Data is for informational purposes only — not financial advice.

---

## What's included

| Module | Description |
|--------|-------------|
| **Dashboard** | Web app: Overview, DEX, Tokens (2500+), Bridge, API docs |
| **REST API** | FastAPI with 7 endpoints: tokens, prices, history, pairs, market overview |
| **Supabase API** | PostgREST access to 14 tables (bridge transfers, token prices, DEX stats, etc.) |
| **Indexers** | 12 Python cron jobs collecting on-chain data every 5-15 min |
| **Dune** | 9 SQL queries + 20 visualizations for bridge analytics (Ethereum-side) |

## Data

- **2,533 tokens** discovered from PulseX Subgraph
- **463K+ price records** (daily, since May 2023)
- **231K+ bridge transfers** (OmniBridge + Hyperlane)
- **100% sovereign** token prices from PulseX `derivedUSD` — no CoinGecko dependency for PulseChain tokens

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
CoinGecko API ────┘                                     ┌─────┴──────┐
                                                        │            │
                                                   React SPA    FastAPI
                                                   (Railway)    (Railway)
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

## License

[MIT](LICENSE)
