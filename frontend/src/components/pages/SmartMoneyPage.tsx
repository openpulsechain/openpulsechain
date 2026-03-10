import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, ArrowUpRight, ArrowDownRight, Loader2, RefreshCw } from 'lucide-react'
import { ShareButton } from '../ui/ShareButton'

const SAFETY_API = import.meta.env.VITE_SAFETY_API_URL || 'https://safety.openpulsechain.com'

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

  // Auto-refresh every 60 seconds
  useEffect(() => {
    loadData()
    const interval = setInterval(() => loadData(), 60_000)
    return () => clearInterval(interval)
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
            Track large swaps (&gt;$5K) and top wallets by volume on PulseX. Identify what smart money is buying and selling in real time. Auto-refreshed every 60 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShareButton title="Smart Money Tracker" text="Real-time large swaps on PulseChain" />
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
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
          Recent Swaps (6h)
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
        /* Recent Swaps — Table */
        recentSwaps.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No large swaps in the last 6 hours.</div>
        ) : (
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-gray-900/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Swap</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium hidden sm:table-cell">Wallet</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium hidden md:table-cell">DEX</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentSwaps.map((swap, i) => (
                  <tr
                    key={swap.tx_id || i}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-red-400 flex items-center gap-0.5">
                          <ArrowDownRight className="h-3.5 w-3.5" />
                          {swap.sold_symbol}
                        </span>
                        <span className="text-gray-600">→</span>
                        <span
                          className="text-emerald-400 flex items-center gap-0.5 cursor-pointer hover:underline"
                          onClick={() => navigate(`/token/${swap.bought_address}`)}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          {swap.bought_symbol}
                        </span>
                      </div>
                    </td>
                    <td className="text-right px-4 py-3 font-medium text-white">
                      ${swap.amount_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span
                        className="text-gray-500 font-mono cursor-pointer hover:text-[#00D4FF] transition-colors"
                        onClick={() => navigate(`/wallet/${swap.wallet}`)}
                      >
                        {shortenAddr(swap.wallet)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                      {swap.dex}
                    </td>
                    <td className="text-right px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatTime(swap.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Top Wallets — Table */
        !feed || feed.top_wallets.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No smart money data available.</div>
        ) : (
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-gray-900/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Wallet</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Volume (24h)</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Swaps</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium hidden md:table-cell">Top Buys</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium hidden lg:table-cell">Top Sells</th>
                </tr>
              </thead>
              <tbody>
                {feed.top_wallets.map((wallet, i) => (
                  <tr
                    key={wallet.wallet}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => navigate(`/wallet/${wallet.wallet}`)}
                  >
                    <td className="px-4 py-3 text-gray-500 font-bold">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[#00D4FF] hover:underline">{shortenAddr(wallet.wallet)}</span>
                    </td>
                    <td className="text-right px-4 py-3 font-medium text-white">
                      ${wallet.total_volume_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="text-right px-4 py-3 text-gray-400">{wallet.swap_count}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex gap-2">
                        {wallet.top_buys.slice(0, 3).map(([symbol]) => (
                          <span key={symbol} className="text-emerald-400 text-xs bg-emerald-400/10 px-1.5 py-0.5 rounded">{symbol}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex gap-2">
                        {wallet.top_sells.slice(0, 3).map(([symbol]) => (
                          <span key={symbol} className="text-red-400 text-xs bg-red-400/10 px-1.5 py-0.5 rounded">{symbol}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
