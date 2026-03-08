import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Shield, AlertTriangle, CheckCircle, XCircle, ExternalLink, ArrowLeft, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface SafetyScore {
  token_address: string
  score: number
  grade: string
  risks: string[]
  honeypot_score: number
  is_honeypot: boolean | null
  buy_tax_pct: number | null
  sell_tax_pct: number | null
  contract_score: number
  is_verified: boolean
  is_proxy: boolean
  ownership_renounced: boolean | null
  has_mint: boolean
  has_blacklist: boolean
  contract_dangers: string[]
  lp_score: number
  has_lp: boolean
  total_liquidity_usd: number
  pair_count: number
  recent_burns_24h: number
  holders_score: number
  holder_count: number
  top10_pct: number
  top1_pct: number
  age_score: number
  age_days: number
  analyzed_at: string
}

interface TokenInfo {
  address: string
  symbol: string
  name: string
}

const GRADE_COLORS: Record<string, string> = {
  A: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  B: 'text-green-400 border-green-400/30 bg-green-400/10',
  C: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  D: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  F: 'text-red-400 border-red-400/30 bg-red-400/10',
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const circumference = 2 * Math.PI * 58
  const offset = circumference - (score / 100) * circumference
  const color = grade === 'A' ? '#34d399' : grade === 'B' ? '#4ade80' : grade === 'C' ? '#facc15' : grade === 'D' ? '#fb923c' : '#f87171'

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="w-36 h-36 -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="58" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle
          cx="64" cy="64" r="58"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{score}</span>
        <span className={`text-sm font-medium ${GRADE_COLORS[grade]?.split(' ')[0] || 'text-gray-400'}`}>{grade}</span>
      </div>
    </div>
  )
}

