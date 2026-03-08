import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Shield, TrendingDown, Coins, Clock, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Alert {
  id: number
  alert_type: string
  severity: string
  token_address: string | null
  pair_address: string | null
  data: Record<string, unknown>
  created_at: string
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  lp_removal: <TrendingDown className="h-4 w-4" />,
  whale_dump: <Coins className="h-4 w-4" />,
  mint_event: <AlertTriangle className="h-4 w-4" />,
}

const TYPE_LABELS: Record<string, string> = {
  lp_removal: 'LP Removal',
  whale_dump: 'Whale Dump',
  mint_event: 'Mint Event',
  tax_change: 'Tax Change',
}

export function AlertsPage() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    loadAlerts()
  }, [])

  async function loadAlerts() {
    setLoading(true)
    const { data } = await supabase
      .from('scam_radar_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    setAlerts(data || [])
    setLoading(false)
  }

  const filteredAlerts = alerts.filter(a => {
    if (filter === 'all') return true
    return a.alert_type === filter
  })

  function formatTime(ts: string) {
    const d = new Date(ts)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000

    if (diff < 60) return `${Math.floor(diff)}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-orange-400" />
          Scam Radar
        </h1>
        <p className="text-gray-400 mt-1">
          Real-time alerts for suspicious on-chain activity: LP removals, whale dumps, and more.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all', label: 'All Alerts' },
          { id: 'lp_removal', label: 'LP Removals' },
          { id: 'whale_dump', label: 'Whale Dumps' },
          { id: 'mint_event', label: 'Mint Events' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.id
                ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Alerts list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF]" />
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Shield className="h-12 w-12 mx-auto mb-3 text-emerald-400/30" />
          <p className="text-lg font-medium text-gray-400">No alerts detected</p>
          <p className="text-sm mt-1">The radar is monitoring. You'll see alerts here when suspicious activity is detected.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map(alert => {
            const data = typeof alert.data === 'string' ? JSON.parse(alert.data) : alert.data
            return (
              <div
                key={alert.id}
                className="rounded-xl border border-white/5 bg-gray-900/50 p-4 hover:bg-gray-900/70 transition-colors cursor-pointer"
                onClick={() => {
                  const tokenAddr = data.token0_address || data.token_address || alert.token_address
                  if (tokenAddr) navigate(`/token/${tokenAddr}`)
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg border ${SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium}`}>
                    {TYPE_ICONS[alert.alert_type] || <AlertTriangle className="h-4 w-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">
                        {TYPE_LABELS[alert.alert_type] || alert.alert_type}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${SEVERITY_STYLES[alert.severity]}`}>
                        {alert.severity}
                      </span>
                    </div>

                    {alert.alert_type === 'lp_removal' && (
                      <p className="text-sm text-gray-400">
                        <span className="text-gray-200">${Number(data.amount_usd || 0).toLocaleString()}</span> LP removed from{' '}
                        <span className="text-gray-200">{data.token0_symbol}/{data.token1_symbol}</span> on {data.dex}
                      </p>
                    )}

                    {alert.alert_type === 'whale_dump' && (
                      <p className="text-sm text-gray-400">
                        <span className="text-gray-200">{data.pct_of_supply}%</span> of supply sold
                      </p>
                    )}

                    {data.sender && (
                      <p className="text-xs text-gray-500 font-mono mt-1 truncate">
                        by {data.sender}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                    <Clock className="h-3 w-3" />
                    {formatTime(alert.created_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
