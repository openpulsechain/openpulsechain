import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Wallet, ArrowUpRight, ArrowDownRight, ExternalLink, Loader2, Clock } from 'lucide-react'
import { ShareButton } from '../ui/ShareButton'

const SAFETY_API = import.meta.env.VITE_SAFETY_API_URL || 'https://safety.openpulsechain.com'

interface Balance {
  token_address: string
  symbol: string
  name: string
  balance: number
  token_type: string
}

interface Swap {
  dex: string
  bought_symbol: string
  bought_address: string
  sold_symbol: string
  sold_address: string
  amount_usd: number
  timestamp: number
}

function shortenAddr(addr: string) {
  return addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : '?'
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

export function WalletProfilePage() {
  const { address } = useParams<{ address: string }>()
  const navigate = useNavigate()
  const [balances, setBalances] = useState<Balance[]>([])
  const [swaps, setSwaps] = useState<Swap[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'holdings' | 'activity'>('holdings')

  useEffect(() => {
    if (!address || !SAFETY_API) return

    const addr = address.toLowerCase()
    setLoading(true)

    Promise.all([
      fetch(`${SAFETY_API}/api/v1/wallet/${addr}/balances`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${SAFETY_API}/api/v1/wallet/${addr}/swaps`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([balRes, swapRes]) => {
      setBalances(balRes.data || [])
      setSwaps(swapRes.data || [])
      setLoading(false)
    })
  }, [address])

  if (!SAFETY_API) {
    return <div className="text-center py-20 text-gray-500">Wallet API not configured.</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <Link to="/smart-money" className="hover:text-[#00D4FF] transition-colors">Smart Money</Link>
          <span>/</span>
          <span className="text-gray-300">Wallet</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-[#8000E0]/10 border border-[#8000E0]/20 shrink-0">
            <Wallet className="h-8 w-8 text-[#8000E0]" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-mono">{shortenAddr(address || '')}</h1>
            <p className="text-sm text-gray-500 font-mono">
              {address}
              <a
                href={`https://scan.pulsechain.com/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-1 text-[#00D4FF] hover:underline"
              >
                Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <div className="ml-auto shrink-0">
            <ShareButton title={`Wallet ${shortenAddr(address || '')}`} text="PulseChain wallet profile on OpenPulsechain" />
          </div>
        </div>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/5 bg-gray-900/50 p-4 text-center">
            <p className="text-2xl font-bold">{balances.length}</p>
            <p className="text-xs text-gray-400 mt-1">Tokens Held</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-gray-900/50 p-4 text-center">
            <p className="text-2xl font-bold">{swaps.length}</p>
            <p className="text-xs text-gray-400 mt-1">Recent Swaps</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-gray-900/50 p-4 text-center">
            <p className="text-2xl font-bold text-[#00D4FF]">
              ${swaps.reduce((s, sw) => s + sw.amount_usd, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-400 mt-1">Swap Volume</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('holdings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'holdings' ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          Holdings ({balances.length})
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'activity' ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          Swap Activity ({swaps.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF]" />
        </div>
      ) : tab === 'holdings' ? (
        balances.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No token holdings found.</div>
        ) : (
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-gray-900/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Token</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Balance</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">Safety</th>
                </tr>
              </thead>
              <tbody>
                {balances.slice(0, 50).map(b => (
                  <tr
                    key={b.token_address}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => navigate(`/token/${b.token_address}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.symbol}</div>
                      <div className="text-xs text-gray-500">{b.name}</div>
                    </td>
                    <td className="text-right px-4 py-3 font-mono">
                      {b.balance > 1000000 ? `${(b.balance / 1000000).toFixed(1)}M` :
                       b.balance > 1000 ? `${(b.balance / 1000).toFixed(1)}K` :
                       b.balance.toFixed(2)}
                    </td>
                    <td className="text-center px-4 py-3">
                      <Link
                        to={`/token/${b.token_address}`}
                        className="text-xs text-[#00D4FF] hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        Check
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        swaps.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No recent swap activity.</div>
        ) : (
          <div className="space-y-2">
            {swaps.map((swap, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-gray-900/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
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
                  <span className="text-xs text-gray-500">{swap.dex}</span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(swap.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
