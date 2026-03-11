import { useState, useMemo, Fragment } from 'react'
import { ExternalLink, ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import { Spinner } from '../ui/Spinner'
import { ShareButton } from '../ui/ShareButton'
import { useWhaleAddresses, useWhaleHoldings, useWhaleLinks } from '../../hooks/useSupabase'
import { formatUsd, shortenAddress } from '../../lib/format'
import type { WhaleAddress, WhaleHolding, WhaleLink } from '../../types'

const SCAN_URL = 'https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address'

function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={`${SCAN_URL}/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[#00D4FF] hover:text-white transition-colors"
    >
      {shortenAddress(address)}
      <ExternalLink className="h-3 w-3 opacity-50" />
    </a>
  )
}

const LINK_COLORS: Record<string, string> = {
  common_funder: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  same_funder: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  direct_transfer: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  token_transfer: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  bridge_funded: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  bridge_siblings: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  bridge_user: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
}

function LinkBadge({ type }: { type: string }) {
  const color = LINK_COLORS[type] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'
  const label = type.replace(/_/g, ' ')
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium border ${color}`}>
      {label}
    </span>
  )
}

interface ExpandedWhaleProps {
  whale: WhaleAddress
  holdings: WhaleHolding[]
  links: WhaleLink[]
}

function ExpandedWhaleRow({ whale, holdings, links }: ExpandedWhaleProps) {
  const whaleHoldings = holdings.filter(h => h.address === whale.address)
    .sort((a, b) => b.balance_usd - a.balance_usd)

  const whaleLinks = links.filter(
    l => l.address_from === whale.address || l.address_to === whale.address
  )

  // Group links by connected address
  const connectionMap = new Map<string, WhaleLink[]>()
  for (const link of whaleLinks) {
    const other = link.address_from === whale.address ? link.address_to : link.address_from
    if (!connectionMap.has(other)) connectionMap.set(other, [])
    connectionMap.get(other)!.push(link)
  }

  return (
    <tr>
      <td colSpan={5} className="px-4 py-3 bg-white/[0.02]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Holdings */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Holdings</h4>
            <div className="space-y-1">
              {whaleHoldings.map(h => (
                <div key={h.token_address} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{h.token_symbol}</span>
                  <div className="text-right">
                    <span className="text-white">{formatUsd(h.balance_usd)}</span>
                    <span className="text-gray-500 ml-2 text-xs">
                      ({h.balance.toLocaleString('en-US', { maximumFractionDigits: 0 })})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Connections */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Connections ({connectionMap.size})
            </h4>
            {connectionMap.size === 0 ? (
              <p className="text-sm text-gray-500">No connections found</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {Array.from(connectionMap.entries()).slice(0, 20).map(([addr, addrLinks]) => (
                  <div key={addr} className="flex items-center gap-2 text-sm">
                    <AddressLink address={addr} />
                    <div className="flex flex-wrap gap-1">
                      {addrLinks.map((l, i) => (
                        <LinkBadge key={i} type={l.link_type} />
                      ))}
                    </div>
                  </div>
                ))}
                {connectionMap.size > 20 && (
                  <p className="text-xs text-gray-500">+{connectionMap.size - 20} more</p>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

export function WhalesPage() {
  const whales = useWhaleAddresses()
  const holdings = useWhaleHoldings()
  const links = useWhaleLinks()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'multi' | 'connected'>('all')

  const loading = whales.loading || holdings.loading || links.loading

  // Build set of addresses that have connections
  const connectedAddresses = useMemo(() => {
    const set = new Set<string>()
    for (const l of links.data) {
      set.add(l.address_from)
      set.add(l.address_to)
    }
    return set
  }, [links.data])

  const filtered = useMemo(() => {
    let list = whales.data
    if (filter === 'multi') list = list.filter(w => w.token_count >= 2)
    if (filter === 'connected') list = list.filter(w => connectedAddresses.has(w.address))
    return list
  }, [whales.data, filter, connectedAddresses])

  // Stats
  const totalValue = useMemo(() => whales.data.reduce((s, w) => s + w.total_usd, 0), [whales.data])
  const multiTokenWhales = useMemo(() => whales.data.filter(w => w.token_count >= 2).length, [whales.data])
  const clusterCount = useMemo(() => {
    const funders = new Set(links.data.filter(l => l.link_type === 'common_funder').map(l => l.address_from))
    return funders.size
  }, [links.data])

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Whale Tracker</h1>
          <p className="text-gray-400 mt-1">
            Map the largest PulseChain holders: multi-token portfolios, funding clusters, and direct connections between whale wallets. Identify coordinated activity across addresses.
          </p>
        </div>
        <ShareButton title="Whale Tracker" text="PulseChain whale wallets and holdings" />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <p className="text-xs text-gray-400">Total Whales</p>
          <p className="text-2xl font-bold text-white">{whales.data.length}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <p className="text-xs text-gray-400">Tracked Value</p>
          <p className="text-2xl font-bold text-white">{formatUsd(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <p className="text-xs text-gray-400">Multi-Token Holders</p>
          <p className="text-2xl font-bold text-[#00D4FF]">{multiTokenWhales}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <p className="text-xs text-gray-400">Funding Clusters</p>
          <p className="text-2xl font-bold text-purple-400">{clusterCount}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {[
          { key: 'all' as const, label: 'All Whales' },
          { key: 'multi' as const, label: 'Multi-Token (2+)' },
          { key: 'connected' as const, label: 'Connected' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">{filtered.length} addresses</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1"><Link2 className="h-3 w-3" /> Connection types:</span>
        <LinkBadge type="common_funder" />
        <LinkBadge type="same_funder" />
        <LinkBadge type="direct_transfer" />
        <LinkBadge type="token_transfer" />
        <LinkBadge type="bridge_funded" />
        <LinkBadge type="bridge_siblings" />
        <LinkBadge type="bridge_user" />
      </div>

      {/* Whale Table */}
      <div className="rounded-xl border border-white/5 bg-white/[0.03] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3 w-8">#</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-center">Tokens</th>
                <th className="px-4 py-3">Top Holdings</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((whale, idx) => {
                const isExpanded = expanded === whale.address
                const hasLinks = connectedAddresses.has(whale.address)
                return (
                  <Fragment key={whale.address}>
                    <tr
                      onClick={() => setExpanded(isExpanded ? null : whale.address)}
                      className={`border-b border-white/[0.03] cursor-pointer transition-colors ${
                        isExpanded ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AddressLink address={whale.address} />
                          {whale.is_contract && (
                            <span className="rounded bg-gray-700/50 px-1 py-0.5 text-[10px] text-gray-400">contract</span>
                          )}
                          {hasLinks && (
                            <Link2 className="h-3.5 w-3.5 text-purple-400" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-white">
                        {formatUsd(whale.total_usd)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`${whale.token_count >= 2 ? 'text-[#00D4FF]' : 'text-gray-400'}`}>
                          {whale.token_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="truncate max-w-[200px]">{whale.top_tokens || '—'}</span>
                          {isExpanded ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <ExpandedWhaleRow
                        whale={whale}
                        holdings={holdings.data}
                        links={links.data}
                      />
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-center text-xs text-gray-600 pt-4">
        This is not investment advice. Data is provided for educational and informational purposes only.
      </p>
    </div>
  )
}
