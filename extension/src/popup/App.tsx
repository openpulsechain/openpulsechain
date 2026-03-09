import { useEffect } from 'react'
import { useStore } from '../lib/store'
import { Header } from './components/Header'
import { SafetyCheck } from './components/SafetyCheck'
import { Portfolio } from './components/Portfolio'
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
    <div className="flex flex-col h-full min-h-[500px] bg-[#050510]">
      <Header />
      <main className="flex-1 overflow-y-auto p-3">
        {activeSection === 'safety' && <SafetyCheck />}
        {activeSection === 'portfolio' && <Portfolio />}
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
  )
}
