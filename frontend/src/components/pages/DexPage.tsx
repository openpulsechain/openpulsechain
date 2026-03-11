import { useMemo, useState } from 'react'
import { ArrowLeftRight, Droplets, Hash, TrendingUp, Info, ChevronDown } from 'lucide-react'
import { KpiCard } from '../cards/KpiCard'
import { AreaChartComponent } from '../charts/AreaChart'
import { BarChartComponent } from '../charts/BarChart'
import { Spinner } from '../ui/Spinner'
import { TimeRangeSelector } from '../ui/TimeRangeSelector'
import { usePulsexDailyStats, usePulsexTopPairs } from '../../hooks/useSupabase'
import { useLivePulsexFactory } from '../../hooks/useLivePulsexFactory'
import { useLiveDefiLlama } from '../../hooks/useLiveDefiLlama'
import { usePulsexHistory } from '../../hooks/usePulsexHistory'
import { useAllPulsechainDexHistory } from '../../hooks/useAllPulsechainDexHistory'
import { formatUsd, formatNumber } from '../../lib/format'

type DexSource = 'v1' | 'pulsex' | 'all'

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

function DexSourceSelector({ value, onChange }: { value: DexSource; onChange: (v: DexSource) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DexSource)}
        className="appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-1 pr-7 text-xs text-gray-300 cursor-pointer hover:bg-white/10 transition-colors focus:outline-none focus:border-[#00D4FF]/50"
      >
        <option value="v1">PulseX V1 (Subgraph)</option>
        <option value="pulsex">PulseX V1+V2+SS (DefiLlama)</option>
        <option value="all">All PulseChain DEX (DefiLlama)</option>
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
    </div>
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
                  <td className="py-1 pr-3">DefiLlama &quot;PulseX&quot;</td>
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

