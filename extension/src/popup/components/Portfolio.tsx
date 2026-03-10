import { useState, useEffect } from 'react'
import { Wallet, Plus, Trash2, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import { useStore } from '../../lib/store'
import { getWalletBalances, getHolderRank, type WalletBalance, type HolderRankResult } from '../../lib/api'
import { formatUsd, shortenAddress } from '../../lib/format'

function formatBalance(val: number): string {
  if (val === 0) return '0'
  if (val < 0.0001) return val.toExponential(2)
  if (val < 1) return val.toFixed(4)
  if (val < 10000) return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (val < 1e9) return val.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (val < 1e12) return `${(val / 1e9).toFixed(2)}B`
  return `${(val / 1e12).toFixed(2)}T`
}

// Generate a deterministic color from token symbol for avatar
function symbolColor(symbol: string): string {
  let hash = 0
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 45%)`
}

// Known PulseChain token logos (checksum addresses for PulseX CDN)
const PLS_LOGO = 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png'
const KNOWN_LOGOS: Record<string, string> = {
  'PLS': PLS_LOGO,
  'WPLS': PLS_LOGO,
  'PLSX': 'https://tokens.app.pulsex.com/images/tokens/0x95B303987A60C71504D99Aa1b13B4DA07b0790ab.png',
  'HEX': 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
  'INC': 'https://tokens.app.pulsex.com/images/tokens/0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d.png',
  'DAI': 'https://tokens.app.pulsex.com/images/tokens/0xefD766cCb38EaF1dfd701853BFCe31359239F305.png',
  'USDC': 'https://tokens.app.pulsex.com/images/tokens/0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07.png',
  'USDT': 'https://tokens.app.pulsex.com/images/tokens/0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f.png',
  'WETH': 'https://tokens.app.pulsex.com/images/tokens/0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C.png',
  'WBTC': 'https://tokens.app.pulsex.com/images/tokens/0xb17D901469B9208B17d916112988A3FeD19b5cA1.png',
  'HDRN': 'https://tokens.app.pulsex.com/images/tokens/0x3819f64f282bf135d62168C1e513280dAF905e06.png',
  'LOAN': 'https://tokens.app.pulsex.com/images/tokens/0x9159f1D2a9f51998Fc9Ab03fbd8f265ab14A1b3B.png',
}

function TokenAvatar({ symbol, address }: { symbol: string; address: string }) {
  const [imgError, setImgError] = useState(false)
  const [triedFallback, setTriedFallback] = useState(false)

  // Priority: known logo > PulseX CDN by address > colored circle
  const knownUrl = KNOWN_LOGOS[symbol.toUpperCase()]

  const handleError = () => {
    if (!triedFallback && !knownUrl) {
      setTriedFallback(true)
    } else {
      setImgError(true)
    }
  }

  if (imgError) {
    return (
      <div
        className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 border border-white/10"
        style={{ backgroundColor: symbolColor(symbol) }}
      >
        {symbol.slice(0, 2)}
      </div>
    )
  }

  const imgUrl = knownUrl || `https://tokens.app.pulsex.com/images/tokens/${address}.png`

  return (
    <img
      src={imgUrl}
      alt={symbol}
      className="h-7 w-7 rounded-full shrink-0 bg-gray-800 border border-white/10"
      onError={handleError}
    />
  )
}

// Map extension token symbols to league symbols
const LEAGUE_SYMBOL_MAP: Record<string, string> = {
  'PLS': 'PLS',
  'PLSX': 'PLSX',
  'HEX': 'pHEX',
  'INC': 'INC',
}

const TIER_EMOJI: Record<string, string> = {
  poseidon: '\u{1F531}',  // trident
  whale: '\u{1F40B}',
  shark: '\u{1F988}',
  dolphin: '\u{1F42C}',
  squid: '\u{1F991}',
  turtle: '\u{1F422}',
}

const TIER_COLOR: Record<string, string> = {
  poseidon: '#fbbf24',
  whale: '#3b82f6',
  shark: '#8b5cf6',
  dolphin: '#06b6d4',
  squid: '#10b981',
  turtle: '#6b7280',
}

