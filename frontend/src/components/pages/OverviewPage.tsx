import { useMemo, useState } from 'react'
import { DollarSign, TrendingUp, Fuel, Box, ChevronDown, Info } from 'lucide-react'
import { KpiCard } from '../cards/KpiCard'
import { AreaChartComponent } from '../charts/AreaChart'
import { Spinner } from '../ui/Spinner'
import { TimeRangeSelector } from '../ui/TimeRangeSelector'
import { useNetworkTvl, useNetworkDexVolume, useTokenPrices, useNetworkSnapshot, usePulsexDefillamaTvl, usePulsexDefillamaVolume } from '../../hooks/useSupabase'
import { useLivePlsPrice } from '../../hooks/useLivePlsPrice'
import { useLiveChainStats } from '../../hooks/useLiveChainStats'
import { useLiveDefiLlama } from '../../hooks/useLiveDefiLlama'
import { formatUsd, formatNumber, formatGwei } from '../../lib/format'

type DataSource = 'all' | 'pulsex'

// Standard gas limits for common operations on PulseChain
const GAS_ESTIMATES = [
  { label: 'PLS Send', gasLimit: 21000 },
  { label: 'Token Transfer', gasLimit: 65000 },
  { label: 'Token Approval', gasLimit: 46000 },
  { label: 'DEX Swap', gasLimit: 200000 },
  { label: 'Add Liquidity', gasLimit: 300000 },
  { label: 'Bridge Transfer', gasLimit: 250000 },
]

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

function SourceSelector({ value, onChange }: { value: DataSource; onChange: (v: DataSource) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DataSource)}
        className="appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-1 pr-7 text-xs text-gray-300 cursor-pointer hover:bg-white/10 transition-colors focus:outline-none focus:border-[#00D4FF]/50"
      >
        <option value="all">All PulseChain</option>
        <option value="pulsex">PulseX only</option>
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
    </div>
  )
}

