import { useMemo, useState } from 'react'
import { ArrowLeftRight, Droplets, Hash, TrendingUp, Info, ChevronDown } from 'lucide-react'
import { KpiCard } from '../cards/KpiCard'
import { AreaChartComponent } from '../charts/AreaChart'
import { BarChartComponent } from '../charts/BarChart'
import { Spinner } from '../ui/Spinner'
import { TimeRangeSelector } from '../ui/TimeRangeSelector'
import { usePulsexDailyStats, usePulsexTopPairs } from '../../hooks/useSupabase'
import { useLivePulsexFactory } from '../../hooks/useLivePulsexFactory'
import { formatUsd, formatNumber } from '../../lib/format'

function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
      <span>(live)</span>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
    </span>
  )
}

function DexDataSourceNote({ liveFactory }: { liveFactory: ReturnType<typeof useLivePulsexFactory> }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        <Info className="h-3 w-3" />
        <span>About these metrics &amp; cross-source audit</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-lg bg-white/5 border border-white/10 p-4 text-xs text-gray-400 space-y-4">
          <p>
            Live KPIs are fetched every 30 seconds directly from PulseX V1 and V2 subgraphs and combined.
            Historical charts use daily snapshots stored in our database (sourced from the V1 subgraph).
          </p>

          {/* Liquidity comparison */}
          <div>
            <p className="font-medium text-gray-300 mb-2">Liquidity comparison (verified 11/03/2026)</p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-1 pr-3 text-gray-500 font-medium">Source</th>
                  <th className="py-1 pr-3 text-right text-gray-500 font-medium">Liquidity</th>
                  <th className="py-1 text-gray-500 font-medium">Scope</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">Subgraph V1 (raw)</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">{liveFactory.v1LiquidityUSD != null ? formatUsd(liveFactory.v1LiquidityUSD) : '$31.74M'}</td>
                  <td className="py-1">PulseX V1 pools, on-chain</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">Subgraph V2 (raw)</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">{liveFactory.v2LiquidityUSD != null ? formatUsd(liveFactory.v2LiquidityUSD) : '$20.59M'}</td>
                  <td className="py-1">PulseX V2 pools, on-chain</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3 font-medium text-emerald-400">V1 + V2 combined (our KPI)</td>
                  <td className="py-1 pr-3 text-right font-mono text-emerald-400">{liveFactory.totalLiquidityUSD != null ? formatUsd(liveFactory.totalLiquidityUSD) : '$52.33M'}</td>
                  <td className="py-1">Raw subgraph combined</td>
                </tr>
                <tr>
                  <td className="py-1 pr-3">DefiLlama "PulseX"</td>
                  <td className="py-1 pr-3 text-right font-mono text-gray-300">~$48.79M</td>
                  <td className="py-1">V1+V2+StableSwap, spam-filtered</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Volume comparison */}
          <div>
            <p className="font-medium text-gray-300 mb-2">All-time volume comparison</p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-1 pr-3 text-gray-500 font-medium">Source</th>
                  <th className="py-1 pr-3 text-right text-gray-500 font-medium">Volume</th>
                  <th className="py-1 text-gray-500 font-medium">Scope</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">Subgraph V1</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">{liveFactory.v1VolumeUSD != null ? formatUsd(liveFactory.v1VolumeUSD) : '$19.4B'}</td>
                  <td className="py-1">V1 totalVolumeUSD</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">Subgraph V2</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">{liveFactory.v2VolumeUSD != null ? formatUsd(liveFactory.v2VolumeUSD) : '$7.1B'}</td>
                  <td className="py-1">V2 totalVolumeUSD</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3 font-medium text-emerald-400">V1 + V2 combined (our KPI)</td>
                  <td className="py-1 pr-3 text-right font-mono text-emerald-400">{liveFactory.totalVolumeUSD != null ? formatUsd(liveFactory.totalVolumeUSD) : '$26.4B'}</td>
                  <td className="py-1">Subgraph combined</td>
                </tr>
                <tr>
                  <td className="py-1 pr-3">DefiLlama V1</td>
                  <td className="py-1 pr-3 text-right font-mono text-gray-300">~$19.35B</td>
                  <td className="py-1">Very close to subgraph V1</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Transactions comparison */}
          <div>
            <p className="font-medium text-gray-300 mb-2">Transaction count</p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-1 pr-3 text-gray-500 font-medium">Source</th>
                  <th className="py-1 pr-3 text-right text-gray-500 font-medium">Transactions</th>
                  <th className="py-1 text-gray-500 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">Subgraph V1</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">{liveFactory.v1Transactions != null ? formatNumber(liveFactory.v1Transactions) : '79.5M'}</td>
                  <td className="py-1">Swaps + adds/removes</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">Subgraph V2</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">{liveFactory.v2Transactions != null ? formatNumber(liveFactory.v2Transactions) : '201.3M'}</td>
                  <td className="py-1">V2 has more activity</td>
                </tr>
                <tr>
                  <td className="py-1 pr-3 font-medium text-emerald-400">V1 + V2 combined (our KPI)</td>
                  <td className="py-1 pr-3 text-right font-mono text-emerald-400">{liveFactory.totalTransactions != null ? formatNumber(liveFactory.totalTransactions) : '280.9M'}</td>
                  <td className="py-1">Total PulseX activity</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 30D Volume note */}
          <div className="rounded bg-amber-500/5 border border-amber-500/15 p-2.5 text-[11px]">
            <p className="text-amber-400 font-medium mb-1">About 30D Volume</p>
            <p className="text-gray-400">
              Our 30D Volume is computed from V1 daily snapshots only (historical data). It does not include V2 daily volume because the V2 subgraph
              <code className="text-gray-300 mx-1">pulsexDayDatas</code>entity is not yet ingested. DefiLlama reports ~$115M total 30D volume
              across all PulseChain DEXes (PulseX + 9mm + others). Our figure is lower because it covers V1 only.
            </p>
          </div>

          <div className="rounded bg-blue-500/5 border border-blue-500/15 p-2.5 text-[11px]">
            <p className="text-blue-400 font-medium mb-1">Why do subgraph values differ from DefiLlama?</p>
            <p className="text-gray-400">
              DefiLlama applies spam filtering on raw subgraph data. PulseChain subgraphs include pools with inflated
              <code className="text-gray-300 mx-1">reserveUSD</code>from spam tokens. DefiLlama also uses a different valuation methodology
              (pricing tokens via Ethereum bridges and CoinGecko), which can produce higher or lower values than raw
              <code className="text-gray-300 mx-1">totalLiquidityUSD</code>depending on the pool.
            </p>
          </div>

          <p className="text-[10px] text-gray-600">
            This is not investment advice. Data is provided for educational and informational purposes only.
          </p>
        </div>
      )}
    </div>
  )
}

