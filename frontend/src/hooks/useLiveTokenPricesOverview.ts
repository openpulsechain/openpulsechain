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
  top_pool_dx_url: string | null
  top_pool_pair_address: string | null
}

// Core PulseChain tokens to show on Overview
const OVERVIEW_TOKENS = [
  '0xa1077a294dde1b09bb078844df40758a5d0f9a27', // WPLS (Wrapped Pulse)
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', // HEX
  '0x95b303987a60c71504d99aa1b13b4da07b0790ab', // PLSX (PulseX)
  '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', // INC (Incentive)
]

const DEXSCREENER_API = `https://api.dexscreener.com/latest/dex/tokens/${OVERVIEW_TOKENS.join(',')}`

interface DexPair {
  chainId: string
  pairAddress: string
  url: string
  baseToken: { address: string; symbol: string; name: string }
  quoteToken: { address: string; symbol: string; name: string }
  priceUsd?: string
  priceChange?: { h24?: number }
  liquidity?: { usd?: number }
  volume?: { h24?: number }
  fdv?: number
  marketCap?: number
}

/**
 * Fetch core PulseChain token prices directly from DexScreener API.
 * Polls every 5 seconds for near-real-time data.
 * Only picks pairs where the target token is the BASE token so that:
 *   - priceUsd is correct for our token
 *   - DexScreener URL shows the price chart (not the quote token's chart)
 */
export function useLiveTokenPricesOverview() {
  const [data, setData] = useState<LiveTokenPrice[]>([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      try {
        const res = await fetch(DEXSCREENER_API)
        if (!res.ok) throw new Error(`DexScreener ${res.status}`)
        const json = await res.json()
        const pairs: DexPair[] = json.pairs || []

        // Only PulseChain pairs
        const pcPairs = pairs.filter((p) => p.chainId === 'pulsechain')

        const tokenMap = new Map<string, LiveTokenPrice>()

        for (const addr of OVERVIEW_TOKENS) {
          const addrLower = addr.toLowerCase()

          // Only pairs where our token is the BASE token
          // This ensures priceUsd = our token's price and DexScreener URL shows its price chart
          const basePairs = pcPairs.filter(
            (p) => p.baseToken.address.toLowerCase() === addrLower
          )

          // Sort: prefer pairs with volume > 0, then by liquidity desc
          basePairs.sort((a, b) => {
            const aVol = a.volume?.h24 ?? 0
            const bVol = b.volume?.h24 ?? 0
            if (aVol > 0 && bVol === 0) return -1
            if (bVol > 0 && aVol === 0) return 1
            return (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
          })

          const best = basePairs[0]
          if (!best) continue

          // Aggregate volume & liquidity across all base pairs
          const totalVolume = basePairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0)
          const totalLiquidity = basePairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0)

          tokenMap.set(addr, {
            token_address: addr,
            token_symbol: best.baseToken.symbol,
            price_usd: best.priceUsd ? parseFloat(best.priceUsd) : null,
            price_change_24h: best.priceChange?.h24 ?? null,
            market_cap_usd: best.marketCap ?? best.fdv ?? null,
            total_volume_24h_usd: totalVolume,
            total_liquidity_usd: totalLiquidity,
            last_updated: new Date().toISOString(),
            top_pool_dx_url: best.url,
            top_pool_pair_address: best.pairAddress,
          })
        }

        if (!cancelled && tokenMap.size > 0) {
          const results = OVERVIEW_TOKENS
            .map((addr) => tokenMap.get(addr))
            .filter((t): t is LiveTokenPrice => t != null)
            .sort((a, b) => (b.total_volume_24h_usd ?? 0) - (a.total_volume_24h_usd ?? 0))
          setData(results)
        }
      } catch {
        // Silently fail — keep previous data
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    intervalRef.current = setInterval(fetchData, 5_000)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return { data, loading }
}
