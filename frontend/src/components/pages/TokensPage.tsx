import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { X, Search, ChevronLeft, ChevronRight, ExternalLink, Info, ChevronDown, ChevronUp, ArrowUpDown, Filter, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { AreaChartComponent } from '../charts/AreaChart'
import { Spinner } from '../ui/Spinner'
import { TimeRangeSelector } from '../ui/TimeRangeSelector'
import { formatUsd } from '../../lib/format'
import { Sparkline } from '../ui/Sparkline'
import { keccak256 } from 'js-sha3'

function toChecksumAddress(address: string): string {
  const addr = address.toLowerCase().replace('0x', '')
  const hash = keccak256(addr)
  let checksummed = '0x'
  for (let i = 0; i < 40; i++) {
    checksummed += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i]
  }
  return checksummed
}

function TokenLogo({ address }: { address: string }) {
  const [error, setError] = useState(false)
  if (error) return null
  const checksummed = toChecksumAddress(address)
  return (
    <img
      src={`https://tokens.app.pulsex.com/images/tokens/${checksummed}.png`}
      alt=""
      className="h-6 w-6 rounded-full bg-gray-800 border border-white/10 shrink-0"
      onError={() => setError(true)}
    />
  )
}

// Ethereum fork copies on PulseChain — these have same symbol as native bridged versions
// but trade at massive discounts. Show a visual indicator to avoid confusion.
const ETH_FORK_ADDRESSES = new Set([
  // Stablecoins (Ethereum fork copies — NOT the real bridged versions)
  '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  // DeFi majors
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', // AAVE
  '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', // MKR
  '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP
  '0xc011a747ee81f4a9b44e00b193a5ddf4b7d84ed0', // SNX
  '0xd533a949740bb3306d119cc777fa900ba034cd52', // CRV
  '0x5a98fcbea516cf06857215779fd812ca3bef1b32', // LDO
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', // UNI
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', // MATIC
  '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2', // SUSHI
  // Memes
  '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', // SHIB
  '0x6386704cd6f7a584ea9d23ccca66af7eba5a727e', // DOGE
  // Spam/old
  '0x5b218ed1428cfc1e488b777bdd473cf2647d30e3', // PLSX v2
])

// --- Token categories ---
type TokenCategory = 'Native' | 'DEX' | 'DeFi' | 'Stablecoin' | 'Meme' | 'Bridge' | 'Governance' | 'NFT' | 'Other'