export function DexPage() {
  const pulsex = usePulsexDailyStats()
  const topPairs = usePulsexTopPairs()
  const liveFactory = useLivePulsexFactory()

  const latest = pulsex.data.length > 0 ? pulsex.data[pulsex.data.length - 1] : null

  // Filter out days with zero data (pre-launch)
  const validData = useMemo(() => pulsex.data.filter((d) => d.daily_volume_usd > 0 || d.total_liquidity_usd > 0), [pulsex.data])

  const [liqRange, setLiqRange] = useState<number | null>(null)
  const [volRange, setVolRange] = useState<number | null>(null)
  const [cumRange, setCumRange] = useState<number | null>(null)

  const kpis = useMemo(() => {
    if (!validData.length) return null
    const last30 = validData.slice(-30)
    const volume30d = last30.reduce((s, d) => s + d.daily_volume_usd, 0)
    const totalVolume = validData.reduce((s, d) => s + d.daily_volume_usd, 0)
    return {
      totalLiquidity: latest?.total_liquidity_usd ?? 0,
      totalVolume,
      totalTxs: latest?.total_transactions ?? 0,
      volume30d,
    }
  }, [validData, latest])

  // Cumulative volume computed from daily sums (subgraph totalVolumeUSD is always 0)
  const cumulativeVolume = useMemo(() => {
    let cumul = 0
    return validData.map((d) => {
      cumul += d.daily_volume_usd
      return { date: d.date, cumulative_volume: cumul }
    })
  }, [validData])

  if (pulsex.loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">PulseX DEX Analytics</h1>
        <p className="text-gray-400 mt-1">
          Track PulseX trading activity: daily volume, total liquidity, and transaction count. All data sourced directly from the PulseX Subgraph.
        </p>
      </div>

      {/* KPI Row */}
      {kpis && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Total Liquidity"
            titleSuffix={liveFactory.totalLiquidityUSD ? <LiveIndicator /> : undefined}
            value={formatUsd(liveFactory.totalLiquidityUSD ?? kpis.totalLiquidity)}
            subtitle="PulseX V1 + V2"
            icon={<Droplets className="h-5 w-5" />}
          />
          <KpiCard
            title="30D Volume"
            value={formatUsd(kpis.volume30d)}
            subtitle="Last 30 days"
            icon={<ArrowLeftRight className="h-5 w-5" />}
          />
          <KpiCard
            title="Total Volume"
            titleSuffix={liveFactory.totalVolumeUSD ? <LiveIndicator /> : undefined}
            value={formatUsd(liveFactory.totalVolumeUSD ?? kpis.totalVolume)}
            subtitle="All time"
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <KpiCard
            title="Total Transactions"
            titleSuffix={liveFactory.totalTransactions ? <LiveIndicator /> : undefined}
            value={formatNumber(liveFactory.totalTransactions ?? kpis.totalTxs)}
            subtitle="All time"
            icon={<Hash className="h-5 w-5" />}
          />
        </div>
        <DexDataSourceNote liveFactory={liveFactory} />
      )}

      {/* Liquidity Chart */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Total Liquidity (PulseX)</h2>
          <TimeRangeSelector value={liqRange} onChange={setLiqRange} />
        </div>
        {validData.length > 0 ? (
          <AreaChartComponent data={liqRange ? validData.slice(-liqRange) : validData} xKey="date" yKey="total_liquidity_usd" color="#00D4FF" />
        ) : (
          <p className="py-12 text-center text-gray-500">No liquidity data available</p>
        )}
      </div>

      {/* Daily Volume Bar Chart */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Daily Trading Volume</h2>
          <TimeRangeSelector value={volRange} onChange={setVolRange} />
        </div>
        {validData.length > 0 ? (
          <BarChartComponent
            data={volRange ? validData.slice(-volRange) : validData}
            xKey="date"
            bars={[{ key: 'daily_volume_usd', color: '#8000E0' }]}
          />
        ) : (
          <p className="py-12 text-center text-gray-500">No volume data available</p>
        )}
      </div>

      {/* Cumulative Volume */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Cumulative Volume</h2>
          <TimeRangeSelector value={cumRange} onChange={setCumRange} />
        </div>
        {cumulativeVolume.length > 0 ? (
          <AreaChartComponent data={cumRange ? cumulativeVolume.slice(-cumRange) : cumulativeVolume} xKey="date" yKey="cumulative_volume" color="#D000C0" />
        ) : (
          <p className="py-12 text-center text-gray-500">No volume data available</p>
        )}
      </div>

      {/* Top Pairs */}
      {topPairs.data.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Top Pairs by Volume</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="py-3 pr-4">#</th>
                  <th className="py-3 pr-4">Pair</th>
                  <th className="py-3 pr-4 text-right">Volume (All Time)</th>
                  <th className="py-3 pr-4 text-right">Liquidity</th>
                  <th className="py-3 text-right">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {topPairs.data.map((pair, i) => (
                  <tr key={pair.pair_address} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-4 text-gray-500">{i + 1}</td>
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-white">{pair.token0_symbol}</span>
                      <span className="text-gray-500"> / </span>
                      <span className="text-gray-300">{pair.token1_symbol}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-gray-300">{formatUsd(pair.volume_usd)}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-300">{formatUsd(pair.reserve_usd)}</td>
                    <td className="py-2.5 text-right text-gray-400">{formatNumber(pair.total_transactions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
