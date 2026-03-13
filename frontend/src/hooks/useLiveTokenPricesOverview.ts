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
 * One API call per token (parallel) to avoid the 30-pair batch limit.
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

    const fetchToken = async (addr: string): Promise<LiveTokenPrice | null> => {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`)
      if (!res.ok) return null
      const json = await res.json()
      const pairs: DexPair[] = json.pairs || []

      const addrLower = addr.toLowerCase()

      // PulseChain pairs where our token is the BASE token
      const basePairs = pairs.filter(
        (p) => p.chainId === 'pulsechain' && p.baseToken.address.toLowerCase() === addrLower
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
      if (!best) return null

      // Aggregate volume & liquidity across all base pairs
      const totalVolume = basePairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0)
      const totalLiquidity = basePairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0)

      return {
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
      }
    }

    const fetchAll = async () => {
      try {
        // 4 parallel calls — well within DexScreener rate limit (300/min)
        const results = await Promise.all(OVERVIEW_TOKENS.map(fetchToken))

        if (!cancelled) {
          const valid = results
            .filter((t): t is LiveTokenPrice => t != null)
            .sort((a, b) => (b.total_volume_24h_usd ?? 0) - (a.total_volume_24h_usd ?? 0))
          if (valid.length > 0) setData(valid)
        }
      } catch {
        // Silently fail — keep previous data
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()
    intervalRef.current = setInterval(fetchAll, 5_000)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return { data, loading }
}
