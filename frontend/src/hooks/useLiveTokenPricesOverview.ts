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

/**
 * Fetch top tokens from token_live_summary with polling every 60s.
 * Returns live prices, volume 24h, market cap from DexScreener data.
 */
export function useLiveTokenPricesOverview(limit = 50) {
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
          .not('price_usd', 'is', null)
          .gt('total_volume_24h_usd', 0)
          .order('total_volume_24h_usd', { ascending: false, nullsFirst: false })
          .limit(limit)

        if (!cancelled && !error && rows) {
          setData(rows as LiveTokenPrice[])
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
  }, [limit])

  return { data, loading }
}
