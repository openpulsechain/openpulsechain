import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Github, Menu, X, Shield, TrendingUp, Crown, Search, Loader2, Activity, ChevronDown } from 'lucide-react'
import { RpcStatusIndicator } from '../ui/RpcStatusIndicator'
import { Component, type ReactNode, type ErrorInfo } from 'react'

class StatusErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(_: Error, info: ErrorInfo) { console.error('RpcStatus error:', _, info) }
  render() { return this.state.hasError ? null : this.props.children }
}

interface HeaderProps {
  activePage: string
  onNavigate: (page: string) => void
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

const PAGES = [
  { id: 'overview', label: 'Overview', path: '/' },
  { id: 'dex', label: 'DEX', path: '/dex' },
  { id: 'tokens', label: 'Tokens', path: '/tokens' },
  { id: 'safety', label: 'Safety', path: '/safety', icon: Shield },
  { id: 'smart-money', label: 'Smart $', path: '/smart-money', icon: TrendingUp },
  { id: 'bridge', label: 'Bridge', path: '/bridge' },
  { id: 'api', label: 'API', path: '/api' },
]

const ONCHAIN_PAGES = [
  { id: 'whales', label: 'Whales', path: '/whales' },
  { id: 'leagues', label: 'Leagues', path: '/leagues', icon: Crown },
  { id: 'intelligence', label: 'Intel', path: '/intelligence' },
]

export function Header({ activePage }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [onchainOpen, setOnchainOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const onchainRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Close On-Chain dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (onchainRef.current && !onchainRef.current.contains(e.target as Node)) {
        setOnchainOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus()
  }, [searchOpen])

  // Keyboard shortcut: / to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !searchOpen && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        setSearchQuery('')
        setSearchError('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const query = searchQuery.trim()
    if (!query) return

    // If it's a valid address, detect type and navigate
    if (ADDRESS_RE.test(query)) {
      const addr = query.toLowerCase()
      setSearching(true)
      setSearchError('')

      try {
        // Check if it's a token (has token info on Scan API)
        const res = await fetch(`https://api.scan.pulsechain.com/api/v2/tokens/${addr}`)
        if (res.ok) {
          const data = await res.json()
          if (data.type === 'ERC-20' || data.type === 'ERC-721' || data.type === 'ERC-1155' || data.symbol) {
            navigate(`/token/${addr}`)
            setSearchOpen(false)
            setSearchQuery('')
            setSearching(false)
            return
          }
        }
      } catch {
        // Not a token, treat as wallet
      }

      // Default: treat as wallet
      navigate(`/wallet/${addr}`)
      setSearchOpen(false)
      setSearchQuery('')
      setSearching(false)
      return
    }

    // Not an address — show error
    setSearchError('Enter a valid 0x address (token or wallet)')
  }

  return (
    <header className="border-b border-white/5 bg-gray-950/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5">
        <Link to="/" className="flex items-center gap-1.5">
          <img src="/logo.png" alt="OpenPulsechain" className="h-8 w-auto" />
          <span className="text-lg font-bold bg-gradient-to-r from-[#00D4FF] to-[#8000E0] bg-clip-text text-transparent">OpenPulsechain</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {PAGES.map((page) => (
            <Link
              key={page.id}
              to={page.path}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activePage === page.id
                  ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              } ${page.id === 'safety' ? 'text-emerald-400' : ''}`}
            >
              {page.icon && <page.icon className="h-3.5 w-3.5" />}
              {page.label}
            </Link>
          ))}
          {/* On-Chain dropdown */}
          <div ref={onchainRef} className="relative">
            <button
              onClick={() => setOnchainOpen(!onchainOpen)}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                ONCHAIN_PAGES.some(p => p.id === activePage)
                  ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              On-Chain
              <ChevronDown className={`h-3 w-3 transition-transform ${onchainOpen ? 'rotate-180' : ''}`} />
            </button>
            {onchainOpen && (
              <div className="absolute top-full left-0 mt-1 w-40 rounded-lg border border-white/10 bg-gray-950/95 backdrop-blur-xl shadow-xl py-1 z-50">
                {ONCHAIN_PAGES.map((page) => (
                  <Link
                    key={page.id}
                    to={page.path}
                    onClick={() => setOnchainOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                      activePage === page.id
                        ? 'bg-[#8000E0]/20 text-[#00D4FF]'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {page.icon && <page.icon className="h-3.5 w-3.5" />}
                    {page.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="ml-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Search address</span>
            <kbd className="hidden lg:inline ml-1 text-[10px] text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">/</kbd>
          </button>
          <StatusErrorBoundary><RpcStatusIndicator /></StatusErrorBoundary>
          <a
            href="https://github.com/openpulsechain/openpulsechain"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-gray-400 hover:text-[#00D4FF] transition-colors"
          >
            <Github className="h-5 w-5" />
          </a>
        </nav>

        {/* Mobile: status + search + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <StatusErrorBoundary><RpcStatusIndicator /></StatusErrorBoundary>
          <button
            onClick={() => setSearchOpen(true)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/5 bg-gray-950/90 backdrop-blur-xl px-4 py-3 space-y-1">
          {PAGES.map((page) => (
            <Link
              key={page.id}
              to={page.path}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activePage === page.id
                  ? 'bg-[#8000E0]/20 text-[#00D4FF]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {page.icon && <page.icon className="h-4 w-4" />}
              {page.label}
            </Link>
          ))}
          <div className="pt-2 mt-1 border-t border-white/5">
            <span className="px-4 text-[10px] text-gray-600 uppercase tracking-wider">On-Chain</span>
          </div>
          {ONCHAIN_PAGES.map((page) => (
            <Link
              key={page.id}
              to={page.path}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activePage === page.id
                  ? 'bg-[#8000E0]/20 text-[#00D4FF]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {page.icon && <page.icon className="h-4 w-4" />}
              {page.label}
            </Link>
          ))}
          <a
            href="https://github.com/openpulsechain/openpulsechain"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-2.5 text-sm text-gray-400 hover:text-[#00D4FF] transition-colors"
          >
            GitHub
          </a>
        </div>
      )}
      {/* Search overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
          onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchError('') }}
        >
          <div
            className="w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-gray-950/95 backdrop-blur-xl shadow-2xl p-4"
            onClick={e => e.stopPropagation()}
          >
            <form onSubmit={handleSearch} className="flex items-center gap-3">
              {searching ? (
                <Loader2 className="h-5 w-5 text-[#00D4FF] animate-spin shrink-0" />
              ) : (
                <Search className="h-5 w-5 text-gray-500 shrink-0" />
              )}
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchError('') }}
                placeholder="Paste token or wallet address (0x...)"
                className="flex-1 bg-transparent text-white text-lg placeholder-gray-600 outline-none"
                spellCheck={false}
                autoComplete="off"
              />
              <kbd className="text-xs text-gray-600 bg-white/5 px-2 py-1 rounded border border-white/10">ESC</kbd>
            </form>
            {searchError && (
              <p className="mt-3 text-sm text-red-400">{searchError}</p>
            )}
            <p className="mt-3 text-xs text-gray-600">
              Tokens → Safety analysis &nbsp;|&nbsp; Wallets → Holdings + activity
            </p>
          </div>
        </div>
      )}
    </header>
  )
}
