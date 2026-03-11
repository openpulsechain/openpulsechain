import { useState, useEffect, useRef, useCallback } from 'react'

const PULSECHAIN_RPC = 'https://rpc.pulsechain.com'
const PULSEX_V2_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2'
const SCAN_API = 'https://api.scan.pulsechain.com/api/v2/stats'
const CHECK_INTERVAL = 15_000 // 15 seconds
const TIMEOUT_MS = 5_000

export type ServiceStatus = 'operational' | 'degraded' | 'down'

export interface ServiceHealth {
  name: string
  url: string
  description: string
  status: ServiceStatus
  latencyMs: number | null
  lastChecked: Date | null
}

export interface RpcHealth {
  services: ServiceHealth[]
  overall: ServiceStatus
  loading: boolean
}

function statusFromLatency(latencyMs: number, fastThreshold: number, slowThreshold: number): ServiceStatus {
  if (latencyMs < fastThreshold) return 'operational'
  if (latencyMs < slowThreshold) return 'degraded'
  return 'down'
}

function overallStatus(services: ServiceHealth[]): ServiceStatus {
  if (services.some((s) => s.status === 'down')) return 'down'
  if (services.some((s) => s.status === 'degraded')) return 'degraded'
  return 'operational'
}

interface CheckResult {
  valid: boolean
  latencyMs: number
}

/** Check PulseChain RPC — validates JSON-RPC result has a hex block number */
async function checkRpc(): Promise<CheckResult> {
  const start = performance.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(PULSECHAIN_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const json = await res.json()
    const valid = typeof json?.result === 'string' && json.result.startsWith('0x')
    return { valid, latencyMs: performance.now() - start }
  } catch {
    return { valid: false, latencyMs: performance.now() - start }
  }
}

/** Check PulseX Subgraph — validates GraphQL returns a block number */
async function checkSubgraph(): Promise<CheckResult> {
  const start = performance.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(PULSEX_V2_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ _meta { block { number } } }' }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const json = await res.json()
    const valid = typeof json?.data?._meta?.block?.number === 'number'
    return { valid, latencyMs: performance.now() - start }
  } catch {
    return { valid: false, latencyMs: performance.now() - start }
  }
}

/** Check Scan API — validates response has total_blocks field */
async function checkScan(): Promise<CheckResult> {
  const start = performance.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(SCAN_API, {
      signal: controller.signal,
    })
    clearTimeout(timer)
    const json = await res.json()
    const valid = json?.total_blocks != null
    return { valid, latencyMs: performance.now() - start }
  } catch {
    return { valid: false, latencyMs: performance.now() - start }
  }
}

const SERVICE_META = [
  { name: 'PulseChain RPC', url: 'rpc.pulsechain.com', description: 'Blockchain node — blocks, gas, transactions', fast: 500, slow: 2000 },
  { name: 'PulseX Subgraph', url: 'graph.pulsechain.com', description: 'DEX indexer — prices, swaps, liquidity', fast: 2000, slow: 5000 },
  { name: 'Scan API', url: 'scan.pulsechain.com', description: 'Block explorer — tokens, holders, contracts', fast: 1000, slow: 3000 },
] as const

export function useRpcHealth(): RpcHealth {
  const [services, setServices] = useState<ServiceHealth[]>(
    SERVICE_META.map((m) => ({ name: m.name, url: m.url, description: m.description, status: 'operational' as ServiceStatus, latencyMs: null, lastChecked: null }))
  )
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const checkHealth = useCallback(async () => {
    const now = new Date()
    const results = await Promise.all([checkRpc(), checkSubgraph(), checkScan()])

    if (!mountedRef.current) return

    const updated: ServiceHealth[] = SERVICE_META.map((meta, i) => {
      const r = results[i]
      return {
        name: meta.name,
        url: meta.url,
        description: meta.description,
        status: r.valid ? statusFromLatency(r.latencyMs, meta.fast, meta.slow) : 'down',
        latencyMs: Math.round(r.latencyMs),
        lastChecked: now,
      }
    })

    setServices(updated)
    setLoading(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    checkHealth()
    const interval = setInterval(checkHealth, CHECK_INTERVAL)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [checkHealth])

  return {
    services,
    overall: overallStatus(services),
    loading,
  }
}
