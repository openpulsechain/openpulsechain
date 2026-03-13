import { useState, useEffect, useRef } from 'react'

export interface LiveTokenPrice {
  token_address: string
  token_symbol: string | null
  price_usd: number | null
  price_change_24h: number | null
  market_cap_usd: number | null
  total_volume_24h_usd: number | null
  total_liquidity_usd: number | null
  last_updated: string
  chart_url: string
}

// Token config: address, TradingView ticker, TradingView chart link
const TOKEN_CONFIG = [
  {
    address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
    symbol: 'WPLS',
    tvTicker: 'PULSEX:WPLSUSDT_322DF7.USD',
    chartUrl: 'https://www.tradingview.com/chart/?symbol=PULSEX%3AWPLSUSDT_322DF7.USD',
  },
  {
    address: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
    symbol: 'HEX',
    tvTicker: 'PULSEX:HEXWPLS_F1F4EE.USD',
    chartUrl: 'https://www.tradingview.com/chart/?symbol=PULSEX%3AHEXWPLS_F1F4EE.USD',
  },
  {
    address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
    symbol: 'PLSX',
    tvTicker: 'PULSEX:PLSXDAI_B2893C.USD',
    chartUrl: 'https://www.tradingview.com/chart/?symbol=PULSEX%3APLSXDAI_B2893C.USD',
  },
  {
    address: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d',
    symbol: 'INC',
    tvTicker: 'PULSEX:INCWPLS_F808BB.USD',
    chartUrl: 'https://www.tradingview.com/chart/?symbol=PULSEX%3AINCWPLS_F808BB.USD',
  },
]

const PULSEX_V2_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2'
const WPLS_ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'

const SCANNER_URL = 'https://scanner.tradingview.com/global/scan'

/**
 * Fetch core PulseChain token prices from TradingView Scanner API.
 * Single POST request for all 4 tokens, high precision (10-16 sig figs).
 * Polls every 5 seconds for near-real-time data.
 * Market cap from DexScreener (TradingView Scanner returns null for PulseX pairs).
 */
export function useLiveTokenPricesOverview() {
  const [data, setData] = useState<LiveTokenPrice[]>([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Cache DexScreener market cap data (refreshed less frequently)
  const mcapCache = useRef<Map<string, { mcap: number | null; volume: number | null; liquidity: number | null }>>(new Map())
  const mcapLastFetch = useRef(0)

  useEffect(() => {
    let cancelled = false

    const fetchMcap = async () => {
      // Refresh DexScreener data every 60s for market cap, volume, liquidity
      const now = Date.now()
      if (now - mcapLastFetch.current < 60_000 && mcapCache.current.size > 0) return

      try {
        const addresses = TOKEN_CONFIG.map((t) => t.address)
        const results = await Promise.all(
          addresses.map(async (addr) => {
            const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`)
            if (!res.ok) return null
            const json = await res.json()
            const pairs = (json.pairs || []).filter(
              (p: any) => p.chainId === 'pulsechain' && p.baseToken.address.toLowerCase() === addr.toLowerCase()
            )
            if (pairs.length === 0) return null
            // Best pair by liquidity for mcap
            pairs.sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
            const best = pairs[0]
            const totalVolume = pairs.reduce((s: number, p: any) => s + (p.volume?.h24 ?? 0), 0)
            const totalLiquidity = pairs.reduce((s: number, p: any) => s + (p.liquidity?.usd ?? 0), 0)
            return {
              address: addr,
              mcap: best.marketCap ?? best.fdv ?? null,
              volume: totalVolume,
              liquidity: totalLiquidity,
            }
          })
        )
        for (const r of results) {
          if (r) mcapCache.current.set(r.address, { mcap: r.mcap, volume: r.volume, liquidity: r.liquidity })
        }
        mcapLastFetch.current = now
      } catch {
        // Keep cached data
      }
    }

    // Fetch WPLS price from PulseX V2 subgraph (same source as KPI "PLS Price")
    const fetchWplsSubgraph = async (): Promise<number | null> => {
      try {
        const res = await fetch(PULSEX_V2_SUBGRAPH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `{ token(id: "${WPLS_ADDRESS}") { derivedUSD } }` }),
        })
        const json = await res.json()
        const val = json?.data?.token?.derivedUSD
        return val ? parseFloat(val) : null
      } catch {
        return null
      }
    }

    const fetchPrices = async () => {
      try {
        // Fetch Scanner (HEX, PLSX, INC) + subgraph (WPLS) in parallel
        const [scannerRes, wplsPrice] = await Promise.all([
          fetch(SCANNER_URL, {
            method: 'POST',
            cache: 'no-store',
            body: JSON.stringify({
              symbols: {
                tickers: TOKEN_CONFIG.map((t) => t.tvTicker),
                query: { types: [] },
              },
              columns: ['close', 'change', 'volume'],
            }),
          }),
          fetchWplsSubgraph(),
        ])

        if (!scannerRes.ok) throw new Error(`Scanner ${scannerRes.status}`)
        const json = await scannerRes.json()

        if (!cancelled && json.data?.length > 0) {
          const results: LiveTokenPrice[] = []

          for (const item of json.data) {
            const ticker = item.s as string
            const config = TOKEN_CONFIG.find((t) => t.tvTicker === ticker)
            if (!config) continue

            const [close, change, volume] = item.d as [number | null, number | null, number | null]
            const cached = mcapCache.current.get(config.address)

            // For WPLS: use subgraph price (identical to KPI) instead of Scanner
            const price = config.symbol === 'WPLS' && wplsPrice != null ? wplsPrice : close

            results.push({
              token_address: config.address,
              token_symbol: config.symbol,
              price_usd: price,
              price_change_24h: change,
              market_cap_usd: cached?.mcap ?? null,
              total_volume_24h_usd: cached?.volume ?? (volume ?? null),
              total_liquidity_usd: cached?.liquidity ?? null,
              last_updated: new Date().toISOString(),
              chart_url: config.chartUrl,
            })
          }

          if (results.length > 0) {
            results.sort((a, b) => (b.total_volume_24h_usd ?? 0) - (a.total_volume_24h_usd ?? 0))
            setData(results)
          }
        }
      } catch {
        // Silently fail — keep previous data
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const fetchAll = async () => {
      // Run mcap (DexScreener, slow) and prices (TradingView, fast) in parallel
      await Promise.all([fetchMcap(), fetchPrices()])
    }

    fetchAll()
    intervalRef.current = setInterval(fetchPrices, 5_000)
    // DexScreener mcap refresh every 60s (separate timer)
    const mcapTimer = setInterval(fetchMcap, 60_000)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      clearInterval(mcapTimer)
    }
  }, [])

  return { data, loading }
}
