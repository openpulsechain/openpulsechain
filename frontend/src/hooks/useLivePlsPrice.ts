import { useState, useEffect, useRef } from 'react'

const PULSEX_V2_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2'
const WPLS_ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
const REFRESH_INTERVAL = 30_000 // 30 seconds

const QUERY = `{
  token(id: "${WPLS_ADDRESS}") {
    derivedUSD
  }
}`

export function useLivePlsPrice() {
  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function fetchPrice() {
      try {
        const res = await fetch(PULSEX_V2_SUBGRAPH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: QUERY }),
        })
        const json = await res.json()
        const derivedUSD = json?.data?.token?.derivedUSD
        if (derivedUSD && mountedRef.current) {
          setPrice(parseFloat(derivedUSD))
          setLoading(false)
        }
      } catch {
        // Silently fail, keep previous price
      }
    }

    fetchPrice()
    const interval = setInterval(fetchPrice, REFRESH_INTERVAL)

    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [])

  return { price, loading }
}
