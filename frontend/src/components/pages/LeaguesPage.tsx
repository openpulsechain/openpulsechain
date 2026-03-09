import { Crown, Users, Loader2 } from 'lucide-react'
import { useHolderLeagues } from '../../hooks/useSupabase'
import type { HolderLeagueCurrent } from '../../types'

const TIERS = [
  { key: 'poseidon', label: 'Poseidon', emoji: '🌊', pct: 10, color: '#fbbf24' },
  { key: 'whale', label: 'Whale', emoji: '🐋', pct: 1, color: '#a855f7' },
  { key: 'shark', label: 'Shark', emoji: '🦈', pct: 0.1, color: '#22d3ee' },
  { key: 'dolphin', label: 'Dolphin', emoji: '🐬', pct: 0.01, color: '#3b82f6' },
  { key: 'squid', label: 'Squid', emoji: '🦑', pct: 0.001, color: '#10b981' },
  { key: 'turtle', label: 'Turtle', emoji: '🐢', pct: 0.0001, color: '#6b7280' },
] as const

const TOKEN_ORDER = ['PLS', 'PLSX', 'pHEX', 'INC'] as const
const TOKEN_COLORS: Record<string, string> = {
  PLS: '#00D4FF',
  PLSX: '#8000E0',
  pHEX: '#FF6B35',
  INC: '#10b981',
}
const TOKEN_LOGOS: Record<string, string> = {
  PLS: '/tokens/pls.png',
  PLSX: '/tokens/plsx.png',
  pHEX: '/tokens/phex.png',
  INC: '/tokens/inc.png',
}
const TOKEN_DESCRIPTIONS: Record<string, string> = {
  PLS: 'Combined PLS + WPLS Holders',
  PLSX: 'PulseX Token Holders',
  pHEX: 'HEX Token Holders',
  INC: 'INC Token Holders',
}

function formatSupply(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(0)
}

function formatPct(pct: number): string {
  return `${pct.toFixed(pct >= 1 ? 0 : pct >= 0.01 ? 2 : pct >= 0.001 ? 3 : 4)}%`
}

function tokensRequired(totalSupply: number, pct: number): string {
  return formatSupply(totalSupply * pct / 100)
}

function TokenCard({ league }: { league: HolderLeagueCurrent }) {
  const color = TOKEN_COLORS[league.token_symbol] || '#00D4FF'

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5" style={{ background: `linear-gradient(135deg, ${color}10, transparent)` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {TOKEN_LOGOS[league.token_symbol] && (
              <img src={TOKEN_LOGOS[league.token_symbol]} alt={league.token_symbol} className="h-10 w-10 rounded-full" />
            )}
            <div>
              <h3 className="text-lg font-bold text-white">{league.token_symbol} Holders</h3>
              <p className="text-sm text-gray-400">{TOKEN_DESCRIPTIONS[league.token_symbol] || 'Token Holders'}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{league.total_holders.toLocaleString()}</div>
            <div className="text-xs text-gray-500">total holders</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3 text-left">League</th>
              <th className="px-4 py-3 text-right">% of Supply</th>
              <th className="px-4 py-3 text-right">Tokens Required</th>
              <th className="px-6 py-3 text-right"># of Holders</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((tier) => {
              const count = league[`${tier.key}_count` as keyof HolderLeagueCurrent] as number
              return (
                <tr key={tier.key} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{tier.emoji}</span>
                      <span className="text-sm font-medium" style={{ color: tier.color }}>{tier.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-400">{formatPct(tier.pct)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-300 font-mono">
                    {tokensRequired(league.total_supply_human, tier.pct)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color }}>
                      {count.toLocaleString()}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function LeaguesPage() {
  const { data: leagues, loading } = useHolderLeagues()

  // Sort leagues by TOKEN_ORDER
  const sorted = TOKEN_ORDER
    .map((sym) => leagues.find((l) => l.token_symbol === sym))
    .filter(Boolean) as HolderLeagueCurrent[]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Crown className="h-6 w-6 text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Holder Leagues</h1>
        </div>
        <p className="text-gray-400 max-w-2xl">
          PulseChain token holder distribution ranked by ocean-themed tiers.
          Track whale concentration and holder growth for PLS, PLSX, pHEX, and INC.
          Updated every 6 hours.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF]" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <Users className="h-12 w-12 text-gray-600 mb-4" />
          <h2 className="text-lg font-semibold text-gray-400 mb-2">No league data available yet</h2>
          <p className="text-sm text-gray-500">Data will appear after the first scrape cycle (every 6 hours).</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sorted.map((league) => (
            <TokenCard key={league.token_symbol} league={league} />
          ))}
        </div>
      )}

      {/* Last updated */}
      {sorted.length > 0 && sorted[0].updated_at && (
        <div className="text-center text-xs text-gray-600">
          Last updated: {new Date(sorted[0].updated_at).toLocaleString()}
        </div>
      )}
    </div>
  )
}
