import { useState, useMemo } from 'react'
import { ExternalLink, ChevronDown, ChevronUp, AlertTriangle, Shield, Eye, Activity, Heart, Repeat2 } from 'lucide-react'
import { Spinner } from '../ui/Spinner'
import { useIntelConclusions, useLlmAnalyses, useResearchTweets } from '../../hooks/useSupabase'
import { shortenAddress, formatDate } from '../../lib/format'
import type { IntelConclusion, LlmAnalysis, ResearchTweet } from '../../types'

const SCAN_URL = 'https://scan.mypinata.cloud/ipfs/bafybeienxyoyrhn5tswclvd3gdjy5mtkkwmu37aqtml6onbf7xnb3o22pe/#/address'

type RiskFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'
type TypeFilter = 'all' | 'address_profile' | 'event'

const RISK_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  low: 'bg-green-500/20 text-green-300 border-green-500/40',
}

const SENTIMENT_COLORS: Record<string, string> = {
  warning: 'bg-orange-500/20 text-orange-300',
  bearish: 'bg-red-500/20 text-red-300',
  bullish: 'bg-green-500/20 text-green-300',
  neutral: 'bg-gray-500/20 text-gray-300',
  accusation: 'bg-rose-500/20 text-rose-300',
}

const ACTION_COLORS: Record<string, string> = {
  dump: 'bg-red-500/20 text-red-300',
  manipulate: 'bg-purple-500/20 text-purple-300',
  bridge: 'bg-blue-500/20 text-blue-300',
  redistribute: 'bg-amber-500/20 text-amber-300',
  tornado_funded: 'bg-rose-500/20 text-rose-300',
}

function RiskBadge({ level }: { level: string }) {
  const color = RISK_COLORS[level] || 'bg-gray-500/20 text-gray-300 border-gray-500/40'
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase border ${color}`}>
      {level}
    </span>
  )
}

function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={`${SCAN_URL}/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[#00D4FF] hover:text-white transition-colors text-xs"
    >
      {shortenAddress(address)}
      <ExternalLink className="h-3 w-3 opacity-50" />
    </a>
  )
}

