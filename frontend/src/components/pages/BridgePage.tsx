import { useMemo } from 'react'
import { ArrowDownUp, Coins, Hash, DollarSign, Fish } from 'lucide-react'
import { KpiCard } from '../cards/KpiCard'
import { TokenTable } from '../cards/TokenTable'
import { BarChartComponent } from '../charts/BarChart'
import { AreaChartComponent } from '../charts/AreaChart'
import { PieChartComponent } from '../charts/PieChart'
import { Spinner } from '../ui/Spinner'
import { useBridgeDailyStats, useBridgeTokenStats, useBridgeTransfers, useBridgeWhales } from '../../hooks/useSupabase'
import { formatUsd, formatNumber, formatDate, shortenAddress } from '../../lib/format'

function formatAmount(raw: string | null, decimals: number | null): string {
  if (!raw) return '--'
  const dec = decimals ?? 18
  const val = Number(raw) / Math.pow(10, dec)
  if (val >= 1_000_000) return `${(val / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`
  if (val >= 1_000) return `${(val / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`
  if (val >= 1) return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return val.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function BridgePage() {
  const daily = useBridgeDailyStats()
  const tokens = useBridgeTokenStats()
  const transfers = useBridgeTransfers()
  const whales = useBridgeWhales(50000)

  // Compute KPIs from daily stats
  const kpis = useMemo(() => {
    if (!daily.data.length) return null
    const totalDeposits = daily.data.reduce((s, d) => s + d.deposit_volume_usd, 0)
    const totalWithdrawals = daily.data.reduce((s, d) => s + d.withdrawal_volume_usd, 0)
    const totalTxs = daily.data.reduce((s, d) => s + d.deposit_count + d.withdrawal_count, 0)
    const last30 = daily.data.slice(-30)
    const volume30d = last30.reduce((s, d) => s + d.deposit_volume_usd + d.withdrawal_volume_usd, 0)
    return { totalDeposits, totalWithdrawals, totalVolume: totalDeposits + totalWithdrawals, totalTxs, volume30d }
  }, [daily.data])

  // Recent 90 days for bar chart
  const dailyRecent = daily.data.slice(-90)

  // Cumulative net flow
  const cumulativeFlow = useMemo(() => {
    let cumul = 0
    return daily.data.map((d) => {
      cumul += d.net_flow_usd
      return { date: d.date, cumulative_net_flow: cumul }
    })
  }, [daily.data])
  const cumulativeRecent = cumulativeFlow.slice(-180)

  // Top tokens for pie chart
  const pieData = useMemo(() => {
    const top = tokens.data.slice(0, 8)
    return top.map((t) => ({
      name: t.token_symbol || t.token_address.slice(0, 8),
      value: t.total_deposit_volume_usd + t.total_withdrawal_volume_usd,
    }))
  }, [tokens.data])

  if (daily.loading && tokens.loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">OmniBridge Analytics</h1>
        <a
          href="https://dune.com/evasentience/pulsechain-bridge-analytics"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[#8000E0]/30 bg-[#8000E0]/10 px-3 py-1.5 text-sm text-[#00D4FF] hover:bg-[#8000E0]/20 transition-colors"
        >
          Dune Dashboard
        </a>
      </div>

      {/* KPI Row */}
      {kpis && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Total Volume"
            value={formatUsd(kpis.totalVolume)}
            subtitle="All time"
            icon={<DollarSign className="h-5 w-5" />}
          />
          <KpiCard
            title="30D Volume"
            value={formatUsd(kpis.volume30d)}
            subtitle="Last 30 days"
            icon={<ArrowDownUp className="h-5 w-5" />}
          />
          <KpiCard
            title="Total Transactions"
            value={formatNumber(kpis.totalTxs)}
            icon={<Hash className="h-5 w-5" />}
          />
          <KpiCard
            title="Tokens Tracked"
            value={formatNumber(tokens.data.length)}
            icon={<Coins className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Whale Alerts */}
      {whales.data.length > 0 && (
        <div className="rounded-xl border border-[#FF0040]/20 bg-gray-900/40 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Fish className="h-5 w-5 text-[#FF0040]" />
            <h2 className="text-lg font-semibold text-white">Whale Alerts</h2>
            <span className="text-xs text-gray-500">Transfers &gt; $50K</span>
          </div>
          <div className="space-y-2">
            {whales.data.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  tx.direction === 'deposit'
                    ? 'bg-[#00D4FF]/10 text-[#00D4FF]'
                    : 'bg-[#FF0040]/10 text-[#FF0040]'
                }`}>
                  {tx.direction === 'deposit' ? 'ETH → PLS' : 'PLS → ETH'}
                </span>
                <span className="text-lg font-bold text-white">{formatUsd(tx.amount_usd)}</span>
                <span className="text-sm text-gray-400">{tx.token_symbol || '--'}</span>
                <span className="font-mono text-xs text-gray-500">{shortenAddress(tx.user_address)}</span>
                <span className="ml-auto text-xs text-gray-500">{formatDate(tx.block_timestamp)}</span>
                <span className="flex gap-1">
                  {tx.tx_hash_eth && (
                    <a href={`https://etherscan.io/tx/${tx.tx_hash_eth}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#4040E0] hover:text-[#00D4FF] transition-colors">ETH</a>
                  )}
                  {tx.tx_hash_pls && (
                    <a href={`https://scan.pulsechain.com/tx/${tx.tx_hash_pls}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#8000E0] hover:text-[#D000C0] transition-colors">PLS</a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Flows Bar Chart */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Daily Deposits vs Withdrawals</h2>
        {dailyRecent.length > 0 ? (
          <BarChartComponent
            data={dailyRecent}
            xKey="date"
            bars={[
              { key: 'deposit_volume_usd', color: '#00D4FF', name: 'Deposits' },
              { key: 'withdrawal_volume_usd', color: '#FF0040', name: 'Withdrawals' },
            ]}
          />
        ) : (
          <p className="py-12 text-center text-gray-500">No daily data available</p>
        )}
      </div>

      {/* Cumulative Net Flow */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Cumulative Net Flow</h2>
        {cumulativeRecent.length > 0 ? (
          <AreaChartComponent data={cumulativeRecent} xKey="date" yKey="cumulative_net_flow" color="#00D4FF" />
        ) : (
          <p className="py-12 text-center text-gray-500">No flow data available</p>
        )}
      </div>

      {/* Token Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Top Tokens by Volume</h2>
          {pieData.length > 0 ? (
            <PieChartComponent data={pieData} />
          ) : (
            <p className="py-12 text-center text-gray-500">No token data</p>
          )}
        </div>
        <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Token Breakdown</h2>
          <div className="max-h-[350px] overflow-y-auto">
            <TokenTable data={tokens.data.slice(0, 20)} />
          </div>
        </div>
      </div>

      {/* Recent Transfers */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Recent Transfers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-gray-400">
                <th className="py-3 pr-4">Direction</th>
                <th className="py-3 pr-4">Token</th>
                <th className="py-3 pr-4 text-right">Amount</th>
                <th className="py-3 pr-4">User</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4 text-right">Time</th>
                <th className="py-3 text-right">Tx</th>
              </tr>
            </thead>
            <tbody>
              {transfers.data.map((tx) => (
                <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-2.5 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.direction === 'deposit'
                        ? 'bg-[#00D4FF]/10 text-[#00D4FF]'
                        : 'bg-[#FF0040]/10 text-[#FF0040]'
                    }`}>
                      {tx.direction === 'deposit' ? 'ETH → PLS' : 'PLS → ETH'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-white">{tx.token_symbol || '--'}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-300 font-mono text-xs">
                    {formatAmount(tx.amount_raw, tx.token_decimals)}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-gray-400 text-xs">{shortenAddress(tx.user_address)}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs ${
                      tx.status === 'executed' ? 'text-emerald-400' : 'text-yellow-400'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-400 text-xs">{formatDate(tx.block_timestamp)}</td>
                  <td className="py-2.5 text-right">
                    {tx.tx_hash_eth && (
                      <a
                        href={`https://etherscan.io/tx/${tx.tx_hash_eth}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#4040E0] hover:text-[#00D4FF] transition-colors"
                      >
                        ETH
                      </a>
                    )}
                    {tx.tx_hash_eth && tx.tx_hash_pls && ' | '}
                    {tx.tx_hash_pls && (
                      <a
                        href={`https://scan.pulsechain.com/tx/${tx.tx_hash_pls}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#8000E0] hover:text-[#D000C0] transition-colors"
                      >
                        PLS
                      </a>
                    )}
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
