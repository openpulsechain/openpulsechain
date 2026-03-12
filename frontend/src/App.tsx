import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation, useNavigate, Link } from 'react-router-dom'
import { SEO } from './components/SEO'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { Loader2 } from 'lucide-react'

// Lazy-loaded pages for code splitting
const OverviewPage = lazy(() => import('./components/pages/OverviewPage').then(m => ({ default: m.OverviewPage })))
const BridgePage = lazy(() => import('./components/pages/BridgePage').then(m => ({ default: m.BridgePage })))
const DexPage = lazy(() => import('./components/pages/DexPage').then(m => ({ default: m.DexPage })))
const TokensPage = lazy(() => import('./components/pages/TokensPage').then(m => ({ default: m.TokensPage })))
const ApiPage = lazy(() => import('./components/pages/ApiPage').then(m => ({ default: m.ApiPage })))
const WhalesPage = lazy(() => import('./components/pages/WhalesPage').then(m => ({ default: m.WhalesPage })))
const IntelligencePage = lazy(() => import('./components/pages/IntelligencePage').then(m => ({ default: m.IntelligencePage })))
const TokenSafetyPage = lazy(() => import('./components/pages/TokenSafetyPage').then(m => ({ default: m.TokenSafetyPage })))
const SafetyDashboardPage = lazy(() => import('./components/pages/SafetyDashboardPage').then(m => ({ default: m.SafetyDashboardPage })))
const AlertsPage = lazy(() => import('./components/pages/AlertsPage').then(m => ({ default: m.AlertsPage })))
const SmartMoneyPage = lazy(() => import('./components/pages/SmartMoneyPage').then(m => ({ default: m.SmartMoneyPage })))
const WalletProfilePage = lazy(() => import('./components/pages/WalletProfilePage').then(m => ({ default: m.WalletProfilePage })))
const LeaguesPage = lazy(() => import('./components/pages/LeaguesPage').then(m => ({ default: m.LeaguesPage })))

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <p className="text-6xl font-bold text-[#8000E0] mb-4">404</p>
      <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
      <p className="text-gray-400 mb-8">The page you're looking for doesn't exist or has been moved.</p>
      <Link to="/" className="px-6 py-3 rounded-lg bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30 hover:bg-[#8000E0]/30 transition-colors font-medium">
        Back to Overview
      </Link>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF]" />
    </div>
  )
}

const ROUTE_TO_PAGE: Record<string, string> = {
  '/': 'overview',
  '/dex': 'dex',
  '/tokens': 'tokens',
  '/bridge': 'bridge',
  '/whales': 'whales',
  '/intelligence': 'intelligence',
  '/api': 'api',
  '/safety': 'safety',
  '/alerts': 'alerts',
  '/smart-money': 'smart-money',
  '/leagues': 'leagues',
}

