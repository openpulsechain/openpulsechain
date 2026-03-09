const SAFETY_API = 'https://safety.openpulsechain.com'
const REST_API = 'https://api.openpulsechain.com'

export interface SafetyScore {
  token_address: string
  score: number
  grade: string
  risks: string[]
  honeypot_score: number
  is_honeypot: boolean
  buy_tax_pct: number | null
  sell_tax_pct: number | null
  contract_score: number
  is_verified: boolean
  is_proxy: boolean
  ownership_renounced: boolean
  has_mint: boolean
  has_blacklist: boolean
  contract_dangers: string[]
  lp_score: number
  has_lp: boolean
  total_liquidity_usd: number
  pair_count: number
  holders_score: number
  holder_count: number
  top10_pct: number
  top1_pct: number
  age_score: number
  age_days: number
  analyzed_at: string
  token_symbol?: string
  token_name?: string
}

export interface DeployerReputation {
  deployer_address: string
  tokens_deployed: number
  tokens_dead: number
  tokens_alive: number
  dead_ratio: number
  reputation_score: number
  risk_level: string
  analyzed_at: string
}

// Raw format from wallet API
interface RawWalletBalance {
  token_address: string
  symbol: string
  name: string
  balance: number
  token_type: string
}

// Enriched format for display
export interface WalletBalance {
  token_address: string
  symbol: string
  name: string
  balance: number
  price_usd: number | null
  value_usd: number | null
}

export interface SmartMoneySwap {
  dex: string
  token_bought: string
  token_sold: string
  symbol_bought: string
  symbol_sold: string
  amount_bought: number
  amount_sold: number
  amount_usd: number
  wallet: string
  timestamp: string
  tx_hash: string
}

export interface ScamAlert {
  id: number
  alert_type: string
  severity: string
  token_address: string
  pair_address: string
  data: string
  created_at: string
}

// Cache with TTL
const cache = new Map<string, { data: unknown; expires: number }>()

async function cachedFetch<T>(url: string, ttlMs: number): Promise<T> {
  const cached = cache.get(url)
  if (cached && cached.expires > Date.now()) {
    return cached.data as T
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  cache.set(url, { data, expires: Date.now() + ttlMs })
  return data as T
}

// REST API token info (returns price_usd)
interface TokenApiResponse {
  data: {
    address: string
    symbol: string
    name: string
    price_usd: number | null
    market_cap_usd: number | null
    price_change_24h_pct: number | null
  }
}

// WPLS address — used to get PLS native token price
const WPLS_ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
const PLS_NATIVE = '0x0000000000000000000000000000000000000000'

// Fetch prices for multiple tokens via REST API
// Uses concurrent requests with concurrency limit
async function getTokenPrices(addresses: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>()
  if (addresses.length === 0) return priceMap

  // Map PLS native to WPLS for price lookup
  const hasPlsNative = addresses.some(a => a.toLowerCase() === PLS_NATIVE)
  const lookupAddresses = addresses.map(a =>
    a.toLowerCase() === PLS_NATIVE ? WPLS_ADDRESS : a
  )

  // Check cache first, collect uncached
  const uncached: string[] = []
  for (const addr of lookupAddresses) {
    const key = `price:${addr.toLowerCase()}`
    const cached = cache.get(key)
    if (cached && cached.expires > Date.now()) {
      const price = cached.data as number | null
      if (price != null) priceMap.set(addr.toLowerCase(), price)
    } else {
      uncached.push(addr)
    }
  }

  if (uncached.length === 0) return priceMap

  // Fetch in batches of 5 concurrent requests
  const BATCH_SIZE = 5
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (addr) => {
        const url = `${REST_API}/api/v1/tokens/${addr.toLowerCase()}`
        const res = await fetch(url)
        if (!res.ok) return { addr, price: null }
        const json: TokenApiResponse = await res.json()
        return { addr, price: json.data?.price_usd ?? null }
      })
    )
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { addr, price } = result.value
        // Cache for 5 min (even null prices to avoid re-fetching)
        cache.set(`price:${addr.toLowerCase()}`, { data: price, expires: Date.now() + 5 * 60 * 1000 })
        if (price != null) {
          priceMap.set(addr.toLowerCase(), price)
        }
      }
    }
  }

  // Copy WPLS price to PLS native address
  if (hasPlsNative) {
    const wplsPrice = priceMap.get(WPLS_ADDRESS)
    if (wplsPrice != null) {
      priceMap.set(PLS_NATIVE, wplsPrice)
    }
  }

  return priceMap
}

// Safety API
export async function getTokenSafety(address: string): Promise<SafetyScore> {
  return cachedFetch(`${SAFETY_API}/api/v1/token/${address}/safety`, 60 * 60 * 1000)
}

export async function getDeployerReputation(address: string): Promise<DeployerReputation> {
  return cachedFetch(`${SAFETY_API}/api/v1/deployer/${address}`, 60 * 60 * 1000)
}

export async function getRecentAlerts(limit = 20): Promise<ScamAlert[]> {
  const result = await cachedFetch<{ data: ScamAlert[]; count: number }>(
    `${SAFETY_API}/api/v1/alerts/recent?limit=${limit}`, 2 * 60 * 1000
  )
  return result.data || []
}

// Wallet API — fetch raw balances then enrich with live prices from REST API
export async function getWalletBalances(address: string): Promise<WalletBalance[]> {
  const result = await cachedFetch<{ data: RawWalletBalance[]; wallet: string; count: number }>(
    `${SAFETY_API}/api/v1/wallet/${address}/balances`, 2 * 60 * 1000
  )
  const raw = result.data || []

  // Get prices via REST API (batched, concurrent)
  const addresses = raw.map(b => b.token_address)
  const prices = await getTokenPrices(addresses)

  return raw.map(b => {
    const price = prices.get(b.token_address.toLowerCase()) || null
    const value = price != null ? b.balance * price : null
    return {
      token_address: b.token_address,
      symbol: b.symbol,
      name: b.name,
      balance: b.balance,
      price_usd: price,
      value_usd: value,
    }
  })
}

// Smart Money
export async function getSmartMoneySwaps(minUsd = 5000): Promise<SmartMoneySwap[]> {
  const result = await cachedFetch<{ data: SmartMoneySwap[]; count: number }>(
    `${SAFETY_API}/api/v1/smart-money/swaps?min_usd=${minUsd}&minutes=60`, 60 * 1000
  )
  return result.data || []
}

export function clearCache() {
  cache.clear()
}

// Grade color helpers
export function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#10b981'
    case 'B': return '#22d3ee'
    case 'C': return '#f59e0b'
    case 'D': return '#f97316'
    case 'F': return '#ef4444'
    default: return '#6b7280'
  }
}
