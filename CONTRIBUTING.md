# Contributing

This document outlines the guidelines for contributing to PulseChain Analytics. The project is open-source under the MIT License, and contributions of all kinds are welcome.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Contribution Areas](#contribution-areas)
- [Code Standards](#code-standards)
- [Pull Request Process](#pull-request-process)
- [Security](#security)
- [Reporting Issues](#reporting-issues)

---

## Development Setup

```bash
git clone https://github.com/openpulsechain/openpulsechain.git
cd pulsechain-analytics
```

Refer to the README in each module for specific setup instructions:

- [`/dune`](./dune) -- SQL queries for Dune Analytics
- [`/indexers`](./indexers) -- Python data collection scripts
- [`/frontend`](./frontend) -- React web dashboard

---

## Project Structure

```
pulsechain-analytics/
|-- dune/              SQL queries targeting Ethereum mainnet (bridge, sacrifice)
|-- indexers/          Python scripts for on-chain data collection and storage
|-- frontend/          React + TypeScript dashboard application
|-- LICENSE            MIT License
|-- CONTRIBUTING.md    This file
|-- README.md          Project overview and documentation
```

---

## Contribution Areas

### Dune SQL Queries

Location: `/dune`

- Each query must be a standalone `.sql` file.
- Include a header comment block with: query description, target chain, relevant contract addresses, and expected output columns.
- If the query is published on Dune, include the dashboard URL in the header.

### Data Indexers

Location: `/indexers`

- Written in Python 3.10+.
- Must use the public PulseChain RPC (`rpc.pulsechain.com`) by default. Do not hardcode paid RPC endpoints.
- Store results in Supabase via the `supabase-py` client.
- Respect API rate limits. Implement exponential backoff where appropriate.
- Include a `.env.example` file documenting all required environment variables.

### Frontend

Location: `/frontend`

- Built with React, TypeScript, Vite, and TailwindCSS.
- Components must be responsive and accessible.
- Minimize external dependencies. Justify any new dependency in the pull request description.
- Do not embed API keys or secrets in client-side code.

### Documentation

- Written in English.
- Use clear, concise language. Avoid colloquial expressions.
- Follow the existing document structure and formatting conventions.

---

## Code Standards

- **No secrets in source code.** All credentials, API keys, and sensitive configuration must be loaded from environment variables.
- **One concern per pull request.** Keep PRs focused on a single feature, fix, or improvement.
- **Write tests** for new functionality when the testing infrastructure is in place.
- **Follow existing conventions.** Match the code style, naming patterns, and directory structure of the module you are contributing to.
- **No unnecessary abstractions.** Prefer straightforward implementations over premature generalization.

---

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Implement your changes following the code standards above.
3. Ensure your code runs without errors locally.
4. Write a clear PR description explaining what was changed and why.
5. Reference any related issues using `Closes #<issue-number>` or `Relates to #<issue-number>`.
6. Submit the pull request for review.

---

## Security

If you discover a security vulnerability, do not open a public issue. Instead, report it privately via the repository's security advisory feature or contact the maintainers directly.

---

## Reporting Issues

When opening an issue, include:

- A clear and descriptive title.
- Steps to reproduce the problem.
- Expected behavior versus actual behavior.
- Relevant logs, error messages, or screenshots.
- Environment details (OS, Node.js version, Python version, browser).

---

## License

By submitting a contribution, you agree that your work will be licensed under the [MIT License](LICENSE).
