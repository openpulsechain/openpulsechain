import { useState } from 'react'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { OverviewPage } from './components/pages/OverviewPage'
import { BridgePage } from './components/pages/BridgePage'

export default function App() {
  const [page, setPage] = useState('overview')

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

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col">
        <Header activePage={page} onNavigate={setPage} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          {page === 'overview' ? <OverviewPage /> : <BridgePage />}
        </main>
        <Footer />
      </div>
    </div>
  )
}
