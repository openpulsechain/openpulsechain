import { useState, useEffect, Fragment } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Shield, AlertTriangle, CheckCircle, XCircle, ExternalLink, ArrowLeft, Loader2, ChevronDown, ChevronRight, Clock, Users, FileCode, Droplets, Fingerprint, Activity } from 'lucide-react'
import { ShareButton } from '../ui/ShareButton'
import { supabase } from '../../lib/supabase'

// ─── Interfaces ──────────────────────────────────────────────────────────────

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

interface LiquidityPair {
  address: string
  dex: string
  reserve_usd: number
  token0_symbol: string
  token1_symbol: string
  token0_address: string
  token1_address: string
  created_at: number
  age_days: number
  total_txns: number
  is_anchored?: boolean
}

// Pool data from token_pools_live (Supabase) — used for sections ④⑥⑦
interface PoolLive {
  token_address: string
  pair_address: string
  dex_id: string | null
  base_token_address: string | null
  base_token_symbol: string | null
  quote_token_address: string | null
  quote_token_symbol: string | null
  price_usd: number | null
  liquidity_usd: number | null
  volume_24h_usd: number | null
  buys_24h: number | null
  sells_24h: number | null
  pool_is_legitimate: boolean
  pool_confidence: string | null
  pool_spam_reason: string | null
  tier: string
  dx_url: string | null
  updated_at: string
}

// Monitoring history snapshots (from token_monitoring_pools)
interface MonitoringSnapshot {
  pair_address: string
  snapshot_at: string
  pool_confidence: string
  pool_is_legitimate: boolean
  pool_spam_reason: string | null
  reserve_usd: number | null
  volume_24h_usd: number | null
  token0_symbol: string | null
  token1_symbol: string | null
  token0_is_known: boolean
  token0_is_core: boolean
  token1_is_known: boolean
  token1_is_core: boolean
}

interface VerifiedToken {
  address: string
  symbol: string
  name: string | null
}

