import { useState, useEffect, useRef } from 'react'

const PULSECHAIN_RPC = 'https://rpc.pulsechain.com'
const PULSEX_V2_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2'
const SCAN_API = 'https://api.scan.pulsechain.com/api/v2/stats'
const CHECK_INTERVAL = 15_000
const TIMEOUT_MS = 5_000

type Status = 'operational' | 'degraded' | 'down'

interface Service {
  name: string
  description: string
  status: Status
  latencyMs: number | null
}

const SERVICE_META = [
  { name: 'PulseChain RPC', description: 'Blockchain node', fast: 500, slow: 2000 },
  { name: 'PulseX Subgraph', description: 'DEX indexer', fast: 2000, slow: 5000 },
  { name: 'Scan API', description: 'Block explorer', fast: 1000, slow: 3000 },
] as const

function statusFromLatency(ms: number, fast: number, slow: number): Status {
  if (ms < fast) return 'operational'
  if (ms < slow) return 'degraded'
  return 'down'
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

async function checkRpc(): Promise<{ valid: boolean; ms: number }> {
  const start = performance.now()
  try {
    const res = await withTimeout(
      fetch(PULSECHAIN_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      }),
      TIMEOUT_MS
    )
    const json = await res.json()
    return { valid: typeof json?.result === 'string' && json.result.startsWith('0x'), ms: performance.now() - start }
  } catch {
    return { valid: false, ms: performance.now() - start }
  }
}

async function checkSubgraph(): Promise<{ valid: boolean; ms: number }> {
  const start = performance.now()
  try {
    const res = await withTimeout(
      fetch(PULSEX_V2_SUBGRAPH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ _meta { block { number } } }' }),
      }),
      TIMEOUT_MS
    )
    const json = await res.json()
    return { valid: typeof json?.data?._meta?.block?.number === 'number', ms: performance.now() - start }
  } catch {
    return { valid: false, ms: performance.now() - start }
  }
}

async function checkScan(): Promise<{ valid: boolean; ms: number }> {
  const start = performance.now()
  try {
    const res = await withTimeout(fetch(SCAN_API), TIMEOUT_MS)
    const json = await res.json()
    return { valid: json?.total_blocks != null, ms: performance.now() - start }
  } catch {
    return { valid: false, ms: performance.now() - start }
  }
}

const checkers = [checkRpc, checkSubgraph, checkScan]

const COLORS: Record<Status, string> = {
  operational: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  down: 'bg-red-500',
}

const LABELS: Record<Status, string> = {
  operational: 'All Systems Operational',
  degraded: 'Degraded Performance',
  down: 'Service Disruption',
}

function Dot({ status }: { status: Status }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {status !== 'operational' && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${COLORS[status]} opacity-75`} />
      )}
      <span className={`relative inline-flex rounded-full h-2 w-2 ${COLORS[status]}`} />
    </span>
  )
}

export function RpcStatus() {
  const [services, setServices] = useState<Service[]>([])
  const [open, setOpen] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function run() {
      const results = await Promise.all(checkers.map((fn) => fn()))
      if (!mountedRef.current) return
      setServices(
        SERVICE_META.map((meta, i) => ({
          name: meta.name,
          description: meta.description,
          status: results[i].valid ? statusFromLatency(results[i].ms, meta.fast, meta.slow) : 'down',
          latencyMs: Math.round(results[i].ms),
        }))
      )
    }

    run()
    const id = setInterval(run, CHECK_INTERVAL)
    return () => { mountedRef.current = false; clearInterval(id) }
  }, [])

  if (!services.length) return null

  const overall: Status = services.some(s => s.status === 'down') ? 'down'
    : services.some(s => s.status === 'degraded') ? 'degraded' : 'operational'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
        title={LABELS[overall]}
      >
        <Dot status={overall} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-60 rounded-lg border border-white/10 bg-gray-900/95 backdrop-blur-md shadow-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Dot status={overall} />
              <span className="text-[11px] font-medium text-white">{LABELS[overall]}</span>
            </div>

            <div className="space-y-2">
              {services.map(s => (
                <div key={s.name}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Dot status={s.status} />
                      <span className="text-[10px] text-gray-300">{s.name}</span>
                    </div>
                    <span className={`text-[10px] font-mono ${
                      (s.latencyMs ?? 9999) < 500 ? 'text-emerald-400' : (s.latencyMs ?? 9999) < 2000 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {s.latencyMs ?? '--'}ms
                    </span>
                  </div>
                  <p className="text-[9px] text-gray-600 ml-[14px] mt-0.5">{s.description}</p>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-2.5 pt-2 border-t border-white/5 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400 shrink-0" />
                <span className="text-[9px] text-gray-500"><span className="text-emerald-400">OK</span> — normal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex rounded-full h-1.5 w-1.5 bg-amber-400 shrink-0" />
                <span className="text-[9px] text-gray-500"><span className="text-amber-400">Slow</span> — delayed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex rounded-full h-1.5 w-1.5 bg-red-500 shrink-0" />
                <span className="text-[9px] text-gray-500"><span className="text-red-400">Down</span> — unreachable</span>
              </div>
            </div>

            <div className="mt-2 pt-1.5 border-t border-white/5">
              <span className="text-[9px] text-gray-600">Checked every 15s</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
