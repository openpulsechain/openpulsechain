import { useMemo } from 'react'
import { ArrowLeftRight, Droplets, Hash, TrendingUp } from 'lucide-react'
import { KpiCard } from '../cards/KpiCard'
import { AreaChartComponent } from '../charts/AreaChart'
import { BarChartComponent } from '../charts/BarChart'
import { Spinner } from '../ui/Spinner'
import { usePulsexDailyStats } from '../../hooks/useSupabase'
import { formatUsd, formatNumber } from '../../lib/format'

export function DexPage() {
  const pulsex = usePulsexDailyStats()

  const latest = pulsex.data.length > 0 ? pulsex.data[pulsex.data.length - 1] : null

  const kpis = useMemo(() => {
    if (!pulsex.data.length) return null
    const last30 = pulsex.data.slice(-30)
    const volume30d = last30.reduce((s, d) => s + d.daily_volume_usd, 0)
    return {
      totalLiquidity: latest?.total_liquidity_usd ?? 0,
      totalVolume: latest?.total_volume_usd ?? 0,
      totalTxs: latest?.total_transactions ?? 0,
      volume30d,
    }
  }, [pulsex.data, latest])

  // Recent 180 days for charts
  const recent = pulsex.data.slice(-180)

  // Daily volume for bar chart (last 90 days)
  const volumeRecent = pulsex.data.slice(-90)

  if (pulsex.loading) return <Spinner />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">PulseX DEX Analytics</h1>

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
        <h2 className="mb-4 text-lg font-semibold text-white">Total Liquidity (TVL)</h2>
        {recent.length > 0 ? (
          <AreaChartComponent data={recent} xKey="date" yKey="total_liquidity_usd" color="#00D4FF" />
        ) : (
          <p className="py-12 text-center text-gray-500">No liquidity data available</p>
        )}
      </div>

      {/* Daily Volume Bar Chart */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Daily Trading Volume</h2>
        {volumeRecent.length > 0 ? (
          <BarChartComponent
            data={volumeRecent}
            xKey="date"
            bars={[{ key: 'daily_volume_usd', color: '#8000E0', name: 'Volume' }]}
          />
        ) : (
          <p className="py-12 text-center text-gray-500">No volume data available</p>
        )}
      </div>

      {/* Cumulative Volume */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Cumulative Volume</h2>
        {recent.length > 0 ? (
          <AreaChartComponent data={recent} xKey="date" yKey="total_volume_usd" color="#D000C0" />
        ) : (
          <p className="py-12 text-center text-gray-500">No volume data available</p>
        )}
      </div>
    </div>
  )
}
