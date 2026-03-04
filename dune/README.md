# Dune Queries

SQL queries for PulseChain bridge analytics on [Dune Analytics](https://dune.com).

---

## Context

PulseChain is not natively indexed by Dune Analytics as of March 2026. All queries in this directory target **Ethereum mainnet** to analyze interactions with the PulseChain bridge contracts deployed on Ethereum.

### Target Contracts

| Contract | Address | Role |
|----------|---------|------|
| OmniBridge Proxy | `0x1715a3e4a142d8b698131108995174f37aeba10d` | Main bridge contract. Locks ERC20 tokens on deposit, releases on withdrawal. |
| WETH OmniBridge Router | `0x8ac4ae65b3656e26dc4e0e69108b392283350f55` | Handles native ETH wrapping and bridging via the OmniBridge. |

### Methodology

- **Deposits** (Ethereum to PulseChain): ERC20 `Transfer` events where `to` is a bridge contract address. Tokens are locked on Ethereum and minted on PulseChain.
- **Withdrawals** (PulseChain to Ethereum): ERC20 `Transfer` events where `from` is a bridge contract address. Tokens are released on Ethereum after being burned on PulseChain.
- **USD valuation**: Daily price from `prices.day` (curated Dune table) joined on token contract address.
- **Price sanitization**: Per-transfer USD cap of $50M to filter out tokens with manipulated/inflated prices from low-liquidity sources.
- **Partition pruning**: All queries filter on `evt_block_date` (physical partition column) for optimal performance.

---

## Available Queries

| File | Description | Output |
|------|-------------|--------|
| `bridge_daily_flows.sql` | Daily deposit and withdrawal volume in USD with cumulative net flow | Time series: day, deposits, withdrawals, net flow |
| `bridge_token_breakdown.sql` | Aggregate bridge volume by token, ranked by total volume | Table: token, deposits, withdrawals, net flow, tx count |
| `bridge_top_users.sql` | Top 100 bridge users by total USD volume (excludes bridge contracts) | Table: address, deposits, withdrawals, net flow, activity dates |

### Dune Query IDs

| Query | Dune ID | Credits |
|-------|---------|---------|
| Daily Flows | [6775936](https://dune.com/queries/6775936) | ~10 |
| Token Breakdown | [6775937](https://dune.com/queries/6775937) | ~7 |
| Top Users | [6775939](https://dune.com/queries/6775939) | ~8 |

---

## Usage

1. Sign in to [dune.com](https://dune.com) (free tier is sufficient).
2. Create a new query.
3. Copy the contents of the desired `.sql` file into the query editor.
4. Execute. The queries use DuneSQL syntax and target `erc20_ethereum.evt_Transfer`, `tokens.erc20`, and `prices.day` tables.
5. Add visualizations (bar chart for daily flows, table for token breakdown, etc.).

---

## Query Header Format

Each `.sql` file includes a comment header with:

```sql
-- Title:       <Query title>
-- Description: <What this query measures>
-- Chain:       <Target blockchain>
-- Contracts:   <Relevant contract addresses>
-- Output:      <Expected columns>
-- Author:      <Contributor handle>
-- Dune Link:   <Published dashboard URL>
```

---

## Limitations

- These queries only capture **Ethereum-side** bridge activity. PulseChain-native transactions are not visible until PulseChain is natively indexed on Dune.
- Native ETH transfers to the WETH router are tracked via the WETH wrapping event, not raw ETH transfers.
- Tokens without entries in `prices.day` will show a USD value of 0.
- Transfers exceeding $50M USD per transaction are filtered out to exclude tokens with manipulated prices from low-liquidity sources.
- The `0x000...000` address (token mint/burn) appears in top users as it receives burned bridged tokens.

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for query submission guidelines.
