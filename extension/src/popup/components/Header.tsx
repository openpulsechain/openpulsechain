import { Shield, Wallet, Search, TrendingUp, AlertTriangle, Settings, Menu, X } from 'lucide-react'
import { useStore, type Section } from '../../lib/store'

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'safety', label: 'Token Safety', icon: <Shield className="h-4 w-4" /> },
  { id: 'portfolio', label: 'Portfolio', icon: <Wallet className="h-4 w-4" /> },
  { id: 'explorer', label: 'Explorer', icon: <Search className="h-4 w-4" /> },
  { id: 'smartmoney', label: 'Smart Money', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'alerts', label: 'Scam Radar', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

export function Header() {
  const activeSection = useStore((s) => s.activeSection)
  const setActiveSection = useStore((s) => s.setActiveSection)
  const menuOpen = useStore((s) => s.menuOpen)
  const setMenuOpen = useStore((s) => s.setMenuOpen)

  const activeItem = NAV_ITEMS.find((n) => n.id === activeSection)

  return (
    <div className="relative">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 bg-gray-900/60">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-pulse-cyan to-pulse-purple flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">OpenPulsechain</span>
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          {activeItem && (
            <>
              {activeItem.icon}
              <span className="hidden sm:inline">{activeItem.label}</span>
            </>
          )}
          {menuOpen ? <X className="h-4 w-4 ml-1" /> : <Menu className="h-4 w-4 ml-1" />}
        </button>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div className="absolute top-full right-0 z-50 w-48 mt-0.5 mr-1 rounded-lg border border-white/10 bg-gray-900 shadow-2xl overflow-hidden">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                activeSection === item.id
                  ? 'bg-pulse-cyan/10 text-pulse-cyan'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
