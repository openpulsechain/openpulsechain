import { useState } from 'react'
import { useRpcHealth, type ServiceStatus } from '../../hooks/useRpcHealth'

const STATUS_CONFIG: Record<ServiceStatus, { color: string; bg: string; ping: string; label: string }> = {
  operational: { color: 'bg-emerald-400', bg: 'bg-emerald-400/20', ping: 'bg-emerald-400', label: 'All Systems Operational' },
  degraded: { color: 'bg-amber-400', bg: 'bg-amber-400/20', ping: 'bg-amber-400', label: 'Degraded Performance' },
  down: { color: 'bg-red-500', bg: 'bg-red-500/20', ping: 'bg-red-500', label: 'Service Disruption' },
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status !== 'operational' && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.ping} opacity-75`} />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.color}`} />
    </span>
  )
}

function LatencyBadge({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="text-gray-600">--</span>
  const color = ms < 500 ? 'text-emerald-400' : ms < 2000 ? 'text-amber-400' : 'text-red-400'
  return <span className={`text-[11px] font-mono ${color}`}>{ms}ms</span>
}

export function RpcStatusIndicator() {
  const { services, overall, loading } = useRpcHealth()
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CONFIG[overall]

  if (loading) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
        title={cfg.label}
      >
        <StatusDot status={overall} />
        <span className="text-[11px] text-gray-400 hidden sm:inline">RPC</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-white/10 bg-gray-900/95 backdrop-blur-md shadow-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <StatusDot status={overall} />
              <span className="text-sm font-medium text-white">{cfg.label}</span>
            </div>

            <div className="space-y-2.5">
              {services.map((svc) => (
                <div key={svc.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot status={svc.status} />
                    <span className="text-xs text-gray-300">{svc.name}</span>
                  </div>
                  <LatencyBadge ms={svc.latencyMs} />
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-white/5">
              <span className="text-[10px] text-gray-500">
                Checked every 15s — {services[0]?.lastChecked?.toLocaleTimeString() || '--'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
