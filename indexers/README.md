# Indexers

Lightweight Python scripts that collect on-chain and off-chain PulseChain data and store it in Supabase (PostgreSQL).

---

## Architecture

```
Bridge Subgraphs (ETH + PLS)  ─┐
DefiLlama API (TVL, DEX)      ─┤
CoinGecko API (prices)        ─┼──→  main.py  ──→  Supabase
PulseChain RPC (gas, blocks)  ─┘     (cron)        (8 tables)
```

All 6 indexers run sequentially in a single cron execution every 15 minutes (~15-30s total).

---

## Indexers

| Module | Source | Target Table | Description |
|--------|--------|-------------|-------------|
| `bridge_subgraph` | ETH + PLS subgraphs | `bridge_transfers` | Individual bridge transfers (deposits + withdrawals) |
| `bridge_aggregator` | `bridge_transfers` | `bridge_daily_stats`, `bridge_token_stats` | Pre-aggregated daily and per-token stats |
| `network_tvl` | DefiLlama | `network_tvl_history` | PulseChain chain TVL (daily) |
| `network_dex_volume` | DefiLlama | `network_dex_volume` | PulseX DEX volume (daily) |
| `token_prices` | CoinGecko | `token_prices` | Prices for 13 tracked tokens |
| `network_snapshot` | PulseChain RPC | `network_snapshots` | Block number, gas price, base fee |

---

## Setup

```bash
cd indexers
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Supabase credentials
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (NOT anon key) |
| `COINGECKO_API_KEY` | No | CoinGecko API key (free tier works without) |

---

## Running

```bash
# Single run (local testing)
python main.py

# First run = backfill (~10-20 min for 950K bridge transfers)
# Subsequent runs = incremental (~15-30s)
```

---

## Deployment (Railway)

1. Create a new Railway project
2. Connect the GitHub repo, set root directory to `indexers`
3. Add environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
4. Railway will auto-detect the Dockerfile
5. Cron schedule is configured in `railway.toml`: `*/15 * * * *`

---

## Sync Strategy

- **Bridge subgraph**: Cursor-based pagination using `timestamp_gt`. Resumes from last synced timestamp. Max 50K records per run (50 pages x 1000).
- **Execution matching**: After syncing transfers, queries `executions` entity to update `pending → executed` status via `messageId`.
- **DefiLlama / CoinGecko**: Incremental (only inserts data newer than last synced date).
- **Network snapshots**: Appends one record per run.
- **Aggregator**: Recomputes all daily and token stats from `bridge_transfers` via Supabase RPC functions.

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for coding standards and submission guidelines.
