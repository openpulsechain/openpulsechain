import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Shield, Search, AlertTriangle, CheckCircle, XCircle, Loader2, TrendingDown, Coins, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatTimeAgo } from '../../lib/format'
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

// ─── Interfaces ────────────────────────────────────────────────────────

interface SafetyEntry {
  token_address: string
  score: number
  grade: string
  risks: string[]
  is_honeypot: boolean | null
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

interface Alert {
  id: number
  alert_type: string
  severity: string
  token_address: string | null
  pair_address: string | null
  data: Record<string, unknown>
  created_at: string
}

// ─── Constants ─────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  A: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  B: 'text-green-400 bg-green-400/10 border-green-400/30',
  C: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  D: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  F: 'text-red-400 bg-red-400/10 border-red-400/30',
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  lp_removal: <TrendingDown className="h-4 w-4" />,
  whale_dump: <Coins className="h-4 w-4" />,
  mint_event: <AlertTriangle className="h-4 w-4" />,
}

const TYPE_LABELS: Record<string, string> = {
  lp_removal: 'LP Removal',
  whale_dump: 'Whale Dump',
  mint_event: 'Mint Event',
  tax_change: 'Tax Change',
}

// ─── Main component ───────────────────────────────────────────────────

export function SafetyDashboardPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'alerts' ? 'alerts' : 'scanner'

  // Scanner state
  const [scores, setScores] = useState<SafetyEntry[]>([])
  const [tokenNames, setTokenNames] = useState<Record<string, TokenName>>({})
  const [loading, setLoading] = useState(true)
  const [searchAddress, setSearchAddress] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [stats, setStats] = useState({ total: 0, honeypots: 0, safe: 0, moderate: 0, risky: 0 })

  // Alerts state
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [alertFilter, setAlertFilter] = useState<string>('all')

  // Load scanner data
  useEffect(() => {
    loadScores()
  }, [])

  // Load alerts + auto-refresh
  useEffect(() => {
    loadAlerts()
    const interval = setInterval(() => loadAlerts(), 120_000)
    return () => clearInterval(interval)
  }, [])

  async function loadScores() {
    setLoading(true)
    const { data } = await supabase
      .from('token_safety_scores')
      .select('token_address, score, grade, risks, is_honeypot, total_liquidity_usd, holder_count, top10_pct, buy_tax_pct, sell_tax_pct, analyzed_at')
      .order('total_liquidity_usd', { ascending: false })
      .limit(200)

    const entries = data || []
    setScores(entries)

    const honeypots = entries.filter(e => e.is_honeypot === true).length
    const safe = entries.filter(e => e.score >= 60).length
    const moderate = entries.filter(e => e.score >= 40 && e.score < 60).length
    const risky = entries.filter(e => e.score < 40).length
    setStats({ total: entries.length, honeypots, safe, moderate, risky })

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

  async function loadAlerts() {
    setAlertsLoading(true)
    const { data } = await supabase
      .from('scam_radar_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    setAlerts(data || [])
    setAlertsLoading(false)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const addr = searchAddress.trim().toLowerCase()
    if (/^0x[0-9a-f]{40}$/i.test(addr)) {
      navigate(`/token/${addr}`)
    }
  }

  function setTab(tab: string) {
    setSearchParams(tab === 'scanner' ? {} : { tab })
  }

  const filteredScores = scores.filter(s => {
    if (filter === 'honeypot') return s.is_honeypot === true
    if (filter === 'safe') return s.score >= 60
    if (filter === 'moderate') return s.score >= 40 && s.score < 60
    if (filter === 'risky') return s.score < 40
    return true
  })

  const filteredAlerts = alerts.filter(a => {
    if (alertFilter === 'all') return true
    return a.alert_type === alertFilter
  })

  // Last alert timestamp for "last scan" indicator
  const lastAlertTime = alerts.length > 0 ? alerts[0].created_at : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Shield className="h-7 w-7 text-emerald-400" />
          Token Safety
        </h1>
        <p className="text-gray-400 mt-1">
          Automated safety analysis and real-time scam detection for PulseChain tokens.
        </p>
      </div>

      {/* Search — always visible */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
          <input
            type="text"
            value={searchAddress}
            onChange={e => setSearchAddress(e.target.value)}
            placeholder="Enter token address (0x...) for full safety report"
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

      {/* Tab switcher: Scanner / Alerts */}
      <div className="flex gap-2 border-b border-white/5 pb-1">
        <button
          onClick={() => setTab('scanner')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'scanner'
              ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30 border-b-0'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Shield className="h-4 w-4" />
          Scanner
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-500">{stats.total}</span>
        </button>
        <button
          onClick={() => setTab('alerts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'alerts'
              ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30 border-b-0'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Scam Radar
          {alerts.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">
              {alerts.length}
            </span>
          )}
        </button>
      </div>

      {/* ═══ SCANNER TAB ═══ */}
      {activeTab === 'scanner' && (
        <>
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
        </>
      )}

      {/* ═══ ALERTS TAB ═══ */}
      {activeTab === 'alerts' && (
        <>
          {/* Last scan indicator */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Real-time alerts for suspicious on-chain activity. Monitors LP removals, whale dumps, and mint events.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
              {lastAlertTime ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span>Last alert: {formatTimeAgo(lastAlertTime)}</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-500" />
                  </span>
                  <span>No recent alerts</span>
                </>
              )}
              <span className="text-gray-600 ml-1">| Auto-refresh 2min</span>
            </div>
          </div>

          {/* Alert filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'all', label: 'All Alerts' },
              { id: 'lp_removal', label: 'LP Removals' },
              { id: 'whale_dump', label: 'Whale Dumps' },
              { id: 'mint_event', label: 'Mint Events' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setAlertFilter(f.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  alertFilter === f.id
                    ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Alerts list */}
          {alertsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF]" />
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-3 text-emerald-400/30" />
              <p className="text-lg font-medium text-gray-400">No alerts detected</p>
              <p className="text-sm mt-1">The radar is monitoring. Alerts will appear here when suspicious activity is detected.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map(alert => {
                const data = typeof alert.data === 'string' ? JSON.parse(alert.data) : alert.data
                return (
                  <div
                    key={alert.id}
                    className="rounded-xl border border-white/5 bg-gray-900/50 p-4 hover:bg-gray-900/70 transition-colors cursor-pointer"
                    onClick={() => {
                      const tokenAddr = (data.token0_address || data.token_address || alert.token_address) as string | undefined
                      if (tokenAddr) navigate(`/token/${tokenAddr}`)
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg border ${SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium}`}>
                        {TYPE_ICONS[alert.alert_type] || <AlertTriangle className="h-4 w-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {TYPE_LABELS[alert.alert_type] || alert.alert_type}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${SEVERITY_STYLES[alert.severity]}`}>
                            {alert.severity}
                          </span>
                        </div>

                        {alert.alert_type === 'lp_removal' && (
                          <p className="text-sm text-gray-400">
                            <span className="text-gray-200">${Number(data.amount_usd || 0).toLocaleString()}</span> LP removed from{' '}
                            <span className="text-gray-200">{data.token0_symbol as string}/{data.token1_symbol as string}</span> on {data.dex as string}
                          </p>
                        )}

                        {alert.alert_type === 'whale_dump' && (
                          <p className="text-sm text-gray-400">
                            <span className="text-gray-200">{data.pct_of_supply as string}%</span> of supply sold
                          </p>
                        )}

                        {data.sender && (
                          <p className="text-xs text-gray-500 font-mono mt-1 truncate">
                            by {data.sender as string}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(alert.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <p className="text-center text-xs text-gray-600 pt-4">
        This is not investment advice. Data is provided for educational and informational purposes only.
      </p>
    </div>
  )
}
