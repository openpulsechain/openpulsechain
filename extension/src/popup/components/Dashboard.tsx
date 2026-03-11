import { useState, useEffect } from 'react'
import { Search, Wallet, ArrowLeftRight, AlertTriangle, Loader2, Shield, Activity } from 'lucide-react'
import { useStore } from '../../lib/store'
import { getBridgeStats, getRecentAlerts, getTokenSafety, getWalletBalances, gradeColor, type BridgeSnapshot, type ScamAlert, type SafetyScore } from '../../lib/api'
import { formatUsd, shortenAddress, timeAgo } from '../../lib/format'
import { RpcStatusInline } from './RpcStatusInline'

// PulseX CDN logos (checksum addresses)
const TOKEN_LOGOS: Record<string, string> = {
  HEX: 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
  PLSX: 'https://tokens.app.pulsex.com/images/tokens/0x95B303987A60C71504D99Aa1b13B4DA07b0790ab.png',
  INC: 'https://tokens.app.pulsex.com/images/tokens/0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d.png',
  HDRN: 'https://tokens.app.pulsex.com/images/tokens/0x3819f64f282bf135d62168C1e513280dAF905e06.png',
  LOAN: 'https://tokens.app.pulsex.com/images/tokens/0x9159f1D2a9f51998Fc9Ab03fbd8f265ab14A1b3B.png',
  DAI: 'https://tokens.app.pulsex.com/images/tokens/0xefD766cCb38EaF1dfd701853BFCe31359239F305.png',
}

