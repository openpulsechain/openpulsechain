import { useEffect } from 'react'
import { useStore } from '../lib/store'
import { Header } from './components/Header'
import { SafetyCheck } from './components/SafetyCheck'
import { Portfolio } from './components/Portfolio'
import { Bridge } from './components/Bridge'
import { Explorer } from './components/Explorer'
import { SmartMoney } from './components/SmartMoney'
import { Alerts } from './components/Alerts'
import { Settings } from './components/Settings'

export function App() {
  const activeSection = useStore((s) => s.activeSection)
  const loadWallets = useStore((s) => s.loadWallets)
  const loadSettings = useStore((s) => s.loadSettings)

  useEffect(() => {
    loadWallets()
    loadSettings()
  }, [loadWallets, loadSettings])

  return (
    <div className="flex flex-col h-full min-h-[500px] bg-[#050510] relative overflow-hidden">
      {/* PulseChain Aurora Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Cyan */}
        <div
          className="absolute -top-[80px] -right-[40px] w-[280px] h-[280px] bg-[#00D4FF]/15 rounded-full blur-[80px]"
          style={{ animation: 'liquid-1 20s ease-in-out infinite' }}
        />
        {/* Crimson/Rose */}
        <div
          className="absolute -bottom-[40px] -left-[80px] w-[240px] h-[320px] bg-[#FF0040]/10 rounded-full blur-[90px]"
          style={{ animation: 'liquid-2 25s ease-in-out infinite', animationDelay: '2s' }}
        />
        {/* Blue Royal */}
        <div
          className="absolute -top-[40px] left-[60px] w-[200px] h-[200px] bg-[#4040E0]/15 rounded-full blur-[70px]"
          style={{ animation: 'liquid-3 22s ease-in-out infinite', animationDelay: '5s' }}
        />
        {/* Violet */}
        <div
          className="absolute -bottom-[80px] right-[40px] w-[240px] h-[240px] bg-[#8000E0]/20 rounded-full blur-[80px]"
          style={{ animation: 'liquid-1 28s ease-in-out infinite', animationDelay: '1s', animationDirection: 'reverse' }}
        />
        {/* Magenta */}
        <div
          className="absolute top-[120px] left-[100px] w-[160px] h-[160px] bg-[#D000C0]/10 rounded-full blur-[90px]"
          style={{ animation: 'liquid-2 30s ease-in-out infinite', animationDelay: '7s' }}
        />
      </div>

      {/* Content — above aurora */}
      <div className="flex flex-col h-full relative z-10">
        <Header />
        <main className="flex-1 overflow-y-auto p-3">
          {activeSection === 'safety' && <SafetyCheck />}
          {activeSection === 'portfolio' && <Portfolio />}
          {activeSection === 'bridge' && <Bridge />}
          {activeSection === 'explorer' && <Explorer />}
          {activeSection === 'smartmoney' && <SmartMoney />}
          {activeSection === 'alerts' && <Alerts />}
          {activeSection === 'settings' && <Settings />}
        </main>
        <footer className="px-3 py-1.5 text-center text-[10px] text-gray-600 border-t border-white/5">
          <a href="https://www.openpulsechain.com" target="_blank" rel="noopener noreferrer" className="hover:text-pulse-cyan transition-colors">
            openpulsechain.com
          </a>
          {' · Open Source · MIT'}
        </footer>
      </div>
    </div>
  )
}
