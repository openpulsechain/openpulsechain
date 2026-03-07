import { useState } from 'react'
import { Database, Code, Zap, Copy, Check } from 'lucide-react'
import { Tabs } from '../ui/Tabs'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
      title="Copy"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </button>
  )
}

function CodeBlock({ code, className = '' }: { code: string; className?: string }) {
  return (
    <div className={`relative bg-gray-950 border border-white/10 rounded-lg p-4 font-mono text-sm overflow-x-auto ${className}`}>
      <CopyButton text={code} />
      <pre className="text-gray-300 whitespace-pre">{code}</pre>
    </div>
  )
}

const BASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface TableColumn {
  name: string
  type: string
}

interface Endpoint {
  table: string
  description: string
  columns: TableColumn[]
}

const ENDPOINTS: Record<string, Endpoint[]> = {
  'Bridge (OmniBridge)': [
    {
      table: 'bridge_transfers',
      description: 'Individual OmniBridge transfers between Ethereum and PulseChain',
      columns: [
        { name: 'id', type: 'text' },
        { name: 'direction', type: "text ('deposit' | 'withdrawal')" },
        { name: 'status', type: "text ('pending' | 'executed')" },
        { name: 'user_address', type: 'text' },
        { name: 'token_symbol', type: 'text' },
        { name: 'token_address_eth', type: 'text' },
        { name: 'token_address_pls', type: 'text' },
        { name: 'token_decimals', type: 'integer' },
        { name: 'amount_raw', type: 'text' },
        { name: 'amount_usd', type: 'numeric' },
        { name: 'message_id', type: 'text' },
        { name: 'tx_hash_eth', type: 'text' },
        { name: 'tx_hash_pls', type: 'text' },
        { name: 'block_timestamp', type: 'timestamptz' },
      ],
    },
    {
      table: 'bridge_daily_stats',
      description: 'Daily aggregated OmniBridge volumes and user counts',
      columns: [
        { name: 'date', type: 'date' },
        { name: 'deposit_count', type: 'integer' },
        { name: 'withdrawal_count', type: 'integer' },
        { name: 'deposit_volume_usd', type: 'numeric' },
        { name: 'withdrawal_volume_usd', type: 'numeric' },
        { name: 'net_flow_usd', type: 'numeric' },
        { name: 'unique_users', type: 'integer' },
        { name: 'updated_at', type: 'timestamptz' },
      ],
    },
    {
      table: 'bridge_token_stats',
      description: 'Per-token bridge volume breakdown',
      columns: [
        { name: 'token_address', type: 'text' },
        { name: 'token_symbol', type: 'text' },
        { name: 'total_deposit_count', type: 'integer' },
        { name: 'total_withdrawal_count', type: 'integer' },
        { name: 'total_deposit_volume_usd', type: 'numeric' },
        { name: 'total_withdrawal_volume_usd', type: 'numeric' },
        { name: 'net_flow_usd', type: 'numeric' },
        { name: 'last_bridge_at', type: 'timestamptz' },
        { name: 'updated_at', type: 'timestamptz' },
      ],
    },
  ],
  'Bridge (Hyperlane)': [
    {
      table: 'hyperlane_transfers',
      description: 'Individual Hyperlane cross-chain transfers (11 chains)',
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'msg_id', type: 'text' },
        { name: 'direction', type: "text ('inbound' | 'outbound')" },
        { name: 'is_delivered', type: 'boolean' },
        { name: 'origin_chain_id', type: 'integer' },
        { name: 'origin_chain_name', type: 'text' },
        { name: 'destination_chain_id', type: 'integer' },
        { name: 'destination_chain_name', type: 'text' },
        { name: 'sender_address', type: 'text' },
        { name: 'recipient_address', type: 'text' },
        { name: 'origin_tx_hash', type: 'text' },
        { name: 'destination_tx_hash', type: 'text' },
        { name: 'token_symbol', type: 'text' },
        { name: 'token_decimals', type: 'integer' },
        { name: 'amount_raw', type: 'text' },
        { name: 'amount_usd', type: 'numeric' },
        { name: 'send_occurred_at', type: 'timestamptz' },
        { name: 'delivery_occurred_at', type: 'timestamptz' },
        { name: 'nonce', type: 'integer' },
      ],
    },
    {
      table: 'hyperlane_daily_stats',
      description: 'Daily aggregated Hyperlane volumes across all chains',
      columns: [
        { name: 'date', type: 'date' },
        { name: 'inbound_count', type: 'integer' },
        { name: 'outbound_count', type: 'integer' },
        { name: 'inbound_volume_usd', type: 'numeric' },
        { name: 'outbound_volume_usd', type: 'numeric' },
        { name: 'net_flow_usd', type: 'numeric' },
        { name: 'unique_users', type: 'integer' },
        { name: 'unique_chains', type: 'integer' },
        { name: 'updated_at', type: 'timestamptz' },
      ],
    },
    {
      table: 'hyperlane_chain_stats',
      description: 'Per-chain Hyperlane volume breakdown',
      columns: [
        { name: 'chain_id', type: 'integer' },
        { name: 'chain_name', type: 'text' },
        { name: 'total_inbound_count', type: 'integer' },
        { name: 'total_outbound_count', type: 'integer' },
        { name: 'total_inbound_volume_usd', type: 'numeric' },
        { name: 'total_outbound_volume_usd', type: 'numeric' },
        { name: 'net_flow_usd', type: 'numeric' },
        { name: 'last_transfer_at', type: 'timestamptz' },
        { name: 'updated_at', type: 'timestamptz' },
      ],
    },
  ],
  'DEX (PulseX)': [
    {
      table: 'pulsex_daily_stats',
      description: 'Daily PulseX trading volumes and liquidity',
      columns: [
        { name: 'date', type: 'date' },
        { name: 'daily_volume_usd', type: 'numeric' },
        { name: 'total_liquidity_usd', type: 'numeric' },
        { name: 'total_volume_usd', type: 'numeric' },
        { name: 'total_transactions', type: 'integer' },
        { name: 'updated_at', type: 'timestamptz' },
      ],
    },
    {
      table: 'pulsex_top_pairs',
      description: 'Top trading pairs by volume on PulseX',
      columns: [
        { name: 'pair_address', type: 'text' },
        { name: 'token0_symbol', type: 'text' },
        { name: 'token0_name', type: 'text' },
        { name: 'token1_symbol', type: 'text' },
        { name: 'token1_name', type: 'text' },
        { name: 'volume_usd', type: 'numeric' },
        { name: 'reserve_usd', type: 'numeric' },
        { name: 'total_transactions', type: 'integer' },
        { name: 'updated_at', type: 'timestamptz' },
      ],
    },
  ],
  'Tokens (Sovereign)': [
    {
      table: 'pulsechain_tokens',
      description: 'All discovered PulseChain tokens (2500+ tokens, source: PulseX Subgraph)',
      columns: [
        { name: 'address', type: 'text (contract address)' },
        { name: 'symbol', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'decimals', type: 'integer' },
        { name: 'total_volume_usd', type: 'numeric' },
        { name: 'total_liquidity', type: 'numeric' },
        { name: 'is_active', type: 'boolean' },
        { name: 'updated_at', type: 'timestamptz' },
      ],
    },
    {
      table: 'token_price_history',
      description: 'Daily price history for all tokens since May 2023 (460K+ records, source: PulseX Subgraph)',
      columns: [
        { name: 'address', type: 'text (contract address)' },
        { name: 'date', type: 'date' },
        { name: 'price_usd', type: 'numeric' },
        { name: 'daily_volume_usd', type: 'numeric' },
        { name: 'total_liquidity_usd', type: 'numeric' },
        { name: 'source', type: "text ('pulsex_subgraph')" },
      ],
    },
    {
      table: 'token_prices',
      description: 'Current prices for PulseChain tokens + majors (source: PulseX Subgraph)',
      columns: [
        { name: 'id', type: 'text' },
        { name: 'symbol', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'price_usd', type: 'numeric' },
        { name: 'market_cap_usd', type: 'numeric' },
        { name: 'volume_24h_usd', type: 'numeric' },
        { name: 'price_change_24h_pct', type: 'numeric' },
        { name: 'last_updated', type: 'timestamptz' },
      ],
    },
  ],
  'Network': [
    {
      table: 'network_tvl_history',
      description: 'Historical TVL for PulseChain (source: DefiLlama)',
      columns: [
        { name: 'date', type: 'date' },
        { name: 'tvl_usd', type: 'numeric' },
        { name: 'source', type: 'text' },
      ],
    },
    {
      table: 'network_dex_volume',
      description: 'Historical DEX trading volume across PulseChain (source: DefiLlama)',
      columns: [
        { name: 'date', type: 'date' },
        { name: 'volume_usd', type: 'numeric' },
        { name: 'source', type: 'text' },
      ],
    },
    {
      table: 'network_snapshots',
      description: 'Network gas price snapshots',
      columns: [
        { name: 'block_number', type: 'integer' },
        { name: 'gas_price_gwei', type: 'numeric' },
        { name: 'base_fee_gwei', type: 'numeric' },
        { name: 'timestamp', type: 'timestamptz' },
      ],
    },
  ],
}

