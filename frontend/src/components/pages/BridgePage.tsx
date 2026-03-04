import { useMemo } from 'react'
import { ArrowDownUp, Users, Hash, DollarSign } from 'lucide-react'
import { KpiCard } from '../cards/KpiCard'
import { TokenTable } from '../cards/TokenTable'
import { BarChartComponent } from '../charts/BarChart'
import { AreaChartComponent } from '../charts/AreaChart'
import { PieChartComponent } from '../charts/PieChart'
import { Spinner } from '../ui/Spinner'
import { useBridgeDailyStats, useBridgeTokenStats, useBridgeTransfers } from '../../hooks/useSupabase'
import { formatUsd, formatNumber, formatDate, shortenAddress } from '../../lib/format'

export function BridgePage() {
  const daily = useBridgeDailyStats()
  const tokens = useBridgeTokenStats()
  const transfers = useBridgeTransfers()

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
          className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:text-white"
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
            icon={<Users className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Daily Flows Bar Chart */}
      <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Daily Deposits vs Withdrawals</h2>
        {dailyRecent.length > 0 ? (
          <BarChartComponent
            data={dailyRecent}
            xKey="date"
            bars={[
              { key: 'deposit_volume_usd', color: '#34d399', name: 'Deposits' },
              { key: 'withdrawal_volume_usd', color: '#f87171', name: 'Withdrawals' },
            ]}
          />
        ) : (
          <p className="py-12 text-center text-gray-500">No daily data available</p>
        )}
      </div>

      {/* Cumulative Net Flow */}
      <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Cumulative Net Flow</h2>
        {cumulativeRecent.length > 0 ? (
          <AreaChartComponent data={cumulativeRecent} xKey="date" yKey="cumulative_net_flow" color="#60a5fa" />
        ) : (
          <p className="py-12 text-center text-gray-500">No flow data available</p>
        )}
      </div>

      {/* Token Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Top Tokens by Volume</h2>
          {pieData.length > 0 ? (
            <PieChartComponent data={pieData} />
          ) : (
            <p className="py-12 text-center text-gray-500">No token data</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Token Breakdown</h2>
          <div className="max-h-[350px] overflow-y-auto">
            <TokenTable data={tokens.data.slice(0, 20)} />
          </div>
        </div>
      </div>

      {/* Recent Transfers */}
      <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Recent Transfers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="py-3 pr-4">Direction</th>
                <th className="py-3 pr-4">Token</th>
                <th className="py-3 pr-4">User</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4 text-right">Time</th>
                <th className="py-3 text-right">Tx</th>
              </tr>
            </thead>
            <tbody>
              {transfers.data.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-2.5 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.direction === 'deposit'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}>
                      {tx.direction === 'deposit' ? 'ETH → PLS' : 'PLS → ETH'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-white">{tx.token_symbol || '--'}</td>
                  <td className="py-2.5 pr-4 font-mono text-gray-400">{shortenAddress(tx.user_address)}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs ${
                      tx.status === 'executed' ? 'text-emerald-400' : 'text-yellow-400'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-400">{formatDate(tx.block_timestamp)}</td>
                  <td className="py-2.5 text-right">
                    {tx.tx_hash_eth && (
                      <a
                        href={`https://etherscan.io/tx/${tx.tx_hash_eth}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline"
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
                        className="text-xs text-purple-400 hover:underline"
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
