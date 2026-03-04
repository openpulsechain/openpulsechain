# PulseChain Analytics

Open-source analytics platform for the PulseChain blockchain.

> Community-built — not official — not financial advice.

## Why?

PulseChain lacks open, queryable, community-driven analytics. Existing tools are either closed-source, centralized, or incomplete. This project aims to fill that gap.

## What we cover

| Feature | Status | Data Source |
|---------|--------|-------------|
| Bridge Inflows/Outflows | Planned | Dune (ETH-side) |
| Network Dashboard (TVL, gas, burn, holders) | Planned | DefiLlama API, RPC |
| Whale Alerts (top transfers) | Planned | RPC |
| PulseX Volume & Liquidity | Planned | DefiLlama DEX API |
| Farming Yields (basic) | Planned | RPC `getReserves()` |
| Public REST API | Planned | Supabase |

## Community Bounties

These features need contributors with archive node access:

- [ ] Wash trading detection on PulseX
- [ ] MEV / arbitrage tracking
- [ ] Rug pull monitoring
- [ ] Full portfolio tracker (DeFi positions per protocol)
- [ ] Telegram / Discord bots

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get involved.

## Architecture

```
+------------------+     +----------------+     +-------------+
|  Data Sources    |     |   Backend      |     |  Frontend   |
|  - DefiLlama API | --> |  - Supabase DB | --> |  - React    |
|  - RPC public    |     |  - REST API    |     |  - Vercel   |
|  - CoinGecko     |     |  - Cron jobs   |     |             |
|  - Dune (bridge) |     |  (Railway)     |     |             |
+------------------+     +----------------+     +-------------+
```

## Data Sources (all free)

| Data | Source | API |
|------|--------|-----|
| TVL & protocols | DefiLlama | `api.llama.fi` |
| Gas & PLS burn | PulseChain RPC | `rpc.pulsechain.com` |
| Token prices | CoinGecko | `api.coingecko.com` |
| Bridge flows | Dune Analytics | Free tier |
| DEX volume | DefiLlama DEX | `api.llama.fi` |
| Holders | PulseChain Explorer | `scan.pulsechain.com` |

## Getting Started

```bash
git clone https://github.com/eva-sentience/pulsechain-analytics.git
cd pulsechain-analytics
# Setup instructions coming soon
```

## Dune Dashboards

Bridge dashboard queries are in the [`/dune`](./dune) directory. You can fork them directly on [Dune Analytics](https://dune.com).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions welcome — from SQL queries to full features.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This project is community-built and not affiliated with PulseChain, PulseX, or any related entity. Data is provided as-is for informational and educational purposes only. This is not financial advice.
