import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { getBridgeStats, type BridgeSnapshot } from '../../lib/api'
import { formatUsd } from '../../lib/format'

// Animated block that moves across the bridge lane
function BridgeBlock({ direction, index, speed }: { direction: 'in' | 'out'; index: number; speed: number }) {
  const isIn = direction === 'in'
  const delay = index * 1.2
  const duration = Math.max(2, 6 / speed) // faster speed = shorter duration

  return (
    <div
      className={`absolute w-2.5 h-2.5 rounded-sm ${isIn ? 'bg-emerald-400/80' : 'bg-red-400/80'}`}
      style={{
        animation: `bridge-${isIn ? 'in' : 'out'} ${duration}s linear infinite`,
        animationDelay: `${delay}s`,
        top: isIn ? '0px' : '14px',
      }}
    />
  )
}

// Ethereum logo (simplified diamond)
function EthLogo() {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="w-8 h-8 rounded-full bg-[#627eea]/20 border border-[#627eea]/40 flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 256 417" fill="none">
          <path d="M127.961 0L125.166 9.5V285.168L127.961 287.958L255.923 212.32L127.961 0Z" fill="#627eea" fillOpacity="0.8"/>
          <path d="M127.962 0L0 212.32L127.962 287.958V154.159V0Z" fill="#627eea"/>
          <path d="M127.961 312.187L126.386 314.107V412.306L127.961 416.905L255.999 236.587L127.961 312.187Z" fill="#627eea" fillOpacity="0.8"/>
          <path d="M127.962 416.905V312.187L0 236.587L127.962 416.905Z" fill="#627eea"/>
        </svg>
      </div>
      <span className="text-[9px] text-gray-500 font-medium">ETH</span>
    </div>
  )
}

// PulseChain logo (heart/pulse)
function PlsLogo() {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="w-8 h-8 rounded-full bg-[#00D4FF]/20 border border-[#00D4FF]/40 flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
          <path d="M50 85L15 50C5 35 15 15 35 15C42 15 48 18 50 22C52 18 58 15 65 15C85 15 95 35 85 50L50 85Z" fill="#00D4FF" fillOpacity="0.9"/>
        </svg>
      </div>
      <span className="text-[9px] text-gray-500 font-medium">PLS</span>
    </div>
  )
}