function ChartDataSourceNote({ source }: { source: DexSource }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        <Info className="h-3 w-3" />
        <span>About this data source</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-lg bg-white/5 border border-white/10 p-4 text-xs text-gray-400 space-y-3">
          {source === 'v1' && (
            <>
              <p className="font-medium text-gray-300">PulseX V1 (Subgraph) — Raw on-chain data from PulseX V1 router</p>
              <p>
                This is our primary historical source, synced daily from the PulseX V1 subgraph (<code className="text-gray-300">pulsexDayDatas</code>).
                It covers only V1 pools. V2 daily data is not yet ingested into our database.
              </p>
              <p>
                Live data point (green dot) is fetched from the V1 subgraph factory contract in real-time every 30 seconds.
              </p>
            </>
          )}
          {source === 'pulsex' && (
            <>
              <p className="font-medium text-gray-300">PulseX (DefiLlama) — V1 + V2 + StableSwap, spam-filtered</p>
              <p>
                DefiLlama aggregates all PulseX sub-protocols (V1, V2, and StableSwap) and applies spam pool filtering.
                This gives the most complete and accurate view of PulseX activity.
              </p>
            </>
          )}
          {source === 'all' && (
            <>
              <p className="font-medium text-gray-300">All PulseChain DEXes (DefiLlama) — Every DEX on the chain</p>
              <p>
                Includes PulseX V1, V2, StableSwap, 9mm V2/V3, PHUX, and all other DEXes tracked by DefiLlama.
                This is the broadest view of trading activity on PulseChain.
              </p>
            </>
          )}

          {/* Cross-source daily comparison table */}
          <div>
            <p className="font-medium text-gray-300 mb-2">Daily volume comparison (last 7 days, verified 11/03/2026)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-1 pr-3 text-gray-500 font-medium">Date</th>
                    <th className="py-1 pr-3 text-right text-gray-500 font-medium">V1 Subgraph</th>
                    <th className="py-1 pr-3 text-right text-gray-500 font-medium">V2 Subgraph</th>
                    <th className="py-1 pr-3 text-right text-gray-500 font-medium">V1+V2 Raw</th>
                    <th className="py-1 pr-3 text-right text-gray-500 font-medium">DefiLlama PulseX</th>
                    <th className="py-1 text-right text-gray-500 font-medium">DefiLlama All DEX</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400 font-mono text-[11px]">
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">05/03</td>
                    <td className="py-1 pr-3 text-right">$3.18M</td>
                    <td className="py-1 pr-3 text-right">$1.94M</td>
                    <td className="py-1 pr-3 text-right text-white">$5.12M</td>
                    <td className="py-1 pr-3 text-right text-emerald-400">$5.67M</td>
                    <td className="py-1 text-right text-[#00D4FF]">$6.52M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">06/03</td>
                    <td className="py-1 pr-3 text-right">$2.63M</td>
                    <td className="py-1 pr-3 text-right">$1.51M</td>
                    <td className="py-1 pr-3 text-right text-white">$4.14M</td>
                    <td className="py-1 pr-3 text-right text-emerald-400">$4.65M</td>
                    <td className="py-1 text-right text-[#00D4FF]">$5.37M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">07/03</td>
                    <td className="py-1 pr-3 text-right">$2.11M</td>
                    <td className="py-1 pr-3 text-right">$1.31M</td>
                    <td className="py-1 pr-3 text-right text-white">$3.42M</td>
                    <td className="py-1 pr-3 text-right text-emerald-400">$3.71M</td>
                    <td className="py-1 text-right text-[#00D4FF]">$4.26M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">08/03</td>
                    <td className="py-1 pr-3 text-right">$1.66M</td>
                    <td className="py-1 pr-3 text-right">$1.15M</td>
                    <td className="py-1 pr-3 text-right text-white">$2.81M</td>
                    <td className="py-1 pr-3 text-right text-emerald-400">$3.10M</td>
                    <td className="py-1 text-right text-[#00D4FF]">$3.44M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">09/03</td>
                    <td className="py-1 pr-3 text-right">$1.91M</td>
                    <td className="py-1 pr-3 text-right">$1.34M</td>
                    <td className="py-1 pr-3 text-right text-white">$3.25M</td>
                    <td className="py-1 pr-3 text-right text-emerald-400">$3.36M</td>
                    <td className="py-1 text-right text-[#00D4FF]">$3.84M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">10/03</td>
                    <td className="py-1 pr-3 text-right">$1.93M</td>
                    <td className="py-1 pr-3 text-right">$1.66M</td>
                    <td className="py-1 pr-3 text-right text-white">$3.59M</td>
                    <td className="py-1 pr-3 text-right text-emerald-400">$3.96M</td>
                    <td className="py-1 text-right text-[#00D4FF]">$4.42M</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Liquidity daily comparison */}
          <div>
            <p className="font-medium text-gray-300 mb-2">Daily liquidity comparison (last 7 days)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-1 pr-3 text-gray-500 font-medium">Date</th>
                    <th className="py-1 pr-3 text-right text-gray-500 font-medium">V1 Subgraph</th>
                    <th className="py-1 pr-3 text-right text-gray-500 font-medium">V2 Subgraph</th>
                    <th className="py-1 pr-3 text-right text-gray-500 font-medium">V1+V2 Raw</th>
                    <th className="py-1 text-right text-gray-500 font-medium">DefiLlama PulseX</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400 font-mono text-[11px]">
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">05/03</td>
                    <td className="py-1 pr-3 text-right">$28.4M</td>
                    <td className="py-1 pr-3 text-right">$19.9M</td>
                    <td className="py-1 pr-3 text-right text-white">$48.4M</td>
                    <td className="py-1 text-right text-emerald-400">$46.6M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">06/03</td>
                    <td className="py-1 pr-3 text-right">$26.5M</td>
                    <td className="py-1 pr-3 text-right">$18.2M</td>
                    <td className="py-1 pr-3 text-right text-white">$44.6M</td>
                    <td className="py-1 text-right text-emerald-400">$42.6M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">07/03</td>
                    <td className="py-1 pr-3 text-right">$28.2M</td>
                    <td className="py-1 pr-3 text-right">$19.5M</td>
                    <td className="py-1 pr-3 text-right text-white">$47.7M</td>
                    <td className="py-1 text-right text-emerald-400">$45.5M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">08/03</td>
                    <td className="py-1 pr-3 text-right">$28.8M</td>
                    <td className="py-1 pr-3 text-right">$19.7M</td>
                    <td className="py-1 pr-3 text-right text-white">$48.5M</td>
                    <td className="py-1 text-right text-emerald-400">$46.2M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">09/03</td>
                    <td className="py-1 pr-3 text-right">$30.9M</td>
                    <td className="py-1 pr-3 text-right">$20.6M</td>
                    <td className="py-1 pr-3 text-right text-white">$51.5M</td>
                    <td className="py-1 text-right text-emerald-400">$48.9M</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 pr-3 font-sans">10/03</td>
                    <td className="py-1 pr-3 text-right">$32.5M</td>
                    <td className="py-1 pr-3 text-right">$20.9M</td>
                    <td className="py-1 pr-3 text-right text-white">$53.4M</td>
                    <td className="py-1 text-right text-emerald-400">$49.8M</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* DefiLlama PulseX breakdown */}
          <div>
            <p className="font-medium text-gray-300 mb-2">DefiLlama PulseX volume breakdown (10/03/2026)</p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-1 pr-3 text-gray-500 font-medium">Sub-protocol</th>
                  <th className="py-1 pr-3 text-right text-gray-500 font-medium">24h Volume</th>
                  <th className="py-1 text-right text-gray-500 font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">PulseX V1</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">$1,927,333</td>
                  <td className="py-1 text-right">48.7%</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">PulseX V2</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">$1,658,644</td>
                  <td className="py-1 text-right">41.9%</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">PulseX StableSwap</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">$371,084</td>
                  <td className="py-1 text-right">9.4%</td>
                </tr>
                <tr className="border-t border-white/10 font-medium">
                  <td className="py-1 pr-3 text-gray-300">Total PulseX</td>
                  <td className="py-1 pr-3 text-right font-mono text-emerald-400">$3,957,061</td>
                  <td className="py-1 text-right text-emerald-400">100%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* All PulseChain DEX protocols */}
          <div>
            <p className="font-medium text-gray-300 mb-2">All PulseChain DEX protocols (DefiLlama, 10/03/2026)</p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-1 pr-3 text-gray-500 font-medium">Protocol</th>
                  <th className="py-1 pr-3 text-right text-gray-500 font-medium">24h Volume</th>
                  <th className="py-1 text-right text-gray-500 font-medium">7d Volume</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">PulseX V1</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">$1,747,186</td>
                  <td className="py-1 text-right font-mono">$16,608,916</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">PulseX V2</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">$1,615,579</td>
                  <td className="py-1 text-right font-mono">$10,652,477</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">PulseX StableSwap</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">$353,353</td>
                  <td className="py-1 text-right font-mono">~$2.1M</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">9mm V3</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">~$347K</td>
                  <td className="py-1 text-right font-mono">~$2.4M</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">PHUX</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">~$89K</td>
                  <td className="py-1 text-right font-mono">~$600K</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1 pr-3">9mm V2</td>
                  <td className="py-1 pr-3 text-right font-mono text-white">~$288</td>
                  <td className="py-1 text-right font-mono">~$2K</td>
                </tr>
                <tr className="border-t border-white/10 font-medium">
                  <td className="py-1 pr-3 text-gray-300">Total (All DEX)</td>
                  <td className="py-1 pr-3 text-right font-mono text-[#00D4FF]">$4,424,468</td>
                  <td className="py-1 text-right font-mono text-[#00D4FF]">~$32.4M</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded bg-amber-500/5 border border-amber-500/15 p-2.5 text-[11px]">
            <p className="text-amber-400 font-medium mb-1">Key discrepancies explained</p>
            <ul className="text-gray-400 space-y-1 list-disc list-inside">
              <li><strong>V1+V2 raw &lt; DefiLlama PulseX</strong> for volume: DefiLlama includes StableSwap (~7-10% of PulseX volume), which is a separate contract.</li>
              <li><strong>V1+V2 raw &gt; DefiLlama PulseX</strong> for liquidity: raw subgraph includes spam pools that inflate <code className="text-gray-300">reserveUSD</code>. DefiLlama filters these out.</li>
              <li><strong>V1 subgraph = ~55% of total PulseX volume</strong>, so our V1-only chart underestimates by ~45%.</li>
              <li><strong>All DEX is ~12% higher</strong> than PulseX alone (9mm + PHUX contribute the difference).</li>
            </ul>
          </div>

          <p className="text-gray-600 text-[10px] pt-1 border-t border-white/5">
            Historical data: DefiLlama API or Supabase (V1 subgraph). Live data point: same source as chart for consistency.
            This is not investment advice.
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
  const liveLL = useLiveDefiLlama()

  // Source selection for charts
  const [liqSource, setLiqSource] = useState<DexSource>('v1')
  const [volSource, setVolSource] = useState<DexSource>('v1')

  // Lazy-load DefiLlama histories when user switches dropdown
  const pulsexHistory = usePulsexHistory(liqSource === 'pulsex' || volSource === 'pulsex')
  const allDexHistory = useAllPulsechainDexHistory(liqSource === 'all' || volSource === 'all')

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

  // Today's date in YYYY-MM-DD (UTC)
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // --- Liquidity data based on source ---
  const v1LiqData = useMemo(() => validData.map((d) => ({ date: d.date, tvl_usd: d.total_liquidity_usd })), [validData])

  const liqBaseData = liqSource === 'v1' ? v1LiqData : liqSource === 'pulsex' ? pulsexHistory.tvl : allDexHistory.tvl
  const liveLiq = liqSource === 'v1'
    ? liveFactory.v1LiquidityUSD
    : liqSource === 'pulsex'
      ? liveLL.tvlPulsex
      : liveLL.tvlAll

  const liqWithLive = useMemo(() => {
    if (!liveLiq || liqBaseData.length === 0) return liqBaseData
    const hist = [...liqBaseData]
    const last = hist[hist.length - 1]
    if (last.date === todayStr) {
      hist[hist.length - 1] = { ...last, tvl_usd: liveLiq }
    } else {
      hist.push({ date: todayStr, tvl_usd: liveLiq })
    }
    return hist
  }, [liqBaseData, liveLiq, todayStr])

  const liqRecent = liqRange ? liqWithLive.slice(-liqRange) : liqWithLive

  // --- Volume data based on source ---
  const v1VolData = useMemo(() => validData.map((d) => ({ date: d.date, volume_usd: d.daily_volume_usd })), [validData])

  const volBaseData = volSource === 'v1' ? v1VolData : volSource === 'pulsex' ? pulsexHistory.volume : allDexHistory.volume
  const liveVol = volSource === 'v1'
    ? null // V1 subgraph doesn't provide live daily volume
    : volSource === 'pulsex'
      ? liveLL.volumePulsex
      : liveLL.volumeAll

  const volWithLive = useMemo(() => {
    if (!liveVol || volBaseData.length === 0) return volBaseData
    const hist = [...volBaseData]
    const last = hist[hist.length - 1]
    if (last.date === todayStr) {
      hist[hist.length - 1] = { ...last, volume_usd: liveVol }
    } else {
      hist.push({ date: todayStr, volume_usd: liveVol })
    }
    return hist
  }, [volBaseData, liveVol, todayStr])

  const volRecent = volRange ? volWithLive.slice(-volRange) : volWithLive

  // --- Cumulative volume derived from selected volume source ---
  const cumulativeVolume = useMemo(() => {
    const src = volWithLive
    let cumul = 0
    return src.map((d) => {
      cumul += d.volume_usd
      return { date: d.date, cumulative_volume: cumul }
    })
  }, [volWithLive])

  const cumRecent = cumRange ? cumulativeVolume.slice(-cumRange) : cumulativeVolume

  // Loading states
  const liqIsLoading = (liqSource === 'pulsex' && pulsexHistory.loading) || (liqSource === 'all' && allDexHistory.loading)
  const volIsLoading = (volSource === 'pulsex' && pulsexHistory.loading) || (volSource === 'all' && allDexHistory.loading)

  if (pulsex.loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">PulseX DEX Analytics</h1>
        <p className="text-gray-400 mt-1">
          Track PulseX trading activity: daily volume, total liquidity, and transaction count. Data sourced from PulseX Subgraph and DefiLlama.
        </p>
      </div>

      {/* KPI Row */}
      {kpis && (
        <>
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
              subtitle="Last 30 days (V1)"
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
        </>
      )}

      {/* Liquidity Chart */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Total Liquidity</h2>
          <div className="flex items-center gap-2">
            <DexSourceSelector value={liqSource} onChange={setLiqSource} />
            <TimeRangeSelector value={liqRange} onChange={setLiqRange} />
          </div>
        </div>
        {liqIsLoading ? (
          <div className="py-12 flex justify-center"><Spinner /></div>
        ) : liqRecent.length > 0 ? (
          <AreaChartComponent data={liqRecent} xKey="date" yKey="tvl_usd" color="#00D4FF" liveDot={!!liveLiq} />
        ) : (
          <p className="py-12 text-center text-gray-500">No liquidity data available</p>
        )}
        <ChartDataSourceNote source={liqSource} />
      </div>

      {/* Daily Volume Bar Chart */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Daily Trading Volume</h2>
          <div className="flex items-center gap-2">
            <DexSourceSelector value={volSource} onChange={setVolSource} />
            <TimeRangeSelector value={volRange} onChange={setVolRange} />
          </div>
        </div>
        {volIsLoading ? (
          <div className="py-12 flex justify-center"><Spinner /></div>
        ) : volRecent.length > 0 ? (
          <BarChartComponent
            data={volRecent}
            xKey="date"
            bars={[{ key: 'volume_usd', color: '#8000E0' }]}
          />
        ) : (
          <p className="py-12 text-center text-gray-500">No volume data available</p>
        )}
        <ChartDataSourceNote source={volSource} />
      </div>

      {/* Cumulative Volume */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Cumulative Volume</h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">Follows volume source</span>
            <TimeRangeSelector value={cumRange} onChange={setCumRange} />
          </div>
        </div>
        {volIsLoading ? (
          <div className="py-12 flex justify-center"><Spinner /></div>
        ) : cumRecent.length > 0 ? (
          <AreaChartComponent data={cumRecent} xKey="date" yKey="cumulative_volume" color="#D000C0" liveDot={!!liveVol} />
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
