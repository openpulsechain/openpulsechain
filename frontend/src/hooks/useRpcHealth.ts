import { useState, useEffect, useRef, useCallback } from 'react'

const PULSECHAIN_RPC = 'https://rpc.pulsechain.com'
const PULSEX_V2_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2'
const SCAN_API = 'https://api.scan.pulsechain.com/api/v2/stats'
const CHECK_INTERVAL = 15_000 // 15 seconds
const TIMEOUT_MS = 5_000

export type ServiceStatus = 'operational' | 'degraded' | 'down'

export interface ServiceHealth {
  name: string
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

async function checkWithTimeout(fn: () => Promise<Response>, timeoutMs: number): Promise<{ ok: boolean; latencyMs: number }> {
  const start = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fn()
    const latencyMs = performance.now() - start
    clearTimeout(timer)
    return { ok: res.ok, latencyMs }
  } catch {
    clearTimeout(timer)
    const latencyMs = performance.now() - start
    return { ok: false, latencyMs }
  }
}

export function useRpcHealth(): RpcHealth {
  const [services, setServices] = useState<ServiceHealth[]>([
    { name: 'PulseChain RPC', status: 'operational', latencyMs: null, lastChecked: null },
    { name: 'PulseX Subgraph', status: 'operational', latencyMs: null, lastChecked: null },
    { name: 'Scan API', status: 'operational', latencyMs: null, lastChecked: null },
  ])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const checkHealth = useCallback(async () => {
    const now = new Date()

    const [rpc, subgraph, scan] = await Promise.all([
      // 1. PulseChain RPC
      checkWithTimeout(
        () =>
          fetch(PULSECHAIN_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
          }),
        TIMEOUT_MS
      ),
      // 2. PulseX Subgraph
      checkWithTimeout(
        () =>
          fetch(PULSEX_V2_SUBGRAPH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ _meta { block { number } } }' }),
          }),
        TIMEOUT_MS
      ),
      // 3. Scan API
      checkWithTimeout(() => fetch(SCAN_API), TIMEOUT_MS),
    ])

    if (!mountedRef.current) return

    const updated: ServiceHealth[] = [
      {
        name: 'PulseChain RPC',
        status: rpc.ok ? statusFromLatency(rpc.latencyMs, 500, 2000) : 'down',
        latencyMs: Math.round(rpc.latencyMs),
        lastChecked: now,
      },
      {
        name: 'PulseX Subgraph',
        status: subgraph.ok ? statusFromLatency(subgraph.latencyMs, 2000, 5000) : 'down',
        latencyMs: Math.round(subgraph.latencyMs),
        lastChecked: now,
      },
      {
        name: 'Scan API',
        status: scan.ok ? statusFromLatency(scan.latencyMs, 1000, 3000) : 'down',
        latencyMs: Math.round(scan.latencyMs),
        lastChecked: now,
      },
    ]

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
