import { useState, useEffect, useRef } from 'react'

interface TvlPoint {
  date: string
  tvl_usd: number
}

interface VolumePoint {
  date: string
  volume_usd: number
}

export interface AllPulsechainDexHistory {
  tvl: TvlPoint[]
  volume: VolumePoint[]
  loading: boolean
}

/**
 * Fetches "All PulseChain" historical TVL + DEX volume from DefiLlama.
 * Only loads when `enabled` is true (lazy fetch on dropdown switch).
 */
export function useAllPulsechainDexHistory(enabled: boolean): AllPulsechainDexHistory {
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
        const [tvlRes, volRes] = await Promise.all([
          fetch('https://api.llama.fi/v2/historicalChainTvl/PulseChain').then((r) => r.json()),
          fetch('https://api.llama.fi/overview/dexs/PulseChain').then((r) => r.json()),
        ])

        if (!mountedRef.current) return

        // TVL history
        const tvlPoints: TvlPoint[] = (tvlRes ?? []).map((p: { date: number; tvl: number }) => ({
          date: new Date(p.date * 1000).toISOString().slice(0, 10),
          tvl_usd: p.tvl,
        }))

        // Volume history
        const chart = volRes?.totalDataChart ?? []
        const volPoints: VolumePoint[] = chart.map((p: [number, number]) => ({
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