const POPULAR_TOKENS = [
  { symbol: 'HEX', address: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', fallbackGrade: 'A' },
  { symbol: 'PLSX', address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab', fallbackGrade: 'A' },
  { symbol: 'INC', address: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', fallbackGrade: 'B' },
  { symbol: 'HDRN', address: '0x3819f64f282bf135d62168c1e513280daf905e06', fallbackGrade: 'B' },
  { symbol: 'LOAN', address: '0x9159f1d2a9f51998fc9ab03fbd8f265ab14a1b3b', fallbackGrade: 'B' },
  { symbol: 'DAI', address: '0xefd766ccb38eaf1dfd701853bfce31359239f305', fallbackGrade: 'A' },
]

export function Dashboard() {
  const wallets = useStore((s) => s.wallets)
  const setActiveSection = useStore((s) => s.setActiveSection)

  // Quick search
  const [searchInput, setSearchInput] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)

  // Wallet summary
  const [walletTotal, setWalletTotal] = useState<number | null>(null)
  const [walletTokenCount, setWalletTokenCount] = useState(0)
  const [walletLoading, setWalletLoading] = useState(false)

  // Bridge
  const [bridge, setBridge] = useState<BridgeSnapshot | null>(null)
  const [bridgeLoading, setBridgeLoading] = useState(true)

  // Alerts
  const [alerts, setAlerts] = useState<ScamAlert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(true)

  // Popular tokens
  const [tokenGrades, setTokenGrades] = useState<Map<string, SafetyScore>>(new Map())
  const [tokensLoading, setTokensLoading] = useState(true)

  useEffect(() => {
    // Load bridge stats
    getBridgeStats()
      .then((s) => setBridge(s))
      .catch(() => {})
      .finally(() => setBridgeLoading(false))

    // Load recent alerts
    getRecentAlerts(3)
      .then((a) => setAlerts(a.slice(0, 3)))
      .catch(() => {})
      .finally(() => setAlertsLoading(false))

    // Load popular token grades
    Promise.allSettled(
      POPULAR_TOKENS.map(async (t) => {
        const safety = await getTokenSafety(t.address)
        return { symbol: t.symbol, safety }
      })
    ).then((results) => {
      const map = new Map<string, SafetyScore>()
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.safety) {
          map.set(r.value.symbol, r.value.safety)
        }
      }
      setTokenGrades(map)
      setTokensLoading(false)
    })

    // Load wallet summary if configured
    // (handled separately below)
  }, [])

  useEffect(() => {
    if (wallets.length > 0) {
      setWalletLoading(true)
      getWalletBalances(wallets[0].address)
        .then((balances) => {
          const total = balances.reduce((sum, b) => sum + (b.value_usd || 0), 0)
          setWalletTotal(total)
          setWalletTokenCount(balances.filter((b) => b.balance > 0).length)
        })
        .catch(() => {
          setWalletTotal(null)
          setWalletTokenCount(0)
        })
        .finally(() => setWalletLoading(false))
    }
  }, [wallets])

  const handleSearch = () => {
    const addr = searchInput.trim()
    if (!addr.match(/^0x[a-fA-F0-9]{40}$/)) return
    setSearchLoading(true)
    // Navigate to explorer and let it handle the search
    setActiveSection('explorer')
  }

  // Bridge status helpers
  const bridgeStatusDot = () => {
    if (!bridge) return 'bg-gray-500'
    const outVol = bridge.withdrawal_volume_24h
    const inVol = bridge.deposit_volume_24h
    if (outVol > inVol * 3 && outVol > 500000) return 'bg-red-400'
    if (outVol > 2000000 || inVol > 2000000) return 'bg-amber-400'
    return 'bg-emerald-400'
  }

  const bridgeStatusLabel = () => {
    if (!bridge) return 'Loading...'
    const outVol = bridge.withdrawal_volume_24h
    const inVol = bridge.deposit_volume_24h
    if (outVol > inVol * 3 && outVol > 500000) return 'Heavy Outflow'
    if (outVol > 2000000 || inVol > 2000000) return 'High Volume'
    return 'Normal'
  }

  return (
    <div className="space-y-3">
      {/* Quick Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search token or wallet (0x...)"
            className="w-full bg-gray-800/60 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-pulse-cyan/50"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searchLoading}
          className="px-3 py-2 rounded-lg bg-gradient-to-r from-pulse-cyan to-pulse-purple text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {searchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Wallet Summary */}
      <div className="bg-gray-800/30 rounded-lg p-3 border border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="h-4 w-4 text-pulse-cyan" />
          <span className="text-xs font-semibold text-white">Wallet</span>
        </div>
        {wallets.length > 0 ? (
          walletLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 text-gray-500 animate-spin" />
              <span className="text-xs text-gray-500">Loading...</span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-white">
                  {walletTotal != null ? formatUsd(walletTotal) : '$0.00'}
                </div>
                <div className="text-[11px] text-gray-500">
                  {walletTokenCount} tokens · {shortenAddress(wallets[0].address)}
                </div>
              </div>
              <button
                onClick={() => setActiveSection('portfolio')}
                className="text-xs text-pulse-cyan hover:underline"
              >
                View
              </button>
            </div>
          )
        ) : (
          <button
            onClick={() => setActiveSection('portfolio')}
            className="w-full py-2 rounded-md bg-pulse-cyan/10 text-pulse-cyan text-xs font-medium hover:bg-pulse-cyan/20 transition-colors"
          >
            + Add your wallet
          </button>
        )}
      </div>

      {/* Bridge Status (mini) */}
      <div
        className="bg-gray-800/30 rounded-lg px-3 py-2.5 border border-white/5 flex items-center justify-between cursor-pointer hover:bg-gray-800/40 transition-colors"
        onClick={() => setActiveSection('bridge')}
      >
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-pulse-cyan" />
          <span className="text-xs font-semibold text-white">Bridge:</span>
          {bridgeLoading ? (
            <Loader2 className="h-3 w-3 text-gray-500 animate-spin" />
          ) : (
            <>
              <span className={`h-2 w-2 rounded-full ${bridgeStatusDot()}`} />
              <span className="text-xs text-gray-300">{bridgeStatusLabel()}</span>
            </>
          )}
        </div>
        {bridge && !bridgeLoading && (
          <div className="text-[11px] text-gray-500">
            In {formatUsd(bridge.deposit_volume_24h)} / Out {formatUsd(bridge.withdrawal_volume_24h)}
          </div>
        )}
      </div>

      {/* Recent Alerts */}
      <div className="bg-gray-800/30 rounded-lg p-3 border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-xs font-semibold text-white">Recent Alerts</span>
          </div>
          <button
            onClick={() => setActiveSection('alerts')}
            className="text-[11px] text-pulse-cyan hover:underline"
          >
            View all
          </button>
        </div>
        {alertsLoading ? (
          <div className="flex justify-center py-2">
            <Loader2 className="h-3.5 w-3.5 text-gray-500 animate-spin" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-2 py-1">
            <Shield className="h-3.5 w-3.5 text-emerald-500/50" />
            <span className="text-xs text-gray-500">No recent alerts -- all clear</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-md bg-gray-900/40"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-medium ${
                    alert.severity === 'critical' ? 'text-red-400' :
                    alert.severity === 'high' ? 'text-orange-400' : 'text-amber-400'
                  }`}>
                    {alert.alert_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[11px] text-gray-500 truncate">
                    {shortenAddress(alert.token_address)}
                  </span>
                </div>
                <span className="text-[11px] text-gray-600 shrink-0 ml-2">{timeAgo(alert.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status RPC & Indexers */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-pulse-cyan" />
          <span className="text-xs font-semibold text-white">Status RPC & Indexers</span>
        </div>
        <RpcStatusInline />
      </div>
    </div>
  )
}
