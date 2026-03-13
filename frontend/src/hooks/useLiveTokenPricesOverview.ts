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
        const { data: rows, error } = await supabase
          .from('token_live_summary')
          .select('token_address, token_symbol, price_usd, price_change_24h, market_cap_usd, total_volume_24h_usd, total_liquidity_usd, last_updated')
          .in('token_address', OVERVIEW_TOKENS)

        if (!cancelled && !error && rows) {
          // Sort by volume 24h desc
          const sorted = (rows as LiveTokenPrice[]).sort(
            (a, b) => (b.total_volume_24h_usd ?? 0) - (a.total_volume_24h_usd ?? 0)
          )
          setData(sorted)
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