function DataSourceNote({ source, type }: { source: DataSource; type: 'tvl' | 'volume' }) {
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
          {type === 'tvl' ? (
            <>
              <p className="font-medium text-gray-300">
                {source === 'all'
                  ? 'All PulseChain — Total Value Locked across all protocols'
                  : 'PulseX only — Liquidity in PulseX DEX (V1 + V2 + StableSwap)'}
              </p>
              <p>
                {source === 'all'
                  ? 'Aggregated by DefiLlama across all DeFi protocols deployed on PulseChain (PulseX, 9mm, Phiat, etc.). This is the industry-standard TVL metric.'
                  : 'PulseX is the dominant DEX on PulseChain. This metric tracks only PulseX liquidity pools (V1 + V2 + StableSwap combined), as aggregated by DefiLlama.'}
              </p>

              <div>
                <p className="font-medium text-gray-300 mb-2">Cross-source comparison (verified 11/03/2026)</p>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-1 pr-3 text-gray-500 font-medium">Source</th>
                      <th className="py-1 pr-3 text-right text-gray-500 font-medium">TVL</th>
                      <th className="py-1 text-gray-500 font-medium">Scope</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">DefiLlama "PulseChain"</td>
                      <td className="py-1 pr-3 text-right font-mono text-white">$66.94M</td>
                      <td className="py-1">All protocols (filtered)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">DefiLlama "PulseX"</td>
                      <td className="py-1 pr-3 text-right font-mono text-white">$48.79M</td>
                      <td className="py-1">PulseX V1+V2+StableSwap (filtered)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">Subgraph V1 (raw)</td>
                      <td className="py-1 pr-3 text-right font-mono text-amber-400">$31.74M</td>
                      <td className="py-1">On-chain, includes spam pools</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">Subgraph V2 (raw)</td>
                      <td className="py-1 pr-3 text-right font-mono text-amber-400">$20.59M</td>
                      <td className="py-1">On-chain, cleaner data</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-3">V1+V2 subgraph combined</td>
                      <td className="py-1 pr-3 text-right font-mono text-amber-400">$52.33M</td>
                      <td className="py-1">Raw, no spam filtering</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="rounded bg-amber-500/5 border border-amber-500/15 p-2.5 text-[11px]">
                <p className="text-amber-400 font-medium mb-1">Why do subgraph values differ from DefiLlama?</p>
                <p className="text-gray-400">
                  DefiLlama applies spam filtering on top of raw subgraph data. PulseChain subgraphs include pools with inflated
                  <code className="text-gray-300 mx-1">reserveUSD</code>from spam tokens, which artificially inflate the raw
                  <code className="text-gray-300 mx-1">totalLiquidityUSD</code>. DefiLlama corrects this by excluding
                  known spam pools. This is why Subgraph V1 raw ($31.74M) differs from DefiLlama PulseX ($48.79M) —
                  DefiLlama&apos;s number is actually higher because it uses a different valuation methodology that more accurately
                  prices legitimate pools.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="font-medium text-gray-300">
                {source === 'all'
                  ? 'All PulseChain DEXes — Daily trading volume across all decentralized exchanges'
                  : 'PulseX only — Daily trading volume on PulseX (V1 + V2 + StableSwap)'}
              </p>
              <p>
                {source === 'all'
                  ? 'Aggregated by DefiLlama across all DEXes on PulseChain: PulseX V1, V2, StableSwap, 9mm V2/V3, PHUX, and others.'
                  : 'PulseX handles the majority of DEX volume on PulseChain. This metric tracks V1 + V2 + StableSwap combined.'}
              </p>

              <div>
                <p className="font-medium text-gray-300 mb-2">Volume breakdown by DEX (verified 11/03/2026)</p>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-1 pr-3 text-gray-500 font-medium">DEX</th>
                      <th className="py-1 text-right text-gray-500 font-medium">24h Volume</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">PulseX V1</td>
                      <td className="py-1 text-right font-mono text-white">$1,778,074</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">PulseX V2</td>
                      <td className="py-1 text-right font-mono text-white">$1,676,205</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">PulseX StableSwap</td>
                      <td className="py-1 text-right font-mono text-white">$355,246</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">9mm V3</td>
                      <td className="py-1 text-right font-mono text-white">$347,366</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">PHUX</td>
                      <td className="py-1 text-right font-mono text-white">$89,181</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1 pr-3">9mm V2</td>
                      <td className="py-1 text-right font-mono text-white">$288</td>
                    </tr>
                    <tr className="border-t border-white/10 font-medium">
                      <td className="py-1 pr-3 text-gray-300">Total (All DEX)</td>
                      <td className="py-1 text-right font-mono text-[#00D4FF]">$4,246,360</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-gray-500">
                Source: DefiLlama DEX aggregator. Volume represents completed swaps over 24h. All data is sourced from
                on-chain subgraphs and verified by DefiLlama&apos;s methodology.
              </p>
            </>
          )}

          <p className="text-gray-600 text-[10px] pt-1 border-t border-white/5">
            Historical data: DefiLlama API. Live data point: DefiLlama real-time (~60s refresh).
            Same source for both historical and live ensures chart continuity.
          </p>
        </div>
      )}
    </div>
  )
}