function ConclusionCard({ conclusion, isExpanded, onToggle, tweets, llmAnalyses }: {
  conclusion: IntelConclusion
  isExpanded: boolean
  onToggle: () => void
  tweets: Map<string, ResearchTweet>
  llmAnalyses: Map<string, LlmAnalysis>
}) {
  // Get tweet IDs from evidence
  const tweetIds = useMemo(() => {
    if (!Array.isArray(conclusion.evidence)) return []
    const ids = new Set<string>()
    for (const e of conclusion.evidence) ids.add(e.tweet_id)
    return [...ids]
  }, [conclusion.evidence])

  // Get matching LLM analyses
  const relatedLlm = useMemo(() => {
    return tweetIds.map(tid => llmAnalyses.get(tid)).filter(Boolean) as LlmAnalysis[]
  }, [tweetIds, llmAnalyses])

  // Collect all amounts from LLM
  const allAmounts = useMemo(() => {
    const amounts: any[] = []
    for (const llm of relatedLlm) {
      if (llm.amounts_mentioned) amounts.push(...llm.amounts_mentioned)
    }
    return amounts
  }, [relatedLlm])

  // Collect all relationships
  const allRelationships = useMemo(() => {
    const rels: any[] = []
    for (const llm of relatedLlm) {
      if (llm.relationships) rels.push(...llm.relationships)
    }
    return rels
  }, [relatedLlm])

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] overflow-hidden">
      <div
        onClick={onToggle}
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
      >
        <div className="pt-0.5">
          <RiskBadge level={conclusion.risk_level} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 border border-white/5">
              {conclusion.conclusion_type.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-gray-500">{conclusion.tweet_count} tweets</span>
            <span className="text-xs text-gray-500 ml-auto flex-shrink-0">{formatDate(conclusion.last_seen)}</span>
          </div>
          <h3 className="text-sm font-medium text-white mb-1">{conclusion.title}</h3>
          <p className={`text-xs text-gray-400 ${isExpanded ? '' : 'line-clamp-2'}`}>
            {conclusion.summary}
          </p>

          {/* Tokens badges */}
          {conclusion.tokens_involved && conclusion.tokens_involved.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {conclusion.tokens_involved.map((token, i) => (
                <span key={i} className="rounded bg-[#8000E0]/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-300 border border-[#8000E0]/25">
                  {token}
                </span>
              ))}
            </div>
          )}

          {/* Addresses */}
          {conclusion.addresses_involved && conclusion.addresses_involved.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(isExpanded ? conclusion.addresses_involved : conclusion.addresses_involved.slice(0, 3)).map((addr, i) => (
                <AddressLink key={i} address={addr} />
              ))}
              {!isExpanded && conclusion.addresses_involved.length > 3 && (
                <span className="text-xs text-gray-500">+{conclusion.addresses_involved.length - 3} more</span>
              )}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 pt-1">
          {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-white/5 px-4 py-3 bg-white/[0.01] space-y-4">

          {/* LLM Analysis Summary */}
          {relatedLlm.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Analysis</h4>
              <div className="space-y-2">
                {relatedLlm.map((llm, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.02] border border-white/5 p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {llm.sentiment && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SENTIMENT_COLORS[llm.sentiment] || 'bg-gray-500/20 text-gray-300'}`}>
                          {llm.sentiment}
                        </span>
                      )}
                      {llm.action_detected && llm.action_detected !== 'none' && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ACTION_COLORS[llm.action_detected] || 'bg-gray-500/20 text-gray-300'}`}>
                          {llm.action_detected}
                        </span>
                      )}
                      {llm.risk_level && (
                        <RiskBadge level={llm.risk_level} />
                      )}
                    </div>
                    {llm.summary && <p className="text-xs text-gray-300">{llm.summary}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Amounts detected */}
          {allAmounts.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Amounts Detected</h4>
              <div className="flex flex-wrap gap-2">
                {allAmounts.map((a, i) => (
                  <span key={i} className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-xs text-amber-300">
                    {a.value || a}{a.token ? ` ${a.token}` : ''}{a.context ? ` (${a.context})` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Relationships */}
          {allRelationships.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Address Relationships</h4>
              <div className="space-y-1">
                {allRelationships.map((r, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    {r.from && <span className="font-mono text-[#00D4FF]">{shortenAddress(r.from)}</span>}
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-400">{r.type?.replace(/_/g, ' ')}</span>
                    {r.to && <span className="font-mono text-[#00D4FF]">{shortenAddress(r.to)}</span>}
                    {r.detail && <span className="text-gray-500">— {r.detail}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source tweets */}
          {tweetIds.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Source Tweets</h4>
              <div className="space-y-2">
                {tweetIds.map(tid => {
                  const tweet = tweets.get(tid)
                  if (!tweet) return null
                  return (
                    <div key={tid} className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-white">@{tweet.author_username}</span>
                        <a
                          href={tweet.tweet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#00D4FF] hover:text-white transition-colors flex items-center gap-1"
                        >
                          View on X <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <p className="text-xs text-gray-300 whitespace-pre-wrap line-clamp-4">{tweet.text}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {tweet.like_count}</span>
                        <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" /> {tweet.retweet_count}</span>
                        <span>{formatDate(tweet.tweeted_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-white/5">
            <span>First seen: {formatDate(conclusion.first_seen)}</span>
            <span>Last seen: {formatDate(conclusion.last_seen)}</span>
            <span className={conclusion.is_active ? 'text-green-400' : 'text-gray-500'}>
              {conclusion.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function IntelligencePage() {
  const conclusions = useIntelConclusions()
  const llmAnalyses = useLlmAnalyses()
  const researchTweets = useResearchTweets()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const loading = conclusions.loading || llmAnalyses.loading || researchTweets.loading

  // Build lookup maps for expanded cards
  const tweetsMap = useMemo(() => {
    const map = new Map<string, ResearchTweet>()
    for (const t of researchTweets.data) map.set(t.id, t)
    return map
  }, [researchTweets.data])

  const llmMap = useMemo(() => {
    const map = new Map<string, LlmAnalysis>()
    for (const l of llmAnalyses.data) map.set(l.tweet_id, l)
    return map
  }, [llmAnalyses.data])

  // KPIs
  const totalConclusions = conclusions.data.length
  const criticalHighCount = useMemo(
    () => conclusions.data.filter(c => c.risk_level === 'critical' || c.risk_level === 'high').length,
    [conclusions.data]
  )
  const uniqueAddresses = useMemo(() => {
    const set = new Set<string>()
    for (const c of conclusions.data) {
      if (c.addresses_involved) c.addresses_involved.forEach(a => set.add(a))
    }
    return set.size
  }, [conclusions.data])
  const uniqueTokens = useMemo(() => {
    const set = new Set<string>()
    for (const c of conclusions.data) {
      if (c.tokens_involved) c.tokens_involved.forEach(t => set.add(t))
    }
    return set.size
  }, [conclusions.data])

  // Sentiment distribution from LLM analyses
  const sentimentCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of llmAnalyses.data) {
      if (a.sentiment) {
        counts[a.sentiment] = (counts[a.sentiment] || 0) + 1
      }
    }
    return counts
  }, [llmAnalyses.data])

  // Action breakdown from LLM analyses
  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of llmAnalyses.data) {
      if (a.action_detected) {
        counts[a.action_detected] = (counts[a.action_detected] || 0) + 1
      }
    }
    return counts
  }, [llmAnalyses.data])

  // Filter & sort conclusions
  const filtered = useMemo(() => {
    let list = conclusions.data
    if (riskFilter !== 'all') list = list.filter(c => c.risk_level === riskFilter)
    if (typeFilter !== 'all') list = list.filter(c => c.conclusion_type === typeFilter)
    return [...list].sort((a, b) => (RISK_ORDER[a.risk_level] ?? 99) - (RISK_ORDER[b.risk_level] ?? 99))
  }, [conclusions.data, riskFilter, typeFilter])

  const totalSentiments = Object.values(sentimentCounts).reduce((s, v) => s + v, 0)

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Market Intelligence</h1>
        <p className="text-gray-400 mt-1">
          On-chain intelligence powered by AI analysis of crypto Twitter and blockchain data. Each conclusion is backed by evidence — tweets, transactions, and address profiling — ranked by risk level.
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-4 w-4 text-gray-400" />
            <p className="text-xs text-gray-400">Total Conclusions</p>
          </div>
          <p className="text-2xl font-bold text-white">{totalConclusions}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <p className="text-xs text-gray-400">Critical / High Alerts</p>
          </div>
          <p className="text-2xl font-bold text-red-400">{criticalHighCount}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-[#00D4FF]" />
            <p className="text-xs text-gray-400">Addresses Tracked</p>
          </div>
          <p className="text-2xl font-bold text-[#00D4FF]">{uniqueAddresses}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-purple-400" />
            <p className="text-xs text-gray-400">Tokens Monitored</p>
          </div>
          <p className="text-2xl font-bold text-purple-400">{uniqueTokens}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Risk level filters */}
        {([
          { key: 'all' as RiskFilter, label: 'All' },
          { key: 'critical' as RiskFilter, label: 'Critical' },
          { key: 'high' as RiskFilter, label: 'High' },
          { key: 'medium' as RiskFilter, label: 'Medium' },
          { key: 'low' as RiskFilter, label: 'Low' },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setRiskFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              riskFilter === f.key
                ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}

        <span className="text-gray-600 mx-1">|</span>

        {/* Type filters */}
        {([
          { key: 'all' as TypeFilter, label: 'All Types' },
          { key: 'address_profile' as TypeFilter, label: 'Address Profile' },
          { key: 'event' as TypeFilter, label: 'Event' },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              typeFilter === f.key
                ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}

        <span className="ml-auto text-xs text-gray-500">{filtered.length} results</span>
      </div>

      {/* Main content: conclusions + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conclusions list */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-8 text-center text-gray-500">
              No conclusions match the current filters.
            </div>
          ) : (
            filtered.map(c => (
              <ConclusionCard
                key={c.id}
                conclusion={c}
                isExpanded={expanded === c.id}
                onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                tweets={tweetsMap}
                llmAnalyses={llmMap}
              />
            ))
          )}
        </div>

        {/* Sidebar: Sentiment + Actions */}
        <div className="space-y-4">
          {/* Sentiment Overview */}
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sentiment Distribution</h3>
            {totalSentiments === 0 ? (
              <p className="text-sm text-gray-500">No sentiment data available</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(sentimentCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([sentiment, count]) => {
                    const pct = Math.round((count / totalSentiments) * 100)
                    const color = SENTIMENT_COLORS[sentiment] || 'bg-gray-500/20 text-gray-300'
                    return (
                      <div key={sentiment}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={`rounded px-1.5 py-0.5 font-medium capitalize ${color}`}>
                            {sentiment}
                          </span>
                          <span className="text-gray-400">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#8000E0] to-[#00D4FF] transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Actions Breakdown */}
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actions Detected</h3>
            {Object.keys(actionCounts).length === 0 ? (
              <p className="text-sm text-gray-500">No actions detected</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(actionCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([action, count]) => {
                    const color = ACTION_COLORS[action] || 'bg-gray-500/20 text-gray-300'
                    return (
                      <div key={action} className="flex items-center justify-between">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>
                          {action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm font-medium text-white">{count}</span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* LLM Analysis Stats */}
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">LLM Analysis</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">Total Analyses</p>
                <p className="text-lg font-bold text-white">{llmAnalyses.data.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Sentiments</p>
                <p className="text-lg font-bold text-[#00D4FF]">{Object.keys(sentimentCounts).length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Action Types</p>
                <p className="text-lg font-bold text-purple-400">{Object.keys(actionCounts).length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">High Risk</p>
                <p className="text-lg font-bold text-red-400">
                  {llmAnalyses.data.filter(a => a.risk_level === 'high' || a.risk_level === 'critical').length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-gray-600 pt-4">
        This is not investment advice. Data is provided for educational and informational purposes only.
      </p>
    </div>
  )
}
