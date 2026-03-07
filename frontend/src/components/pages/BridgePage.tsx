import { useState, useMemo } from 'react'
import { ArrowDownUp, Coins, Hash, DollarSign, Globe } from 'lucide-react'

function WhaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
      {/* Tail fluke — Y shape rising from water */}
      <path d="M12 4C10 4 8.5 6 7.5 8.5C6.5 7 5 6 3.5 5.5C3.2 5.4 3 5.7 3.2 5.9C4.5 7.5 5.5 9.5 6 12L7 12C7.5 9.5 9 7 10.5 5.5L10.5 14L13.5 14L13.5 5.5C15 7 16.5 9.5 17 12L18 12C18.5 9.5 19.5 7.5 20.8 5.9C21 5.7 20.8 5.4 20.5 5.5C19 6 17.5 7 16.5 8.5C15.5 6 14 4 12 4Z" fill="currentColor" stroke="none" />
      {/* Wave lines */}
      <path d="M3 16.5Q6 15 9 16.5Q12 18 15 16.5Q18 15 21 16.5" fill="none" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4 19Q7 17.5 10 19Q13 20.5 16 19Q19 17.5 22 19" fill="none" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <path d="M5 21.2Q8 19.8 11 21.2Q14 22.5 17 21.2Q20 19.8 23 21.2" fill="none" strokeWidth="0.7" strokeLinecap="round" opacity="0.3" />
    </svg>
  )
}

import { KpiCard } from '../cards/KpiCard'
import { TokenTable } from '../cards/TokenTable'
import { ChainTable } from '../cards/ChainTable'
import { BarChartComponent } from '../charts/BarChart'
import { AreaChartComponent } from '../charts/AreaChart'
import { PieChartComponent } from '../charts/PieChart'
import { Tabs } from '../ui/Tabs'
import { Spinner } from '../ui/Spinner'
import {
  useBridgeDailyStats, useBridgeTokenStats, useBridgeTransfers, useBridgeWhales,
  useHyperlaneDailyStats, useHyperlaneChainStats, useHyperlaneTransfers, useHyperlaneWhales,
} from '../../hooks/useSupabase'
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

const EXPLORER_URLS: Record<number, { name: string; url: string }> = {
  1: { name: 'ETH', url: 'https://etherscan.io/tx/' },
  10: { name: 'OP', url: 'https://optimistic.etherscan.io/tx/' },
  56: { name: 'BSC', url: 'https://bscscan.com/tx/' },
  100: { name: 'GNOSIS', url: 'https://gnosisscan.io/tx/' },
  137: { name: 'POLY', url: 'https://polygonscan.com/tx/' },
  369: { name: 'PLS', url: 'https://scan.pulsechain.com/tx/' },
  8453: { name: 'BASE', url: 'https://basescan.org/tx/' },
  42161: { name: 'ARB', url: 'https://arbiscan.io/tx/' },
  43114: { name: 'AVAX', url: 'https://subnets.avax.network/c-chain/tx/' },
}

const CHAIN_ABBREV: Record<string, string> = {
  ethereum: 'ETH',
  optimism: 'OP',
  bsc: 'BSC',
  gnosis: 'GNO',
  unichain: 'UNI',
  polygon: 'POLY',
  fantom: 'FTM',
  pulsechain: 'PLS',
  sei: 'SEI',
  base: 'BASE',
  arbitrum: 'ARB',
  avalanche: 'AVAX',
}

function chainLabel(name: string | null): string {
  if (!name) return '?'
  return CHAIN_ABBREV[name.toLowerCase()] || name.toUpperCase()
}

const BRIDGE_TABS = [
  { id: 'all', label: 'All Bridges' },
  { id: 'omni', label: 'OmniBridge' },
  { id: 'hyperlane', label: 'Hyperlane' },
]