export function Bridge() {
  const [stats, setStats] = useState<BridgeSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getBridgeStats()
      setStats(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  // Compute speeds based on volume ratio
  const { inSpeed, outSpeed, inBlocks, outBlocks } = useMemo(() => {
    if (!stats) return { inSpeed: 1, outSpeed: 1, inBlocks: 3, outBlocks: 3 }
    const inVol = stats.deposit_volume_24h
    const outVol = stats.withdrawal_volume_24h
    const total = inVol + outVol
    if (total === 0) return { inSpeed: 1, outSpeed: 1, inBlocks: 3, outBlocks: 3 }
    const ratio = inVol / (outVol || 1)
    return {
      inSpeed: Math.min(3, Math.max(0.5, ratio)),
      outSpeed: Math.min(3, Math.max(0.5, 1 / ratio)),
      inBlocks: Math.min(6, Math.max(2, Math.round(3 * ratio))),
      outBlocks: Math.min(6, Math.max(2, Math.round(3 / ratio))),
    }
  }, [stats])

  // Determine bridge health status
  const healthStatus = useMemo(() => {
    if (!stats) return null
    const netFlow = stats.net_flow_24h
    const outVol = stats.withdrawal_volume_24h
    const inVol = stats.deposit_volume_24h

    // Large net outflow = potential concern
    if (outVol > inVol * 3 && outVol > 500000) {
      return { level: 'warning', label: 'Heavy Outflow', color: 'text-amber-400', bg: 'bg-amber-500/10' }
    }
    // Very large single-direction movement
    if (outVol > 2000000 || inVol > 2000000) {
      return { level: 'alert', label: 'High Volume', color: 'text-yellow-400', bg: 'bg-yellow-500/10' }
    }
    // Low activity might indicate issues
    if (stats.tx_count_24h < 5 && stats.tx_count_24h >= 0) {
      return { level: 'low', label: 'Low Activity', color: 'text-gray-400', bg: 'bg-gray-500/10' }
    }
    return { level: 'ok', label: 'Normal', color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
  }, [stats])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 text-pulse-cyan">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-white">Bridge Monitor</h2>
        </div>
        <button
          onClick={loadStats}
          disabled={loading}
          className="text-gray-500 hover:text-white transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Animated Bridge Visualization */}
      <div className="bg-gray-800/40 rounded-xl p-3 border border-white/5">
        <div className="flex items-center justify-between">
          <EthLogo />

          {/* Bridge lanes */}
          <div className="flex-1 mx-3 relative h-[28px] overflow-hidden">
            {/* Top lane: ETH → PLS (green, left to right) */}
            {Array.from({ length: inBlocks }).map((_, i) => (
              <BridgeBlock key={`in-${i}`} direction="in" index={i} speed={inSpeed} />
            ))}
            {/* Bottom lane: PLS → ETH (red, right to left) */}
            {Array.from({ length: outBlocks }).map((_, i) => (
              <BridgeBlock key={`out-${i}`} direction="out" index={i} speed={outSpeed} />
            ))}
            {/* Lane divider */}
            <div className="absolute top-[12px] left-0 right-0 h-px bg-white/5" />
          </div>

          <PlsLogo />
        </div>

        {/* Direction labels */}
        <div className="flex justify-between mt-1.5 px-10">
          <span className="text-[8px] text-emerald-400/60">IN</span>
          <span className="text-[8px] text-red-400/60">OUT</span>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 text-gray-500 animate-spin" />
        </div>
      ) : stats ? (
        <>
          {/* Health status */}
          {healthStatus && (
            <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${healthStatus.bg}`}>
              {healthStatus.level === 'warning' && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
              <span className={`text-xs font-medium ${healthStatus.color}`}>
                Bridge Status: {healthStatus.label}
              </span>
            </div>
          )}

          {/* 24h Stats */}
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="bg-gray-800/30 rounded-md p-2">
              <div className="text-[10px] text-gray-500">Inflow (24h)</div>
              <div className="text-emerald-400 font-medium">{formatUsd(stats.deposit_volume_24h)}</div>
              <div className="text-[9px] text-gray-600">{stats.deposit_count_24h} txs</div>
            </div>
            <div className="bg-gray-800/30 rounded-md p-2">
              <div className="text-[10px] text-gray-500">Outflow (24h)</div>
              <div className="text-red-400 font-medium">{formatUsd(stats.withdrawal_volume_24h)}</div>
              <div className="text-[9px] text-gray-600">{stats.withdrawal_count_24h} txs</div>
            </div>
            <div className="bg-gray-800/30 rounded-md p-2">
              <div className="text-[10px] text-gray-500">Net Flow (24h)</div>
              <div className={`font-medium ${stats.net_flow_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.net_flow_24h >= 0 ? '+' : ''}{formatUsd(stats.net_flow_24h)}
              </div>
            </div>
            <div className="bg-gray-800/30 rounded-md p-2">
              <div className="text-[10px] text-gray-500">Total Txs (24h)</div>
              <div className="text-white font-medium">{stats.tx_count_24h}</div>
            </div>
          </div>

          {/* 7d Stats */}
          <div className="bg-gray-800/30 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-500 mb-1.5">7-Day Summary</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-emerald-400">{formatUsd(stats.deposit_volume_7d)}</div>
                <div className="text-[9px] text-gray-600">In</div>
              </div>
              <div>
                <div className="text-red-400">{formatUsd(stats.withdrawal_volume_7d)}</div>
                <div className="text-[9px] text-gray-600">Out</div>
              </div>
              <div>
                <div className={stats.net_flow_7d >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {stats.net_flow_7d >= 0 ? '+' : ''}{formatUsd(stats.net_flow_7d)}
                </div>
                <div className="text-[9px] text-gray-600">Net</div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <a
        href="https://www.openpulsechain.com/bridge"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1 text-xs text-pulse-cyan hover:underline pt-1"
      >
        Full bridge analytics <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
