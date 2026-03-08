import { useMemo, useState } from 'react'
import { ArrowLeftRight, Droplets, Hash, TrendingUp } from 'lucide-react'
import { KpiCard } from '../cards/KpiCard'
import { AreaChartComponent } from '../charts/AreaChart'
import { BarChartComponent } from '../charts/BarChart'
import { Spinner } from '../ui/Spinner'
import { TimeRangeSelector } from '../ui/TimeRangeSelector'
import { usePulsexDailyStats, usePulsexTopPairs } from '../../hooks/useSupabase'
import { formatUsd, formatNumber } from '../../lib/format'

export function DexPage() {
  const pulsex = usePulsexDailyStats()
  const topPairs = usePulsexTopPairs()

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
            value={formatUsd(kpis.totalLiquidity)}
            subtitle="Current"
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
            value={formatUsd(kpis.totalVolume)}
            subtitle="All time"
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <KpiCard
            title="Total Transactions"
            value={formatNumber(kpis.totalTxs)}
            subtitle="All time"
            icon={<Hash className="h-5 w-5" />}
          />
        </div>
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
