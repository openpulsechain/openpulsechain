import { useState, useEffect, useRef } from 'react'

const PULSECHAIN_RPC = 'https://rpc.pulsechain.com'
const PULSEX_V2_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2'
const SCAN_API = 'https://api.scan.pulsechain.com/api/v2/stats'
const CHECK_INTERVAL = 15_000
const TIMEOUT_MS = 5_000

type Status = 'operational' | 'degraded' | 'down'

interface Service {
  name: string
  status: Status
  latencyMs: number | null
}

function statusFromLatency(ms: number, fast: number, slow: number): Status {
  if (ms < fast) return 'operational'
  if (ms < slow) return 'degraded'
  return 'down'
}

async function check(fn: () => Promise<Response>): Promise<{ ok: boolean; ms: number }> {
  const start = performance.now()
  try {
    const res = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ])
    return { ok: res.ok, ms: Math.round(performance.now() - start) }
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) }
  }
}

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
    <span className="relative flex h-2 w-2">
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
      const [rpc, sg, scan] = await Promise.all([
        check(() => fetch(PULSECHAIN_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
        })),
        check(() => fetch(PULSEX_V2_SUBGRAPH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '{ _meta { block { number } } }' }),
        })),
        check(() => fetch(SCAN_API)),
      ])
      if (!mountedRef.current) return
      setServices([
        { name: 'PulseChain RPC', status: rpc.ok ? statusFromLatency(rpc.ms, 500, 2000) : 'down', latencyMs: rpc.ms },
        { name: 'PulseX Subgraph', status: sg.ok ? statusFromLatency(sg.ms, 2000, 5000) : 'down', latencyMs: sg.ms },
        { name: 'Scan API', status: scan.ok ? statusFromLatency(scan.ms, 1000, 3000) : 'down', latencyMs: scan.ms },
      ])
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
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-white/10 bg-gray-900/95 backdrop-blur-md shadow-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Dot status={overall} />
              <span className="text-[11px] font-medium text-white">{LABELS[overall]}</span>
            </div>
            <div className="space-y-1.5">
              {services.map(s => (
                <div key={s.name} className="flex items-center justify-between">
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
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