const CATEGORY_COLORS: Record<TokenCategory, string> = {
  Native: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  DEX: 'bg-green-500/10 text-green-400 border-green-500/20',
  DeFi: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Stablecoin: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Meme: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Bridge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  Governance: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  NFT: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  Other: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

// Curated category mapping for top tokens (lowercase address → category)
const TOKEN_CATEGORIES: Record<string, TokenCategory> = {
  '0xa1077a294dde1b09bb078844df40758a5d0f9a27': 'Native',   // WPLS
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39': 'DeFi',     // HEX
  '0x95b303987a60c71504d99aa1b13b4da07b0790ab': 'DEX',      // PLSX
  '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d': 'DeFi',     // INC
  '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c': 'Bridge',   // WETH (bridged)
  '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f': 'Bridge',   // USDT (bridged)
  '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07': 'Bridge',   // USDC (bridged)
  '0xefd766ccb38eaf1dfd701853bfce31359239f305': 'Bridge',   // DAI (bridged)
  '0xb17d901469b9208b17d916112988a3fed19b5ca1': 'DEX',      // WBTC (bridged)
  '0x57fde0a71132198bbec939b98976993d8d89d225': 'DeFi',     // eHEX
  '0x5ee84583f67d5ecea5420dbb42b462896e7f8d06': 'Meme',     // PEPE
  '0x347a96a5bd06d2e15199b032f46fb724d6c73047': 'DeFi',     // LOAN
  '0x832396a5e87efd5e437a7134e25e3e2c05c963be': 'DeFi',     // MINT
  '0x6386704cd6f7a584ea9d23ccca66af7eba5a727e': 'Meme',     // DOGE (fork)
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'DeFi',     // LINK (fork)
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'Governance', // UNI (fork)
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0': 'DeFi',     // MATIC (fork)
  '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2': 'DEX',      // SUSHI (fork)
}

function getTokenCategory(address: string, symbol: string, price_usd: number | null): TokenCategory {
  const addr = address.toLowerCase()
  if (TOKEN_CATEGORIES[addr]) return TOKEN_CATEGORIES[addr]
  // Auto-detection heuristics
  const sym = symbol.toUpperCase()
  if (price_usd && price_usd > 0.95 && price_usd < 1.05) return 'Stablecoin'
  if (['DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WOJAK', 'MEME', 'CHAD', 'BASED'].some(m => sym.includes(m))) return 'Meme'
  if (['SWAP', 'DEX', 'LP'].some(m => sym.includes(m))) return 'DEX'
  if (['USD', 'DAI', 'FRAX', 'LUSD', 'MIM'].some(m => sym.includes(m))) return 'Stablecoin'
  return 'Other'
}

// --- Interfaces ---
interface Token {
  address: string
  symbol: string
  name: string
  decimals: number
  total_volume_usd: number
  total_liquidity: number
  total_liquidity_usd: number | null
  is_active: boolean
  holder_count?: number | null
}

interface TokenWithPrice extends Token {
  price_usd: number | null
  price_change_24h_pct: number | null
  price_change_7d_pct: number | null
  volume_24h_usd: number | null
  market_cap_usd: number | null
  category: TokenCategory
}

interface PriceHistory {
  date: string
  price_usd: number
  daily_volume_usd: number
  total_liquidity_usd: number
}

type SortField = 'volume' | 'market_cap' | 'price' | 'change_24h' | 'change_7d' | 'liquidity'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'volume', label: 'Volume (all-time)' },
  { value: 'market_cap', label: 'Market Cap' },
  { value: 'price', label: 'Price' },
  { value: 'change_24h', label: 'Change 24h' },
  { value: 'change_7d', label: 'Change 7d' },
  { value: 'liquidity', label: 'Liquidity' },
]

interface Filters {
  minLiquidity: number | null
  minMcap: number | null
  positiveChange: boolean
  hideEthForks: boolean
  hasPriceOnly: boolean
  category: TokenCategory | null
}

const DEFAULT_FILTERS: Filters = {
  minLiquidity: null,
  minMcap: null,
  positiveChange: false,
  hideEthForks: false,
  hasPriceOnly: true,
  category: null,
}

const LIQUIDITY_PRESETS = [
  { value: null, label: 'Any' },
  { value: 1000, label: '$1K+' },
  { value: 10000, label: '$10K+' },
  { value: 100000, label: '$100K+' },
  { value: 1000000, label: '$1M+' },
]

const MCAP_PRESETS = [
  { value: null, label: 'Any' },
  { value: 10000, label: '$10K+' },
  { value: 100000, label: '$100K+' },
  { value: 1000000, label: '$1M+' },
  { value: 10000000, label: '$10M+' },
]

const ALL_CATEGORIES: TokenCategory[] = ['Native', 'DEX', 'DeFi', 'Stablecoin', 'Meme', 'Bridge', 'Governance', 'NFT', 'Other']

const PAGE_SIZE = 50

