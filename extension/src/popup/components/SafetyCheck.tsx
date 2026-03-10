import { useState, useCallback } from 'react'
import { Shield, Search, AlertTriangle, CheckCircle, XCircle, ExternalLink, Loader2 } from 'lucide-react'
import { getTokenSafety, getDeployerReputation, gradeColor, type SafetyScore, type DeployerReputation } from '../../lib/api'
import { formatUsd, shortenAddress } from '../../lib/format'

// Known token logos (checksum addresses for PulseX CDN)
const KNOWN_LOGOS: Record<string, string> = {
  '0xa1077a294dde1b09bb078844df40758a5d0f9a27': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
  '0x95b303987a60c71504d99aa1b13b4da07b0790ab': 'https://tokens.app.pulsex.com/images/tokens/0x95B303987A60C71504D99Aa1b13B4DA07b0790ab.png',
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39': 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
  '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d': 'https://tokens.app.pulsex.com/images/tokens/0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d.png',
  '0xefd766ccb38eaf1dfd701853bfce31359239f305': 'https://tokens.app.pulsex.com/images/tokens/0xefD766cCb38EaF1dfd701853BFCe31359239F305.png',
  '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c': 'https://tokens.app.pulsex.com/images/tokens/0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C.png',
}

function SafetyTokenLogo({ address }: { address: string }) {
  const [error, setError] = useState(false)
  const addr = address?.toLowerCase() || ''
  const knownUrl = KNOWN_LOGOS[addr]
  const imgUrl = knownUrl || `https://tokens.app.pulsex.com/images/tokens/${address}.png`
  if (error) return null
  return (
    <img
      src={imgUrl}
      alt=""
      className="h-6 w-6 rounded-full bg-gray-800 border border-white/10 shrink-0"
      onError={() => setError(true)}
    />
  )
}