export function OverviewPage() {
  const tvl = useNetworkTvl()
  const dex = useNetworkDexVolume()
  const prices = useTokenPrices()
  const snapshot = useNetworkSnapshot()
  const livePls = useLivePlsPrice()
  const liveChain = useLiveChainStats()
  const liveLL = useLiveDefiLlama()

  // PulseX DefiLlama historical data from Supabase (sovereign)
  const pulsexLLTvl = usePulsexDefillamaTvl()
  const pulsexLLVol = usePulsexDefillamaVolume()

  // Source selection
  const [tvlSource, setTvlSource] = useState<DataSource>('all')
  const [volSource, setVolSource] = useState<DataSource>('all')

  const latestTvl = tvl.data.length > 0 ? tvl.data[tvl.data.length - 1] : null
  const latestSnapshot = snapshot.data.length > 0 ? snapshot.data[0] : null
  const plsPrice = prices.data.find((p) => p.symbol === 'PLS')

  // Use live subgraph price (max precision), fallback to Supabase cached
  const plsPriceUsd = livePls.price ?? plsPrice?.price_usd ?? null

  // Live chain stats with fallback to Supabase snapshot
  const liveGasPriceGwei = liveChain.stats?.gasPriceGwei ?? latestSnapshot?.gas_price_gwei ?? null
  const liveBaseFeeGwei = liveChain.stats?.baseFeeGwei ?? latestSnapshot?.base_fee_gwei ?? null
  const liveBlockNumber = liveChain.stats?.blockNumber ?? latestSnapshot?.block_number ?? null

  // Gas estimates computed from gas price + PLS price (live)
  const gasEstimates = useMemo(() => {
    if (!liveGasPriceGwei || !plsPriceUsd) return null
    return GAS_ESTIMATES.map((e) => {
      const costPls = (liveGasPriceGwei * e.gasLimit) / 1e9
      const costUsd = costPls * plsPriceUsd
      return { ...e, costPls, costUsd }
    })
  }, [liveGasPriceGwei, plsPriceUsd])

  const [tvlRange, setTvlRange] = useState<number | null>(null)
  const [dexRange, setDexRange] = useState<number | null>(null)

  // Today's date in YYYY-MM-DD (UTC)
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // --- TVL data based on source ---
  const liveTvl = tvlSource === 'all' ? liveLL.tvlAll : liveLL.tvlPulsex
  const tvlBaseData = tvlSource === 'all' ? tvl.data : pulsexLLTvl.data

  const tvlWithLive = useMemo(() => {
    if (!liveTvl || tvlBaseData.length === 0) return tvlBaseData
    const hist = [...tvlBaseData]
    const last = hist[hist.length - 1]
    if (last.date === todayStr) {
      hist[hist.length - 1] = { ...last, tvl_usd: liveTvl }
    } else {
      hist.push({ date: todayStr, tvl_usd: liveTvl })
    }
    return hist
  }, [tvlBaseData, liveTvl, todayStr])

  const tvlRecent = tvlRange ? tvlWithLive.slice(-tvlRange) : tvlWithLive

  // --- Volume data based on source ---
  const liveVol = volSource === 'all' ? liveLL.volumeAll : liveLL.volumePulsex
  const volBaseData = volSource === 'all' ? dex.data : pulsexLLVol.data

  const dexWithLive = useMemo(() => {
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

  const dexRecent = dexRange ? dexWithLive.slice(-dexRange) : dexWithLive

  // --- KPI TVL value: always show "All PulseChain" ---
  const kpiTvl = liveLL.tvlAll ?? (latestTvl ? latestTvl.tvl_usd : null)

  // Known reliable tokens: prefer CoinGecko source for majors, PulseX for native
  // Filter out Ethereum fork copies with wrong prices (e.g. USDC at $0.0006)
  const cleanPrices = useMemo(() => {
    // Stablecoin symbols that should be ~$1 — filter out copies with wrong price
    const STABLES = new Set(['USDT', 'USDC', 'DAI'])
    return prices.data.filter((t) => {
      const price = t.price_usd ?? 0
      if (STABLES.has(t.symbol.toUpperCase()) && t.source === 'pulsex_subgraph') {
        // Keep only bridged stables with price close to $1 (±10%)
        if (price < 0.9 || price > 1.1) return false
      }
      // Filter WBTC copies with wrong price (should be ~$60K+)
      if (t.symbol.toUpperCase() === 'WBTC' && t.source === 'pulsex_subgraph' && price < 10000) return false
      // Filter WETH copies with wrong price (should be ~$1500+)
      if (t.symbol.toUpperCase() === 'WETH' && t.source === 'pulsex_subgraph' && price < 500) return false
      return true
    })
  }, [prices.data])

  // Deduplicate by symbol: prefer CoinGecko price/market cap but keep PulseChain address
  const deduped = useMemo(() => {
    const map = new Map<string, typeof prices.data[0]>()
    // Track PulseChain addresses by symbol (from PulseX subgraph)
    const addressMap = new Map<string, string>()
    for (const token of cleanPrices) {
      if (token.address && token.source === 'pulsex_subgraph') {
        addressMap.set(token.symbol.toUpperCase(), token.address)
      }
    }

    for (const token of cleanPrices) {
      const key = token.symbol.toUpperCase()
      const existing = map.get(key)
      if (!existing) {
        map.set(key, token)
      } else {
        // Prefer CoinGecko for majors (more reliable market cap)
        const existingIsCG = existing.source === 'coingecko'
        const newIsCG = token.source === 'coingecko'
        if (newIsCG && !existingIsCG) {
          // Keep CoinGecko data but preserve PulseChain address
          const pcAddress = addressMap.get(key)
          map.set(key, pcAddress ? { ...token, address: pcAddress } : token)
        } else if (!newIsCG && existingIsCG) {
          // keep existing
        } else if ((token.market_cap_usd ?? 0) > (existing.market_cap_usd ?? 0)) {
          map.set(key, token)
        }
      }
    }
    return Array.from(map.values())
  }, [cleanPrices])

  // Only show tokens with a PulseChain address (this is a PulseChain analytics site)
  const filtered = deduped.filter((t) => t.address && (t.price_usd ?? 0) >= 0.0000001 && (t.market_cap_usd ?? 0) > 0)

  // Sort tokens by market cap
  const sortedPrices = [...filtered].sort((a, b) => {
    const aCap = a.market_cap_usd ?? 0
    const bCap = b.market_cap_usd ?? 0
    if (aCap > 0 && bCap === 0) return -1
    if (aCap === 0 && bCap > 0) return 1
    return bCap - aCap
  })

  if (tvl.loading && prices.loading) return <Spinner />

  const tvlIsLoading = tvlSource === 'pulsex' && pulsexLLTvl.loading
  const volIsLoading = volSource === 'pulsex' && pulsexLLVol.loading

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
          <span className="rounded-full bg-white/5 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-400">Token Safety</span>
          <span className="rounded-full bg-white/5 border border-blue-500/30 px-3 py-1 text-xs text-blue-400">Smart Money</span>
          <span className="rounded-full bg-white/5 border border-red-500/30 px-3 py-1 text-xs text-red-400">Scam Radar</span>
          <span className="rounded-full bg-white/5 border border-gray-400/30 px-3 py-1 text-xs text-gray-300">Free API</span>
          <span className="rounded-full bg-white/5 border border-amber-500/30 px-3 py-1 text-xs text-amber-400">2500+ Tokens</span>
          <span className="rounded-full bg-white/5 border border-gray-400/30 px-3 py-1 text-xs text-gray-300">Open Source</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="PLS Price"
          titleSuffix={<LiveIndicator />}
          value={plsPriceUsd ? `$${plsPriceUsd.toPrecision(6)}` : '--'}
          trend={plsPrice?.price_change_24h_pct ?? undefined}
          subtitle="24h change"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiCard
          title="Chain TVL"
          titleSuffix={liveLL.tvlAll ? <LiveIndicator /> : undefined}
          value={kpiTvl ? formatUsd(kpiTvl) : '--'}
          subtitle="All protocols"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          title="Gas Price"
          titleSuffix={<LiveIndicator />}
          value={liveGasPriceGwei ? `${formatGwei(liveGasPriceGwei)} Gwei` : '--'}
          subtitle={liveBaseFeeGwei ? `Base: ${formatGwei(liveBaseFeeGwei)}` : ''}
          icon={<Fuel className="h-5 w-5" />}
        />
        <KpiCard
          title="Latest Block"
          titleSuffix={<LiveIndicator />}
          value={liveBlockNumber ? formatNumber(liveBlockNumber) : '--'}
          subtitle="~10s block time"
          icon={<Box className="h-5 w-5" />}
        />
      </div>

      {/* TVL Chart */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">Total Value Locked (TVL)</h2>
            {liveTvl && <LiveIndicator />}
          </div>
          <div className="flex items-center gap-2">
            <SourceSelector value={tvlSource} onChange={setTvlSource} />
            <TimeRangeSelector value={tvlRange} onChange={setTvlRange} />
          </div>
        </div>
        {tvlIsLoading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : tvlRecent.length > 0 ? (
          <AreaChartComponent data={tvlRecent} xKey="date" yKey="tvl_usd" color="#00D4FF" liveDot={!!liveTvl} />
        ) : (
          <p className="py-12 text-center text-gray-500">No TVL data available</p>
        )}
        <DataSourceNote source={tvlSource} type="tvl" />
      </div>

      {/* DEX Volume Chart */}
      <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">DEX Volume</h2>
            {liveVol && <LiveIndicator />}
          </div>
          <div className="flex items-center gap-2">
            <SourceSelector value={volSource} onChange={setVolSource} />
            <TimeRangeSelector value={dexRange} onChange={setDexRange} />
          </div>
        </div>
        {volIsLoading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : dexRecent.length > 0 ? (
          <AreaChartComponent data={dexRecent} xKey="date" yKey="volume_usd" color="#8000E0" liveDot={!!liveVol} />
        ) : (
          <p className="py-12 text-center text-gray-500">No DEX volume data available</p>
        )}
        <DataSourceNote source={volSource} type="volume" />
      </div>

      {/* Gas Estimates */}
      {gasEstimates && (
        <div className="rounded-xl border border-white/5 bg-gray-900/40 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Fuel className="h-5 w-5 text-[#00D4FF]" />
            <h2 className="text-lg font-semibold text-white">Gas Estimates</h2>
            <LiveIndicator />
            <span className="text-xs text-gray-500">@ {formatGwei(liveGasPriceGwei!)} Gwei</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {gasEstimates.map((e) => (
              <div key={e.label} className="rounded-lg bg-white/5 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs text-gray-400">{e.label}</span>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                </div>
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
                <th className="py-3 pr-4 text-right" title="Fully Diluted Valuation = Total Supply × Price">
                  <span className="hidden sm:inline">Market Cap</span>
                  <span className="sm:hidden">MCap</span>
                  <span className="text-xs text-gray-500 ml-1" title="Fully Diluted Valuation for PulseChain tokens, Circulating for CoinGecko tokens">*</span>
                </th>
                <th className="py-3 text-right" title="All-time cumulative trading volume from PulseX">Volume (All-time)</th>
              </tr>
            </thead>
            <tbody>
              {sortedPrices.map((token) => (
                <tr key={token.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-2.5 pr-4">
                    <div>
                      <span className="font-medium text-white">{token.symbol}</span>
                      <span className="ml-2 text-gray-500">{token.name}</span>
                    </div>
                    {token.address && (
                      <a
                        href={`https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address/${token.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-600 hover:text-[#00D4FF] font-mono truncate max-w-[200px] sm:max-w-[300px] block transition-colors"
                      >
                        {token.address}
                      </a>
                    )}
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
                      : '0.00%'}
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
        <div className="mt-4 rounded-lg bg-white/5 border border-white/10 p-4 text-xs text-gray-500 space-y-2">
          <p className="font-medium text-gray-400">Data Methodology</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>
              <strong className="text-gray-400">Prices:</strong> PulseChain tokens use <code className="text-[#00D4FF]/70">derivedUSD</code> from PulseX Subgraph (100% on-chain). Major tokens (BTC, ETH, stables) use CoinGecko.
            </li>
            <li>
              <strong className="text-gray-400">Market Cap*:</strong> For PulseChain tokens, this is the <span className="text-gray-400">Fully Diluted Valuation (FDV)</span> = Total Supply × Price. No reliable circulating supply data exists on-chain for PulseChain — this is a known ecosystem limitation (PulseChain Scan also reports $0 circulating market cap). For CoinGecko tokens, this is the standard circulating market cap.
            </li>
            <li>
              <strong className="text-gray-400">Volume:</strong> All-time cumulative trading volume from PulseX Subgraph (<code className="text-[#00D4FF]/70">tradeVolumeUSD</code>). Not 24h volume.
            </li>
            <li>
              <strong className="text-gray-400">24h Change:</strong> Calculated from price history stored daily. Compares current price to the most recent historical price (1-3 days ago).
            </li>
          </ul>
          <p className="text-gray-600 pt-1">
            Contract addresses link to <a href="https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/" target="_blank" rel="noopener noreferrer" className="text-[#00D4FF]/50 hover:text-[#00D4FF] transition-colors">PulseChain Explorer</a> (Otterscan) for independent verification.
            Not financial advice. Data provided for informational purposes only.
          </p>
        </div>
      </div>
    </div>
  )
}
