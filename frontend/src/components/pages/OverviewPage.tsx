import { useMemo, useState } from 'react'
import { DollarSign, TrendingUp, Fuel, Box } from 'lucide-react'
import { KpiCard } from '../cards/KpiCard'
import { AreaChartComponent } from '../charts/AreaChart'
import { Spinner } from '../ui/Spinner'
import { TimeRangeSelector } from '../ui/TimeRangeSelector'
import { useNetworkTvl, useNetworkDexVolume, useTokenPrices, useNetworkSnapshot } from '../../hooks/useSupabase'
import { formatUsd, formatNumber, formatGwei } from '../../lib/format'

// Standard gas limits for common operations on PulseChain
const GAS_ESTIMATES = [
  { label: 'PLS Send', gasLimit: 21000 },
  { label: 'Token Transfer', gasLimit: 65000 },
  { label: 'Token Approval', gasLimit: 46000 },
  { label: 'DEX Swap', gasLimit: 200000 },
  { label: 'Add Liquidity', gasLimit: 300000 },
  { label: 'Bridge Transfer', gasLimit: 250000 },
]

export function OverviewPage() {
  const tvl = useNetworkTvl()
  const dex = useNetworkDexVolume()
  const prices = useTokenPrices()
  const snapshot = useNetworkSnapshot()

  const latestTvl = tvl.data.length > 0 ? tvl.data[tvl.data.length - 1] : null
  const latestSnapshot = snapshot.data.length > 0 ? snapshot.data[0] : null
  const plsPrice = prices.data.find((p) => p.symbol === 'PLS')

  // Gas estimates computed from gas price + PLS price
  const gasEstimates = useMemo(() => {
    if (!latestSnapshot || !plsPrice?.price_usd) return null
    const gasPriceGwei = latestSnapshot.gas_price_gwei
    return GAS_ESTIMATES.map((e) => {
      const costPls = (gasPriceGwei * e.gasLimit) / 1e9
      const costUsd = costPls * plsPrice.price_usd!
      return { ...e, costPls, costUsd }
    })
  }, [latestSnapshot, plsPrice])

  const [tvlRange, setTvlRange] = useState<number | null>(null)
  const [dexRange, setDexRange] = useState<number | null>(null)

  const tvlRecent = tvlRange ? tvl.data.slice(-tvlRange) : tvl.data
  const dexRecent = dexRange ? dex.data.slice(-dexRange) : dex.data

  // Sort tokens: real market cap first, then $0
  const sortedPrices = [...prices.data].sort((a, b) => {
    const aCap = a.market_cap_usd ?? 0
    const bCap = b.market_cap_usd ?? 0
    if (aCap > 0 && bCap === 0) return -1
    if (aCap === 0 && bCap > 0) return 1
    return bCap - aCap
  })

  if (tvl.loading && prices.loading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-xl border border-white/5 bg-gray-900/30 backdrop-blur-sm p-6 sm:p-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-[#00D4FF] to-[#8000E0] bg-clip-text text-transparent">
          PulseChain Analytics
        </h1>
        <p className="mt-2 text-gray-400 max-w-xl mx-auto">
          Open-source, sovereign data for PulseChain. 2500+ tokens, bridge flows, DEX volume — powered by PulseX Subgraph.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-[#00D4FF]">Free API</span>
          <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-[#00D4FF]">100% On-chain</span>
          <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-[#00D4FF]">Open Source</span>
          <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-[#00D4FF]">No Auth Required</span>
        </div>
      </div>

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
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Total Value Locked (TVL)</h2>
          <TimeRangeSelector value={tvlRange} onChange={setTvlRange} />
        </div>
        {tvlRecent.length > 0 ? (
          <AreaChartComponent data={tvlRecent} xKey="date" yKey="tvl_usd" color="#00D4FF" />
        ) : (
          <p className="py-12 text-center text-gray-500">No TVL data available</p>
        )}
      </div>

      {/* DEX Volume Chart */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">DEX Volume (PulseX)</h2>
          <TimeRangeSelector value={dexRange} onChange={setDexRange} />
        </div>
        {dexRecent.length > 0 ? (
          <AreaChartComponent data={dexRecent} xKey="date" yKey="volume_usd" color="#8000E0" />
        ) : (
          <p className="py-12 text-center text-gray-500">No DEX volume data available</p>
        )}
      </div>

      {/* Gas Estimates */}
      {gasEstimates && (
        <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Fuel className="h-5 w-5 text-[#00D4FF]" />
            <h2 className="text-lg font-semibold text-white">Gas Estimates</h2>
            <span className="text-xs text-gray-500">@ {formatGwei(latestSnapshot!.gas_price_gwei)} Gwei</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {gasEstimates.map((e) => (
              <div key={e.label} className="rounded-lg bg-white/5 p-3">
                <div className="text-xs text-gray-400 mb-1">{e.label}</div>
                <div className="text-sm font-medium text-white">
                  {e.costPls < 1
                    ? e.costPls.toFixed(4)
                    : e.costPls.toLocaleString('en-US', { maximumFractionDigits: 1 })} PLS
                </div>
                <div className="text-xs text-gray-500">
                  ${e.costUsd < 0.01 ? e.costUsd.toFixed(6) : e.costUsd.toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Token Prices Table */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Token Prices</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-gray-400">
                <th className="py-3 pr-4">Token</th>
                <th className="py-3 pr-4 text-right">Price</th>
                <th className="py-3 pr-4 text-right">24h Change</th>
                <th className="py-3 pr-4 text-right">Market Cap</th>
                <th className="py-3 text-right">24h Volume</th>
              </tr>
            </thead>
            <tbody>
              {sortedPrices.map((token) => (
                <tr key={token.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-white">{token.symbol}</span>
                    <span className="ml-2 text-gray-500">{token.name}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-white">
                    {token.price_usd != null
                      ? token.price_usd < 0.01
                        ? `$${token.price_usd.toFixed(6)}`
                        : `$${token.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
