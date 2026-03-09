import { useState, useEffect } from 'react'
import { TrendingUp, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import { getSmartMoneySwaps, type SmartMoneySwap } from '../../lib/api'
import { formatUsd, shortenAddress, timeAgo } from '../../lib/format'

export function SmartMoney() {
  const [swaps, setSwaps] = useState<SmartMoneySwap[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSwaps = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getSmartMoneySwaps(5000)
      setSwaps(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSwaps()
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-pulse-cyan" />
          <h2 className="text-sm font-semibold text-white">Smart Money</h2>
        </div>
        <button
          onClick={loadSwaps}
          disabled={loading}
          className="text-gray-500 hover:text-white transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-[10px] text-gray-500">Large swaps (&gt;$5K) on PulseX in the last hour.</p>

      {error && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 text-gray-500 animate-spin" />
        </div>
      ) : swaps.length === 0 ? (
        <p className="text-center text-xs text-gray-500 py-8">No large swaps in the last hour</p>
      ) : (
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto">
          {swaps.slice(0, 30).map((swap, i) => (
            <div key={i} className="bg-gray-800/30 rounded-lg p-2 border border-white/5 hover:border-white/10 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500">{shortenAddress(swap.wallet)}</span>
                <span className="text-[10px] text-gray-500">{timeAgo(swap.timestamp)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-red-400">{swap.symbol_sold}</span>
                <span className="text-gray-600">&rarr;</span>
                <span className="text-emerald-400">{swap.symbol_bought}</span>
                <span className="ml-auto font-medium text-white">{formatUsd(swap.amount_usd)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <a
        href="https://www.openpulsechain.com/smart-money"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1 text-xs text-pulse-cyan hover:underline pt-1"
      >
        View all on OpenPulsechain <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
