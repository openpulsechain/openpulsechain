import { useState } from 'react'
import { Search, Loader2, ExternalLink, Shield } from 'lucide-react'
import { getTokenSafety, getWalletBalances, gradeColor, type SafetyScore, type WalletBalance } from '../../lib/api'
import { formatUsd, shortenAddress } from '../../lib/format'

type ResultType = 'token' | 'wallet' | null

export function Explorer() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [resultType, setResultType] = useState<ResultType>(null)
  const [safety, setSafety] = useState<SafetyScore | null>(null)
  const [balances, setBalances] = useState<WalletBalance[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    const addr = input.trim()
    if (!addr.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError('Enter a valid address (0x...)')
      return
    }
    setLoading(true)
    setError(null)
    setSafety(null)
    setBalances([])
    setResultType(null)

    // Try as token first, then as wallet
    try {
      const result = await getTokenSafety(addr)
      if (result && result.score != null) {
        setSafety(result)
        setResultType('token')
        setLoading(false)
        return
      }
    } catch {
      // Not a token, try as wallet
    }

    try {
      const result = await getWalletBalances(addr)
      const sorted = result
        .filter((b) => b.balance > 0)
        .sort((a, b) => (b.value_usd || 0) - (a.value_usd || 0))
      setBalances(sorted)
      setResultType('wallet')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Address not found')
    } finally {
      setLoading(false)
    }
  }

  const totalUsd = balances.reduce((sum, b) => sum + (b.value_usd || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Search className="h-4 w-4 text-pulse-cyan" />
        <h2 className="text-sm font-semibold text-white">Explorer</h2>
      </div>

      <p className="text-[10px] text-gray-500">
        Search any PulseChain address — auto-detects tokens vs wallets.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Token or wallet address (0x...)"
          className="flex-1 bg-gray-800/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-pulse-cyan/50"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-gradient-to-r from-pulse-cyan to-pulse-purple text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </button>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">{error}</div>}

      {/* Token result */}
      {resultType === 'token' && safety && (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-gray-800/40 rounded-xl p-3 border border-white/5">
            <div>
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" style={{ color: gradeColor(safety.grade) }} />
                <span className="text-xs font-medium text-white">
                  {safety.token_symbol || shortenAddress(safety.token_address)}
                </span>
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">{safety.token_name}</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold" style={{ color: gradeColor(safety.grade) }}>
                {safety.grade}
              </div>
              <div className="text-xs text-gray-400">{safety.score}/100</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="bg-gray-800/30 rounded-md p-2">
              <div className="text-[10px] text-gray-500">Liquidity</div>
              <div className="text-white">{formatUsd(safety.total_liquidity_usd)}</div>
            </div>
            <div className="bg-gray-800/30 rounded-md p-2">
              <div className="text-[10px] text-gray-500">Holders</div>
              <div className="text-white">{safety.holder_count.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800/30 rounded-md p-2">
              <div className="text-[10px] text-gray-500">Age</div>
              <div className="text-white">{safety.age_days} days</div>
            </div>
            <div className="bg-gray-800/30 rounded-md p-2">
              <div className="text-[10px] text-gray-500">Honeypot</div>
              <div className={safety.is_honeypot ? 'text-red-400 font-medium' : 'text-emerald-400'}>
                {safety.is_honeypot ? 'YES' : 'No'}
              </div>
            </div>
          </div>

          {safety.risks.length > 0 && (
            <div className="space-y-1">
              {safety.risks.slice(0, 3).map((r, i) => (
                <div key={i} className="text-[10px] text-red-300 bg-red-500/5 rounded px-2 py-1">
                  {r}
                </div>
              ))}
            </div>
          )}

          <a
            href={`https://www.openpulsechain.com/token/${safety.token_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-xs text-pulse-cyan hover:underline"
          >
            Full report <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Wallet result */}
      {resultType === 'wallet' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-gray-800/40 rounded-lg p-2.5 border border-white/5">
            <div>
              <div className="text-[10px] text-gray-500">Wallet</div>
              <div className="text-xs font-mono text-white">{shortenAddress(input.trim(), 6)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-500">Total Value</div>
              <div className="text-sm font-bold text-white">{formatUsd(totalUsd)}</div>
            </div>
          </div>

          <div className="space-y-1 max-h-[250px] overflow-y-auto">
            {balances.map((b) => (
              <div key={b.token_address} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-white/5">
                <span className="text-xs text-white">{b.symbol}</span>
                <span className="text-xs text-gray-300">{formatUsd(b.value_usd)}</span>
              </div>
            ))}
            {balances.length === 0 && (
              <p className="text-center text-xs text-gray-500 py-4">No tokens found</p>
            )}
          </div>

          <a
            href={`https://www.openpulsechain.com/wallet/${input.trim()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-xs text-pulse-cyan hover:underline"
          >
            Full profile <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  )
}