export function Portfolio() {
  const wallets = useStore((s) => s.wallets)
  const addWallet = useStore((s) => s.addWallet)
  const removeWallet = useStore((s) => s.removeWallet)
  const [input, setInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [activeWallet, setActiveWallet] = useState<string | null>(null)
  const [balances, setBalances] = useState<WalletBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ranks, setRanks] = useState<HolderRankResult | null>(null)

  useEffect(() => {
    if (wallets.length > 0 && !activeWallet) {
      loadWallet(wallets[0].address)
    }
  }, [wallets])

  const loadWallet = async (address: string) => {
    setActiveWallet(address)
    setLoading(true)
    setError(null)
    try {
      const [result, rankResult] = await Promise.all([
        getWalletBalances(address),
        getHolderRank(address).catch(() => null),
      ])
      const withValue = result
        .filter((b) => b.value_usd != null && b.value_usd > 0.01)
        .sort((a, b) => (b.value_usd || 0) - (a.value_usd || 0))
      const withoutValue = result
        .filter((b) => b.value_usd == null || b.value_usd <= 0.01)
        .filter((b) => b.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 20)
      setBalances([...withValue, ...withoutValue])
      setRanks(rankResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setBalances([])
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    const addr = input.trim()
    if (!addr.match(/^0x[a-fA-F0-9]{40}$/)) return
    addWallet(addr, labelInput.trim() || undefined)
    setInput('')
    setLabelInput('')
    setShowAdd(false)
    loadWallet(addr)
  }

  const totalUsd = balances.reduce((sum, b) => sum + (b.value_usd || 0), 0)
  const pricedCount = balances.filter(b => b.value_usd != null && b.value_usd > 0).length
  const tokenCount = balances.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-pulse-cyan" />
          <h2 className="text-sm font-semibold text-white">Portfolio</h2>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {/* Add wallet form */}
      {showAdd && (
        <div className="bg-gray-800/40 rounded-lg p-2.5 space-y-2 border border-white/5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Wallet address (0x...)"
            className="w-full bg-gray-900/60 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-pulse-cyan/50"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Label (optional)"
              className="flex-1 bg-gray-900/60 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-pulse-cyan/50"
            />
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 rounded-md bg-pulse-cyan/20 text-pulse-cyan text-xs font-medium hover:bg-pulse-cyan/30 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Wallet tabs */}
      {wallets.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {wallets.map((w) => (
            <button
              key={w.address}
              onClick={() => loadWallet(w.address)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                activeWallet === w.address
                  ? 'bg-pulse-cyan/15 text-pulse-cyan border border-pulse-cyan/30'
                  : 'bg-gray-800/40 text-gray-400 border border-white/5 hover:border-white/10'
              }`}
            >
              {w.label}
              <button
                onClick={(e) => { e.stopPropagation(); removeWallet(w.address) }}
                className="ml-0.5 text-gray-600 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </button>
          ))}
        </div>
      )}

      {wallets.length === 0 && !showAdd && (
        <div className="text-center py-8">
          <Wallet className="h-8 w-8 text-gray-600 mx-auto mb-2" />
          <p className="text-xs text-gray-500">No wallets added yet</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-2 text-xs text-pulse-cyan hover:underline"
          >
            Add your first wallet
          </button>
        </div>
      )}

      {/* Holdings */}
      {activeWallet && (
        <>
          {/* Total card */}
          <div className="bg-gradient-to-r from-gray-800/60 to-gray-800/30 rounded-xl p-3 border border-white/5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total Value</div>
                <div className="text-xl font-bold text-white mt-0.5">
                  {totalUsd > 0 ? formatUsd(totalUsd) : '$0.00'}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {tokenCount} tokens · {pricedCount} priced
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://www.openpulsechain.com/wallet/${activeWallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-gray-500 hover:bg-white/5 hover:text-pulse-cyan transition-colors"
                  title="View on OpenPulsechain"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => activeWallet && loadWallet(activeWallet)}
                  disabled={loading}
                  className="p-1.5 rounded-md text-gray-500 hover:bg-white/5 hover:text-white transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Mini address */}
            <div className="text-[10px] text-gray-600 font-mono mt-1.5 truncate">
              {activeWallet}
            </div>
          </div>

          {error && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 text-gray-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {balances.map((b) => {
                const hasPriceData = b.value_usd != null && b.value_usd > 0
                return (
                  <div
                    key={b.token_address}
                    className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-white/5 transition-colors cursor-default"
                  >
                    {/* Token logo */}
                    <TokenAvatar symbol={b.symbol} address={b.token_address} />

                    {/* Token info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-white">{b.symbol}</span>
                        {b.price_usd != null && (
                          <span className="text-[9px] text-gray-400">
                            ${b.price_usd < 0.01 ? b.price_usd.toFixed(6) : b.price_usd.toFixed(4)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 truncate">{b.name}</span>
                        {(() => {
                          const leagueSym = LEAGUE_SYMBOL_MAP[b.symbol.toUpperCase()]
                          const r = leagueSym && ranks?.ranks?.[leagueSym]
                          if (!r) return null
                          const emoji = TIER_EMOJI[r.tier] || ''
                          const color = TIER_COLOR[r.tier] || '#6b7280'
                          return (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                              style={{ color, backgroundColor: `${color}25` }}
                              title={`${r.tier} — ${r.balance_pct.toFixed(4)}% of supply`}
                            >
                              #{r.rank}/{r.total_holders} {emoji}
                            </span>
                          )
                        })()}
                      </div>
                    </div>

                    {/* Values */}
                    <div className="text-right shrink-0">
                      {hasPriceData ? (
                        <>
                          <div className="text-xs font-medium text-white">{formatUsd(b.value_usd)}</div>
                          <div className="text-[10px] text-gray-400">{formatBalance(b.balance)}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-gray-400">{formatBalance(b.balance)}</div>
                          <div className="text-[9px] text-gray-600">no price</div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              {balances.length === 0 && !loading && (
                <p className="text-center text-xs text-gray-500 py-4">No tokens found</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
