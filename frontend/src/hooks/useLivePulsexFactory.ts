import { useState, useEffect, useRef } from 'react'

const PULSEX_V1_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex'
const REFRESH_INTERVAL = 30_000 // 30 seconds

const QUERY = `{
  pulseXFactories(first: 1) {
    totalLiquidityUSD
    totalVolumeUSD
    totalTransactions
  }
}`

export interface LivePulsexFactory {
  totalLiquidityUSD: number | null
  totalVolumeUSD: number | null
  totalTransactions: number | null
  loading: boolean
}

export function useLivePulsexFactory(): LivePulsexFactory {
  const [data, setData] = useState<Omit<LivePulsexFactory, 'loading'>>({
    totalLiquidityUSD: null,
    totalVolumeUSD: null,
    totalTransactions: null,
  })
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function fetchFactory() {
      try {
        const res = await fetch(PULSEX_V1_SUBGRAPH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: QUERY }),
        })
        const json = await res.json()
        if (!mountedRef.current) return

        const factory = json?.data?.pulseXFactories?.[0]
        if (factory) {
          setData({
            totalLiquidityUSD: factory.totalLiquidityUSD ? parseFloat(factory.totalLiquidityUSD) : null,
            totalVolumeUSD: factory.totalVolumeUSD ? parseFloat(factory.totalVolumeUSD) : null,
            totalTransactions: factory.totalTransactions ? parseInt(factory.totalTransactions) : null,
          })
          setLoading(false)
        }
      } catch {
        // Silently fail, keep previous values
      }
    }

    fetchFactory()
    const interval = setInterval(fetchFactory, REFRESH_INTERVAL)

    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [])

  return { ...data, loading }
}
