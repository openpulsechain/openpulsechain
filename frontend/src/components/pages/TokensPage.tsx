import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Search, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { AreaChartComponent } from '../charts/AreaChart'
import { Spinner } from '../ui/Spinner'
import { TimeRangeSelector } from '../ui/TimeRangeSelector'
import { formatUsd } from '../../lib/format'

interface Token {
  address: string
  symbol: string
  name: string
  decimals: number
  total_volume_usd: number
  total_liquidity: number
  is_active: boolean
}

interface TokenWithPrice extends Token {
  price_usd: number | null
  price_change_24h_pct: number | null
}

interface PriceHistory {
  date: string
  price_usd: number
  daily_volume_usd: number
  total_liquidity_usd: number
}

const PAGE_SIZE = 50

export function TokensPage() {
  const [tokens, setTokens] = useState<TokenWithPrice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedToken, setSelectedToken] = useState<TokenWithPrice | null>(null)
  const [history, setHistory] = useState<PriceHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [priceRange, setPriceRange] = useState<number | null>(null)
  const [volRange, setVolRange] = useState<number | null>(null)

  const fetchTokens = useCallback(async () => {
    setLoading(true)
    try {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      let query = supabase
        .from('pulsechain_tokens')
        .select('address, symbol, name, decimals, total_volume_usd, total_liquidity, is_active', { count: 'exact' })
        .eq('is_active', true)
        .order('total_volume_usd', { ascending: false })

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

      const tokenList = (rows || []) as Token[]
      setTotal(count || 0)

      // Enrich with prices
      const addresses = tokenList.map(t => t.address.toLowerCase())
      let pricesMap: Record<string, { price_usd: number | null; price_change_24h_pct: number | null }> = {}

      if (addresses.length > 0) {
        const { data: prices } = await supabase
          .from('token_prices')
          .select('id, price_usd, price_change_24h_pct')
          .in('id', addresses)
        for (const p of (prices || [])) {
          pricesMap[p.id] = { price_usd: p.price_usd, price_change_24h_pct: p.price_change_24h_pct }
        }
      }

      const enriched: TokenWithPrice[] = tokenList.map(t => ({
        ...t,
        price_usd: pricesMap[t.address.toLowerCase()]?.price_usd ?? null,
        price_change_24h_pct: pricesMap[t.address.toLowerCase()]?.price_change_24h_pct ?? null,
      }))

      setTokens(enriched)
    } catch (e) {
      console.error('Failed to fetch tokens:', e)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  // Reset page on search change
  useEffect(() => {
    setPage(0)
  }, [search])

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

  // Close modal on Escape
  useEffect(() => {
    if (!selectedToken) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [selectedToken, closeModal])

  // Prevent body scroll when modal open
  useEffect(() => {
    if (selectedToken) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [selectedToken])

  // Token list view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tokens</h1>
          <p className="text-sm text-gray-500">{total.toLocaleString()} active tokens from PulseX Subgraph</p>
        </div>

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
                    <th className="py-3 pr-4 text-right">Volume (All Time)</th>
                    <th className="py-3 text-right">Liquidity</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token, i) => (
                    <tr
                      key={token.address}
                      onClick={() => handleSelectToken(token)}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 pr-4 text-gray-500">{page * PAGE_SIZE + i + 1}</td>
                      <td className="py-2.5 pr-4">
                        <span className="font-medium text-white">{token.symbol}</span>
                        <span className="ml-2 text-gray-500 text-xs">{token.name}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-white">
                        {token.price_usd != null
                          ? token.price_usd < 0.01
                            ? `$${token.price_usd.toFixed(6)}`
                            : `$${token.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                          : '--'}
                      </td>
                      <td className={`py-2.5 pr-4 text-right ${
                        (token.price_change_24h_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {token.price_change_24h_pct != null
                          ? `${token.price_change_24h_pct >= 0 ? '+' : ''}${token.price_change_24h_pct.toFixed(2)}%`
                          : '--'}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-300">{formatUsd(token.total_volume_usd)}</td>
                      <td className="py-2.5 text-right text-gray-300">{formatUsd(token.total_liquidity)}</td>
                    </tr>
                  ))}
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

      <div className="text-xs text-gray-600 text-center">
        Source: PulseX Subgraph (graph.pulsechain.com) — 100% on-chain, sovereign data
      </div>

      {/* Token Detail Modal */}
      {selectedToken && (
        <div
          ref={overlayRef}
          onClick={(e) => { if (e.target === overlayRef.current) closeModal() }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4 pt-12 sm:pt-16"
        >
          <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
            {/* Close button */}
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
                  <h2 className="text-2xl font-bold text-white">{selectedToken.symbol}</h2>
                  <p className="text-gray-400 text-sm">{selectedToken.name}</p>
                  <a
                    href={`https://scan.pulsechain.com/address/${selectedToken.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-gray-500 text-xs font-mono mt-1 hover:text-[#00D4FF] transition-colors"
                  >
                    {selectedToken.address}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">
                    {selectedToken.price_usd != null
                      ? selectedToken.price_usd < 0.01
                        ? `$${selectedToken.price_usd.toFixed(8)}`
                        : `$${selectedToken.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                      : '--'}
                  </div>
                  {selectedToken.price_change_24h_pct != null && (
                    <span className={`text-sm font-medium ${selectedToken.price_change_24h_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {selectedToken.price_change_24h_pct >= 0 ? '+' : ''}{selectedToken.price_change_24h_pct.toFixed(2)}%
                      <span className="text-gray-500 ml-1">24h</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                <div>
                  <div className="text-xs text-gray-500">Total Volume</div>
                  <div className="text-sm font-medium text-white">{formatUsd(selectedToken.total_volume_usd)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Liquidity</div>
                  <div className="text-sm font-medium text-white">{formatUsd(selectedToken.total_liquidity)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Decimals</div>
                  <div className="text-sm font-medium text-white">{selectedToken.decimals}</div>
                </div>
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
                Source: PulseX Subgraph — 100% on-chain data
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
