import { useState, useEffect, useRef } from 'react'

interface TvlPoint {
  date: string
  tvl_usd: number
}

interface VolumePoint {
  date: string
  volume_usd: number
}

export interface PulsexHistory {
  tvl: TvlPoint[]
  volume: VolumePoint[]
  loading: boolean
}

/**
 * Fetches PulseX historical TVL and volume from DefiLlama.
 * Only loads when `enabled` is true (lazy fetch on dropdown switch).
 */
export function usePulsexHistory(enabled: boolean): PulsexHistory {
  const [tvl, setTvl] = useState<TvlPoint[]>([])
  const [volume, setVolume] = useState<VolumePoint[]>([])
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!enabled || fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)

    async function fetchHistory() {
      try {
        const [protocolRes, volumeRes] = await Promise.all([
          fetch('https://api.llama.fi/protocol/pulsex').then((r) => r.json()),
          fetch('https://api.llama.fi/summary/dexs/pulsex').then((r) => r.json()),
        ])

        if (!mountedRef.current) return

        // TVL history from /protocol/pulsex → chainTvls.PulseChain.tvl
        const tvlRaw = protocolRes?.chainTvls?.PulseChain?.tvl ?? []
        const tvlPoints: TvlPoint[] = tvlRaw.map((p: { date: number; totalLiquidityUSD: number }) => ({
          date: new Date(p.date * 1000).toISOString().slice(0, 10),
          tvl_usd: p.totalLiquidityUSD,
        }))

        // Volume history from /summary/dexs/pulsex → totalDataChart
        const volRaw = volumeRes?.totalDataChart ?? []
        const volPoints: VolumePoint[] = volRaw.map((p: [number, number]) => ({
          date: new Date(p[0] * 1000).toISOString().slice(0, 10),
          volume_usd: p[1],
        }))

        setTvl(tvlPoints)
        setVolume(volPoints)
      } catch {
        // Silently fail
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }

    fetchHistory()
  }, [enabled])

  return { tvl, volume, loading }
}