const CODE_TABS = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
]

const CODE_EXAMPLES: Record<string, { title: string; curl: string; javascript: string; python: string }> = {
  whale: {
    title: 'Whale alerts — transfers > $50K',
    curl: `curl '${BASE_URL}/rest/v1/bridge_transfers?amount_usd=gte.50000&order=block_timestamp.desc&limit=20' \\
  -H "apikey: ${ANON_KEY}"`,
    javascript: `const res = await fetch(
  '${BASE_URL}/rest/v1/bridge_transfers?amount_usd=gte.50000&order=block_timestamp.desc&limit=20',
  { headers: { apikey: '${ANON_KEY}' } }
)
const whales = await res.json()
console.log(whales)`,
    python: `import requests

url = "${BASE_URL}/rest/v1/bridge_transfers"
headers = {"apikey": "${ANON_KEY}"}
params = {"amount_usd": "gte.50000", "order": "block_timestamp.desc", "limit": 20}

whales = requests.get(url, headers=headers, params=params).json()
print(whales)`,
  },
  volume: {
    title: 'Daily bridge volume — last 30 days',
    curl: `curl '${BASE_URL}/rest/v1/bridge_daily_stats?order=date.desc&limit=30' \\
  -H "apikey: ${ANON_KEY}"`,
    javascript: `const res = await fetch(
  '${BASE_URL}/rest/v1/bridge_daily_stats?order=date.desc&limit=30',
  { headers: { apikey: '${ANON_KEY}' } }
)
const stats = await res.json()
console.log(stats)`,
    python: `import requests

url = "${BASE_URL}/rest/v1/bridge_daily_stats"
headers = {"apikey": "${ANON_KEY}"}
params = {"order": "date.desc", "limit": 30}

stats = requests.get(url, headers=headers, params=params).json()
print(stats)`,
  },
  prices: {
    title: 'Current token prices',
    curl: `curl '${BASE_URL}/rest/v1/token_prices?select=symbol,price_usd,price_change_24h_pct' \\
  -H "apikey: ${ANON_KEY}"`,
    javascript: `const res = await fetch(
  '${BASE_URL}/rest/v1/token_prices?select=symbol,price_usd,price_change_24h_pct',
  { headers: { apikey: '${ANON_KEY}' } }
)
const prices = await res.json()
console.log(prices)`,
    python: `import requests

url = "${BASE_URL}/rest/v1/token_prices"
headers = {"apikey": "${ANON_KEY}"}
params = {"select": "symbol,price_usd,price_change_24h_pct"}

prices = requests.get(url, headers=headers, params=params).json()
print(prices)`,
  },
  tokenHistory: {
    title: 'Token price history (sovereign) — HEX last 30 days',
    curl: `curl '${BASE_URL}/rest/v1/token_price_history?address=eq.0x2b591e99afe9f32eaa6214f7b7629768c40eeb39&order=date.desc&limit=30&select=date,price_usd,daily_volume_usd' \\
  -H "apikey: ${ANON_KEY}"`,
    javascript: `const res = await fetch(
  '${BASE_URL}/rest/v1/token_price_history?address=eq.0x2b591e99afe9f32eaa6214f7b7629768c40eeb39&order=date.desc&limit=30&select=date,price_usd,daily_volume_usd',
  { headers: { apikey: '${ANON_KEY}' } }
)
const history = await res.json()
console.log(history)`,
    python: `import requests

url = "${BASE_URL}/rest/v1/token_price_history"
headers = {"apikey": "${ANON_KEY}"}
params = {
    "address": "eq.0x2b591e99afe9f32eaa6214f7b7629768c40eeb39",
    "order": "date.desc", "limit": 30,
    "select": "date,price_usd,daily_volume_usd"
}

history = requests.get(url, headers=headers, params=params).json()
print(history)  # HEX daily prices from PulseX Subgraph`,
  },
  tokenDiscovery: {
    title: 'Top tokens by volume (sovereign)',
    curl: `curl '${BASE_URL}/rest/v1/pulsechain_tokens?is_active=eq.true&order=total_volume_usd.desc&limit=20&select=address,symbol,name,total_volume_usd' \\
  -H "apikey: ${ANON_KEY}"`,
    javascript: `const res = await fetch(
  '${BASE_URL}/rest/v1/pulsechain_tokens?is_active=eq.true&order=total_volume_usd.desc&limit=20&select=address,symbol,name,total_volume_usd',
  { headers: { apikey: '${ANON_KEY}' } }
)
const tokens = await res.json()
console.log(tokens)`,
    python: `import requests

url = "${BASE_URL}/rest/v1/pulsechain_tokens"
headers = {"apikey": "${ANON_KEY}"}
params = {
    "is_active": "eq.true",
    "order": "total_volume_usd.desc",
    "limit": 20,
    "select": "address,symbol,name,total_volume_usd"
}

tokens = requests.get(url, headers=headers, params=params).json()
print(tokens)  # 2500+ tokens from PulseX Subgraph`,
  },
  hyperlane: {
    title: 'Hyperlane chain breakdown',
    curl: `curl '${BASE_URL}/rest/v1/hyperlane_chain_stats?order=total_inbound_volume_usd.desc' \\
  -H "apikey: ${ANON_KEY}"`,
    javascript: `const res = await fetch(
  '${BASE_URL}/rest/v1/hyperlane_chain_stats?order=total_inbound_volume_usd.desc',
  { headers: { apikey: '${ANON_KEY}' } }
)
const chains = await res.json()
console.log(chains)`,
    python: `import requests

url = "${BASE_URL}/rest/v1/hyperlane_chain_stats"
headers = {"apikey": "${ANON_KEY}"}
params = {"order": "total_inbound_volume_usd.desc"}

chains = requests.get(url, headers=headers, params=params).json()
print(chains)`,
  },
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [open, setOpen] = useState(false)
  const curlExample = `curl '${BASE_URL}/rest/v1/${endpoint.table}?limit=5' \\
  -H "apikey: ${ANON_KEY}"`

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <code className="text-[#00D4FF] text-sm font-mono">{endpoint.table}</code>
          <span className="text-gray-400 text-sm hidden sm:inline">{endpoint.description}</span>
        </div>
        <span className="text-gray-500 text-xs">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="border-t border-white/5 px-4 py-3 space-y-3">
          <p className="text-gray-400 text-sm sm:hidden">{endpoint.description}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 text-xs">
                  <th className="pb-2 pr-6">Column</th>
                  <th className="pb-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {endpoint.columns.map((col) => (
                  <tr key={col.name} className="border-t border-white/5">
                    <td className="py-1.5 pr-6 font-mono text-emerald-400">{col.name}</td>
                    <td className="py-1.5 text-gray-400">{col.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CodeBlock code={curlExample} />
        </div>
      )}
    </div>
  )
}

