import { useState, useEffect, Fragment } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Shield, AlertTriangle, CheckCircle, XCircle, ExternalLink, ArrowLeft, Loader2, Clock, Users, FileCode, Droplets, Fingerprint, Activity, Info } from 'lucide-react'
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

interface HoneypotDetail {
  is_honeypot: boolean | null
  buy_tax_pct: number | null
  sell_tax_pct: number | null
  transfer_tax_pct: number | null
  buy_gas: number | null
  sell_gas: number | null
  max_tx_amount: string | null
  max_wallet_amount: string | null
  dynamic_tax: boolean
  tax_by_amount: Record<string, { buy_tax: number | null; sell_tax: number | null; error?: boolean }> | null
  flags: string[]
  router: string | null
  error: string | null
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
  pool_risk_score: number | null
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

// Leagues holder data for section ⑤
interface LeagueHolder {
  holder_address: string
  balance_pct: number
  tier: string
  family_id: string | null
}

interface LeagueFamily {
  family_id: string
  mother_address: string
  daughter_count: number
  combined_balance_pct: number
  combined_tier: string
  link_types: string[]
}

interface LeagueSummary {
  total_holders: number
  poseidon_count: number
  whale_count: number
  shark_count: number
  dolphin_count: number
  squid_count: number
  turtle_count: number
  updated_at: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Tokens tracked by the Leagues module (holder_leagues scraper)
const LEAGUE_TOKEN_ADDRESSES: Record<string, string> = {
  '0xa1077a294dde1b09bb078844df40758a5d0f9a27': 'PLS',
  '0x95b303987a60c71504d99aa1b13b4da07b0790ab': 'PLSX',
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39': 'pHEX',
  '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d': 'INC',
}

// Canonical token registry — curated list of verified token addresses
// This replaces the unreliable "search by symbol in pulsechain_tokens" approach (Finding #3)
// Status: Canonical (address matches) / Address differs (symbol match, wrong address) / Unlisted (not in registry)
const CANONICAL_TOKENS: Record<string, { address: string; name: string; source: string }> = {
  // Native & Core
  WPLS: { address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', name: 'Wrapped Pulse', source: 'native' },
  PLS: { address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', name: 'PulseChain', source: 'native' },
  HEX: { address: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', name: 'HEX', source: 'native' },
  PLSX: { address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab', name: 'PulseX', source: 'native' },
  INC: { address: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', name: 'Incentive', source: 'native' },
  // Bridged stablecoins
  DAI: { address: '0xefd766ccb38eaf1dfd701853bfce31359239f305', name: 'Dai (bridged)', source: 'bridge' },
  USDC: { address: '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07', name: 'USD Coin (bridged)', source: 'bridge' },
  USDT: { address: '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f', name: 'Tether (bridged)', source: 'bridge' },
  // Bridged assets
  WETH: { address: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', name: 'Wrapped Ether (bridged)', source: 'bridge' },
  WBTC: { address: '0xb17d901469b9208b17d916112988a3fed19b5ca1', name: 'Wrapped Bitcoin (bridged)', source: 'bridge' },
  // DeFi tokens
  HEDRON: { address: '0x3819f64f282bf135d62168c1e513280daf905e06', name: 'Hedron', source: 'pulsex_top' },
  eHEX: { address: '0x57fde0a71132198bbec939b98976993d8d89d225', name: 'HEX (Ethereum)', source: 'bridge' },
  MAXI: { address: '0x0d86eb9f43c57f6ff3bc9e23d8f9d82503f0e84b', name: 'Maximus', source: 'pulsex_top' },
  // Top tokens by liquidity
  LOAN: { address: '0x9159f1d2a9f51998fc9ab03fbd8f265ab14a1b3b', name: 'Liquid Loans', source: 'pulsex_top' },
  USDL: { address: '0x0defe0442277c3e8e7b0e3c9ca2acac65116ff25', name: 'USDL Stablecoin', source: 'pulsex_top' },
  CST: { address: '0x5b44e5891bfa780099c3485e4bdc1161da3a2981', name: 'CST', source: 'pulsex_top' },
  BEAR: { address: '0x06e678c8884f136e2a488c027a3ac7520e260749', name: 'Bear', source: 'pulsex_top' },
  FLEX: { address: '0x98505e3f52c6c810ef4d2de3a6b4bea8e5caa563', name: 'FLEX', source: 'pulsex_top' },
  SPARK: { address: '0x6386704cd6f7a584ea9d23ccca66af7eba5a727e', name: 'SparkSwap', source: 'pulsex_top' },
  pDAI: { address: '0x6b175474e89094c44da98b954eedeac495271d0f', name: 'DAI (Ethereum fork)', source: 'fork' },
}

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

const TIER_COLORS: Record<string, string> = {
  poseidon: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  whale: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  shark: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  dolphin: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  squid: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  turtle: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
}

const TIER_EMOJI: Record<string, string> = {
  poseidon: '\u{1F30A}',
  whale: '\u{1F40B}',
  shark: '\u{1F988}',
  dolphin: '\u{1F42C}',
  squid: '\u{1F991}',
  turtle: '\u{1F422}',
}

const TIER_THRESHOLDS: Record<string, string> = {
  poseidon: '10%+ of supply',
  whale: '1%+ of supply',
  shark: '0.1%+ of supply',
  dolphin: '0.01%+ of supply',
  squid: '0.001%+ of supply',
  turtle: '0.0001%+ of supply',
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
// P3-A: add actionable recommendations per spam reason type
function formatSpamReason(raw: string | null, baseSymbol?: string | null, quoteSymbol?: string | null, pageAddress?: string | null, baseAddress?: string | null, quoteAddress?: string | null): { code: string; explanation: string; action?: string }[] {
  if (!raw) return []
  const t0 = baseSymbol || 'Base token'
  const t1 = quoteSymbol || 'Quote token'
  const pa = pageAddress?.toLowerCase()
  return raw.split('; ').filter(part => {
    // Don't flag the monitored token as "unknown" on its own page (stale cache safety net)
    const k = part.split(':')[0].trim()
    if (k === 'unknown_token0' && pa && baseAddress?.toLowerCase() === pa) return false
    if (k === 'unknown_token1' && pa && quoteAddress?.toLowerCase() === pa) return false
    return true
  }).map(part => {
    const [code, val] = part.split(':')
    const key = code.trim()
    if (key.startsWith('low_reserve')) {
      return {
        code: part,
        explanation: `Pool reserves are extremely low ($${val ?? '< 100'} USD). Legitimate pools typically have significantly higher reserves.`,
        action: 'This pool has almost no capital. Trades here will have extreme price impact.',
      }
    }
    // Handle spam_name_token0/token1 patterns
    if (key === 'spam_name_token0') {
      return {
        code: part,
        explanation: `The name of ${t0} contains a flagged keyword: '${val ?? 'unknown'}'.`,
        action: `Token names containing '${val ?? 'flagged keywords'}' are commonly associated with scam/test tokens.`,
      }
    }
    if (key === 'spam_name_token1') {
      return {
        code: part,
        explanation: `The name of ${t1} contains a flagged keyword: '${val ?? 'unknown'}'.`,
        action: `Token names containing '${val ?? 'flagged keywords'}' are commonly associated with scam/test tokens.`,
      }
    }
    const map: Record<string, { explanation: string; action: string }> = {
      unknown_token0: {
        explanation: `${t0} is not recognized in our token database.`,
        action: 'Check the contract address on PulseChain Scan. Compare with the official token website.',
      },
      unknown_token1: {
        explanation: `${t1} is not recognized in our token database.`,
        action: 'Check the contract address on PulseChain Scan. Compare with the official token website.',
      },
      low_volume_token0: {
        explanation: `${t0} has very low all-time trading volume (< $1,000), indicating an inactive or fake token.`,
        action: 'Low volume means high slippage and potential exit difficulty.',
      },
      low_volume_token1: {
        explanation: `${t1} has very low all-time trading volume (< $1,000), indicating an inactive or fake token.`,
        action: 'Low volume means high slippage and potential exit difficulty.',
      },
      spam_name: {
        explanation: `One of the token names contains a spam keyword (e.g. "airdrop", "free", "claim", "test").`,
        action: 'Token names with promotional keywords are commonly associated with scam tokens.',
      },
      no_liquidity_token0: {
        explanation: `${t0} has zero or near-zero liquidity in this pool.`,
        action: 'No liquidity means you cannot sell this token. Do not buy.',
      },
      no_liquidity_token1: {
        explanation: `${t1} has zero or near-zero liquidity in this pool.`,
        action: 'No liquidity means you cannot sell this token. Do not buy.',
      },
    }
    const entry = map[key]
    if (entry) return { code: part, ...entry }
    return { code: part, explanation: `Flagged: ${part}` }
  })
}

// ─── Popup Panel (modal overlay) ─────────────────────────────────────────────

function PopupPanel({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md" onClick={onClose}>
      <div className="relative w-full max-w-4xl max-h-[85vh] mx-4 rounded-2xl border border-white/10 bg-gray-900 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
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

function ContractCheckRow({ label, badge, tooltip, href }: { label: string; badge: React.ReactNode; tooltip: string; href: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      <span className="flex items-center gap-2">
        {badge}
        <span className="group relative">
          <Info className="h-3 w-3 text-gray-600 hover:text-[#00D4FF] cursor-help transition-colors" />
          <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-64 rounded-lg bg-gray-800 border border-white/10 px-3 py-2 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
            {tooltip}
          </span>
        </span>
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#00D4FF] transition-colors" title="Verify on Explorer">
          <ExternalLink className="h-3 w-3" />
        </a>
      </span>
    </div>
  )
}

function ConfidenceBadge({ level }: { level: string | null }) {
  const conf = CONFIDENCE_INFO[level ?? ''] ?? CONFIDENCE_INFO.suspect
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${conf.bg} ${conf.color} cursor-help`}
      title={conf.explanation}
    >
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
  const [poolsOpen, setPoolsOpen] = useState(false)

  // Section ③: Deployer reputation
  const [deployer, setDeployer] = useState<DeployerInfo | null>(null)
  const [deployerLoading, setDeployerLoading] = useState(true)

  // Section ⑤: Leagues integration (whale/holder tier data)
  const [leagueSummary, setLeagueSummary] = useState<LeagueSummary | null>(null)
  const [leagueHolders, setLeagueHolders] = useState<LeagueHolder[]>([])
  const [leagueFamilies, setLeagueFamilies] = useState<LeagueFamily[]>([])
  const [leagueOpen, setLeagueOpen] = useState(false)

  // Section ⑥: Token identity comparison
  const [verifiedTokens, setVerifiedTokens] = useState<Record<string, VerifiedToken[]>>({})

  // Section ⑦: Monitoring history + confidence events
  const [monitoringHistory, setMonitoringHistory] = useState<MonitoringSnapshot[]>([])
  const [confidenceEvents, setConfidenceEvents] = useState<{ pair_address: string; event_summary: string; prev_confidence: string; new_confidence: string; created_at: string }[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  // P0-C: Safety API health check
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)

  // Honeypot detail popup (enriched from Safety API)
  const [honeypotOpen, setHoneypotOpen] = useState(false)
  const [honeypotDetail, setHoneypotDetail] = useState<HoneypotDetail | null>(null)
  const [honeypotLoading, setHoneypotLoading] = useState(false)

  const loadHoneypotDetail = () => {
    setHoneypotOpen(true)
    if (honeypotDetail || !address) return
    setHoneypotLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    fetch(`${SAFETY_API}/api/v1/token/${address.toLowerCase()}/safety?fresh=true`, { signal: ctrl.signal })
      .then(r => { clearTimeout(t); if (!r.ok) throw new Error(`API ${r.status}`); return r.json() })
      .then(json => {
        const hp = json.data?.honeypot
        if (hp) setHoneypotDetail(hp)
        setHoneypotLoading(false)
      })
      .catch(() => setHoneypotLoading(false))
  }

  // Legacy: Safety API pair list (anchored/capped analysis)
  const [pairs, setPairs] = useState<LiquidityPair[]>([])
  const [pairsOpen, setPairsOpen] = useState(false)
  const [pairsLoading, setPairsLoading] = useState(false)

  const loadPairs = () => {
    if (pairs.length > 0) { setPairsOpen(true); return }
    if (!address) return
    setPairsOpen(true)
    setPairsLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    fetch(`${SAFETY_API}/api/v1/token/${address.toLowerCase()}/liquidity?fresh=true`, { signal: controller.signal })
      .then(r => { clearTimeout(timeout); if (!r.ok) throw new Error(`API ${r.status}`); return r.json() })
      .then(json => { setPairs(json.pairs || []); setPairsLoading(false) })
      .catch(() => setPairsLoading(false))
  }

  // P0-C: Health check on mount — detect if Safety API is available
  useEffect(() => {
    if (!SAFETY_API) { setApiAvailable(false); return }
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    fetch(`${SAFETY_API}/health`, { signal: ctrl.signal })
      .then(r => { clearTimeout(t); setApiAvailable(r.ok) })
      .catch(() => { clearTimeout(t); setApiAvailable(false) })
  }, [])

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
        } else if (SAFETY_API && apiAvailable !== false) {
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
            .catch(() => { setError('Safety API unavailable. Try again later.'); setApiAvailable(false); setAnalyzing(false) })
        } else {
          setError(apiAvailable === false
            ? 'Safety analysis temporarily unavailable. The token has not been analyzed yet.'
            : 'No safety score available yet for this token.')
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

        // 3a-bis. Confidence transition events (from pool_confidence_events table)
        supabase
          .from('pool_confidence_events')
          .select('pair_address, event_summary, prev_confidence, new_confidence, created_at')
          .in('pair_address', pairAddresses)
          .order('created_at', { ascending: false })
          .limit(50)
          .then(({ data }) => setConfidenceEvents((data ?? []) as typeof confidenceEvents))

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
      .then(json => {
        if (json.data) {
          const d = json.data
          setDeployer({
            deployer_address: d.deployer || d.deployer_address || '',
            tokens_deployed: d.tokens_deployed ?? 0,
            dead_tokens: d.tokens_dead ?? d.dead_tokens ?? 0,
            mortality_rate: (d.dead_ratio ?? 0) / 100,
            risk_level: d.risk_level ?? 'unknown',
          })
        }
        setDeployerLoading(false)
      })
      .catch(() => setDeployerLoading(false))

    // ── 5. Leagues data (holder tiers — only for tracked tokens) ──
    const leagueSymbol = LEAGUE_TOKEN_ADDRESSES[addr]
    if (leagueSymbol) {
      // Summary (tier counts)
      supabase
        .from('holder_league_current')
        .select('total_holders, poseidon_count, whale_count, shark_count, dolphin_count, squid_count, turtle_count, updated_at')
        .eq('token_symbol', leagueSymbol)
        .single()
        .then(({ data }) => { if (data) setLeagueSummary(data as LeagueSummary) })

      // Top holders (limit to top tiers for display)
      supabase
        .from('holder_league_addresses')
        .select('holder_address, balance_pct, tier, family_id')
        .eq('token_symbol', leagueSymbol)
        .in('tier', ['poseidon', 'whale', 'shark'])
        .order('balance_pct', { ascending: false })
        .limit(20)
        .then(({ data }) => setLeagueHolders((data ?? []) as LeagueHolder[]))

      // Families (whale clusters)
      supabase
        .from('holder_league_families')
        .select('family_id, mother_address, daughter_count, combined_balance_pct, combined_tier, link_types')
        .eq('token_symbol', leagueSymbol)
        .order('combined_balance_pct', { ascending: false })
        .limit(10)
        .then(({ data }) => setLeagueFamilies((data ?? []) as LeagueFamily[]))
    }

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
        <p className="text-gray-500 mb-4">{error || 'Token not analyzed yet.'}</p>
        {apiAvailable === false && (
          <div className="inline-block rounded-lg bg-orange-500/10 border border-orange-500/20 px-4 py-2 mb-4">
            <p className="text-orange-400 text-sm">Safety analysis service is currently unavailable. Cached scores are still displayed where available.</p>
          </div>
        )}
        <div>
          <Link to="/safety" className="inline-flex items-center gap-2 text-[#00D4FF] hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Safety Dashboard
          </Link>
        </div>
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

  // Detect transitions: live pool confidence vs last monitoring snapshot
  const poolTransitions: Record<string, { from: string; to: string }> = {}
  for (const pool of livePools) {
    const lastSnap = monitoringHistory.find(s => s.pair_address === pool.pair_address)
    if (lastSnap && lastSnap.pool_confidence !== (pool.pool_confidence ?? 'suspect')) {
      poolTransitions[pool.pair_address] = {
        from: lastSnap.pool_confidence,
        to: pool.pool_confidence ?? 'suspect',
      }
    }
  }
  const hasAnyTransition = Object.keys(poolTransitions).length > 0

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

      {/* ── Grid: 2-column layout for modules ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* ══════════════════════════════════════════════════════════════════════
          ① CONTRACT ANALYSIS (25 pts)
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="contract" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <FileCode className="h-4 w-4 text-[#00D4FF]" />
          Contract Analysis
          <a
            href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${address}`}
            target="_blank" rel="noopener noreferrer"
            className="ml-auto text-[10px] text-gray-600 hover:text-[#00D4FF] transition-colors flex items-center gap-1 font-normal normal-case tracking-normal"
          >
            Verify on Explorer <ExternalLink className="h-3 w-3" />
          </a>
        </h3>
        <SubScore label="Contract" score={safety.contract_score} max={25} icon={<FileCode className="h-4 w-4" />} />
        <div className="space-y-2 text-sm">
          <ContractCheckRow
            label="Source Code Verified"
            badge={<BoolBadge value={safety.is_verified} trueLabel="Verified on Explorer" falseLabel="Not verified" />}
            tooltip='Explorer → onglet "Contract" → badge "Contract Source Code Verified"'
            href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${address}?tab=contract`}
          />
          <ContractCheckRow
            label="Proxy Contract"
            badge={<BoolBadge value={safety.is_proxy ? false : true} trueLabel="No proxy" falseLabel="Upgradeable (proxy)" />}
            tooltip='Explorer → "Read Contract" → chercher implementation() ou upgradeTo()'
            href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${address}?tab=read_contract`}
          />
          <ContractCheckRow
            label="Ownership"
            badge={<BoolBadge value={safety.ownership_renounced} trueLabel="Renounced" falseLabel="Active owner" />}
            tooltip='Explorer → "Read Contract" → appeler owner() — si 0x000...000 = renounced'
            href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${address}?tab=read_contract`}
          />
          <ContractCheckRow
            label="Mint Function"
            badge={<BoolBadge value={!safety.has_mint} trueLabel="No mint" falseLabel="Can mint new tokens" />}
            tooltip='Explorer → "Write Contract" → chercher mint() ou _mint() dans les fonctions'
            href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${address}?tab=write_contract`}
          />
          <ContractCheckRow
            label="Blacklist"
            badge={<BoolBadge value={!safety.has_blacklist} trueLabel="No blacklist" falseLabel="Can blacklist addresses" />}
            tooltip='Explorer → "Read/Write Contract" → chercher blacklist(), isBlacklisted(), addToBlacklist()'
            href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${address}?tab=read_contract`}
          />
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
          HONEYPOT TEST (30 pts) — summary card + popup detail
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="honeypot" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#00D4FF]" />
          Honeypot Test
        </h3>
        <SubScore label="Honeypot" score={safety.honeypot_score} max={30} icon={<Shield className="h-4 w-4" />} />

        {/* Verdict banner */}
        <div className={`rounded-lg px-4 py-3 text-center font-bold text-lg ${
          safety.is_honeypot === true
            ? 'bg-red-500/20 border border-red-500/30 text-red-400'
            : safety.is_honeypot === false
              ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400'
              : 'bg-gray-700/30 border border-gray-600/30 text-gray-400'
        }`}>
          {safety.is_honeypot === true ? 'HONEYPOT DETECTED' : safety.is_honeypot === false ? 'NOT A HONEYPOT' : 'INCONCLUSIVE'}
        </div>

        <div className="space-y-2 text-sm">
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

        <button
          onClick={loadHoneypotDetail}
          className="w-full py-2 rounded-lg border border-[#00D4FF]/20 text-[#00D4FF] text-sm hover:bg-[#00D4FF]/10 transition-colors"
        >
          View full honeypot analysis
        </button>

        <p className="text-[10px] text-gray-600">
          Tested via FeeChecker on-chain simulation on PulseX V1 + V2 routers.
          {' '}
          <a
            href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${address}?tab=contract`}
            target="_blank" rel="noopener noreferrer"
            className="text-[#00D4FF]/60 hover:text-[#00D4FF] transition-colors inline-flex items-center gap-0.5"
          >
            View contract <ExternalLink className="h-2.5 w-2.5 inline" />
          </a>
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ③ DEPLOYER REPUTATION (informational)
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="deployer" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-[#00D4FF]" />
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
              onClick={() => setPoolsOpen(true)}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#00D4FF] hover:text-white rounded-lg border border-[#00D4FF]/30 bg-[#00D4FF]/5 hover:bg-[#00D4FF]/10 py-2.5 transition-colors"
            >
              {`View all ${livePools.length} pools with confidence`}
            </button>

            {/* ── HONEYPOT DETAIL POPUP (style HoneyPot.is) ── */}
            <PopupPanel open={honeypotOpen} onClose={() => setHoneypotOpen(false)} title="Honeypot Analysis — On-Chain Simulation">
              {honeypotLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-[#00D4FF]" />
                  <span className="ml-2 text-gray-400">Running on-chain simulation...</span>
                </div>
              ) : (() => {
                const hp = honeypotDetail
                const buyTax = hp?.buy_tax_pct ?? safety.buy_tax_pct
                const sellTax = hp?.sell_tax_pct ?? safety.sell_tax_pct
                const transferTax = hp?.transfer_tax_pct ?? null
                const isHp = hp?.is_honeypot ?? safety.is_honeypot
                const buyGas = hp?.buy_gas ?? null
                const sellGas = hp?.sell_gas ?? null
                const maxTx = hp?.max_tx_amount ?? null
                const maxWallet = hp?.max_wallet_amount ?? null
                const dynTax = hp?.dynamic_tax ?? false
                const taxByAmt = hp?.tax_by_amount ?? null
                const flags = hp?.flags ?? []
                const router = hp?.router ?? null

                return (
                <div className="space-y-5">
                  {/* Verdict banner */}
                  <div className={`rounded-xl px-6 py-5 text-center ${
                    isHp === true
                      ? 'bg-red-500/20 border-2 border-red-500/40'
                      : isHp === false
                        ? 'bg-emerald-500/15 border-2 border-emerald-500/30'
                        : 'bg-gray-700/30 border-2 border-gray-600/30'
                  }`}>
                    <div className={`text-2xl font-black tracking-wide ${
                      isHp === true ? 'text-red-400' : isHp === false ? 'text-emerald-400' : 'text-gray-400'
                    }`}>
                      {isHp === true ? 'HONEYPOT DETECTED' : isHp === false ? 'NOT A HONEYPOT' : 'INCONCLUSIVE'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {isHp === true
                        ? 'This token cannot be sold. Do NOT buy.'
                        : isHp === false
                          ? 'On-chain simulation confirms this token can be bought and sold.'
                          : 'Simulation failed — manual verification recommended.'}
                    </p>
                  </div>

                  {/* Tax breakdown */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-gray-800/60 border border-white/5 p-4 text-center">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Buy Tax</div>
                      <div className={`text-xl font-bold ${(buyTax ?? 0) > 10 ? 'text-orange-400' : 'text-white'}`}>
                        {buyTax != null ? `${buyTax}%` : '-'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-800/60 border border-white/5 p-4 text-center">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Sell Tax</div>
                      <div className={`text-xl font-bold ${(sellTax ?? 0) > 10 ? 'text-red-400' : 'text-white'}`}>
                        {sellTax != null ? `${sellTax}%` : '-'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-800/60 border border-white/5 p-4 text-center">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Transfer Tax</div>
                      <div className={`text-xl font-bold ${(transferTax ?? 0) > 0 ? 'text-amber-400' : 'text-white'}`}>
                        {transferTax != null ? `${transferTax}%` : '-'}
                      </div>
                    </div>
                  </div>

                  {/* Gas estimation */}
                  {(buyGas != null || sellGas != null) && (
                    <div className="rounded-lg bg-gray-800/40 border border-white/5 p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gas Estimation</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Buy Gas</span>
                          <span className={buyGas && buyGas > 2_000_000 ? 'text-orange-400' : 'text-gray-300'}>
                            {buyGas != null ? buyGas.toLocaleString() : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Sell Gas</span>
                          <span className={sellGas && sellGas > 3_500_000 ? 'text-red-400' : 'text-gray-300'}>
                            {sellGas != null ? sellGas.toLocaleString() : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Max transaction / wallet limits */}
                  {(maxTx || maxWallet) && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Transaction Limits
                      </h4>
                      <div className="space-y-1 text-sm">
                        {maxTx && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Max Transaction</span>
                            <span className="text-amber-300 font-mono text-xs">{maxTx}</span>
                          </div>
                        )}
                        {maxWallet && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Max Wallet</span>
                            <span className="text-amber-300 font-mono text-xs">{maxWallet}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Variable amount tax breakdown */}
                  {taxByAmt && Object.keys(taxByAmt).length > 0 && (
                    <div className="rounded-lg bg-gray-800/40 border border-white/5 p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        Tax by Amount
                        {dynTax && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
                            DYNAMIC TAX
                          </span>
                        )}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b border-white/5">
                              <th className="text-left py-1.5 pr-4">Amount (PLS)</th>
                              <th className="text-right py-1.5 px-2">Buy Tax</th>
                              <th className="text-right py-1.5 pl-2">Sell Tax</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(taxByAmt).map(([amt, taxes]) => (
                              <tr key={amt} className="border-b border-white/5">
                                <td className="py-1.5 pr-4 text-gray-300 font-mono">{amt}</td>
                                <td className="py-1.5 px-2 text-right">
                                  {taxes.error ? (
                                    <span className="text-gray-600">Failed</span>
                                  ) : taxes.buy_tax != null ? (
                                    <span className={taxes.buy_tax > 10 ? 'text-orange-400' : 'text-gray-300'}>{taxes.buy_tax}%</span>
                                  ) : <span>-</span>}
                                </td>
                                <td className="py-1.5 pl-2 text-right">
                                  {taxes.error ? (
                                    <span className="text-gray-600">Failed</span>
                                  ) : taxes.sell_tax != null ? (
                                    <span className={taxes.sell_tax > 10 ? 'text-red-400' : 'text-gray-300'}>{taxes.sell_tax}%</span>
                                  ) : <span>-</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Warning flags */}
                  {flags.length > 0 && (
                    <div className="rounded-lg bg-gray-800/40 border border-white/5 p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Warning Flags</h4>
                      <div className="flex flex-wrap gap-2">
                        {flags.map((flag, i) => (
                          <span key={i} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                            ['honeypot', 'extreme_tax'].includes(flag)
                              ? 'bg-red-500/15 text-red-400 border-red-500/30'
                              : ['high_buy_tax', 'high_sell_tax', 'high_gas', 'dynamic_tax'].includes(flag)
                                ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {flag.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Technical risks */}
                  <div className="rounded-lg bg-gray-800/30 border border-white/5 p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Technical Risks</h4>
                    <ul className="text-[11px] text-gray-600 space-y-1 list-disc list-inside">
                      <li>Gas estimation may fail for tokens requiring specific approvals</li>
                      <li>Max TX/Wallet detection only works for tokens with public getter functions</li>
                      <li>Dynamic tax detection tests 4 amounts (0.1, 1, 10, 100 PLS) — edge cases possible</li>
                      <li>Transfer tax is inferred from bytecode analysis — may not capture all implementations</li>
                    </ul>
                  </div>

                  {/* Simulation info */}
                  <div className="text-center space-y-1">
                    <p className="text-[10px] text-gray-600">
                      Router: {router ?? 'Unknown'} | Simulated via FeeChecker on PulseX V1 + V2
                    </p>
                    <p className="text-[10px] text-amber-500/70">
                      This is not a foolproof method. Just because it's not a honeypot now, does not mean it won't change.
                    </p>
                  </div>
                </div>
                )
              })()}
            </PopupPanel>

            <PopupPanel open={poolsOpen} onClose={() => setPoolsOpen(false)} title={`All ${livePools.length} Pools — Confidence Analysis`}>
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
                      <th className="py-2 text-center" title="Pool risk score (0-100, higher is safer)">Risk</th>
                      <th className="py-2 text-center">DexScreener</th>
                    </tr>
                  </thead>
                  <tbody>
                    {livePools.map((pool, i) => {
                      const spamReasons = formatSpamReason(pool.pool_spam_reason, pool.base_token_symbol, pool.quote_token_symbol, address, pool.base_token_address, pool.quote_token_address)
                      const transition = poolTransitions[pool.pair_address]
                      return (
                        <Fragment key={pool.pair_address}>
                          <tr className={`border-b border-white/5 ${(pool.pool_risk_score != null ? pool.pool_risk_score < 30 : !pool.pool_is_legitimate) ? 'opacity-60' : ''}`}>
                            <td className="py-2 text-gray-600">{i + 1}</td>
                            <td className="py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-white font-medium">
                                  {pool.base_token_symbol}/{pool.quote_token_symbol}
                                </span>
                                {!pool.pool_is_legitimate && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 font-bold whitespace-nowrap">
                                    NOT LEGITIMATE
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 text-gray-400">{formatDexName(pool.dex_id)}</td>
                            <td className="py-2 text-right text-gray-300">
                              {pool.liquidity_usd != null ? formatUsdCompact(pool.liquidity_usd) : '--'}
                            </td>
                            <td className="py-2 text-right text-gray-300">
                              {pool.volume_24h_usd != null ? formatUsdCompact(pool.volume_24h_usd) : '--'}
                            </td>
                            <td className="py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <ConfidenceBadge level={pool.pool_confidence} />
                                {transition && (
                                  <span className="text-yellow-400 text-[9px]" title={`Recent transition: ${CONFIDENCE_INFO[transition.from]?.label ?? transition.from} → ${CONFIDENCE_INFO[transition.to]?.label ?? transition.to}`}>
                                    ↑
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 text-center">
                              {pool.pool_risk_score != null ? (
                                <span className={`font-mono text-[10px] font-bold ${
                                  pool.pool_risk_score >= 70 ? 'text-emerald-400'
                                  : pool.pool_risk_score >= 50 ? 'text-yellow-400'
                                  : pool.pool_risk_score >= 30 ? 'text-orange-400'
                                  : 'text-red-400'
                                }`} title={`Pool risk score: ${pool.pool_risk_score}/100`}>
                                  {pool.pool_risk_score}
                                </span>
                              ) : (
                                <span className="text-gray-600">—</span>
                              )}
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
                              <td colSpan={7} className="py-1.5 pb-2.5">
                                {spamReasons.map((r, j) => (
                                  <div key={j} className="text-xs text-red-400/80 leading-relaxed">
                                    <span className="font-mono text-red-400/50 mr-1">{r.code}</span>
                                    {r.explanation}
                                    {r.action && <span className="text-orange-400/80 ml-1">→ {r.action}</span>}
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
            </PopupPanel>
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
            onClick={apiAvailable === false ? undefined : loadPairs}
            disabled={apiAvailable === false}
            className={`w-full flex items-center justify-center gap-2 text-[11px] rounded-lg border border-white/5 py-2 transition-colors ${
              apiAvailable === false
                ? 'text-gray-600 cursor-not-allowed opacity-50'
                : 'text-gray-500 hover:text-gray-300 bg-white/[0.01] hover:bg-white/[0.03]'
            }`}
            title={apiAvailable === false ? 'Safety API temporarily unavailable' : undefined}
          >
            {apiAvailable === false ? 'Anchor analysis (API unavailable)' : 'Anchor analysis (Safety API)'}
          </button>
        )}

        <PopupPanel open={pairsOpen} onClose={() => setPairsOpen(false)} title="Anchor Analysis (Safety API)">
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
        </PopupPanel>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ⑤ HOLDER DISTRIBUTION (15 pts) + Leagues integration
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="holders" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Users className="h-4 w-4 text-[#00D4FF]" />
          Holder Distribution
          <a
            href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/token/${address}?tab=holders`}
            target="_blank" rel="noopener noreferrer"
            className="ml-auto text-[10px] text-gray-600 hover:text-[#00D4FF] transition-colors flex items-center gap-1 font-normal normal-case tracking-normal"
          >
            View holders <ExternalLink className="h-3 w-3" />
          </a>
        </h3>
        <SubScore label="Holders" score={safety.holders_score} max={15} icon={<Users className="h-4 w-4" />} />
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Total Holders</span>
            <span className="font-medium">
              {leagueSummary ? leagueSummary.total_holders.toLocaleString() : (safety.holder_count || 0).toLocaleString()}
            </span>
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

        {/* Leagues tier distribution — only for tracked tokens */}
        {leagueSummary && (
          <div className="pt-3 border-t border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium">Holder Tier Distribution (Leagues)</span>
              <span className="text-[10px] text-gray-600">
                Updated {new Date(leagueSummary.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                ['poseidon', leagueSummary.poseidon_count],
                ['whale', leagueSummary.whale_count],
                ['shark', leagueSummary.shark_count],
                ['dolphin', leagueSummary.dolphin_count],
                ['squid', leagueSummary.squid_count],
                ['turtle', leagueSummary.turtle_count],
              ] as [string, number][]).map(([tier, count]) => (
                <div key={tier} className={`rounded-lg border px-2.5 py-1.5 ${TIER_COLORS[tier]}`} title={TIER_THRESHOLDS[tier]}>
                  <div className="text-[10px] uppercase tracking-wider opacity-70 flex items-center gap-1"><span>{TIER_EMOJI[tier]}</span>{tier}</div>
                  <div className="text-sm font-bold">{count.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* Top whales + family clusters (popup) */}
            {(leagueHolders.length > 0 || leagueFamilies.length > 0) && (
              <>
                <button
                  onClick={() => setLeagueOpen(true)}
                  className="w-full flex items-center justify-center gap-2 text-xs font-medium text-[#00D4FF] hover:text-white rounded-lg border border-[#00D4FF]/20 bg-[#00D4FF]/5 hover:bg-[#00D4FF]/10 py-2 transition-colors"
                >
                  {`View top holders & families (${leagueHolders.length} whales, ${leagueFamilies.length} clusters)`}
                </button>

                <PopupPanel open={leagueOpen} onClose={() => setLeagueOpen(false)} title={`Top Holders & Whale Families (${leagueHolders.length} whales, ${leagueFamilies.length} clusters)`}>
                  <div className="space-y-4">
                    {/* Top holders table */}
                    {leagueHolders.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Top Holders (Poseidon / Whale / Shark)</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-white/10 text-gray-500">
                                <th className="py-1.5 text-left">Address</th>
                                <th className="py-1.5 text-center">Tier</th>
                                <th className="py-1.5 text-right">% Supply</th>
                                <th className="py-1.5 text-center">Family</th>
                              </tr>
                            </thead>
                            <tbody>
                              {leagueHolders.map((h, i) => (
                                <tr key={i} className="border-b border-white/5">
                                  <td className="py-1.5 font-mono text-gray-300">
                                    <a
                                      href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${h.holder_address}`}
                                      target="_blank" rel="noopener noreferrer"
                                      className="hover:text-cyan-400 transition-colors"
                                    >
                                      {h.holder_address.slice(0, 8)}...{h.holder_address.slice(-6)}
                                    </a>
                                  </td>
                                  <td className="py-1.5 text-center">
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${TIER_COLORS[h.tier] || 'text-gray-400'}`}>
                                      {TIER_EMOJI[h.tier]}{h.tier}
                                    </span>
                                  </td>
                                  <td className={`py-1.5 text-right font-medium ${h.balance_pct > 5 ? 'text-red-400' : h.balance_pct > 1 ? 'text-orange-400' : ''}`}>
                                    {h.balance_pct.toFixed(4)}%
                                  </td>
                                  <td className="py-1.5 text-center">
                                    {h.family_id ? (
                                      <span className="text-purple-400 text-[10px]" title={`Family: ${h.family_id.slice(0, 10)}...`}>Clustered</span>
                                    ) : (
                                      <span className="text-gray-600">--</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Family clusters */}
                    {leagueFamilies.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Whale Family Clusters</div>
                        <div className="space-y-2">
                          {leagueFamilies.map((f, i) => (
                            <div key={i} className="rounded-lg bg-purple-500/5 border border-purple-500/10 px-3 py-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-purple-400 text-xs font-medium">Mother</span>
                                  <a
                                    href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${f.mother_address}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="text-xs font-mono text-gray-300 hover:text-cyan-400 transition-colors"
                                  >
                                    {f.mother_address.slice(0, 8)}...{f.mother_address.slice(-6)}
                                  </a>
                                </div>
                                <span className={`text-xs font-medium ${f.combined_balance_pct > 5 ? 'text-red-400' : 'text-orange-400'}`}>
                                  {f.combined_balance_pct.toFixed(3)}% combined
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                                <span>{f.daughter_count} daughter{f.daughter_count !== 1 ? 's' : ''}</span>
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border ${TIER_COLORS[f.combined_tier] || 'text-gray-400'}`}>{TIER_EMOJI[f.combined_tier]}{f.combined_tier}</span>
                                {f.link_types.map((lt, j) => (
                                  <span key={j} className="text-purple-400/60">{lt.replace(/_/g, ' ')}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Link
                      to="/leagues"
                      className="flex items-center justify-center gap-2 text-xs text-[#00D4FF] hover:text-white transition-colors"
                    >
                      View full Leagues page <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </PopupPanel>
              </>
            )}
          </div>
        )}

        {/* Message for non-tracked tokens */}
        {!leagueSummary && address && !LEAGUE_TOKEN_ADDRESSES[address.toLowerCase()] && (
          <p className="text-[10px] text-gray-600 text-center pt-2">
            Detailed tier distribution (Leagues) is available for core tokens: PLS, PLSX, pHEX, INC.
            <Link to="/leagues" className="text-[#00D4FF] hover:underline ml-1">View Leagues</Link>
          </p>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ⑥ TOKEN IDENTITY (informational)
          Phase E: Canonical registry replaces auto-populated pulsechain_tokens (Finding #3)
          Status: Canonical / Address differs / Unlisted
          ══════════════════════════════════════════════════════════════════════ */}
      <div id="identity" className="rounded-xl border border-white/5 bg-gray-900/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-[#00D4FF]" />
          Token Identity
          <span className="text-[10px] text-gray-600 font-normal normal-case tracking-normal ml-auto">Informational</span>
        </h3>

        {/* Token registry status — canonical check */}
        {(() => {
          const symbol = tokenInfo?.symbol?.toUpperCase()
          const canonical = symbol ? CANONICAL_TOKENS[symbol] : undefined
          const isCanonical = canonical && address && canonical.address.toLowerCase() === address.toLowerCase()
          const addressDiffers = canonical && address && canonical.address.toLowerCase() !== address.toLowerCase()
          return (
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
                <span className="text-gray-400">Canonical Status</span>
                {isCanonical ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-bold">
                    <CheckCircle className="h-3 w-3" /> Canonical
                  </span>
                ) : addressDiffers ? (
                  <span className="inline-flex items-center gap-1 text-xs text-red-400 font-bold">
                    <XCircle className="h-3 w-3" /> Address differs
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    Unlisted
                  </span>
                )}
              </div>
              {canonical && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Source</span>
                  <span className="text-xs text-gray-500">{canonical.source}</span>
                </div>
              )}
              {/* Warning banner for address mismatch */}
              {addressDiffers && canonical && (
                <div className="rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-2 mt-1">
                  <div className="text-xs text-red-300 font-bold mb-1">Impersonation Warning</div>
                  <p className="text-[11px] text-red-300/80">
                    This token uses the symbol "{tokenInfo?.symbol}" but its address does not match the canonical {canonical.name} ({canonical.address.slice(0, 10)}...{canonical.address.slice(-6)}).
                    This could be a fork copy, a scam, or a different token. Verify the contract before interacting.
                  </p>
                  <Link to={`/token/${canonical.address}`} className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-[#00D4FF] hover:underline">
                    <Shield className="h-3 w-3" /> View canonical {tokenInfo?.symbol}
                  </Link>
                </div>
              )}
            </div>
          )
        })()}

        {/* Token Address Comparison — dual check: canonical + known (from pools) */}
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
                  // Canonical registry check (curated, reliable)
                  const canonicalEntry = t.symbol ? CANONICAL_TOKENS[t.symbol.toUpperCase()] : undefined
                  const isCanonicalMatch = canonicalEntry && t.address && canonicalEntry.address.toLowerCase() === t.address.toLowerCase()
                  const isCanonicalMismatch = canonicalEntry && t.address && canonicalEntry.address.toLowerCase() !== t.address.toLowerCase()
                  // Fallback: pulsechain_tokens check (auto-populated, less reliable)
                  const knownTokens = t.symbol ? verifiedTokens[t.symbol] : undefined
                  const matchesKnown = knownTokens?.some(v => v.address.toLowerCase() === t.address?.toLowerCase())
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
                            : isCanonicalMatch ? <span className="text-emerald-400 font-bold">Canonical</span>
                            : isCanonicalMismatch ? <span className="text-red-400 font-bold">Address differs</span>
                            : matchesKnown ? <span className="text-cyan-400">Known</span>
                            : <span className="text-gray-500">Unlisted</span>}
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
                      {/* Show canonical address if mismatch */}
                      {isCanonicalMismatch && canonicalEntry && (
                        <tr className="border-b border-white/5 bg-red-500/5">
                          <td className="py-1 text-emerald-400/60 pl-4 text-[10px]">Canonical {t.symbol}</td>
                          <td className="py-1 font-mono text-emerald-400/80">
                            <a href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${canonicalEntry.address}`}
                              target="_blank" rel="noopener noreferrer"
                              className="hover:text-emerald-300 transition-colors"
                            >
                              {canonicalEntry.address.slice(0, 10)}...{canonicalEntry.address.slice(-8)}
                            </a>
                          </td>
                          <td className="py-1 text-center text-emerald-400 font-bold">Canonical</td>
                          <td className="py-1 text-center">
                            <Link to={`/token/${canonicalEntry.address}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                              title={`Token Safety for canonical ${t.symbol}`}
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
              "Canonical" = verified address from curated registry ({Object.keys(CANONICAL_TOKENS).length} tokens).
              "Known" = found in auto-populated database (not manually verified).
              "Address differs" = same symbol but different contract than canonical — potential impersonation.
              "Unlisted" = symbol not in either registry.
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

        {/* Transition banners — migrated from PoolConfidencePopup */}
        {hasAnyTransition && (
          <div className="space-y-2">
            {Object.entries(poolTransitions).map(([pairAddr, t]) => {
              const pool = livePools.find(p => p.pair_address === pairAddr)
              const fromConf = CONFIDENCE_INFO[t.from] ?? CONFIDENCE_INFO.suspect
              const toConf = CONFIDENCE_INFO[t.to] ?? CONFIDENCE_INFO.suspect
              const event = confidenceEvents.find(e => e.pair_address === pairAddr)
              return (
                <div key={pairAddr} className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 flex items-start gap-2">
                  <span className="text-yellow-400 text-xs mt-0.5">↑</span>
                  <div className="text-xs text-yellow-300">
                    <span className="font-bold">Recent transition</span>
                    {pool && <span className="text-yellow-400/70"> ({pool.base_token_symbol}/{pool.quote_token_symbol})</span>}
                    {': '}
                    <span className={fromConf.color}>{fromConf.label}</span>
                    {' → '}
                    <span className={toConf.color}>{toConf.label}</span>
                    {event?.event_summary ? (
                      <span className="text-yellow-400/80 ml-1">— {event.event_summary}</span>
                    ) : (
                      <span className="text-yellow-400/60 ml-1">
                        — The monitoring history below still shows the previous state. The next indexer run (every 6h) will record this transition.
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pool Monitoring History */}
        {monitoringHistory.length > 0 && (
          <>
            <button
              onClick={() => setHistoryOpen(true)}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#00D4FF] hover:text-white rounded-lg border border-[#00D4FF]/30 bg-[#00D4FF]/5 hover:bg-[#00D4FF]/10 py-2.5 transition-colors"
            >
              {`View monitoring history (${monitoringHistory.length} snapshots)`}
            </button>

            <PopupPanel open={historyOpen} onClose={() => setHistoryOpen(false)} title={`Monitoring History (${monitoringHistory.length} snapshots)`}>
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
            </PopupPanel>
          </>
        )}

        {monitoringHistory.length === 0 && livePools.length > 0 && (
          <p className="text-xs text-gray-500 text-center py-2">No monitoring history available yet. Snapshots are recorded every 6 hours.</p>
        )}

        <p className="text-[10px] text-gray-600 text-center">
          Analysis by token_monitoring indexer (runs every 6 hours). Not real-time. Not investment advice.
        </p>
      </div>

      </div>{/* end grid */}

      {/* Classification version footer (P3-B) */}
      <div className="text-center text-[10px] text-gray-600 pt-2">
        Classification v2.0 — 7 criteria, last calibrated 2026-03-13
      </div>
    </div>
  )
}
