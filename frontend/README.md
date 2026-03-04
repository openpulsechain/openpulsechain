# Frontend

Web dashboard for PulseChain Analytics, providing visual exploration of network metrics, bridge flows, liquidity data, and whale activity.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite | Build toolchain |
| TailwindCSS | Utility-first styling |
| Supabase JS | Database client and real-time subscriptions |
| Vercel | Deployment (free tier) |

---

## Prerequisites

- Node.js >= 18
- npm or yarn
- A Supabase project with indexed data (see [`/indexers`](../indexers))

---

## Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `.env` with your Supabase project credentials.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |

---

## Development

```bash
npm run dev
```

The development server starts at `http://localhost:5173` with hot module replacement.

---

## Production Build

```bash
npm run build
npm run preview
```

The production build outputs to `dist/`. Deploy to Vercel by connecting the repository and setting the root directory to `frontend`.

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for component guidelines and submission process.
