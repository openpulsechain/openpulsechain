import { useState, useEffect, useRef } from 'react'

interface VolumePoint {
  date: string
  volume_usd: number
}

export interface AllPulsechainDexHistory {
  volume: VolumePoint[]
  loading: boolean
}

/**
 * Fetches "All PulseChain DEX" historical daily volume from DefiLlama.
 * Only loads when `enabled` is true (lazy fetch on dropdown switch).
 */
export function useAllPulsechainDexHistory(enabled: boolean): AllPulsechainDexHistory {
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
        const res = await fetch('https://api.llama.fi/overview/dexs/PulseChain').then((r) => r.json())

        if (!mountedRef.current) return

        const chart = res?.totalDataChart ?? []
        const volPoints: VolumePoint[] = chart.map((p: [number, number]) => ({
          date: new Date(p[0] * 1000).toISOString().slice(0, 10),
          volume_usd: p[1],
        }))

        setVolume(volPoints)
      } catch {
        // Silently fail
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }

    fetchHistory()
  }, [enabled])

  return { volume, loading }
}
