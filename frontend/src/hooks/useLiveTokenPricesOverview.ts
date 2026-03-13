import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

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

/**
 * Fetch core PulseChain tokens from token_live_summary with polling every 60s.
 * Returns live prices, volume 24h, market cap from DexScreener data.
 */
export function useLiveTokenPricesOverview() {
  const [data, setData] = useState<LiveTokenPrice[]>([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      try {
        // Fetch token summaries + top pool per token in parallel
        const [summaryRes, poolsRes] = await Promise.all([
          supabase
            .from('token_live_summary')
            .select('token_address, token_symbol, price_usd, price_change_24h, market_cap_usd, total_volume_24h_usd, total_liquidity_usd, last_updated')
            .in('token_address', OVERVIEW_TOKENS),
          supabase
            .from('token_pools_live')
            .select('token_address, pair_address, dx_url, liquidity_usd')
            .in('token_address', OVERVIEW_TOKENS)
            .eq('pool_is_legitimate', true)
            .order('liquidity_usd', { ascending: false, nullsFirst: false }),
        ])

        if (!cancelled && !summaryRes.error && summaryRes.data) {
          // Build map: token_address → top pool (first = highest liquidity)
          const topPoolMap = new Map<string, { dx_url: string | null; pair_address: string }>()
          if (!poolsRes.error && poolsRes.data) {
            for (const pool of poolsRes.data) {
              if (!topPoolMap.has(pool.token_address)) {
                topPoolMap.set(pool.token_address, { dx_url: pool.dx_url, pair_address: pool.pair_address })
              }
            }
          }

          // Merge and sort by volume 24h desc
          const merged = (summaryRes.data as LiveTokenPrice[]).map((t) => {
            const topPool = topPoolMap.get(t.token_address)
            return {
              ...t,
              top_pool_dx_url: topPool?.dx_url ?? null,
              top_pool_pair_address: topPool?.pair_address ?? null,
            }
          })
          merged.sort((a, b) => (b.total_volume_24h_usd ?? 0) - (a.total_volume_24h_usd ?? 0))
          setData(merged)
        }
      } catch {
        // Silently fail — keep previous data
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    intervalRef.current = setInterval(fetchData, 60_000)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return { data, loading }
}