function SubScore({ label, score, max, icon }: { label: string; score: number; max: number; icon: React.ReactNode }) {
  const pct = max > 0 ? (score / max) * 100 : 0
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : pct >= 20 ? 'bg-orange-500' : 'bg-red-500'

  return (
    <div className="flex items-center gap-3">
      <div className="text-gray-400 w-5">{icon}</div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-gray-300">{label}</span>
          <span className="text-sm font-medium">{score}/{max}</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

function RiskBadge({ risk }: { risk: string }) {
  const isHoneypot = risk.toLowerCase().includes('honeypot')
  const isCritical = isHoneypot || risk.toLowerCase().includes('selfdestruct') || risk.includes('Extreme')

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
      isCritical ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
      'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
    }`}>
      {isCritical ? <XCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {risk}
    </span>
  )
}

function BoolBadge({ value, trueLabel, falseLabel }: { value: boolean | null; trueLabel: string; falseLabel: string }) {
  if (value === null) return <span className="text-xs text-gray-500">Unknown</span>
  return value ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="h-3 w-3" />{trueLabel}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-red-400"><XCircle className="h-3 w-3" />{falseLabel}</span>
  )
}

// Token Safety API base URL (Railway service)
const SAFETY_API = import.meta.env.VITE_SAFETY_API_URL || 'https://openpulsechain-production-8166.up.railway.app'

export function TokenSafetyPage() {
  const { address } = useParams<{ address: string }>()
  const [safety, setSafety] = useState<SafetyScore | null>(null)
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) return

    const addr = address.toLowerCase()

    // 1. Try Supabase cache first
    supabase
      .from('token_safety_scores')
      .select('*')
      .eq('token_address', addr)
      .single()
      .then(({ data, error: err }) => {
        if (data && !err) {
          setSafety(data)
          setLoading(false)
        } else if (SAFETY_API) {
          // 2. Not in cache — call Token Safety API for live analysis
          setAnalyzing(true)
          setLoading(false)
          fetch(`${SAFETY_API}/api/v1/token/${addr}/safety?fresh=true`)
            .then(r => r.json())
            .then(json => {
              if (json.data) {
                // Re-fetch from Supabase to get the saved result
                supabase
                  .from('token_safety_scores')
                  .select('*')
                  .eq('token_address', addr)
                  .single()
                  .then(({ data: refreshed }) => {
                    if (refreshed) setSafety(refreshed)
                    else setError('Analysis completed but score not found.')
                    setAnalyzing(false)
                  })
              } else {
                setError('Analysis failed. Try again later.')
                setAnalyzing(false)
              }
            })
            .catch(() => {
              setError('Safety API unavailable. Try again later.')
              setAnalyzing(false)
            })
        } else {
          setError('No safety score available yet for this token.')
          setLoading(false)
        }
      })

    // Fetch token info
    supabase
      .from('pulsechain_tokens')
      .select('address, symbol, name')
      .eq('address', addr)
      .single()
      .then(({ data }) => {
        if (data) setTokenInfo(data)
      })
  }, [address])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF]" />
      </div>
    )
  }

  if (analyzing) {
    return (
      <div className="text-center py-20">
        <Loader2 className="h-12 w-12 animate-spin text-[#00D4FF] mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-300 mb-2">Analyzing Token...</h2>
        <p className="text-gray-500">Running honeypot simulation, contract analysis, LP check, and holder scan.</p>
        <p className="text-gray-600 text-sm mt-2">This may take 10-15 seconds.</p>
      </div>
    )
  }

  if (error || !safety) {
    return (
      <div className="text-center py-20">
        <Shield className="h-16 w-16 text-gray-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-300 mb-2">No Safety Score</h2>
        <p className="text-gray-500 mb-6">{error || 'Token not analyzed yet.'}</p>
        <Link to="/safety" className="inline-flex items-center gap-2 text-[#00D4FF] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Safety Dashboard
        </Link>
      </div>
    )
  }

  const grade = safety.grade || 'F'

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/safety" className="hover:text-[#00D4FF] transition-colors">Safety</Link>
        <span>/</span>
        <span className="text-gray-300 font-mono">{address?.slice(0, 10)}...{address?.slice(-6)}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
        <ScoreRing score={safety.score} grade={grade} />

        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">
              {tokenInfo ? `${tokenInfo.name} (${tokenInfo.symbol})` : `Token ${address?.slice(0, 10)}...`}
            </h1>
            <span className={`px-3 py-1 rounded-lg border text-lg font-bold ${GRADE_COLORS[grade]}`}>
              Grade {grade}
            </span>
          </div>

          <p className="text-sm text-gray-400 font-mono mb-3">
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

          {/* Risks */}
          {safety.risks && safety.risks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {safety.risks.map((risk, i) => (
                <RiskBadge key={i} risk={risk} />
              ))}
            </div>
          )}
          {safety.risks?.length === 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/20">
              <CheckCircle className="h-4 w-4" /> No risks detected
            </span>
          )}
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Honeypot */}
        <div className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#00D4FF]" /> Honeypot Check
          </h3>
          <SubScore label="Honeypot" score={safety.honeypot_score} max={30} icon={<Shield className="h-4 w-4" />} />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Honeypot</span>
              {safety.is_honeypot === true ? (
                <span className="text-red-400 font-medium">YES - DANGER</span>
              ) : safety.is_honeypot === false ? (
                <span className="text-emerald-400 font-medium">No</span>
              ) : (
                <span className="text-gray-500">Unknown</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Buy Tax</span>
              <span className={safety.buy_tax_pct != null && safety.buy_tax_pct > 10 ? 'text-orange-400' : ''}>{safety.buy_tax_pct != null ? `${safety.buy_tax_pct}%` : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Sell Tax</span>
              <span className={safety.sell_tax_pct != null && safety.sell_tax_pct > 10 ? 'text-red-400' : ''}>{safety.sell_tax_pct != null ? `${safety.sell_tax_pct}%` : '-'}</span>
            </div>
          </div>
        </div>

        {/* Contract */}
        <div className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Contract Analysis</h3>
          <SubScore label="Contract" score={safety.contract_score} max={25} icon={<Shield className="h-4 w-4" />} />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Verified</span>
              <BoolBadge value={safety.is_verified} trueLabel="Verified" falseLabel="Not verified" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Proxy</span>
              <BoolBadge value={safety.is_proxy ? false : true} trueLabel="No proxy" falseLabel="Upgradeable" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Ownership</span>
              <BoolBadge value={safety.ownership_renounced} trueLabel="Renounced" falseLabel="Active owner" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Mint Function</span>
              <BoolBadge value={!safety.has_mint} trueLabel="No mint" falseLabel="Can mint" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Blacklist</span>
              <BoolBadge value={!safety.has_blacklist} trueLabel="No blacklist" falseLabel="Has blacklist" />
            </div>
          </div>
        </div>

        {/* LP */}
        <div className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Liquidity</h3>
          <SubScore label="Liquidity" score={safety.lp_score} max={20} icon={<Shield className="h-4 w-4" />} />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Has LP</span>
              <BoolBadge value={safety.has_lp} trueLabel="Yes" falseLabel="No LP" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Liquidity</span>
              <span>${(safety.total_liquidity_usd || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Pairs</span>
              <span>{safety.pair_count || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">LP Removals (24h)</span>
              <span className={safety.recent_burns_24h > 0 ? 'text-orange-400' : ''}>{safety.recent_burns_24h || 0}</span>
            </div>
          </div>
        </div>

        {/* Holders */}
        <div className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Holders</h3>
          <SubScore label="Holders" score={safety.holders_score} max={15} icon={<Shield className="h-4 w-4" />} />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Holder Count</span>
              <span>{(safety.holder_count || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Top 10 Holders</span>
              <span className={safety.top10_pct > 50 ? 'text-red-400' : safety.top10_pct > 30 ? 'text-orange-400' : ''}>{safety.top10_pct?.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">#1 Holder</span>
              <span className={safety.top1_pct > 30 ? 'text-red-400' : ''}>{safety.top1_pct?.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Age */}
      <div className="rounded-xl border border-white/5 bg-gray-900/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-1">Age & Activity</h3>
            <p className="text-sm text-gray-400">
              Token age: <span className="text-gray-200">{Math.floor(safety.age_days)} days</span>
              {' | '}Score: <span className="text-gray-200">{safety.age_score}/10</span>
            </p>
          </div>
          <p className="text-xs text-gray-500">
            Analyzed: {new Date(safety.analyzed_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
