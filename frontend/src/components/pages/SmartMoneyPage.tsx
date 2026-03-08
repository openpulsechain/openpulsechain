import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, Clock, Loader2, RefreshCw } from 'lucide-react'

const SAFETY_API = import.meta.env.VITE_SAFETY_API_URL || ''

interface Swap {
  dex: string
  bought_symbol: string
  bought_address: string
  sold_symbol: string
  sold_address: string
  amount_usd: number
  wallet: string
  timestamp: number
  tx_id?: string
}

interface TopWallet {
  wallet: string
  total_volume_usd: number
  swap_count: number
  top_buys: [string, number][]
  top_sells: [string, number][]
  recent_swaps: Swap[]
}

interface Feed {
  period_hours: number
  total_swaps: number
  unique_wallets: number
  top_wallets: TopWallet[]
  generated_at: string
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function shortenAddr(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '?'
}

export function SmartMoneyPage() {
  const navigate = useNavigate()
  const [feed, setFeed] = useState<Feed | null>(null)
  const [recentSwaps, setRecentSwaps] = useState<Swap[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'wallets' | 'swaps'>('swaps')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [feedRes, swapsRes] = await Promise.all([
        fetch(`${SAFETY_API}/api/v1/smart-money/feed?hours=24&min_usd=5000`).then(r => r.json()).catch(() => null),
        fetch(`${SAFETY_API}/api/v1/smart-money/swaps?minutes=360&min_usd=1000`).then(r => r.json()).catch(() => null),
      ])
      if (feedRes?.top_wallets) setFeed(feedRes)
      if (swapsRes?.data) setRecentSwaps(swapsRes.data)
    } catch {
      // Fallback: empty
    }
    setLoading(false)
  }

  if (!SAFETY_API) {
    return (
      <div className="text-center py-20">
        <TrendingUp className="h-12 w-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Smart Money API not configured.</p>
        <p className="text-gray-500 text-sm mt-1">Set VITE_SAFETY_API_URL environment variable.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-[#00D4FF]" />
            Smart Money
          </h1>
          <p className="text-gray-400 mt-1">
            Track large swaps and top wallets on PulseChain DEXes.
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      {feed && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/5 bg-gray-900/50 p-4 text-center">
            <p className="text-2xl font-bold">{feed.total_swaps}</p>
            <p className="text-xs text-gray-400 mt-1">Large Swaps (24h)</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-gray-900/50 p-4 text-center">
            <p className="text-2xl font-bold">{feed.unique_wallets}</p>
            <p className="text-xs text-gray-400 mt-1">Unique Wallets</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-gray-900/50 p-4 text-center">
            <p className="text-2xl font-bold text-[#00D4FF]">
              ${feed.top_wallets.reduce((s, w) => s + w.total_volume_usd, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-400 mt-1">Total Volume</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('swaps')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'swaps' ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          Recent Swaps
        </button>
        <button
          onClick={() => setTab('wallets')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'wallets' ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          Top Wallets
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF]" />
        </div>
      ) : tab === 'swaps' ? (
        /* Recent Swaps */
        recentSwaps.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No large swaps in the last 6 hours.</div>
        ) : (
          <div className="space-y-2">
            {recentSwaps.map((swap, i) => (
              <div
                key={swap.tx_id || i}
                className="rounded-xl border border-white/5 bg-gray-900/50 p-4 hover:bg-gray-900/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-red-400 flex items-center gap-1 text-sm">
                      <ArrowDownRight className="h-3.5 w-3.5" />
                      {swap.sold_symbol}
                    </span>
                    <span className="text-gray-500">→</span>
                    <span
                      className="text-emerald-400 flex items-center gap-1 text-sm cursor-pointer hover:underline"
                      onClick={() => navigate(`/token/${swap.bought_address}`)}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      {swap.bought_symbol}
                    </span>
                  </div>

                  <span className="text-white font-medium">
                    ${swap.amount_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>

                  <span className="text-xs text-gray-500 font-mono hidden sm:inline">
                    <Wallet className="h-3 w-3 inline mr-1" />
                    {shortenAddr(swap.wallet)}
                  </span>

                  <span className="text-xs text-gray-500 whitespace-nowrap flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(swap.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Top Wallets */
        !feed || feed.top_wallets.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No smart money data available.</div>
        ) : (
          <div className="space-y-4">
            {feed.top_wallets.map((wallet, i) => (
              <div
                key={wallet.wallet}
                className="rounded-xl border border-white/5 bg-gray-900/50 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-500 w-8">#{i + 1}</span>
                    <div>
                      <p className="font-mono text-sm text-gray-300">{shortenAddr(wallet.wallet)}</p>
                      <p className="text-xs text-gray-500">{wallet.swap_count} swaps</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">
                      ${wallet.total_volume_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-gray-500">24h volume</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Top Buys</p>
                    {wallet.top_buys.slice(0, 3).map(([symbol, usd]) => (
                      <div key={symbol} className="flex justify-between text-emerald-400">
                        <span>{symbol}</span>
                        <span>${Number(usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Top Sells</p>
                    {wallet.top_sells.slice(0, 3).map(([symbol, usd]) => (
                      <div key={symbol} className="flex justify-between text-red-400">
                        <span>{symbol}</span>
                        <span>${Number(usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
