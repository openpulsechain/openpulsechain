# Dune Queries

This directory contains SQL queries designed to run on [Dune Analytics](https://dune.com) for PulseChain-related data analysis.

---

## Context

PulseChain is not natively indexed by Dune Analytics as of March 2026. It is not included in Dune's 100+ supported blockchains.

As a result, all queries in this directory target **Ethereum mainnet** tables. They analyze interactions with PulseChain bridge contracts deployed on Ethereum, providing insight into cross-chain flows without requiring direct PulseChain data.

If Dune adds native PulseChain support in the future, this directory will be expanded with queries targeting PulseChain-native tables.

---

## Available Queries

| File | Description | Target |
|------|-------------|--------|
| `bridge_flows.sql` | Daily and cumulative bridge inflows/outflows by token | Ethereum mainnet |

---

## Usage

1. Navigate to [dune.com](https://dune.com) and sign in (free tier is sufficient).
2. Create a new query.
3. Copy the contents of the desired `.sql` file and paste it into the query editor.
4. Execute the query.
5. Optionally, fork the query to customize filters, date ranges, or visualizations.

---

## Query Format

Each `.sql` file includes a header comment block with the following metadata:

```sql
-- Title:       <Query title>
-- Description: <What this query measures>
-- Chain:       <Target blockchain (e.g., Ethereum)>
-- Contracts:   <Relevant contract addresses>
-- Output:      <Expected columns>
-- Author:      <Contributor handle>
-- Dune Link:   <Published dashboard URL, if applicable>
```

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for query submission guidelines.