export function ApiPage() {
  const [codeTab, setCodeTab] = useState('curl')

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="text-center space-y-4 pt-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-[#00D4FF] to-[#8000E0] bg-clip-text text-transparent">
          Public API
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Free, no auth required, sovereign PulseChain data.
          <br />
          <span className="text-gray-500">The only open API for PulseChain tokens, bridges, DEX, and network data — 100% on-chain, zero third-party dependency.</span>
        </p>
      </div>

      {/* Base URL + API Key */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[#00D4FF]" />
          <h2 className="text-xl font-semibold">Quick Start</h2>
        </div>
        <p className="text-gray-400 text-sm">
          All endpoints use the Supabase REST API. Include the <code className="text-[#00D4FF]">apikey</code> header in every request.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 uppercase tracking-wider">Base URL</label>
            <CodeBlock code={`${BASE_URL}/rest/v1/`} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 uppercase tracking-wider">Header</label>
            <CodeBlock code={`apikey: ${ANON_KEY}`} />
          </div>
        </div>
        <div className="bg-gray-900/50 border border-white/5 rounded-lg p-4 text-sm text-gray-400">
          <strong className="text-gray-300">PostgREST filtering:</strong> Use query params for filtering, ordering, and pagination.
          Examples: <code className="text-[#00D4FF]">?amount_usd=gte.50000</code>,{' '}
          <code className="text-[#00D4FF]">?order=date.desc</code>,{' '}
          <code className="text-[#00D4FF]">?limit=100</code>,{' '}
          <code className="text-[#00D4FF]">?select=symbol,price_usd</code>.{' '}
          <a
            href="https://docs.postgrest.org/en/stable/references/api/tables_views.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00D4FF] hover:underline"
          >
            Full PostgREST docs
          </a>
        </div>
      </section>

      {/* Endpoints */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-[#00D4FF]" />
          <h2 className="text-xl font-semibold">Endpoints</h2>
          <span className="text-gray-500 text-sm">14 tables</span>
        </div>

        {Object.entries(ENDPOINTS).map(([category, endpoints]) => (
          <div key={category} className="space-y-2">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{category}</h3>
            <div className="space-y-1">
              {endpoints.map((ep) => (
                <EndpointCard key={ep.table} endpoint={ep} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Code Examples */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-[#00D4FF]" />
          <h2 className="text-xl font-semibold">Code Examples</h2>
        </div>

        <Tabs tabs={CODE_TABS} active={codeTab} onChange={setCodeTab} />

        <div className="space-y-4">
          {Object.values(CODE_EXAMPLES).map((example) => (
            <div key={example.title} className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">{example.title}</h4>
              <CodeBlock code={example[codeTab as keyof typeof example]} />
            </div>
          ))}
        </div>
      </section>

      {/* REST API */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-emerald-400" />
          <h2 className="text-xl font-semibold">REST API</h2>
          <span className="text-xs text-gray-500 border border-white/10 rounded px-2 py-0.5">No auth required</span>
        </div>
        <p className="text-gray-400 text-sm">
          Simpler alternative to PostgREST. Standard JSON responses, no API key needed.
          <br />
          <span className="text-gray-500">Interactive docs available at <code className="text-[#00D4FF]">/docs</code> (Swagger UI).</span>
        </p>

        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Base URL</h3>
          <CodeBlock code="https://openpulsechain-api-production.up.railway.app" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-white/10">
                <th className="py-2 pr-4">Method</th>
                <th className="py-2 pr-4">Endpoint</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2">Rate Limit</th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              <tr className="border-b border-white/5">
                <td className="py-2 pr-4 text-emerald-400">GET</td>
                <td className="py-2 pr-4 text-[#00D4FF]">/api/v1/tokens</td>
                <td className="py-2 pr-4 text-gray-400 font-sans">List tokens (paginated, sortable)</td>
                <td className="py-2 text-gray-500 font-sans">60/min</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2 pr-4 text-emerald-400">GET</td>
                <td className="py-2 pr-4 text-[#00D4FF]">{'/api/v1/tokens/{address}'}</td>
                <td className="py-2 pr-4 text-gray-400 font-sans">Token detail + current price</td>
                <td className="py-2 text-gray-500 font-sans">120/min</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2 pr-4 text-emerald-400">GET</td>
                <td className="py-2 pr-4 text-[#00D4FF]">{'/api/v1/tokens/{address}/price'}</td>
                <td className="py-2 pr-4 text-gray-400 font-sans">Current price only (fast)</td>
                <td className="py-2 text-gray-500 font-sans">120/min</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2 pr-4 text-emerald-400">GET</td>
                <td className="py-2 pr-4 text-[#00D4FF]">{'/api/v1/tokens/{address}/history'}</td>
                <td className="py-2 pr-4 text-gray-400 font-sans">Price history (days/date range)</td>
                <td className="py-2 text-gray-500 font-sans">30/min</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2 pr-4 text-emerald-400">GET</td>
                <td className="py-2 pr-4 text-[#00D4FF]">/api/v1/pairs</td>
                <td className="py-2 pr-4 text-gray-400 font-sans">Top PulseX trading pairs</td>
                <td className="py-2 text-gray-500 font-sans">60/min</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2 pr-4 text-emerald-400">GET</td>
                <td className="py-2 pr-4 text-[#00D4FF]">/api/v1/market/overview</td>
                <td className="py-2 pr-4 text-gray-400 font-sans">TVL, volume, top gainers/losers</td>
                <td className="py-2 text-gray-500 font-sans">60/min</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Example: Get HEX price history</h4>
          <CodeBlock code={`curl 'https://openpulsechain-api-production.up.railway.app/api/v1/tokens/0x2b591e99afe9f32eaa6214f7b7629768c40eeb39/history?days=30'`} />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Example: Market overview</h4>
          <CodeBlock code={`curl 'https://openpulsechain-api-production.up.railway.app/api/v1/market/overview'`} />
        </div>
      </section>

      {/* Rate Limits */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Rate Limits</h2>
        <div className="bg-gray-900/50 border border-white/5 rounded-lg p-4 text-sm text-gray-400 space-y-2">
          <p><strong className="text-gray-300">Supabase PostgREST API:</strong></p>
          <ul className="list-disc list-inside space-y-1 text-gray-500">
            <li>No hard rate limits — be reasonable (max ~60 req/min)</li>
            <li>Use <code className="text-[#00D4FF]">limit</code> and <code className="text-[#00D4FF]">select</code> to reduce payload size</li>
            <li>Cache responses on your side when possible</li>
          </ul>
          <p className="mt-3"><strong className="text-gray-300">REST API (FastAPI):</strong></p>
          <ul className="list-disc list-inside space-y-1 text-gray-500">
            <li>30-120 requests/minute per IP (varies by endpoint)</li>
            <li>Responses cached 30s (list/detail) to 5min (history)</li>
            <li>429 returned when limit exceeded</li>
          </ul>
          <p className="mt-3 text-gray-500">Data refreshes every 5-15 minutes depending on the table.</p>
        </div>
      </section>

      {/* Links */}
      <section className="flex flex-wrap gap-3 pb-6">
        <a
          href="https://github.com/openpulsechain/openpulsechain"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          GitHub Repository
        </a>
        <a
          href="https://docs.postgrest.org/en/stable/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          PostgREST Documentation
        </a>
      </section>
    </div>
  )
}