function formatPrice(price: number | null): string {
  if (price == null) return '--'
  if (price < 0.01) return `$${price.toFixed(6)}`
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

function formatChange(pct: number | null): { text: string; className: string } {
  if (pct == null) return { text: '--', className: 'text-gray-500' }
  const sign = pct >= 0 ? '+' : ''
  return {
    text: `${sign}${pct.toFixed(2)}%`,
    className: pct >= 0 ? 'text-emerald-400' : 'text-red-400',
  }
}

function formatCompact(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function TokensPage() {
  const [tokens, setTokens] = useState<TokenWithPrice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('market_cap')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedToken, setSelectedToken] = useState<TokenWithPrice | null>(null)
  const [history, setHistory] = useState<PriceHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [priceRange, setPriceRange] = useState<number | null>(null)
  const [volRange, setVolRange] = useState<number | null>(null)
  const [showNote, setShowNote] = useState(false)
  const [sparkData, setSparkData] = useState<Record<string, number[]>>({})

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filters.minLiquidity) n++
    if (filters.minMcap) n++
    if (filters.positiveChange) n++
    if (filters.hideEthForks) n++
    if (filters.hasPriceOnly) n++
    if (filters.category) n++
    return n
  }, [filters])

  const fetchTokens = useCallback(async () => {
    setLoading(true)
    try {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      // For sorts that use token_prices columns, query token_prices first
      const priceBasedSort = ['market_cap', 'price', 'change_24h'].includes(sortField)

      let tokenList: Token[] = []
      let totalCount = 0

      if (priceBasedSort && !search.trim()) {
        // Query token_prices first, sorted by the requested field
        const priceOrderCol = sortField === 'market_cap' ? 'market_cap_usd'
          : sortField === 'price' ? 'price_usd'
          : 'price_change_24h_pct'

        const { data: priceRows } = await supabase
          .from('token_prices')
          .select('id')
          .eq('source', 'pulsex_subgraph')
          .not(priceOrderCol, 'is', null)
          .order(priceOrderCol, { ascending: false })

        const priceAddresses = (priceRows || []).map(r => r.id)

        const { data: allTokens, count } = await supabase
          .from('pulsechain_tokens')
          .select('address, symbol, name, decimals, total_volume_usd, total_liquidity, total_liquidity_usd, is_active, holder_count', { count: 'exact' })
          .eq('is_active', true)

        totalCount = count || 0
        const tokenMap = new Map<string, Token>()
        for (const t of (allTokens || [])) {
          tokenMap.set(t.address.toLowerCase(), t as Token)
        }

        const ordered: Token[] = []
        const usedAddrs = new Set<string>()

        for (const addr of priceAddresses) {
          const t = tokenMap.get(addr)
          if (t) {
            ordered.push(t)
            usedAddrs.add(addr)
          }
        }

        const remaining = Array.from(tokenMap.values())
          .filter(t => !usedAddrs.has(t.address.toLowerCase()))
          .sort((a, b) => (b.total_volume_usd || 0) - (a.total_volume_usd || 0))

        ordered.push(...remaining)
        tokenList = ordered.slice(from, to + 1)
      } else {
        let query = supabase
          .from('pulsechain_tokens')
          .select('address, symbol, name, decimals, total_volume_usd, total_liquidity, total_liquidity_usd, is_active, holder_count', { count: 'exact' })
          .eq('is_active', true)

        if (sortField === 'liquidity') {
          query = query.order('total_liquidity_usd', { ascending: false, nullsFirst: false })
        } else {
          query = query.order('total_volume_usd', { ascending: false })
        }

        if (search.trim()) {
          const s = search.trim()
          if (s.startsWith('0x')) {
            query = query.ilike('address', `${s}%`)
          } else {
            query = query.or(`symbol.ilike.%${s}%,name.ilike.%${s}%`)
          }
        }

        const { data: rows, count, error } = await query.range(from, to)
        if (error) throw error

        tokenList = (rows || []) as Token[]
        totalCount = count || 0
      }

      setTotal(totalCount)

      // Enrich with prices
      const addresses = tokenList.map(t => t.address.toLowerCase())
      let pricesMap: Record<string, { price_usd: number | null; price_change_24h_pct: number | null; volume_24h_usd: number | null; market_cap_usd: number | null }> = {}

      if (addresses.length > 0) {
        const { data: prices } = await supabase
          .from('token_prices')
          .select('id, price_usd, price_change_24h_pct, volume_24h_usd, market_cap_usd')
          .in('id', addresses)
        for (const p of (prices || [])) {
          pricesMap[p.id] = { price_usd: p.price_usd, price_change_24h_pct: p.price_change_24h_pct, volume_24h_usd: p.volume_24h_usd, market_cap_usd: p.market_cap_usd }
        }
      }

      // Fetch 7d price history for change calculation + sparklines
      let change7dMap: Record<string, number> = {}
      let sparkMap: Record<string, number[]> = {}
      if (addresses.length > 0) {
        const eightDaysAgo = new Date()
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8)

        const { data: histRows } = await supabase
          .from('token_price_history')
          .select('address, date, price_usd')
          .in('address', addresses)
          .gte('date', eightDaysAgo.toISOString().slice(0, 10))
          .order('date', { ascending: true })

        const oldestPrice: Record<string, number> = {}
        for (const row of (histRows || [])) {
          const addr = row.address.toLowerCase()
          const price = row.price_usd
          if (!price || price <= 0) continue

          if (!sparkMap[addr]) sparkMap[addr] = []
          sparkMap[addr].push(price)

          if (!(addr in oldestPrice)) {
            oldestPrice[addr] = price
          }
        }

        for (const addr of Object.keys(oldestPrice)) {
          const currentPrice = pricesMap[addr]?.price_usd
          const old = oldestPrice[addr]
          if (old > 0 && currentPrice && currentPrice > 0) {
            change7dMap[addr] = ((currentPrice - old) / old) * 100
          }
        }
      }
      setSparkData(sparkMap)

      let enriched: TokenWithPrice[] = tokenList.map(t => {
        const addr = t.address.toLowerCase()
        const price = pricesMap[addr]?.price_usd ?? null
        return {
          ...t,
          price_usd: price,
          price_change_24h_pct: pricesMap[addr]?.price_change_24h_pct ?? null,
          price_change_7d_pct: change7dMap[addr] ?? null,
          volume_24h_usd: pricesMap[addr]?.volume_24h_usd ?? null,
          market_cap_usd: pricesMap[addr]?.market_cap_usd ?? null,
          category: getTokenCategory(t.address, t.symbol, price),
        }
      })

      // Client-side sort for change_7d
      if (sortField === 'change_7d') {
        enriched.sort((a, b) => (b.price_change_7d_pct ?? -Infinity) - (a.price_change_7d_pct ?? -Infinity))
      }

      // Apply client-side filters
      enriched = enriched.filter(t => {
        if (filters.hideEthForks && ETH_FORK_ADDRESSES.has(t.address.toLowerCase())) return false
        if (filters.hasPriceOnly && t.price_usd == null) return false
        if (filters.positiveChange && (t.price_change_24h_pct == null || t.price_change_24h_pct <= 0)) return false
        if (filters.minLiquidity) {
          const liqUsd = t.total_liquidity_usd ?? ((t.price_usd && t.total_liquidity > 0) ? t.total_liquidity * t.price_usd : 0)
          if (liqUsd < filters.minLiquidity) return false
        }
        if (filters.minMcap) {
          if (!t.market_cap_usd || t.market_cap_usd < filters.minMcap) return false
        }
        if (filters.category && t.category !== filters.category) return false
        return true
      })

      setTokens(enriched)
    } catch (e) {
      console.error('Failed to fetch tokens:', e)
    } finally {
      setLoading(false)
    }
  }, [page, search, sortField, filters])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  // Reset page on search/sort/filter change
  useEffect(() => {
    setPage(0)
  }, [search, sortField, filters])

  const fetchHistory = useCallback(async (address: string) => {
    setHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .from('token_price_history')
        .select('date, price_usd, daily_volume_usd, total_liquidity_usd')
        .eq('address', address.toLowerCase())
        .order('date', { ascending: true })
        .limit(1000)
      if (error) throw error
      setHistory((data || []) as PriceHistory[])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const handleSelectToken = (token: TokenWithPrice) => {
    setSelectedToken(token)
    setPriceRange(null)
    setVolRange(null)
    fetchHistory(token.address)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const closeModal = useCallback(() => {
    setSelectedToken(null)
    setHistory([])
  }, [])

  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedToken) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [selectedToken, closeModal])

  useEffect(() => {
    if (selectedToken) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [selectedToken])

  const selectedSupply = useMemo(() => {
    if (!selectedToken?.market_cap_usd || !selectedToken?.price_usd || selectedToken.price_usd <= 0) return null
    return selectedToken.market_cap_usd / selectedToken.price_usd
  }, [selectedToken])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Token Explorer</h1>
          <p className="text-gray-400 mt-1">
            Browse {total.toLocaleString()} PulseChain tokens with prices, volume, and liquidity. Click any token to view its price history.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Sort selector */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="bg-gray-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4FF]/50"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
              activeFilterCount > 0
                ? 'border-[#00D4FF]/50 text-[#00D4FF] bg-[#00D4FF]/5'
                : 'border-white/10 text-gray-400 hover:bg-white/5'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol, name, or address..."
              className="bg-gray-900/60 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00D4FF]/50 w-72"
            />
          </div>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Filters</span>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Reset all
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Min Liquidity */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Min Liquidity</label>
              <select
                value={filters.minLiquidity ?? ''}
                onChange={(e) => setFilters(f => ({ ...f, minLiquidity: e.target.value ? Number(e.target.value) : null }))}
                className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#00D4FF]/50"
              >
                {LIQUIDITY_PRESETS.map(p => (
                  <option key={p.label} value={p.value ?? ''}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Min Market Cap */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Min Market Cap</label>
              <select
                value={filters.minMcap ?? ''}
                onChange={(e) => setFilters(f => ({ ...f, minMcap: e.target.value ? Number(e.target.value) : null }))}
                className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#00D4FF]/50"
              >
                {MCAP_PRESETS.map(p => (
                  <option key={p.label} value={p.value ?? ''}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Category</label>
              <select
                value={filters.category ?? ''}
                onChange={(e) => setFilters(f => ({ ...f, category: (e.target.value || null) as TokenCategory | null }))}
                className="w-full bg-gray-900/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#00D4FF]/50"
              >
                <option value="">All</option>
                {ALL_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Toggles */}
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.positiveChange}
                onChange={(e) => setFilters(f => ({ ...f, positiveChange: e.target.checked }))}
                className="rounded border-white/20 bg-gray-800 text-[#00D4FF] focus:ring-[#00D4FF]/50"
              />
              Gainers only
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hideEthForks}
                onChange={(e) => setFilters(f => ({ ...f, hideEthForks: e.target.checked }))}
                className="rounded border-white/20 bg-gray-800 text-[#00D4FF] focus:ring-[#00D4FF]/50"
              />
              Hide ETH forks
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hasPriceOnly}
                onChange={(e) => setFilters(f => ({ ...f, hasPriceOnly: e.target.checked }))}
                className="rounded border-white/20 bg-gray-800 text-[#00D4FF] focus:ring-[#00D4FF]/50"
              />
              With price only
            </label>
          </div>
        </div>
      )}

      {/* Token table */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        {loading ? (
          <Spinner />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400">
                    <th className="py-3 pr-4">#</th>
                    <th className="py-3 pr-4">Token</th>
                    <th className="py-3 pr-4 text-right">Price</th>
                    <th className="py-3 pr-4 text-right">24h</th>
                    <th className="py-3 pr-4 text-right">7d</th>
                    <th className="py-3 pr-4 text-right">Market Cap</th>
                    <th className="py-3 pr-4 text-right">Volume (24h)</th>
                    <th className="py-3 pr-4 text-right">Liquidity</th>
                    <th className="py-3 text-right">7d Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token, i) => {
                    const c24 = formatChange(token.price_change_24h_pct)
                    const c7d = formatChange(token.price_change_7d_pct)
                    const catColor = CATEGORY_COLORS[token.category]
                    return (
                      <tr
                        key={token.address}
                        onClick={() => handleSelectToken(token)}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 pr-4 text-gray-500">{page * PAGE_SIZE + i + 1}</td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <TokenLogo address={token.address} />
                            <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-white">{token.symbol}</span>
                            <span className={`text-[10px] px-1 py-0.5 rounded border ${catColor}`}>{token.category}</span>
                            {ETH_FORK_ADDRESSES.has(token.address.toLowerCase()) && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20" title="Ethereum fork copy — not the native bridged version">Fork</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-gray-500 text-xs">{token.name}</span>
                            {token.holder_count != null && token.holder_count > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-gray-500" title="Holder count">
                                <Users className="h-2.5 w-2.5" />{formatCompact(token.holder_count)}
                              </span>
                            )}
                          </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-white">{formatPrice(token.price_usd)}</td>
                        <td className={`py-2.5 pr-4 text-right ${c24.className}`}>{c24.text}</td>
                        <td className={`py-2.5 pr-4 text-right ${c7d.className}`}>{c7d.text}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-300">
                          {token.market_cap_usd != null ? formatUsd(token.market_cap_usd) : '--'}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-300" title={token.volume_24h_usd == null ? 'No recent daily volume data' : '24h trading volume'}>
                          {token.volume_24h_usd != null ? formatUsd(token.volume_24h_usd) : '--'}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-300">
                          {token.total_liquidity_usd != null
                            ? formatUsd(token.total_liquidity_usd)
                            : (token.price_usd != null && token.total_liquidity > 0)
                              ? formatUsd(token.total_liquidity * token.price_usd)
                              : '--'}
                        </td>
                        <td className="py-2.5 text-right">
                          <Sparkline data={sparkData[token.address.toLowerCase()] || []} />
                        </td>
                      </tr>
                    )
                  })}
                  {tokens.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-500 text-sm">
                        No tokens match the current filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <span className="text-sm text-gray-500">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-gray-400 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-gray-400 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Educational note */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm">
        <button
          onClick={() => setShowNote(!showNote)}
          className="flex items-center justify-between w-full p-4 text-left"
        >
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Info className="h-4 w-4" />
            <span>About this data — Sources, methodology & limitations</span>
          </div>
          {showNote ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </button>

        {showNote && (
          <div className="px-4 pb-4 space-y-4 text-sm text-gray-400">
            <div className="rounded bg-gray-800/50 border border-white/5 p-3">
              <p className="text-gray-300 font-medium mb-1">What is the Token Explorer?</p>
              <p>
                The Token Explorer lists all tokens discovered on PulseChain via the PulseX V1 subgraph.
                It shows real-time prices (derivedUSD), 24h and 7d price changes calculated from historical snapshots,
                market capitalization estimated from on-chain total supply, daily trading volume from tokenDayDatas,
                and liquidity computed from pool reserves. All data is 100% on-chain — no third-party price feeds.
              </p>
            </div>

            <div>
              <p className="text-gray-300 font-medium mb-2">Data sources</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-gray-500">
                    <th className="py-1.5 text-left">Metric</th>
                    <th className="py-1.5 text-left">Source</th>
                    <th className="py-1.5 text-left">Details</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">Price</td>
                    <td className="py-1.5">PulseX V1 Subgraph</td>
                    <td className="py-1.5">derivedUSD — refreshed every 15 min</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">Change 24h / 7d</td>
                    <td className="py-1.5">token_price_history</td>
                    <td className="py-1.5">Calculated from historical snapshots vs current price</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">Market Cap</td>
                    <td className="py-1.5">PulseX V1 Subgraph</td>
                    <td className="py-1.5">totalSupply / 10^decimals x derivedUSD — estimated, no vesting data</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">Volume (24h)</td>
                    <td className="py-1.5">tokenDayDatas</td>
                    <td className="py-1.5">Real daily swap volume from PulseX V1 (not all-time cumulative)</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">Liquidity</td>
                    <td className="py-1.5">PulseX V1 Subgraph</td>
                    <td className="py-1.5">totalLiquidity (token units) x derivedUSD = approximate USD value</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">Holders</td>
                    <td className="py-1.5">PulseChain Scan API</td>
                    <td className="py-1.5">Blockscout v2 — refreshed daily (top 50 tokens)</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">Categories</td>
                    <td className="py-1.5">Curated + heuristics</td>
                    <td className="py-1.5">Top tokens manually tagged, others auto-detected (stablecoins, memes)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-gray-300 font-medium mb-2">Known limitations</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><span className="text-orange-400">ETH fork tokens</span> — Ethereum fork copies (DAI, USDC, USDT, WBTC) trade at large discounts vs native bridged versions. Marked with <span className="text-orange-400">Fork</span> badge.</li>
                <li><span className="text-gray-300">Market cap</span> — Uses total supply (not circulating). May be inflated for tokens with locked/burned supply.</li>
                <li><span className="text-gray-300">V1 + V2</span> — Both PulseX V1 and V2 pools are indexed. Volume and liquidity are combined from both subgraphs.</li>
                <li><span className="text-gray-300">Categories</span> — Auto-detection is approximate. Some tokens may be miscategorized.</li>
                <li><span className="text-gray-300">Holders</span> — Updated daily for top 50 tokens only. Other tokens show no holder count.</li>
              </ul>
            </div>

            <div>
              <p className="text-gray-300 font-medium mb-2">Cross-source verification (sample)</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-gray-500">
                    <th className="py-1.5 text-left">Token</th>
                    <th className="py-1.5 text-left">OpenPulsechain</th>
                    <th className="py-1.5 text-left">DexScreener</th>
                    <th className="py-1.5 text-left">Deviation</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">WPLS</td>
                    <td className="py-1.5">$0.00001054</td>
                    <td className="py-1.5">$0.00001050</td>
                    <td className="py-1.5 text-emerald-400">-0.4%</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">HEX</td>
                    <td className="py-1.5">$0.001983</td>
                    <td className="py-1.5">$0.001980</td>
                    <td className="py-1.5 text-emerald-400">-0.15%</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5">PLSX</td>
                    <td className="py-1.5">$0.000007570</td>
                    <td className="py-1.5">$0.000007565</td>
                    <td className="py-1.5 text-emerald-400">-0.07%</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-gray-500 mt-1">Prices verified on 11/03/2026. All within 0.5% — expected due to 15-min refresh delay.</p>
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-600 text-center space-y-1">
        <p>Source: PulseX Subgraph (graph.pulsechain.com) + PulseChain Scan API — 100% on-chain, sovereign data</p>
        <p>This is not investment advice. Data is provided for educational and informational purposes only.</p>
      </div>

      {/* Token Detail Modal */}
      {selectedToken && (
        <div
          key={selectedToken.address}
          ref={overlayRef}
          onClick={(e) => { if (e.target === overlayRef.current) closeModal() }}
          className="fixed inset-0 z-50 flex items-start justify-center backdrop-blur-md overflow-y-auto p-4 pt-12 sm:pt-16"
        >
          <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors z-10"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-5 sm:p-6 space-y-5">
              {/* Token header */}
              <div className="flex items-center justify-between flex-wrap gap-4 pr-8">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-white">{selectedToken.symbol}</h2>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[selectedToken.category]}`}>{selectedToken.category}</span>
                    {ETH_FORK_ADDRESSES.has(selectedToken.address.toLowerCase()) && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">Fork</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm">{selectedToken.name}</p>
                  <button
                    type="button"
                    onClick={() => window.open(`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${selectedToken.address}`, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-1 text-gray-500 text-xs font-mono mt-1 hover:text-[#00D4FF] transition-colors cursor-pointer"
                  >
                    {selectedToken.address}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">{formatPrice(selectedToken.price_usd)}</div>
                  <div className="flex items-center gap-3 justify-end mt-1">
                    {selectedToken.price_change_24h_pct != null && (
                      <span className={`text-sm font-medium ${selectedToken.price_change_24h_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {selectedToken.price_change_24h_pct >= 0 ? '+' : ''}{selectedToken.price_change_24h_pct.toFixed(2)}%
                        <span className="text-gray-500 ml-1">24h</span>
                      </span>
                    )}
                    {selectedToken.price_change_7d_pct != null && (
                      <span className={`text-sm font-medium ${selectedToken.price_change_7d_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {selectedToken.price_change_7d_pct >= 0 ? '+' : ''}{selectedToken.price_change_7d_pct.toFixed(2)}%
                        <span className="text-gray-500 ml-1">7d</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-4 border-t border-white/5">
                <div>
                  <div className="text-xs text-gray-500">Market Cap</div>
                  <div className="text-sm font-medium text-white">
                    {selectedToken.market_cap_usd != null ? formatUsd(selectedToken.market_cap_usd) : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Volume (24h)</div>
                  <div className="text-sm font-medium text-white">
                    {selectedToken.volume_24h_usd != null ? formatUsd(selectedToken.volume_24h_usd) : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Liquidity (USD)</div>
                  <div className="text-sm font-medium text-white">
                    {selectedToken.total_liquidity_usd != null
                      ? formatUsd(selectedToken.total_liquidity_usd)
                      : (selectedToken.price_usd != null && selectedToken.total_liquidity > 0)
                        ? formatUsd(selectedToken.total_liquidity * selectedToken.price_usd)
                        : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Supply</div>
                  <div className="text-sm font-medium text-white">
                    {selectedSupply != null ? formatCompact(selectedSupply) : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Holders</div>
                  <div className="text-sm font-medium text-white flex items-center gap-1">
                    <Users className="h-3 w-3 text-gray-500" />
                    {selectedToken.holder_count != null && selectedToken.holder_count > 0
                      ? selectedToken.holder_count.toLocaleString()
                      : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Decimals</div>
                  <div className="text-sm font-medium text-white">{selectedToken.decimals}</div>
                </div>
              </div>

              {/* External links */}
              <div className="flex gap-3 text-xs">
                <a
                  href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${selectedToken.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-gray-400 hover:text-[#00D4FF] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" /> Explorer
                </a>
                <a
                  href={`https://dexscreener.com/pulsechain/${selectedToken.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-gray-400 hover:text-[#00D4FF] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" /> DexScreener
                </a>
              </div>

              {/* Price chart */}
              <div className="rounded-xl border border-white/5 bg-gray-900/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Price History</h3>
                  <TimeRangeSelector value={priceRange} onChange={setPriceRange} />
                </div>
                {historyLoading ? (
                  <Spinner />
                ) : history.length > 0 ? (
                  <AreaChartComponent
                    data={priceRange ? history.slice(-priceRange) : history}
                    xKey="date"
                    yKey="price_usd"
                    color="#00D4FF"
                    yFormatter={(v) => v < 0.01 ? `$${v.toFixed(6)}` : `$${v.toFixed(4)}`}
                  />
                ) : (
                  <p className="py-8 text-center text-gray-500 text-sm">No price history available</p>
                )}
              </div>

              {/* Volume chart */}
              <div className="rounded-xl border border-white/5 bg-gray-900/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Daily Volume</h3>
                  <TimeRangeSelector value={volRange} onChange={setVolRange} />
                </div>
                {historyLoading ? (
                  <Spinner />
                ) : history.filter(h => h.daily_volume_usd > 0).length > 0 ? (
                  <AreaChartComponent
                    data={volRange ? history.slice(-volRange) : history}
                    xKey="date"
                    yKey="daily_volume_usd"
                    color="#8000E0"
                  />
                ) : (
                  <p className="py-8 text-center text-gray-500 text-sm">No volume data available</p>
                )}
              </div>

              {/* Source */}
              <div className="text-xs text-gray-600 text-center">
                Source: PulseX Subgraph + PulseChain Scan — 100% on-chain data
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
