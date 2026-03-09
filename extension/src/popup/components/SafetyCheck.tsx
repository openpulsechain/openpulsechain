import { useState } from 'react'
import { Shield, Search, AlertTriangle, CheckCircle, XCircle, ExternalLink, Loader2 } from 'lucide-react'
import { getTokenSafety, getDeployerReputation, gradeColor, type SafetyScore, type DeployerReputation } from '../../lib/api'
import { formatUsd, shortenAddress } from '../../lib/format'

export function SafetyCheck() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [safety, setSafety] = useState<SafetyScore | null>(null)
  const [deployer, setDeployer] = useState<DeployerReputation | null>(null)

  const handleCheck = async () => {
    const addr = input.trim()
    if (!addr.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError('Enter a valid PulseChain token address (0x...)')
      return
    }
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
  }

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

      {/* Results */}
      {safety && (
        <div className="space-y-2.5">
          {/* Score header */}
          <div className="flex items-center justify-between bg-gray-800/40 rounded-xl p-3 border border-white/5">
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