interface DeployerInfo {
  deployer_address: string
  tokens_deployed: number
  dead_tokens: number
  mortality_rate: number
  risk_level: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const KNOWN_LOGOS: Record<string, string> = {
  '0xa1077a294dde1b09bb078844df40758a5d0f9a27': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
  '0x95b303987a60c71504d99aa1b13b4da07b0790ab': 'https://tokens.app.pulsex.com/images/tokens/0x95B303987A60C71504D99Aa1b13B4DA07b0790ab.png',
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39': 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
  '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d': 'https://tokens.app.pulsex.com/images/tokens/0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d.png',
  '0xefd766ccb38eaf1dfd701853bfce31359239f305': 'https://tokens.app.pulsex.com/images/tokens/0xefD766cCb38EaF1dfd701853BFCe31359239F305.png',
  '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c': 'https://tokens.app.pulsex.com/images/tokens/0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C.png',
}

const GRADE_COLORS: Record<string, string> = {
  A: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  B: 'text-green-400 border-green-400/30 bg-green-400/10',
  C: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  D: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  F: 'text-red-400 border-red-400/30 bg-red-400/10',
}

// Pool confidence levels — P0-B fix: Low=orange (distinct from Suspect=red)
const CONFIDENCE_INFO: Record<string, { label: string; color: string; bg: string; explanation: string }> = {
  high: {
    label: 'High',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    explanation: 'Both tokens in this pair are core PulseChain tokens (WPLS, HEX, PLSX, INC, WETH, DAI, USDC, USDT, WBTC, HEDRON, MAXI, eHEX). Highest trust level.',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    explanation: 'One token is a core PulseChain token and the other is a known token listed in our database. Standard trust level for most legitimate pairs.',
  },
  low: {
    label: 'Low',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
    explanation: 'Both tokens are known (listed in our database) but neither is a core token. Exercise caution — verify the token contracts independently.',
  },
  suspect: {
    label: 'Suspect',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    explanation: 'At least one token in this pair is not recognized in our database. This pool may involve an unverified or potentially fraudulent token. Do your own research before interacting.',
  },
}

const DEX_NAMES: Record<string, string> = {
  pulsex: 'PulseX', '9mm': '9mm', '9inch': '9inch',
  'pulse-rate': 'Pulse Rate', dextop: 'DexTop', eazyswap: 'EazySwap',
}

// ─── Utility functions ───────────────────────────────────────────────────────

function formatDexName(dex: string | null): string {
  if (!dex) return '--'
  return DEX_NAMES[dex] || dex.charAt(0).toUpperCase() + dex.slice(1)
}

function formatUsdCompact(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`
  return `$${val.toFixed(0)}`
}

// P0-D fix: use real token symbols instead of generic "Token 0/1"
function formatSpamReason(raw: string | null, baseSymbol?: string | null, quoteSymbol?: string | null): { code: string; explanation: string }[] {
  if (!raw) return []
  const t0 = baseSymbol || 'Base token'
  const t1 = quoteSymbol || 'Quote token'
  return raw.split('; ').map(part => {
    const [code, val] = part.split(':')
    const key = code.trim()
    if (key.startsWith('low_reserve')) {
      return { code: part, explanation: `Pool reserves are extremely low ($${val ?? '< 100'} USD). Legitimate pools typically have significantly higher reserves.` }
    }
    const map: Record<string, string> = {
      unknown_token0: `${t0} is not recognized in our token database.`,
      unknown_token1: `${t1} is not recognized in our token database.`,
      low_volume_token0: `${t0} has very low all-time trading volume (< $1,000), indicating an inactive or fake token.`,
      low_volume_token1: `${t1} has very low all-time trading volume (< $1,000), indicating an inactive or fake token.`,
      spam_name: `One of the token names contains a spam keyword (e.g. "airdrop", "free", "claim", "test").`,
      no_liquidity_token0: `${t0} has zero or near-zero liquidity in this pool.`,
      no_liquidity_token1: `${t1} has zero or near-zero liquidity in this pool.`,
    }
    return { code: part, explanation: map[key] ?? `Flagged: ${part}` }
  })
}

// ─── Utility components ──────────────────────────────────────────────────────

function TokenLogo({ address }: { address: string }) {
  const [error, setError] = useState(false)
  const addr = address?.toLowerCase() || ''
  const knownUrl = KNOWN_LOGOS[addr]
  const imgUrl = knownUrl || `https://tokens.app.pulsex.com/images/tokens/${address}.png`
  if (error) return null
  return (
    <img
      src={imgUrl}
      alt=""
      className="h-8 w-8 rounded-full bg-gray-800 border border-white/10 shrink-0"
      onError={() => setError(true)}
    />
  )
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const circumference = 2 * Math.PI * 58
  const offset = circumference - (score / 100) * circumference
  const color = grade === 'A' ? '#34d399' : grade === 'B' ? '#4ade80' : grade === 'C' ? '#facc15' : grade === 'D' ? '#fb923c' : '#f87171'
  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="w-36 h-36 -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="58" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle cx="64" cy="64" r="58" fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000" />
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

function ConfidenceBadge({ level }: { level: string | null }) {
  const conf = CONFIDENCE_INFO[level ?? ''] ?? CONFIDENCE_INFO.suspect
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${conf.bg} ${conf.color}`}>
      {conf.label}
    </span>
  )
}

// ─── Safety API ──────────────────────────────────────────────────────────────

const SAFETY_API = import.meta.env.VITE_SAFETY_API_URL || 'https://safety.openpulsechain.com'

// ─── Main component ─────────────────────────────────────────────────────────

export function TokenSafetyPage() {
  const { address } = useParams<{ address: string }>()

  // Core safety data
  const [safety, setSafety] = useState<SafetyScore | null>(null)
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Section ④: LP pools from token_pools_live (replaces old Safety API /liquidity)
  const [livePools, setLivePools] = useState<PoolLive[]>([])
  const [poolsExpanded, setPoolsExpanded] = useState(false)

  // Section ③: Deployer reputation
  const [deployer, setDeployer] = useState<DeployerInfo | null>(null)
  const [deployerLoading, setDeployerLoading] = useState(true)

  // Section ⑥: Token identity comparison
  const [verifiedTokens, setVerifiedTokens] = useState<Record<string, VerifiedToken[]>>({})

  // Section ⑦: Monitoring history
  const [monitoringHistory, setMonitoringHistory] = useState<MonitoringSnapshot[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)

  // Legacy: Safety API pair list (anchored/capped analysis)
  const [pairs, setPairs] = useState<LiquidityPair[]>([])
  const [pairsExpanded, setPairsExpanded] = useState(false)
  const [pairsLoading, setPairsLoading] = useState(false)

  const loadPairs = () => {
    if (pairs.length > 0) { setPairsExpanded(!pairsExpanded); return }
    if (!address) return
    setPairsExpanded(true)
    setPairsLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    fetch(`${SAFETY_API}/api/v1/token/${address.toLowerCase()}/liquidity?fresh=true`, { signal: controller.signal })
      .then(r => { clearTimeout(timeout); if (!r.ok) throw new Error(`API ${r.status}`); return r.json() })
      .then(json => { setPairs(json.pairs || []); setPairsLoading(false) })
      .catch(() => setPairsLoading(false))
  }

  useEffect(() => {
    if (!address) return
    const addr = address.toLowerCase()

    // ── 1. Safety score (Supabase cache → Safety API fallback) ──
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
          setAnalyzing(true)
          setLoading(false)
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 30000)
          fetch(`${SAFETY_API}/api/v1/token/${addr}/safety?fresh=true`, { signal: controller.signal })
            .then(r => { clearTimeout(timeout); return r.json() })
            .then(json => {
              if (json.data) {
                supabase.from('token_safety_scores').select('*').eq('token_address', addr).single()
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
            .catch(() => { setError('Safety API unavailable. Try again later.'); setAnalyzing(false) })
        } else {
          setError('No safety score available yet for this token.')
          setLoading(false)
        }
      })

    // ── 2. Token info ──
    supabase
      .from('pulsechain_tokens')
      .select('address, symbol, name')
      .eq('address', addr)
      .single()
      .then(({ data }) => { if (data) setTokenInfo(data) })

    // ── 3. Live pools → monitoring history + verified tokens ──
    supabase
      .from('token_pools_live')
      .select('*')
      .eq('token_address', addr)
      .order('liquidity_usd', { ascending: false, nullsFirst: false })
      .then(({ data: poolData }) => {
        const pools = (poolData ?? []) as PoolLive[]
        setLivePools(pools)
        if (pools.length === 0) return

        // 3a. Monitoring history for all pools
        const pairAddresses = pools.map(p => p.pair_address)
        supabase
          .from('token_monitoring_pools')
          .select('pair_address, snapshot_at, pool_confidence, pool_is_legitimate, pool_spam_reason, reserve_usd, volume_24h_usd, token0_symbol, token1_symbol, token0_is_known, token0_is_core, token1_is_known, token1_is_core')
          .in('pair_address', pairAddresses)
          .order('snapshot_at', { ascending: false })
          .limit(200)
          .then(({ data }) => setMonitoringHistory((data ?? []) as MonitoringSnapshot[]))

        // 3b. Verified tokens for identity comparison (section ⑥)
        const symbols = [...new Set(
          pools.flatMap(p => [p.base_token_symbol, p.quote_token_symbol]).filter(Boolean)
        )] as string[]
        if (symbols.length > 0) {
          supabase
            .from('pulsechain_tokens')
            .select('address, symbol, name')
            .in('symbol', symbols)
            .gt('total_volume_usd', 0)
            .order('total_liquidity_usd', { ascending: false, nullsFirst: false })
            .then(({ data }) => {
              const grouped: Record<string, VerifiedToken[]> = {}
              for (const t of (data ?? []) as VerifiedToken[]) {
                if (!grouped[t.symbol]) grouped[t.symbol] = []
                grouped[t.symbol].push(t)
              }
              setVerifiedTokens(grouped)
            })
        }
      })

    // ── 4. Deployer reputation (Safety API) ──
    setDeployerLoading(true)
    const deployerController = new AbortController()
    const deployerTimeout = setTimeout(() => deployerController.abort(), 10000)
    fetch(`${SAFETY_API}/api/v1/token/${addr}/deployer`, { signal: deployerController.signal })
      .then(r => { clearTimeout(deployerTimeout); if (!r.ok) throw new Error(`API ${r.status}`); return r.json() })
      .then(json => { if (json.data) setDeployer(json.data); setDeployerLoading(false) })
      .catch(() => setDeployerLoading(false))

  }, [address])

  // ── Loading states ──

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
  const legitimatePools = livePools.filter(p => p.pool_is_legitimate)
  const suspectPools = livePools.filter(p => !p.pool_is_legitimate)

  // Unique token addresses from all pools for identity comparison
  const poolTokenEntries = livePools.flatMap(p => [
    { symbol: p.base_token_symbol, address: p.base_token_address, role: 'Base' },
    { symbol: p.quote_token_symbol, address: p.quote_token_address, role: 'Quote' },
  ]).filter(t => t.address)
  // Deduplicate by address
  const uniquePoolTokens = Object.values(
    poolTokenEntries.reduce((acc, t) => {
      const key = t.address!.toLowerCase()
      if (!acc[key]) acc[key] = t
      return acc
    }, {} as Record<string, typeof poolTokenEntries[0]>)
  )

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/safety" className="hover:text-[#00D4FF] transition-colors">Safety</Link>
        <span>/</span>
        <span className="text-gray-300 font-mono">{address?.slice(0, 10)}...{address?.slice(-6)}</span>
      </div>

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
        <ScoreRing score={safety.score} grade={grade} />
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {address && <TokenLogo address={address} />}
            <h1 className="text-2xl font-bold">
              {tokenInfo ? `${tokenInfo.name} (${tokenInfo.symbol})` : `Token ${address?.slice(0, 10)}...`}
            </h1>
            <span className={`px-3 py-1 rounded-lg border text-lg font-bold ${GRADE_COLORS[grade]}`}>
              Grade {grade}
            </span>
            <ShareButton
              title={`${tokenInfo?.symbol || 'Token'} Safety Score: ${safety.score}/100 (Grade ${grade})`}
              text="Check any PulseChain token on OpenPulsechain"
            />
          </div>
          <p className="text-sm text-gray-400 font-mono mb-3">
            {address}
            <a
              href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${address}`}
              target="_blank" rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1 text-[#00D4FF] hover:underline"
            >
              Explorer <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          {safety.risks && safety.risks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {safety.risks.map((risk, i) => <RiskBadge key={i} risk={risk} />)}
            </div>
          )}
          {safety.risks?.length === 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/20">
              <CheckCircle className="h-4 w-4" /> No risks detected
            </span>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ① CONTRACT ANALYSIS (25 pts)
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="contract" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <FileCode className="h-4 w-4 text-[#00D4FF]" />
          <span className="text-white/30">①</span>
          Contract Analysis
        </h3>
        <SubScore label="Contract" score={safety.contract_score} max={25} icon={<FileCode className="h-4 w-4" />} />
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Source Code Verified</span>
            <BoolBadge value={safety.is_verified} trueLabel="Verified on Explorer" falseLabel="Not verified" />
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Proxy Contract</span>
            <BoolBadge value={safety.is_proxy ? false : true} trueLabel="No proxy" falseLabel="Upgradeable (proxy)" />
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Ownership</span>
            <BoolBadge value={safety.ownership_renounced} trueLabel="Renounced" falseLabel="Active owner" />
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Mint Function</span>
            <BoolBadge value={!safety.has_mint} trueLabel="No mint" falseLabel="Can mint new tokens" />
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Blacklist</span>
            <BoolBadge value={!safety.has_blacklist} trueLabel="No blacklist" falseLabel="Can blacklist addresses" />
          </div>
        </div>
        {safety.contract_dangers && safety.contract_dangers.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            <span className="text-xs text-red-400 font-bold">Contract Dangers:</span>
            {safety.contract_dangers.map((d, i) => (
              <div key={i} className="text-xs text-red-300 bg-red-500/5 border border-red-500/10 rounded px-2.5 py-1.5">
                {d}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ② HONEYPOT TEST (30 pts)
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="honeypot" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#00D4FF]" />
          <span className="text-white/30">②</span>
          Honeypot Test
        </h3>
        <SubScore label="Honeypot" score={safety.honeypot_score} max={30} icon={<Shield className="h-4 w-4" />} />
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Honeypot Status</span>
            {safety.is_honeypot === true ? (
              <span className="text-red-400 font-bold">YES - CANNOT SELL</span>
            ) : safety.is_honeypot === false ? (
              <span className="text-emerald-400 font-medium">No - Can sell</span>
            ) : (
              <span className="text-gray-500">Unknown (simulation failed)</span>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Buy Tax</span>
            <span className={safety.buy_tax_pct != null && safety.buy_tax_pct > 10 ? 'text-orange-400 font-medium' : ''}>
              {safety.buy_tax_pct != null ? `${safety.buy_tax_pct}%` : '-'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Sell Tax</span>
            <span className={safety.sell_tax_pct != null && safety.sell_tax_pct > 10 ? 'text-red-400 font-medium' : ''}>
              {safety.sell_tax_pct != null ? `${safety.sell_tax_pct}%` : '-'}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-gray-600">
          Tested via FeeChecker on-chain simulation on PulseX V1 + V2 routers.
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ③ DEPLOYER REPUTATION (informational)
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="deployer" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-[#00D4FF]" />
          <span className="text-white/30">③</span>
          Deployer Reputation
          <span className="text-[10px] text-gray-600 font-normal normal-case tracking-normal ml-auto">Informational</span>
        </h3>
        {deployerLoading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            <span className="text-sm text-gray-500">Loading deployer data...</span>
          </div>
        ) : deployer ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Deployer Address</span>
              <a
                href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${deployer.deployer_address}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[#00D4FF] hover:underline font-mono text-xs"
              >
                {deployer.deployer_address.slice(0, 10)}...{deployer.deployer_address.slice(-6)}
                <ExternalLink className="h-3 w-3 inline ml-1" />
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tokens Deployed</span>
              <span>{deployer.tokens_deployed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Dead Tokens</span>
              <span className={deployer.dead_tokens > 5 ? 'text-red-400 font-medium' : ''}>
                {deployer.dead_tokens} ({(deployer.mortality_rate * 100).toFixed(0)}% mortality)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Risk Level</span>
              <span className={
                deployer.risk_level === 'serial_rugger' ? 'text-red-400 font-bold' :
                deployer.risk_level === 'high' ? 'text-red-400 font-medium' :
                deployer.risk_level === 'medium' ? 'text-orange-400 font-medium' :
                'text-emerald-400'
              }>
                {deployer.risk_level === 'serial_rugger' ? 'SERIAL RUGGER' :
                 deployer.risk_level.charAt(0).toUpperCase() + deployer.risk_level.slice(1)}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-white/[0.02] border border-white/5 px-4 py-3">
            <p className="text-sm text-gray-500">Deployer data unavailable.</p>
            <p className="text-[10px] text-gray-600 mt-1">Safety API may be offline. Deployer reputation analysis requires the backend service.</p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ④ LIQUIDITY POOLS (20 pts) — absorbs Pool Confidence
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="liquidity" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Droplets className="h-4 w-4 text-[#00D4FF]" />
          <span className="text-white/30">④</span>
          Liquidity Pools
        </h3>
        <SubScore label="Liquidity" score={safety.lp_score} max={20} icon={<Droplets className="h-4 w-4" />} />

        {/* Summary metrics */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Has Liquidity</span>
            <BoolBadge value={safety.has_lp} trueLabel="Yes" falseLabel="No LP" />
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Total Liquidity</span>
            <span className="font-medium">{formatUsdCompact(safety.total_liquidity_usd || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Active Pairs</span>
            <span>{safety.pair_count || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">LP Removals (24h)</span>
            <span className={safety.recent_burns_24h > 0 ? 'text-orange-400 font-medium' : ''}>
              {safety.recent_burns_24h || 0}
            </span>
          </div>
          {livePools.length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">Monitored Pools</span>
              <span>
                {legitimatePools.length} legitimate
                {suspectPools.length > 0 && <span className="text-red-400 ml-1">+ {suspectPools.length} suspect</span>}
              </span>
            </div>
          )}
        </div>

        {/* Pool table from token_pools_live */}
        {livePools.length > 0 && (
          <>
            <button
              onClick={() => setPoolsExpanded(!poolsExpanded)}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#00D4FF] hover:text-white rounded-lg border border-[#00D4FF]/30 bg-[#00D4FF]/5 hover:bg-[#00D4FF]/10 py-2.5 transition-colors"
            >
              {poolsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {poolsExpanded ? 'Hide pool details' : `View all ${livePools.length} pools with confidence`}
            </button>

            {poolsExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500">
                      <th className="py-2 text-left w-6">#</th>
                      <th className="py-2 text-left">Pair</th>
                      <th className="py-2 text-left">DEX</th>
                      <th className="py-2 text-right">Liquidity</th>
                      <th className="py-2 text-right">Vol 24h</th>
                      <th className="py-2 text-center">Confidence</th>
                      <th className="py-2 text-center">DexScreener</th>
                    </tr>
                  </thead>
                  <tbody>
                    {livePools.map((pool, i) => {
                      const spamReasons = formatSpamReason(pool.pool_spam_reason, pool.base_token_symbol, pool.quote_token_symbol)
                      return (
                        <Fragment key={pool.pair_address}>
                          <tr className={`border-b border-white/5 ${!pool.pool_is_legitimate ? 'opacity-60' : ''}`}>
                            <td className="py-2 text-gray-600">{i + 1}</td>
                            <td className="py-2">
                              <span className="text-white font-medium">
                                {pool.base_token_symbol}/{pool.quote_token_symbol}
                              </span>
                            </td>
                            <td className="py-2 text-gray-400">{formatDexName(pool.dex_id)}</td>
                            <td className="py-2 text-right text-gray-300">
                              {pool.liquidity_usd != null ? formatUsdCompact(pool.liquidity_usd) : '--'}
                            </td>
                            <td className="py-2 text-right text-gray-300">
                              {pool.volume_24h_usd != null ? formatUsdCompact(pool.volume_24h_usd) : '--'}
                            </td>
                            <td className="py-2 text-center">
                              <ConfidenceBadge level={pool.pool_confidence} />
                            </td>
                            <td className="py-2 text-center">
                              {pool.dx_url ? (
                                <a href={pool.dx_url} target="_blank" rel="noopener noreferrer" className="text-[#00D4FF] hover:text-white">
                                  <ExternalLink className="h-3.5 w-3.5 inline" />
                                </a>
                              ) : (
                                <a href={`https://dexscreener.com/pulsechain/${pool.pair_address}`} target="_blank" rel="noopener noreferrer" className="text-[#00D4FF] hover:text-white">
                                  <ExternalLink className="h-3.5 w-3.5 inline" />
                                </a>
                              )}
                            </td>
                          </tr>
                          {/* Spam reasons for this pool */}
                          {spamReasons.length > 0 && (
                            <tr className="border-b border-white/5">
                              <td></td>
                              <td colSpan={6} className="py-1.5 pb-2.5">
                                {spamReasons.map((r, j) => (
                                  <div key={j} className="text-[10px] text-red-400/80 leading-relaxed">
                                    <span className="font-mono text-red-400/50 mr-1">{r.code}</span>
                                    {r.explanation}
                                  </div>
                                ))}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Confidence scale legend */}
        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
          <div className="text-[10px] text-gray-500 mb-2 font-medium uppercase tracking-wider">Confidence Scale</div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {Object.entries(CONFIDENCE_INFO).map(([key, info]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`${info.color} font-bold w-14 shrink-0`}>{info.label}</span>
                <span className="text-gray-500">
                  {key === 'high' ? '2 core tokens' : key === 'medium' ? '1 core + 1 known' : key === 'low' ? '2 known, no core' : '1+ unknown token'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Anchor analysis from Safety API (legacy, optional) */}
        {safety.has_lp && (
          <button
            onClick={loadPairs}
            className="w-full flex items-center justify-center gap-2 text-[11px] text-gray-500 hover:text-gray-300 rounded-lg border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] py-2 transition-colors"
          >
            {pairsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {pairsExpanded ? 'Hide anchor analysis' : 'Anchor analysis (Safety API)'}
          </button>
        )}

        {pairsExpanded && (
          <div className="space-y-2">
            {pairsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              </div>
            ) : pairs.length > 0 ? (
              <>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {pairs.map((p, i) => {
                    const pctOfTotal = safety.total_liquidity_usd > 0
                      ? ((p.reserve_usd / safety.total_liquidity_usd) * 100).toFixed(1) : '0'
                    return (
                      <a key={p.address}
                        href={`https://dexscreener.com/pulsechain/${p.address}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors group"
                      >
                        <span className="text-[10px] text-gray-600 w-5 shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-white">{p.token0_symbol}/{p.token1_symbol}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-gray-500">{p.dex.replace('_', ' ')}</span>
                            {p.is_anchored === true && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400" title="Paired with a reference token">anchored</span>
                            )}
                            {p.is_anchored === false && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400" title="Liquidity capped at $50K">capped</span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono truncate">{p.address.slice(0, 10)}...{p.address.slice(-6)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-white">{formatUsdCompact(p.reserve_usd)}</div>
                          <div className="text-[9px] text-gray-500">{pctOfTotal}% &middot; {p.total_txns.toLocaleString()} tx</div>
                        </div>
                        <ExternalLink className="h-3 w-3 text-gray-600 group-hover:text-[#00D4FF] shrink-0 transition-colors" />
                      </a>
                    )
                  })}
                </div>
                {/* Methodology note */}
                <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 px-3 py-2.5 space-y-1.5">
                  <p className="text-[11px] text-blue-300 font-medium">Anchor System</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Pairs containing a reference token (WPLS, HEX, PLSX, INC, DAI, USDC, USDT, WETH, WBTC) are
                    {' '}<span className="text-emerald-400">trusted</span>.
                    Pairs where both tokens are unknown are <span className="text-amber-400">capped at $50K</span> to
                    prevent inflation from tokens that only trade against other worthless tokens.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500 text-center py-2">Safety API unavailable — anchor analysis not loaded.</p>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ⑤ HOLDER DISTRIBUTION (15 pts)
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="holders" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Users className="h-4 w-4 text-[#00D4FF]" />
          <span className="text-white/30">⑤</span>
          Holder Distribution
        </h3>
        <SubScore label="Holders" score={safety.holders_score} max={15} icon={<Users className="h-4 w-4" />} />
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Total Holders</span>
            <span className="font-medium">{(safety.holder_count || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Top 10 Holders</span>
            <span className={safety.top10_pct > 50 ? 'text-red-400 font-medium' : safety.top10_pct > 30 ? 'text-orange-400' : ''}>
              {safety.top10_pct?.toFixed(1)}% of supply
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">#1 Holder</span>
            <span className={safety.top1_pct > 30 ? 'text-red-400 font-medium' : ''}>
              {safety.top1_pct?.toFixed(1)}% of supply
            </span>
          </div>
        </div>
        {/* Distribution assessment */}
        <div className={`rounded-lg px-3 py-2 text-xs ${
          safety.top10_pct > 50 ? 'bg-red-500/5 border border-red-500/10 text-red-300' :
          safety.top10_pct > 30 ? 'bg-orange-500/5 border border-orange-500/10 text-orange-300' :
          'bg-emerald-500/5 border border-emerald-500/10 text-emerald-300'
        }`}>
          {safety.top10_pct > 50
            ? 'High concentration: Top 10 holders control over 50% of supply. Risk of price manipulation.'
            : safety.top10_pct > 30
            ? 'Moderate concentration: Top 10 holders control over 30% of supply. Exercise caution.'
            : 'Healthy distribution: No excessive concentration detected in top holders.'}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ⑥ TOKEN IDENTITY (informational)
          P0-A fix: "Verified" → "Known" (pulsechain_tokens is auto-populated)
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="identity" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-[#00D4FF]" />
          <span className="text-white/30">⑥</span>
          Token Identity
          <span className="text-[10px] text-gray-600 font-normal normal-case tracking-normal ml-auto">Informational</span>
        </h3>

        {/* Token registry status */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Symbol</span>
            <span className="font-medium">{tokenInfo?.symbol || address?.slice(0, 10)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Name</span>
            <span>{tokenInfo?.name || 'Unknown'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Registry Status</span>
            {tokenInfo ? (
              <span className="inline-flex items-center gap-1 text-xs text-cyan-400">
                <CheckCircle className="h-3 w-3" /> Known Token
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                <AlertTriangle className="h-3 w-3" /> Unknown — not in database
              </span>
            )}
          </div>
        </div>

        {/* Token Address Comparison — migrated from PoolConfidencePopup */}
        {uniquePoolTokens.length > 0 && (
          <div className="pt-2 border-t border-white/5">
            <div className="text-xs text-gray-400 mb-3 font-medium">Token Address Comparison (from pools)</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-gray-500">
                  <th className="py-1.5 text-left">Symbol</th>
                  <th className="py-1.5 text-left">Address in Pools</th>
                  <th className="py-1.5 text-center">Status</th>
                  <th className="py-1.5 text-center">Safety</th>
                </tr>
              </thead>
              <tbody>
                {uniquePoolTokens.map((t, idx) => {
                  const verified = t.symbol ? verifiedTokens[t.symbol] : undefined
                  const matchesKnown = verified?.some(v => v.address.toLowerCase() === t.address?.toLowerCase())
                  return (
                    <Fragment key={idx}>
                      <tr className="border-b border-white/5">
                        <td className="py-1.5 text-white font-medium">{t.symbol ?? '--'}</td>
                        <td className="py-1.5 font-mono text-gray-300">
                          {t.address ? (
                            <a href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${t.address}`}
                              target="_blank" rel="noopener noreferrer"
                              className="hover:text-cyan-400 transition-colors"
                            >
                              {t.address.slice(0, 10)}...{t.address.slice(-8)}
                            </a>
                          ) : '--'}
                        </td>
                        <td className="py-1.5 text-center">
                          {!t.address ? <span className="text-gray-600">--</span>
                            : matchesKnown ? <span className="text-cyan-400 font-bold">Known</span>
                            : verified && verified.length > 0 ? <span className="text-red-400 font-bold">Mismatch</span>
                            : <span className="text-yellow-400">Unknown</span>}
                        </td>
                        <td className="py-1.5 text-center">
                          {t.address && (
                            <Link to={`/token/${t.address}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors"
                              title={`Token Safety analysis for ${t.symbol}`}
                            >
                              <Shield className="h-3 w-3" />
                              <span className="text-[10px] font-medium">Analyze</span>
                            </Link>
                          )}
                        </td>
                      </tr>
                      {/* Show real known address if mismatch */}
                      {verified && verified.length > 0 && !matchesKnown && (
                        <tr className="border-b border-white/5 bg-red-500/5">
                          <td className="py-1 text-cyan-400/60 pl-4 text-[10px]">Real {t.symbol}</td>
                          <td className="py-1 font-mono text-cyan-400/80">
                            <a href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${verified[0].address}`}
                              target="_blank" rel="noopener noreferrer"
                              className="hover:text-cyan-300 transition-colors"
                            >
                              {verified[0].address.slice(0, 10)}...{verified[0].address.slice(-8)}
                            </a>
                          </td>
                          <td className="py-1 text-center text-cyan-400 font-bold">Known</td>
                          <td className="py-1 text-center">
                            <Link to={`/token/${verified[0].address}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors"
                              title={`Token Safety for real ${t.symbol}`}
                            >
                              <Shield className="h-3 w-3" />
                              <span className="text-[10px] font-medium">Analyze</span>
                            </Link>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-600 mt-2">
              "Known" means the token exists in our database (auto-populated by trading volume). This is not a manual verification or endorsement.
              A "Mismatch" means this pool uses a different contract than the established token with the same symbol.
            </p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ⑦ ACTIVITY TIMELINE (10 pts)
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="timeline" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#00D4FF]" />
          <span className="text-white/30">⑦</span>
          Activity Timeline
        </h3>
        <SubScore label="Age" score={safety.age_score} max={10} icon={<Clock className="h-4 w-4" />} />

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Token Age</span>
            <span className="font-medium">{Math.floor(safety.age_days)} days</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Last Analyzed</span>
            <span className="text-gray-300">{new Date(safety.analyzed_at).toLocaleString()}</span>
          </div>
        </div>

        {/* Pool Monitoring History — migrated from PoolConfidencePopup */}
        {monitoringHistory.length > 0 && (
          <>
            <button
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#00D4FF] hover:text-white rounded-lg border border-[#00D4FF]/30 bg-[#00D4FF]/5 hover:bg-[#00D4FF]/10 py-2.5 transition-colors"
            >
              {historyExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {historyExpanded ? 'Hide monitoring history' : `View monitoring history (${monitoringHistory.length} snapshots)`}
            </button>

            {historyExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500">
                      <th className="py-2 text-center">Date</th>
                      <th className="py-2 text-center">Pool</th>
                      <th className="py-2 text-center">Confidence</th>
                      <th className="py-2 text-center">Legitimate</th>
                      <th className="py-2 text-center">Reserve USD</th>
                      <th className="py-2 text-center">Volume 24h</th>
                      <th className="py-2 text-center">Spam Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitoringHistory.map((snap, i) => {
                      const sConf = CONFIDENCE_INFO[snap.pool_confidence] ?? CONFIDENCE_INFO.suspect
                      const prevSnap = monitoringHistory[i + 1]
                      const changed = prevSnap && prevSnap.pair_address === snap.pair_address &&
                        (prevSnap.pool_confidence !== snap.pool_confidence || prevSnap.pool_is_legitimate !== snap.pool_is_legitimate)
                      return (
                        <tr key={i} className={`border-b border-white/5 ${changed ? 'bg-yellow-500/5' : ''}`}>
                          <td className="py-1.5 text-center text-gray-400 whitespace-nowrap">
                            {new Date(snap.snapshot_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {changed && <span className="ml-1 text-yellow-400" title="Status changed">*</span>}
                          </td>
                          <td className="py-1.5 text-center text-gray-300 whitespace-nowrap">
                            {snap.token0_symbol}/{snap.token1_symbol}
                          </td>
                          <td className={`py-1.5 text-center font-medium ${sConf.color}`}>{sConf.label}</td>
                          <td className={`py-1.5 text-center ${snap.pool_is_legitimate ? 'text-emerald-400' : 'text-red-400 font-bold'}`}>
                            {snap.pool_is_legitimate ? 'Yes' : 'No'}
                          </td>
                          <td className="py-1.5 text-center text-gray-300">
                            {snap.reserve_usd != null ? formatUsdCompact(snap.reserve_usd) : '--'}
                          </td>
                          <td className="py-1.5 text-center text-gray-300">
                            {snap.volume_24h_usd != null ? formatUsdCompact(snap.volume_24h_usd) : '--'}
                          </td>
                          <td className="py-1.5 text-center text-red-400/70 max-w-[200px] truncate" title={snap.pool_spam_reason || undefined}>
                            {snap.pool_spam_reason
                              ? formatSpamReason(snap.pool_spam_reason, snap.token0_symbol, snap.token1_symbol).map(r => r.explanation).join(' ')
                              : <span className="text-gray-600">--</span>}
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

        {monitoringHistory.length === 0 && livePools.length > 0 && (
          <p className="text-xs text-gray-500 text-center py-2">No monitoring history available yet. Snapshots are recorded every 6 hours.</p>
        )}

        <p className="text-[10px] text-gray-600 text-center">
          Analysis by token_monitoring indexer (runs every 6 hours). Not real-time. Not investment advice.
        </p>
      </div>
    </div>
  )
}
