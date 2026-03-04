import { DollarSign, TrendingUp, Fuel, Box } from 'lucide-react'
import { KpiCard } from '../cards/KpiCard'
import { AreaChartComponent } from '../charts/AreaChart'
import { Spinner } from '../ui/Spinner'
import { useNetworkTvl, useNetworkDexVolume, useTokenPrices, useNetworkSnapshot } from '../../hooks/useSupabase'
import { formatUsd, formatNumber, formatGwei } from '../../lib/format'

export function OverviewPage() {
  const tvl = useNetworkTvl()
  const dex = useNetworkDexVolume()
  const prices = useTokenPrices()
  const snapshot = useNetworkSnapshot()

  const latestTvl = tvl.data.length > 0 ? tvl.data[tvl.data.length - 1] : null
  const latestSnapshot = snapshot.data.length > 0 ? snapshot.data[0] : null
  const plsPrice = prices.data.find((p) => p.symbol === 'PLS')

  // Last 180 days for charts
  const tvlRecent = tvl.data.slice(-180)
  const dexRecent = dex.data.slice(-180)

  if (tvl.loading && prices.loading) return <Spinner />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">PulseChain Overview</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="PLS Price"
          value={plsPrice?.price_usd ? `$${plsPrice.price_usd.toFixed(6)}` : '--'}
          trend={plsPrice?.price_change_24h_pct ?? undefined}
          subtitle="24h change"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiCard
          title="Chain TVL"
          value={latestTvl ? formatUsd(latestTvl.tvl_usd) : '--'}
          subtitle={latestTvl?.date || ''}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          title="Gas Price"
          value={latestSnapshot ? `${formatGwei(latestSnapshot.gas_price_gwei)} Gwei` : '--'}
          subtitle={latestSnapshot ? `Base: ${formatGwei(latestSnapshot.base_fee_gwei)}` : ''}
          icon={<Fuel className="h-5 w-5" />}
        />
        <KpiCard
          title="Latest Block"
          value={latestSnapshot ? formatNumber(latestSnapshot.block_number) : '--'}
          icon={<Box className="h-5 w-5" />}
        />
      </div>

      {/* TVL Chart */}
      <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Total Value Locked (TVL)</h2>
        {tvlRecent.length > 0 ? (
          <AreaChartComponent data={tvlRecent} xKey="date" yKey="tvl_usd" color="#34d399" />
        ) : (
          <p className="py-12 text-center text-gray-500">No TVL data available</p>
        )}
      </div>

      {/* DEX Volume Chart */}
      <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">DEX Volume (PulseX)</h2>
        {dexRecent.length > 0 ? (
          <AreaChartComponent data={dexRecent} xKey="date" yKey="volume_usd" color="#60a5fa" />
        ) : (
          <p className="py-12 text-center text-gray-500">No DEX volume data available</p>
        )}
      </div>

      {/* Token Prices Table */}
      <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Token Prices</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="py-3 pr-4">Token</th>
                <th className="py-3 pr-4 text-right">Price</th>
                <th className="py-3 pr-4 text-right">24h Change</th>
                <th className="py-3 pr-4 text-right">Market Cap</th>
                <th className="py-3 text-right">24h Volume</th>
              </tr>
            </thead>
            <tbody>
              {prices.data.map((token) => (
                <tr key={token.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-white">{token.symbol}</span>
                    <span className="ml-2 text-gray-500">{token.name}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-white">
                    {token.price_usd != null
                      ? token.price_usd < 0.01
                        ? `$${token.price_usd.toFixed(6)}`
                        : `$${token.price_usd.toFixed(2)}`
                      : '--'}
                  </td>
                  <td className={`py-2.5 pr-4 text-right ${
                    (token.price_change_24h_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {token.price_change_24h_pct != null
                      ? `${token.price_change_24h_pct >= 0 ? '+' : ''}${token.price_change_24h_pct.toFixed(2)}%`
                      : '--'}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-300">
                    {formatUsd(token.market_cap_usd)}
                  </td>
                  <td className="py-2.5 text-right text-gray-300">
                    {formatUsd(token.volume_24h_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
