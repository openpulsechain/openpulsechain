import { useState, useEffect } from 'react'
import { Crown, Users, Loader2, ChevronDown, ChevronRight, Link2, ExternalLink, Copy, Check } from 'lucide-react'
import { useHolderLeagues } from '../../hooks/useSupabase'
import { supabase } from '../../lib/supabase'
import type { HolderLeagueCurrent, HolderLeagueAddress, HolderLeagueFamily } from '../../types'

const SCAN_URL = 'https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#'

const TIERS = [
  { key: 'poseidon', label: 'Poseidon', emoji: '\u{1F30A}', pct: 10, color: '#fbbf24' },
  { key: 'whale', label: 'Whale', emoji: '\u{1F40B}', pct: 1, color: '#a855f7' },
  { key: 'shark', label: 'Shark', emoji: '\u{1F988}', pct: 0.1, color: '#22d3ee' },
  { key: 'dolphin', label: 'Dolphin', emoji: '\u{1F42C}', pct: 0.01, color: '#3b82f6' },
  { key: 'squid', label: 'Squid', emoji: '\u{1F991}', pct: 0.001, color: '#10b981' },
  { key: 'turtle', label: 'Turtle', emoji: '\u{1F422}', pct: 0.0001, color: '#6b7280' },
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

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function CopyAddr({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(address)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="p-0.5 text-gray-500 hover:text-white transition-colors"
      title="Copy address"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

function AddressLink({ address }: { address: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <a
        href={`${SCAN_URL}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#00D4FF] hover:underline"
        onClick={e => e.stopPropagation()}
      >
        {shortAddr(address)}
      </a>
      <CopyAddr address={address} />
    </span>
  )
}

// ── Expandable tier row with holders ────────────────────────

function TierHoldersList({ tokenSymbol, tierKey }: { tokenSymbol: string; tierKey: string }) {
  const [holders, setHolders] = useState<HolderLeagueAddress[]>([])
  const [families, setFamilies] = useState<HolderLeagueFamily[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [holdersRes, familiesRes] = await Promise.all([
        supabase.from('holder_league_addresses')
          .select('*')
          .eq('token_symbol', tokenSymbol)
          .eq('tier', tierKey)
          .order('balance_pct', { ascending: false })
          .limit(200),
        supabase.from('holder_league_families')
          .select('*')
          .eq('token_symbol', tokenSymbol)
          .eq('combined_tier', tierKey)
          .order('combined_balance_pct', { ascending: false })
          .limit(50),
      ])
      setHolders(holdersRes.data || [])
      setFamilies(familiesRes.data || [])
      setLoading(false)
    }
    load()
  }, [tokenSymbol, tierKey])

  const toggleFamily = (familyId: string) => {
    setExpandedFamilies(prev => {
      const next = new Set(prev)
      if (next.has(familyId)) next.delete(familyId)
      else next.add(familyId)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </div>
    )
  }

  if (holders.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-gray-500">
        No individual holder data yet. Will appear after next scrape.
      </div>
    )
  }

  // Group holders: families first, then solo
  const familyIds = new Set(families.map(f => f.family_id))
  const familyHolders = new Map<string, HolderLeagueAddress[]>()
  const soloHolders: HolderLeagueAddress[] = []

  for (const h of holders) {
    if (h.family_id && familyIds.has(h.family_id)) {
      if (!familyHolders.has(h.family_id)) familyHolders.set(h.family_id, [])
      familyHolders.get(h.family_id)!.push(h)
    } else {
      soloHolders.push(h)
    }
  }

  return (
    <div className="space-y-1 px-4 pb-4">
      {/* Families */}
      {families.map(family => {
        const members = familyHolders.get(family.family_id) || []
        const isExpanded = expandedFamilies.has(family.family_id)
        const mother = members.find(m => m.holder_address === family.mother_address)
        const daughters = members.filter(m => m.holder_address !== family.mother_address)

        return (
          <div key={family.family_id} className="rounded-lg border border-purple-500/20 bg-purple-500/5 overflow-hidden">
            <button
              onClick={() => toggleFamily(family.family_id)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-purple-500/10 transition-colors text-left"
            >
              {isExpanded
                ? <ChevronDown className="h-4 w-4 text-purple-400 shrink-0" />
                : <ChevronRight className="h-4 w-4 text-purple-400 shrink-0" />
              }
              <Link2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span className="text-xs text-purple-300 font-medium">
                Family ({1 + family.daughter_count} addresses)
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                Combined: {family.combined_balance_pct.toFixed(4)}%
                {family.combined_tier !== family.individual_tier && (
                  <span className="ml-2 text-amber-400">
                    {family.individual_tier} → {family.combined_tier}
                  </span>
                )}
              </span>
            </button>
            {isExpanded && (
              <div className="border-t border-purple-500/10 px-3 py-2 space-y-1.5">
                {/* Mother */}
                {mother && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">MOTHER</span>
                    <AddressLink address={mother.holder_address} />
                    <span className="text-gray-400 ml-auto font-mono">{mother.balance_pct.toFixed(4)}%</span>
                  </div>
                )}
                {/* Daughters */}
                {daughters.map(d => (
                  <div key={d.holder_address} className="flex items-center gap-2 text-xs pl-6">
                    <span className="px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 text-[10px]">CHILD</span>
                    <AddressLink address={d.holder_address} />
                    <span className="text-gray-500 ml-auto font-mono">{d.balance_pct.toFixed(4)}%</span>
                  </div>
                ))}
                {/* Link types */}
                {family.link_types && family.link_types.length > 0 && (
                  <div className="flex gap-1.5 pt-1">
                    {family.link_types.map(lt => (
                      <span key={lt} className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-gray-500 border border-white/5">
                        {lt.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Solo holders */}
      {soloHolders.map(h => (
        <div key={h.holder_address} className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.02] transition-colors">
          <AddressLink address={h.holder_address} />
          <span className="text-xs text-gray-500 ml-auto font-mono">{h.balance_pct.toFixed(4)}%</span>
          <a
            href={`${SCAN_URL}/address/${h.holder_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-[#00D4FF] transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ))}

      {holders.length >= 200 && (
        <p className="text-center text-[10px] text-gray-600 pt-2">Showing top 200 addresses</p>
      )}
    </div>
  )
}

// ── Token card ──────────────────────────────────────────────

function TokenCard({ league }: { league: HolderLeagueCurrent }) {
  const color = TOKEN_COLORS[league.token_symbol] || '#00D4FF'
  const [expandedTier, setExpandedTier] = useState<string | null>(null)

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

      {/* Tiers */}
      <div>
        <div className="grid grid-cols-4 text-xs text-gray-500 uppercase tracking-wider px-6 py-3">
          <span>League</span>
          <span className="text-right">% of Supply</span>
          <span className="text-right">Tokens Required</span>
          <span className="text-right"># of Holders</span>
        </div>
        {TIERS.map((tier) => {
          const count = league[`${tier.key}_count` as keyof HolderLeagueCurrent] as number
          const isExpanded = expandedTier === tier.key

          return (
            <div key={tier.key}>
              <div
                className={`grid grid-cols-4 items-center border-t border-white/[0.03] transition-colors cursor-pointer px-6 py-3 ${
                  isExpanded ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'
                }`}
                onClick={() => setExpandedTier(isExpanded ? null : tier.key)}
              >
                <div className="flex items-center gap-2">
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                    : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                  }
                  <span className="text-lg">{tier.emoji}</span>
                  <span className="text-sm font-medium" style={{ color: tier.color }}>{tier.label}</span>
                </div>
                <div className="text-right text-sm text-gray-400">{formatPct(tier.pct)}</div>
                <div className="text-right text-sm text-gray-300 font-mono">
                  {tokensRequired(league.total_supply_human, tier.pct)}
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold" style={{ color }}>
                    {count.toLocaleString()}
                  </span>
                </div>
              </div>
              {isExpanded && (
                <div className="bg-white/[0.01] border-t border-white/[0.03]">
                  <TierHoldersList tokenSymbol={league.token_symbol} tierKey={tier.key} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function LeaguesPage() {
  const { data: leagues, loading } = useHolderLeagues()

  const sorted = TOKEN_ORDER
    .map((sym) => leagues.find((l) => l.token_symbol === sym))
    .filter(Boolean) as HolderLeagueCurrent[]

  // Aggregate KPIs from all tokens
  const totalHolders = sorted.reduce((sum, l) => sum + l.total_holders, 0)
  const totalWhales = sorted.reduce((sum, l) => sum + l.whale_count, 0)
  const totalSharks = sorted.reduce((sum, l) => sum + l.shark_count, 0)

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-amber-500/5 via-purple-500/5 to-cyan-500/5 backdrop-blur-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/20">
                <Crown className="h-6 w-6 text-amber-400" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-purple-400 bg-clip-text text-transparent">
                Holder Leagues
              </h1>
            </div>
            <p className="text-gray-400 max-w-xl text-sm">
              On-chain holder distribution for PLS, PLSX, pHEX, and INC.
              Click any tier to reveal individual addresses and family clusters.
            </p>
          </div>
          {sorted.length > 0 && (
            <div className="flex gap-4">
              <div className="text-center px-4 py-2 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-lg font-bold text-white">{totalHolders.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total Holders</div>
              </div>
              <div className="text-center px-4 py-2 rounded-xl bg-purple-500/5 border border-purple-500/10">
                <div className="text-lg font-bold text-purple-400">{totalWhales}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Whales</div>
              </div>
              <div className="text-center px-4 py-2 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
                <div className="text-lg font-bold text-cyan-400">{totalSharks}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Sharks</div>
              </div>
            </div>
          )}
        </div>
        {sorted.length > 0 && sorted[0].updated_at && (
          <div className="mt-3 text-[10px] text-gray-600">
            Data sourced on-chain via PulseChain Scan API &middot; Updated every 6h &middot; Last: {new Date(sorted[0].updated_at).toLocaleString()}
          </div>
        )}
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

      {/* Token logos row */}
      {sorted.length > 0 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          {sorted.map(l => (
            <img key={l.token_symbol} src={TOKEN_LOGOS[l.token_symbol]} alt={l.token_symbol} className="h-6 w-6 rounded-full opacity-40" />
          ))}
          <span className="text-[10px] text-gray-600 ml-2">100% on-chain data &middot; Open source</span>
        </div>
      )}
    </div>
  )
}
