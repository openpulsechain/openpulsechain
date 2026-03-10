import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Search, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function TokenLogo({ address }: { address: string }) {
  const [error, setError] = useState(false)
  if (error) return null
  return (
    <img
      src={`https://tokens.app.pulsex.com/images/tokens/${address}.png`}
      alt=""
      className="h-6 w-6 rounded-full bg-gray-800 border border-white/10 shrink-0"
      onError={() => setError(true)}
    />
  )
}

interface SafetyEntry {
  token_address: string
  score: number
  grade: string
  risks: string[]
  is_honeypot: boolean | null
  is_verified: boolean
  total_liquidity_usd: number
  holder_count: number
  top10_pct: number
  buy_tax_pct: number | null
  sell_tax_pct: number | null
  analyzed_at: string
}

interface TokenName {
  address: string
  symbol: string
  name: string
}

const GRADE_COLORS: Record<string, string> = {
  A: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  B: 'text-green-400 bg-green-400/10 border-green-400/30',
  C: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  D: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  F: 'text-red-400 bg-red-400/10 border-red-400/30',
}

export function SafetyDashboardPage() {
  const navigate = useNavigate()
  const [scores, setScores] = useState<SafetyEntry[]>([])
  const [tokenNames, setTokenNames] = useState<Record<string, TokenName>>({})
  const [loading, setLoading] = useState(true)
  const [searchAddress, setSearchAddress] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [stats, setStats] = useState({ total: 0, honeypots: 0, safe: 0, moderate: 0, risky: 0 })

  useEffect(() => {
    loadScores()
  }, [])

  async function loadScores() {
    setLoading(true)
    const { data } = await supabase
      .from('token_safety_scores')
      .select('token_address, score, grade, risks, is_honeypot, is_verified, total_liquidity_usd, holder_count, top10_pct, buy_tax_pct, sell_tax_pct, analyzed_at')
      .order('total_liquidity_usd', { ascending: false })
      .limit(200)

    const entries = data || []
    setScores(entries)

    // Calculate stats
    const honeypots = entries.filter(e => e.is_honeypot === true).length
    const safe = entries.filter(e => e.score >= 60).length
    const moderate = entries.filter(e => e.score >= 40 && e.score < 60).length
    const risky = entries.filter(e => e.score < 40).length
    setStats({ total: entries.length, honeypots, safe, moderate, risky })

    // Fetch token names
    const addresses = entries.map(e => e.token_address)
    if (addresses.length > 0) {
      const { data: tokens } = await supabase
        .from('pulsechain_tokens')
        .select('address, symbol, name')
        .in('address', addresses)

      const map: Record<string, TokenName> = {}
      for (const t of tokens || []) {
        map[t.address] = t
      }
      setTokenNames(map)
    }

    setLoading(false)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const addr = searchAddress.trim().toLowerCase()
    if (/^0x[0-9a-f]{40}$/i.test(addr)) {
      navigate(`/token/${addr}`)
    }
  }

  const filteredScores = scores.filter(s => {
    if (filter === 'honeypot') return s.is_honeypot === true
    if (filter === 'safe') return s.score >= 60
    if (filter === 'moderate') return s.score >= 40 && s.score < 60
    if (filter === 'risky') return s.score < 40
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Shield className="h-7 w-7 text-emerald-400" />
          Token Safety Scanner
        </h1>
        <p className="text-gray-400 mt-1">
          Automated safety analysis for PulseChain tokens. Each token receives a score from 0 to 100 based on 5 criteria: honeypot detection, contract verification, liquidity health, holder concentration, and token age. Search any token address to get its full safety report.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
          <input
            type="text"
            value={searchAddress}
            onChange={e => setSearchAddress(e.target.value)}
            placeholder="Enter token address (0x...)"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-900/50 border border-white/10 text-gray-100 placeholder-gray-500 focus:border-[#00D4FF]/50 focus:outline-none transition-colors font-mono text-sm"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#8000E0] text-white font-medium hover:opacity-90 transition-opacity"
        >
          Analyze
        </button>
      </form>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-xl border border-white/5 bg-gray-900/50 p-4 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-gray-400 mt-1">Tokens Analyzed</p>
        </div>
        <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{stats.safe}</p>
          <p className="text-xs text-gray-400 mt-1">Safe (60+)</p>
        </div>
        <div className="rounded-xl border border-yellow-500/10 bg-yellow-500/5 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{stats.moderate}</p>
          <p className="text-xs text-gray-400 mt-1">Moderate (40-59)</p>
        </div>
        <div className="rounded-xl border border-orange-500/10 bg-orange-500/5 p-4 text-center">
          <p className="text-2xl font-bold text-orange-400">{stats.risky}</p>
          <p className="text-xs text-gray-400 mt-1">Risky (&lt;40)</p>
        </div>
        <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.honeypots}</p>
          <p className="text-xs text-gray-400 mt-1">Honeypots</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'All' },
          { id: 'safe', label: 'Safe' },
          { id: 'moderate', label: 'Moderate' },
          { id: 'risky', label: 'Risky' },
          { id: 'honeypot', label: 'Honeypots' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.id
                ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF]" />
        </div>
      ) : filteredScores.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No safety scores yet. Use the search above to analyze a token.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-gray-900/50">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Token</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Score</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Grade</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Honeypot</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Verified</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Liquidity</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Holders</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Tax</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Risks</th>
              </tr>
            </thead>
            <tbody>
              {filteredScores.map(entry => {
                const token = tokenNames[entry.token_address]
                return (
                  <tr
                    key={entry.token_address}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => navigate(`/token/${entry.token_address}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <TokenLogo address={entry.token_address} />
                        <div>
                          <div className="font-medium">{token?.symbol || entry.token_address.slice(0, 10) + '...'}</div>
                          {token && <div className="text-xs text-gray-500">{token.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="text-center px-4 py-3 font-bold">{entry.score}</td>
                    <td className="text-center px-4 py-3">
                      <span className={`inline-block w-8 text-center rounded border text-xs font-bold py-0.5 ${GRADE_COLORS[entry.grade]}`}>
                        {entry.grade}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      {entry.is_honeypot === true ? (
                        <XCircle className="h-5 w-5 text-red-400 mx-auto" />
                      ) : entry.is_honeypot === false ? (
                        <CheckCircle className="h-5 w-5 text-emerald-400 mx-auto" />
                      ) : (
                        <span className="text-gray-500">?</span>
                      )}
                    </td>
                    <td className="text-center px-4 py-3">
                      {entry.is_verified ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-500 mx-auto" />
                      )}
                    </td>
                    <td className="text-right px-4 py-3">${(entry.total_liquidity_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="text-right px-4 py-3">{(entry.holder_count || 0).toLocaleString()}</td>
                    <td className="text-center px-4 py-3 text-xs">
                      {entry.buy_tax_pct != null || entry.sell_tax_pct != null ? (
                        <span className={
                          (entry.sell_tax_pct || 0) > 10 ? 'text-red-400' :
                          (entry.sell_tax_pct || 0) > 5 ? 'text-orange-400' : 'text-gray-400'
                        }>
                          {entry.buy_tax_pct ?? '?'}/{entry.sell_tax_pct ?? '?'}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-right px-4 py-3">
                      {entry.risks?.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-orange-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {entry.risks.length}
                        </span>
                      ) : (
                        <CheckCircle className="h-4 w-4 text-emerald-400 inline" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
