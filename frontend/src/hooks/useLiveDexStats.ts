import { useState, useEffect, useRef } from 'react'

const PULSEX_V2_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2'
const REFRESH_INTERVAL = 30_000 // 30 seconds

const QUERY = `{
  pulseXFactories(first: 1) {
    totalLiquidityUSD
  }
  pulsexDayDatas(first: 1, orderBy: date, orderDirection: desc) {
    date
    dailyVolumeUSD
  }
}`

export interface LiveDexStats {
  totalLiquidityUSD: number | null
  dailyVolumeUSD: number | null
  loading: boolean
}

export function useLiveDexStats(): LiveDexStats {
  const [stats, setStats] = useState<{ totalLiquidityUSD: number | null; dailyVolumeUSD: number | null }>({
    totalLiquidityUSD: null,
    dailyVolumeUSD: null,
  })
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function fetchStats() {
      try {
        const res = await fetch(PULSEX_V2_SUBGRAPH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: QUERY }),
        })
        const json = await res.json()
        if (!mountedRef.current) return

        const factory = json?.data?.pulseXFactories?.[0]
        const dayData = json?.data?.pulsexDayDatas?.[0]

        setStats({
          totalLiquidityUSD: factory?.totalLiquidityUSD ? parseFloat(factory.totalLiquidityUSD) : null,
          dailyVolumeUSD: dayData?.dailyVolumeUSD ? parseFloat(dayData.dailyVolumeUSD) : null,
        })
        setLoading(false)
      } catch {
        // Silently fail, keep previous values
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, REFRESH_INTERVAL)

    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [])

  return { ...stats, loading }
}