export function BridgePage() {
  const [activeTab, setActiveTab] = useState('all')

  // OmniBridge data
  const daily = useBridgeDailyStats()
  const tokens = useBridgeTokenStats()
  const transfers = useBridgeTransfers()
  const whales = useBridgeWhales(50000)

  // Hyperlane data
  const hlDaily = useHyperlaneDailyStats()
  const hlChains = useHyperlaneChainStats()
  const hlTransfers = useHyperlaneTransfers()
  const hlWhales = useHyperlaneWhales(10000)

  // OmniBridge KPIs
  const omniKpis = useMemo(() => {
    if (!daily.data.length) return null
    const totalDeposits = daily.data.reduce((s, d) => s + d.deposit_volume_usd, 0)
    const totalWithdrawals = daily.data.reduce((s, d) => s + d.withdrawal_volume_usd, 0)
    const totalTxs = daily.data.reduce((s, d) => s + d.deposit_count + d.withdrawal_count, 0)
    const last30 = daily.data.slice(-30)
    const volume30d = last30.reduce((s, d) => s + d.deposit_volume_usd + d.withdrawal_volume_usd, 0)
    return { totalVolume: totalDeposits + totalWithdrawals, totalTxs, volume30d }
  }, [daily.data])

  // Hyperlane KPIs
  const hlKpis = useMemo(() => {
    if (!hlDaily.data.length) return null
    const totalVolume = hlDaily.data.reduce((s, d) => s + d.inbound_volume_usd + d.outbound_volume_usd, 0)
    const totalTxs = hlDaily.data.reduce((s, d) => s + d.inbound_count + d.outbound_count, 0)
    const last30 = hlDaily.data.slice(-30)
    const volume30d = last30.reduce((s, d) => s + d.inbound_volume_usd + d.outbound_volume_usd, 0)
    const connectedChains = new Set(hlChains.data.map((c) => c.chain_id)).size
    return { totalVolume, totalTxs, volume30d, connectedChains }
  }, [hlDaily.data, hlChains.data])

  // OmniBridge charts
  const dailyRecent = daily.data.slice(-90)
  const cumulativeFlow = useMemo(() => {
    let cumul = 0
    return daily.data.map((d) => {
      cumul += d.net_flow_usd
      return { date: d.date, cumulative_net_flow: cumul }
    })
  }, [daily.data])
  const cumulativeRecent = cumulativeFlow.slice(-180)
  const pieData = useMemo(() => {
    const top = tokens.data.slice(0, 8)
    return top.map((t) => ({
      name: t.token_symbol || t.token_address.slice(0, 8),
      value: t.total_deposit_volume_usd + t.total_withdrawal_volume_usd,
    }))
  }, [tokens.data])

  // Hyperlane charts
  const hlDailyRecent = hlDaily.data.slice(-90)
  const hlCumulativeFlow = useMemo(() => {
    let cumul = 0
    return hlDaily.data.map((d) => {
      cumul += d.net_flow_usd
      return { date: d.date, cumulative_net_flow: cumul }
    })
  }, [hlDaily.data])
  const hlCumulativeRecent = hlCumulativeFlow.slice(-180)
  const hlPieData = useMemo(() => {
    return hlChains.data.slice(0, 8).map((c) => ({
      name: c.chain_name || `Chain ${c.chain_id}`,
      value: c.total_inbound_volume_usd + c.total_outbound_volume_usd,
    }))
  }, [hlChains.data])

  if (daily.loading && tokens.loading && hlDaily.loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Bridge Analytics</h1>
        <a
          href="https://dune.com/openpulsechain/pulsechain-bridge-analytics"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[#8000E0]/30 bg-[#8000E0]/10 px-3 py-1.5 text-sm text-[#00D4FF] hover:bg-[#8000E0]/20 transition-colors"
        >
          Dune Dashboard
        </a>
      </div>

      <Tabs tabs={BRIDGE_TABS} active={activeTab} onChange={setActiveTab} />

      {/* ====================== ALL BRIDGES ====================== */}
      {activeTab === 'all' && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              title="Total Volume"
              value={formatUsd((omniKpis?.totalVolume ?? 0) + (hlKpis?.totalVolume ?? 0))}
              subtitle="All bridges combined"
              icon={<DollarSign className="h-5 w-5" />}
            />
            <KpiCard
              title="30D Volume"
              value={formatUsd((omniKpis?.volume30d ?? 0) + (hlKpis?.volume30d ?? 0))}
              subtitle="Last 30 days"
              icon={<ArrowDownUp className="h-5 w-5" />}
            />
            <KpiCard
              title="Total Transactions"
              value={formatNumber((omniKpis?.totalTxs ?? 0) + (hlKpis?.totalTxs ?? 0))}
              icon={<Hash className="h-5 w-5" />}
            />
            <KpiCard
              title="OmniBridge Volume"
              value={formatUsd(omniKpis?.totalVolume ?? 0)}
              subtitle={`Hyperlane: ${formatUsd(hlKpis?.totalVolume ?? 0)}`}
              icon={<Globe className="h-5 w-5" />}
            />
          </div>

          {/* Both whale alerts */}
          {whales.data.length > 0 && (
            <div className="rounded-xl border border-[#FF0040]/20 bg-gray-900/40 backdrop-blur-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <WhaleIcon className="h-5 w-5 text-[#FF0040]" />
                <h2 className="text-lg font-semibold text-white">OmniBridge Whale Alerts</h2>
                <span className="text-xs text-gray-500">Transfers &gt; $50K</span>
              </div>
              <div className="space-y-2">
                {whales.data.slice(0, 10).map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.direction === 'deposit' ? 'bg-[#00D4FF]/10 text-[#00D4FF]' : 'bg-[#FF0040]/10 text-[#FF0040]'
                    }`}>{tx.direction === 'deposit' ? 'ETH → PLS' : 'PLS → ETH'}</span>
                    <span className="text-lg font-bold text-white">{formatUsd(tx.amount_usd)}</span>
                    <span className="text-sm text-gray-400">{tx.token_symbol || '--'}</span>
                    <span className="font-mono text-xs text-gray-500">{shortenAddress(tx.user_address)}</span>
                    <span className="ml-auto text-xs text-gray-500">{formatDate(tx.block_timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hlWhales.data.length > 0 && (
            <div className="rounded-xl border border-[#4040E0]/20 bg-gray-900/40 backdrop-blur-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <WhaleIcon className="h-5 w-5 text-[#4040E0]" />
                <h2 className="text-lg font-semibold text-white">Hyperlane Whale Alerts</h2>
                <span className="text-xs text-gray-500">Transfers &gt; $10K</span>
              </div>
              <div className="space-y-2">
                {hlWhales.data.slice(0, 10).map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.direction === 'inbound' ? 'bg-[#00D4FF]/10 text-[#00D4FF]' : 'bg-[#FF0040]/10 text-[#FF0040]'
                    }`}>{tx.direction === 'inbound'
                      ? `${chainLabel(tx.origin_chain_name)} → PLS`
                      : `PLS → ${chainLabel(tx.destination_chain_name)}`}</span>
                    <span className="text-lg font-bold text-white">{formatUsd(tx.amount_usd)}</span>
                    <span className="text-sm text-gray-400">{tx.token_symbol || '--'}</span>
                    <span className="font-mono text-xs text-gray-500">{shortenAddress(tx.origin_tx_sender || '')}</span>
                    <span className="ml-auto text-xs text-gray-500">{formatDate(tx.send_occurred_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </>
      )}

      {/* ====================== OMNIBRIDGE ====================== */}
      {activeTab === 'omni' && (
        <>
          {omniKpis && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard title="Total Volume" value={formatUsd(omniKpis.totalVolume)} subtitle="All time" icon={<DollarSign className="h-5 w-5" />} />
              <KpiCard title="30D Volume" value={formatUsd(omniKpis.volume30d)} subtitle="Last 30 days" icon={<ArrowDownUp className="h-5 w-5" />} />
              <KpiCard title="Total Transactions" value={formatNumber(omniKpis.totalTxs)} icon={<Hash className="h-5 w-5" />} />
              <KpiCard title="Tokens Tracked" value={formatNumber(tokens.data.length)} icon={<Coins className="h-5 w-5" />} />
            </div>
          )}

          {whales.data.length > 0 && (
            <div className="rounded-xl border border-[#FF0040]/20 bg-gray-900/40 backdrop-blur-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <WhaleIcon className="h-5 w-5 text-[#FF0040]" />
                <h2 className="text-lg font-semibold text-white">Whale Alerts</h2>
                <span className="text-xs text-gray-500">Transfers &gt; $50K</span>
              </div>
              <div className="space-y-2">
                {whales.data.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.direction === 'deposit' ? 'bg-[#00D4FF]/10 text-[#00D4FF]' : 'bg-[#FF0040]/10 text-[#FF0040]'
                    }`}>{tx.direction === 'deposit' ? 'ETH → PLS' : 'PLS → ETH'}</span>
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

          <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
            <h2 className="mb-4 text-lg font-semibold text-white">Daily Deposits vs Withdrawals</h2>
            {dailyRecent.length > 0 ? (
              <BarChartComponent data={dailyRecent} xKey="date" bars={[
                { key: 'deposit_volume_usd', color: '#00D4FF', name: 'Deposits' },
                { key: 'withdrawal_volume_usd', color: '#FF0040', name: 'Withdrawals' },
              ]} />
            ) : (
              <p className="py-12 text-center text-gray-500">No daily data available</p>
            )}
          </div>

          <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
            <h2 className="mb-4 text-lg font-semibold text-white">Cumulative Net Flow</h2>
            {cumulativeRecent.length > 0 ? (
              <AreaChartComponent data={cumulativeRecent} xKey="date" yKey="cumulative_net_flow" color="#00D4FF" />
            ) : (
              <p className="py-12 text-center text-gray-500">No flow data available</p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Top Tokens by Volume</h2>
              {pieData.length > 0 ? <PieChartComponent data={pieData} /> : <p className="py-12 text-center text-gray-500">No token data</p>}
            </div>
            <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Token Breakdown</h2>
              <div className="max-h-[350px] overflow-y-auto">
                <TokenTable data={tokens.data.slice(0, 20)} />
              </div>
            </div>
          </div>

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
                          tx.direction === 'deposit' ? 'bg-[#00D4FF]/10 text-[#00D4FF]' : 'bg-[#FF0040]/10 text-[#FF0040]'
                        }`}>{tx.direction === 'deposit' ? 'ETH → PLS' : 'PLS → ETH'}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-white">{tx.token_symbol || '--'}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-300 font-mono text-xs">{formatAmount(tx.amount_raw, tx.token_decimals)}</td>
                      <td className="py-2.5 pr-4 font-mono text-gray-400 text-xs">{shortenAddress(tx.user_address)}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs ${tx.status === 'executed' ? 'text-emerald-400' : 'text-yellow-400'}`}>{tx.status}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-400 text-xs">{formatDate(tx.block_timestamp)}</td>
                      <td className="py-2.5 text-right">
                        {tx.tx_hash_eth && (
                          <a href={`https://etherscan.io/tx/${tx.tx_hash_eth}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#4040E0] hover:text-[#00D4FF] transition-colors">ETH</a>
                        )}
                        {tx.tx_hash_eth && tx.tx_hash_pls && ' | '}
                        {tx.tx_hash_pls && (
                          <a href={`https://scan.pulsechain.com/tx/${tx.tx_hash_pls}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#8000E0] hover:text-[#D000C0] transition-colors">PLS</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ====================== HYPERLANE ====================== */}
      {activeTab === 'hyperlane' && (
        <>
          {hlKpis && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard title="Total Volume" value={formatUsd(hlKpis.totalVolume)} subtitle="All time" icon={<DollarSign className="h-5 w-5" />} />
              <KpiCard title="30D Volume" value={formatUsd(hlKpis.volume30d)} subtitle="Last 30 days" icon={<ArrowDownUp className="h-5 w-5" />} />
              <KpiCard title="Total Transfers" value={formatNumber(hlKpis.totalTxs)} icon={<Hash className="h-5 w-5" />} />
              <KpiCard title="Connected Chains" value={formatNumber(hlKpis.connectedChains)} icon={<Globe className="h-5 w-5" />} />
            </div>
          )}

          {hlWhales.data.length > 0 && (
            <div className="rounded-xl border border-[#4040E0]/20 bg-gray-900/40 backdrop-blur-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <WhaleIcon className="h-5 w-5 text-[#4040E0]" />
                <h2 className="text-lg font-semibold text-white">Whale Alerts</h2>
                <span className="text-xs text-gray-500">Transfers &gt; $10K</span>
              </div>
              <div className="space-y-2">
                {hlWhales.data.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.direction === 'inbound' ? 'bg-[#00D4FF]/10 text-[#00D4FF]' : 'bg-[#FF0040]/10 text-[#FF0040]'
                    }`}>{tx.direction === 'inbound'
                      ? `${chainLabel(tx.origin_chain_name)} → PLS`
                      : `PLS → ${chainLabel(tx.destination_chain_name)}`}</span>
                    <span className="text-lg font-bold text-white">{formatUsd(tx.amount_usd)}</span>
                    <span className="text-sm text-gray-400">{tx.token_symbol || '--'}</span>
                    <span className="font-mono text-xs text-gray-500">{shortenAddress(tx.origin_tx_sender || '')}</span>
                    <span className="ml-auto text-xs text-gray-500">{formatDate(tx.send_occurred_at)}</span>
                    <span className="flex gap-1">
                      {tx.origin_tx_hash && (() => {
                        const exp = EXPLORER_URLS[tx.origin_chain_id]
                        return exp ? (
                          <a href={`${exp.url}${tx.origin_tx_hash}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#4040E0] hover:text-[#00D4FF] transition-colors">{exp.name}</a>
                        ) : null
                      })()}
                      {tx.destination_tx_hash && (() => {
                        const exp = EXPLORER_URLS[tx.destination_chain_id]
                        return exp ? (
                          <a href={`${exp.url}${tx.destination_tx_hash}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#8000E0] hover:text-[#D000C0] transition-colors">{exp.name}</a>
                        ) : null
                      })()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
            <h2 className="mb-4 text-lg font-semibold text-white">Daily Inbound vs Outbound</h2>
            {hlDailyRecent.length > 0 ? (
              <BarChartComponent data={hlDailyRecent} xKey="date" bars={[
                { key: 'inbound_volume_usd', color: '#00D4FF', name: 'Inbound' },
                { key: 'outbound_volume_usd', color: '#FF0040', name: 'Outbound' },
              ]} />
            ) : (
              <p className="py-12 text-center text-gray-500">No daily data available</p>
            )}
          </div>

          <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
            <h2 className="mb-4 text-lg font-semibold text-white">Cumulative Net Flow</h2>
            {hlCumulativeRecent.length > 0 ? (
              <AreaChartComponent data={hlCumulativeRecent} xKey="date" yKey="cumulative_net_flow" color="#4040E0" />
            ) : (
              <p className="py-12 text-center text-gray-500">No flow data available</p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Volume by Chain</h2>
              {hlPieData.length > 0 ? <PieChartComponent data={hlPieData} /> : <p className="py-12 text-center text-gray-500">No chain data</p>}
            </div>
            <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Chain Breakdown</h2>
              <div className="max-h-[350px] overflow-y-auto">
                <ChainTable data={hlChains.data} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
            <h2 className="mb-4 text-lg font-semibold text-white">Recent Transfers</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400">
                    <th className="py-3 pr-4">Route</th>
                    <th className="py-3 pr-4">Token</th>
                    <th className="py-3 pr-4 text-right">Amount</th>
                    <th className="py-3 pr-4">User</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4 text-right">Time</th>
                    <th className="py-3 text-right">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {hlTransfers.data.map((tx) => (
                    <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2.5 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          tx.direction === 'inbound' ? 'bg-[#00D4FF]/10 text-[#00D4FF]' : 'bg-[#FF0040]/10 text-[#FF0040]'
                        }`}>
                          {tx.direction === 'inbound'
                            ? `${chainLabel(tx.origin_chain_name)} → PLS`
                            : `PLS → ${chainLabel(tx.destination_chain_name)}`}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-white">{tx.token_symbol || '--'}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-300 font-mono text-xs">
                        {tx.amount_usd != null ? formatUsd(tx.amount_usd) : '--'}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-gray-400 text-xs">{shortenAddress(tx.origin_tx_sender || '')}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs ${tx.is_delivered ? 'text-emerald-400' : 'text-yellow-400'}`}>
                          {tx.is_delivered ? 'delivered' : 'pending'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-400 text-xs">{formatDate(tx.send_occurred_at)}</td>
                      <td className="py-2.5 text-right flex gap-1 justify-end">
                        {tx.origin_tx_hash && (() => {
                          const exp = EXPLORER_URLS[tx.origin_chain_id]
                          return exp ? (
                            <a href={`${exp.url}${tx.origin_tx_hash}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#4040E0] hover:text-[#00D4FF] transition-colors">{exp.name}</a>
                          ) : null
                        })()}
                        {tx.destination_tx_hash && (() => {
                          const exp = EXPLORER_URLS[tx.destination_chain_id]
                          return exp ? (
                            <a href={`${exp.url}${tx.destination_tx_hash}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#8000E0] hover:text-[#D000C0] transition-colors">{exp.name}</a>
                          ) : null
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