const QUICK_TOKENS = [
  { symbol: 'HEX', address: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39' },
  { symbol: 'PLSX', address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab' },
  { symbol: 'INC', address: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d' },
  { symbol: 'HDRN', address: '0x3819f64f282bf135d62168c1e513280daf905e06' },
  { symbol: 'LOAN', address: '0x9159f1d2a9f51998fc9ab03fbd8f265ab14a1b3b' },
  { symbol: 'DAI', address: '0xefd766ccb38eaf1dfd701853bfce31359239f305' },
  { symbol: 'WETH', address: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c' },
  { symbol: 'USDC', address: '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07' },
]

export function SafetyCheck() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [safety, setSafety] = useState<SafetyScore | null>(null)
  const [deployer, setDeployer] = useState<DeployerReputation | null>(null)

  const checkToken = useCallback(async (addr: string) => {
    if (!addr.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError('Enter a valid PulseChain token address (0x...)')
      return
    }
    setInput(addr)
    setLoading(true)
    setError(null)
    setSafety(null)
    setDeployer(null)
    try {
      const result = await getTokenSafety(addr)
      setSafety(result)
      try {
        const dep = await getDeployerReputation(addr)
        setDeployer(dep)
      } catch {
        // deployer info optional
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check token')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleCheck = () => checkToken(input.trim())

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="h-4 w-4 text-pulse-cyan" />
        <h2 className="text-sm font-semibold text-white">Token Safety Check</h2>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            placeholder="Token address (0x...)"
            className="w-full bg-gray-800/60 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-pulse-cyan/50"
          />
        </div>
        <button
          onClick={handleCheck}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-gradient-to-r from-pulse-cyan to-pulse-purple text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Check'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Quick tokens when no result */}
      {!safety && !loading && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500">Popular tokens — tap to check:</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_TOKENS.map((t) => (
              <button
                key={t.symbol}
                onClick={() => checkToken(t.address)}
                className="px-2.5 py-1.5 rounded-lg bg-gray-800/50 border border-white/5 text-xs text-gray-300 hover:bg-gray-800/80 hover:text-white hover:border-pulse-cyan/30 transition-colors"
              >
                {t.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {safety && (
        <div className="space-y-2.5">
          {/* Score header */}
          <div className="flex items-center justify-between bg-gray-800/40 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-2">
              <SafetyTokenLogo address={safety.token_address} />
              <div>
                <div className="text-xs text-gray-400">
                  {safety.token_symbol || shortenAddress(safety.token_address)}
                  {safety.token_name && <span className="ml-1 text-gray-500">{safety.token_name}</span>}
                </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-bold text-white">{safety.score}</span>
                <span className="text-xs text-gray-500">/ 100</span>
              </div>
              </div>
            </div>
            <div
              className="text-3xl font-bold px-3 py-1 rounded-lg"
              style={{ color: gradeColor(safety.grade), backgroundColor: `${gradeColor(safety.grade)}15` }}
            >
              {safety.grade}
            </div>
          </div>

          {/* Risks */}
          {safety.risks.length > 0 && (
            <div className="space-y-1">
              {safety.risks.map((risk, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-red-500/5 border border-red-500/10 rounded-lg p-2">
                  <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-red-300">{risk}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sub-scores */}
          <div className="grid grid-cols-2 gap-2">
            <ScoreBox label="Honeypot" score={safety.honeypot_score} detail={safety.is_honeypot ? 'HONEYPOT' : 'Safe'} danger={safety.is_honeypot} />
            <ScoreBox label="Contract" score={safety.contract_score} detail={safety.is_verified ? 'Verified' : 'Unverified'} danger={!safety.is_verified} />
            <ScoreBox label="Liquidity" score={safety.lp_score} detail={formatUsd(safety.total_liquidity_usd)} danger={safety.total_liquidity_usd < 1000} />
            <ScoreBox label="Holders" score={safety.holders_score} detail={`${safety.holder_count} holders`} danger={safety.top1_pct > 50} />
          </div>

          {/* Contract details */}
          <div className="bg-gray-800/30 rounded-lg p-2.5 space-y-1.5 text-xs">
            <div className="font-medium text-gray-300 mb-1">Contract Analysis</div>
            <Detail label="Ownership" value={safety.ownership_renounced ? 'Renounced' : 'Active'} ok={safety.ownership_renounced} />
            <Detail label="Mint Function" value={safety.has_mint ? 'Yes' : 'No'} ok={!safety.has_mint} />
            <Detail label="Blacklist" value={safety.has_blacklist ? 'Yes' : 'No'} ok={!safety.has_blacklist} />
            <Detail label="Proxy" value={safety.is_proxy ? 'Yes (upgradeable)' : 'No'} ok={!safety.is_proxy} />
            <Detail label="Token Age" value={`${safety.age_days} days`} ok={safety.age_days > 7} />
            {safety.buy_tax_pct != null && <Detail label="Buy Tax" value={`${safety.buy_tax_pct.toFixed(1)}%`} ok={safety.buy_tax_pct < 5} />}
            {safety.sell_tax_pct != null && <Detail label="Sell Tax" value={`${safety.sell_tax_pct.toFixed(1)}%`} ok={safety.sell_tax_pct < 10} />}
          </div>

          {/* Deployer reputation */}
          {deployer && (
            <div className="bg-gray-800/30 rounded-lg p-2.5 text-xs space-y-1.5">
              <div className="font-medium text-gray-300 mb-1">Deployer Reputation</div>
              <Detail label="Tokens Deployed" value={String(deployer.tokens_deployed)} />
              <Detail label="Dead Tokens" value={String(deployer.tokens_dead)} ok={deployer.dead_ratio < 0.5} />
              <Detail label="Dead Ratio" value={`${(deployer.dead_ratio * 100).toFixed(0)}%`} ok={deployer.dead_ratio < 0.5} />
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-gray-500">Risk Level:</span>
                <span className={`font-medium ${deployer.risk_level === 'low' ? 'text-emerald-400' : deployer.risk_level === 'medium' ? 'text-amber-400' : 'text-red-400'}`}>
                  {deployer.risk_level.toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {/* Link to full report */}
          <a
            href={`https://www.openpulsechain.com/token/${safety.token_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs text-pulse-cyan hover:underline py-1"
          >
            Full report on OpenPulsechain <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  )
}

function ScoreBox({ label, score, detail, danger }: { label: string; score: number; detail: string; danger?: boolean }) {
  const color = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="bg-gray-800/30 rounded-lg p-2 border border-white/5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{score}</div>
      <div className={`text-[10px] ${danger ? 'text-red-400' : 'text-gray-400'}`}>{detail}</div>
    </div>
  )
}

function Detail({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`flex items-center gap-1 ${ok === true ? 'text-emerald-400' : ok === false ? 'text-red-400' : 'text-gray-300'}`}>
        {ok === true && <CheckCircle className="h-3 w-3" />}
        {ok === false && <XCircle className="h-3 w-3" />}
        {value}
      </span>
    </div>
  )
}
