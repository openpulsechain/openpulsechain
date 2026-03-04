# Contributing to PulseChain Analytics

Thanks for your interest in contributing! This project is open-source and community-driven.

## How to contribute

### 1. Dune Queries
Add or improve SQL queries in the `/dune` directory. Each query should have:
- A `.sql` file with the query
- A comment header explaining what it does
- The Dune dashboard link (if published)

### 2. Data Indexers
Python scripts in `/indexers` that fetch and store on-chain data:
- Use free RPC (`rpc.pulsechain.com`) by default
- Store results in Supabase
- Respect rate limits

### 3. Frontend
React components in `/frontend`:
- Keep it simple and lightweight
- Mobile-friendly
- No unnecessary dependencies

### 4. Community Bounties
Check the README for features that need contributors with archive node access. If you run a PulseChain node, your contributions are especially valuable.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/eva-sentience/pulsechain-analytics.git
cd pulsechain-analytics

# Install dependencies (details coming soon)
```

## Guidelines

- Keep PRs focused — one feature per PR
- Add tests when possible
- No API keys or secrets in code — use environment variables
- Follow existing code style
- Be respectful in issues and discussions

## Reporting Issues

Open an issue on GitHub with:
- What you expected
- What happened
- Steps to reproduce

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
