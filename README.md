# PulseChain Analytics

An open-source analytics platform for the [PulseChain](https://pulsechain.com) blockchain.

PulseChain Analytics provides transparent, verifiable, and queryable on-chain data through a combination of Dune SQL dashboards and a self-hosted data pipeline. The project is designed to be community-driven and extensible.

**Disclaimer:** This project is not affiliated with PulseChain, PulseX, or any related entity. All data is provided for informational and educational purposes only. Nothing in this repository constitutes financial advice.

---

## Table of Contents

- [Motivation](#motivation)
- [Feature Roadmap](#feature-roadmap)
- [Architecture](#architecture)
- [Data Sources](#data-sources)
- [Getting Started](#getting-started)
- [Dune Dashboards](#dune-dashboards)
- [Community Contributions](#community-contributions)
- [Contributing](#contributing)
- [License](#license)

---

## Motivation

The PulseChain ecosystem currently lacks open, queryable, and community-auditable analytics tooling. Existing solutions are either closed-source and centralized, or limited in scope. PulseChain is not natively indexed by Dune Analytics, which further limits the availability of on-chain data for researchers, developers, and users.

This project addresses that gap by providing:

- **Open-source SQL queries** for bridge flow analysis (Ethereum-side) via Dune Analytics.
- **A lightweight data pipeline** aggregating free API sources (DefiLlama, CoinGecko, PulseChain RPC) into a structured database.
- **A public REST API** for programmatic access to indexed PulseChain metrics.
- **A web dashboard** for visual exploration of network health, liquidity, and activity.

---

## Feature Roadmap

| Feature | Status | Data Source | Notes |
|---------|--------|-------------|-------|
| Bridge inflows/outflows | In progress | Dune Analytics (ETH-side) | Ethereum bridge contract events |
| Network overview (TVL, gas, burn, holders) | Planned | DefiLlama API, PulseChain RPC | Aggregated from multiple free APIs |
| Whale transfer alerts | Planned | PulseChain RPC | Large-value `Transfer` event monitoring |
| PulseX volume and liquidity | Planned | DefiLlama DEX API | Pair-level breakdown |
| Farming yield tracking | Planned | PulseChain RPC | Pool reserve snapshots via `getReserves()` |
| Public REST API | Planned | Supabase | Auto-generated from indexed data |

See [Community Contributions](#community-contributions) for features that require archive node access.

---

## Architecture

```
+-----------------------+     +--------------------+     +------------------+
|    Data Sources       |     |    Backend         |     |    Frontend       |
|                       |     |                    |     |                  |
|  DefiLlama API        |---->|  PostgreSQL        |---->|  React + TS      |
|  PulseChain RPC       |     |  (Supabase)        |     |  (Vercel)        |
|  CoinGecko API        |     |                    |     |                  |
|  PulseChain Explorer  |     |  Cron indexers     |     |                  |
|  Dune Analytics       |     |  (Railway)         |     |                  |
+-----------------------+     +--------------------+     +------------------+
```

**Backend:** PostgreSQL database hosted on Supabase with Row-Level Security. Lightweight Python indexers run on Railway as scheduled cron jobs.

**Frontend:** React single-page application with TypeScript and TailwindCSS, deployed on Vercel.

**Dune layer:** Standalone SQL queries targeting Ethereum mainnet contracts (bridge, sacrifice). These operate independently and do not require the backend infrastructure.

---

## Data Sources

All data sources used in this project are free and publicly accessible.

| Data | Provider | Endpoint | Rate Limit |
|------|----------|----------|------------|
| Chain TVL and protocol breakdown | DefiLlama | `api.llama.fi/v2/chains`, `api.llama.fi/protocols` | Unlimited |
| Historical chain TVL | DefiLlama | `api.llama.fi/v2/historicalChainTvl/PulseChain` | Unlimited |
| DEX volume by chain | DefiLlama | `api.llama.fi/overview/dexs/PulseChain` | Unlimited |
| Token prices | CoinGecko | `api.coingecko.com/api/v3/simple/price` | 30 calls/min |
| Gas price, block data, logs | PulseChain RPC | `rpc.pulsechain.com` | Public, rate-limited |
| Address and contract data | PulseChain Explorer | `scan.pulsechain.com/api` | Public, rate-limited |
| Bridge contract events | Dune Analytics | Ethereum mainnet tables | 2,500 credits/month (free tier) |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- Python >= 3.10
- A Supabase account (free tier)
- Git

### Clone the repository

```bash
git clone https://github.com/openpulsechain/openpulsechain.git
cd pulsechain-analytics
```

Refer to each module's documentation for setup instructions:

- [`/dune`](./dune) -- Dune Analytics SQL queries
- [`/indexers`](./indexers) -- Python data indexers
- [`/frontend`](./frontend) -- React web dashboard

---

## Dune Dashboards

PulseChain is not natively indexed by Dune Analytics. The SQL queries in [`/dune`](./dune) target **Ethereum mainnet** to analyze bridge contract interactions (deposits, withdrawals, token flows).

These queries can be copied directly into the [Dune query editor](https://dune.com) and executed on the free tier.

**Live dashboard:** [dune.com/openpulsechain/pulsechain-bridge-analytics](https://dune.com/openpulsechain/pulsechain-bridge-analytics)

For a detailed comparison of our data against other platforms (DefiLlama, GoPulse, PulseChainStats), see [`docs/bridge-data-comparison.md`](docs/bridge-data-comparison.md).

---

## Community Contributions

The following features require infrastructure beyond the scope of this project's budget (archive node access, high-throughput RPC). They are documented as open bounties for community contributors.

| Feature | Requirement | Complexity |
|---------|-------------|------------|
| Wash trading detection on PulseX | Archive node, full swap history | High |
| MEV and arbitrage tracking | Archive node with `debug_traceTransaction` | High |
| Rug pull and honeypot monitoring | Real-time contract analysis | High |
| Full DeFi portfolio tracker | Protocol-specific ABI decoding | Medium |
| Telegram and Discord alert bots | Webhook infrastructure | Low |

If you operate a PulseChain archive node or have access to dedicated RPC infrastructure, contributions in these areas are especially valuable. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Contributing

Contributions of all kinds are welcome: SQL queries, indexer scripts, frontend components, documentation improvements, and bug reports.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

---

## License

This project is licensed under the [MIT License](LICENSE).