const PAGE_SEO: Record<string, { title: string; description: string }> = {
  overview: { title: 'PulseChain Analytics', description: 'Real-time PulseChain network stats: TVL, gas prices, token prices, DEX volume. Free open-source analytics.' },
  dex: { title: 'DEX Analytics', description: 'PulseX DEX analytics: daily volume, top trading pairs, liquidity depth. Real-time PulseChain DEX data.' },
  tokens: { title: 'PulseCoin Explorer', description: 'Browse 5000+ PulseChain tokens: prices, volume, liquidity. Search and filter the full PulseChain token list.' },
  bridge: { title: 'Bridge Monitor', description: 'PulseChain bridge analytics: track cross-chain flows, bridge volume, and asset transfers between Ethereum and PulseChain.' },
  whales: { title: 'Whale Tracker', description: 'Track PulseChain whale wallets: large transfers, top holders, whale accumulation and distribution patterns.' },
  intelligence: { title: 'Market Intelligence', description: 'PulseChain market intelligence: on-chain signals, trend analysis, and network activity insights.' },
  api: { title: 'Free Public API', description: 'Free PulseChain API: token prices, DEX stats, bridge data, safety scores. No auth required, open-source.' },
  safety: { title: 'Token Safety Scanner', description: 'PulseChain token safety scores: honeypot detection, contract analysis, LP checks, holder distribution. Protect yourself from scams.' },
  alerts: { title: 'Scam Radar Alerts', description: 'Real-time PulseChain scam alerts: LP removals, whale dumps, suspicious mints. Stay safe with automated threat detection.' },
  'smart-money': { title: 'Smart Money Tracker', description: 'Track smart money on PulseChain: large swaps, top wallets by volume, whale activity on PulseX DEX.' },
  leagues: { title: 'Holder Leagues', description: 'PulseChain holder leagues: track whale concentration for PLS, PLSX, HEX, INC. Ocean-themed tier ranking updated every 6 hours.' },
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()

  // Determine active page from URL
  const activePage = ROUTE_TO_PAGE[location.pathname] ||
    (location.pathname.startsWith('/token/') ? 'safety' : 'overview')

  const handleNavigate = (page: string) => {
    const route = Object.entries(ROUTE_TO_PAGE).find(([, p]) => p === page)
    if (route) navigate(route[0])
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050510] text-gray-100 overflow-hidden relative">
      {/* PulseChain Aurora Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[#050510]" />

        {/* Top right - Cyan */}
        <div
          className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vh] bg-[#00D4FF]/20 rounded-full blur-[130px] mix-blend-screen"
          style={{ animation: 'liquid-1 20s ease-in-out infinite' }}
        />

        {/* Bottom left - Crimson/Rose */}
        <div
          className="absolute bottom-[-10%] left-[-20%] w-[60vw] h-[80vh] bg-[#FF0040]/15 rounded-full blur-[140px] mix-blend-screen"
          style={{ animation: 'liquid-2 25s ease-in-out infinite', animationDelay: '2s' }}
        />

        {/* Top Center - Blue Royal */}
        <div
          className="absolute top-[-10%] left-[20%] w-[50vw] h-[50vh] bg-[#4040E0]/20 rounded-full blur-[120px] mix-blend-screen"
          style={{ animation: 'liquid-3 22s ease-in-out infinite', animationDelay: '5s' }}
        />

        {/* Bottom Right - Violet */}
        <div
          className="absolute bottom-[-20%] right-[10%] w-[60vw] h-[60vh] bg-[#8000E0]/25 rounded-full blur-[130px] mix-blend-screen"
          style={{ animation: 'liquid-1 28s ease-in-out infinite', animationDelay: '1s', animationDirection: 'reverse' }}
        />

        {/* Center - Magenta glow */}
        <div
          className="absolute top-[30%] left-[30%] w-[40vw] h-[40vh] bg-[#D000C0]/15 rounded-full blur-[150px] mix-blend-screen"
          style={{ animation: 'liquid-2 30s ease-in-out infinite', animationDelay: '7s' }}
        />
      </div>

      {/* SEO */}
      <SEO
        title={PAGE_SEO[activePage]?.title}
        description={PAGE_SEO[activePage]?.description}
        path={location.pathname}
      />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col">
        <Header activePage={activePage} onNavigate={handleNavigate} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/dex" element={<DexPage />} />
              <Route path="/tokens" element={<TokensPage />} />
              <Route path="/bridge" element={<BridgePage />} />
              <Route path="/whales" element={<WhalesPage />} />
              <Route path="/intelligence" element={<IntelligencePage />} />
              <Route path="/api" element={<ApiPage />} />
              <Route path="/safety" element={<SafetyDashboardPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/smart-money" element={<SmartMoneyPage />} />
              <Route path="/leagues" element={<LeaguesPage />} />
              <Route path="/wallet/:address" element={<WalletProfilePage />} />
              <Route path="/token/:address" element={<TokenSafetyPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
      </div>
    </div>
  )
}
