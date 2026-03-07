import { useState } from 'react'
import { Github, Menu, X } from 'lucide-react'

interface HeaderProps {
  activePage: string
  onNavigate: (page: string) => void
}

const PAGES = [
  { id: 'overview', label: 'Overview' },
  { id: 'dex', label: 'DEX' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'bridge', label: 'Bridge' },
  { id: 'api', label: 'API' },
]

export function Header({ activePage, onNavigate }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleNav = (id: string) => {
    onNavigate(id)
    setMenuOpen(false)
  }

  return (
    <header className="border-b border-white/5 bg-gray-950/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5">
        <button onClick={() => handleNav('overview')} className="flex items-center gap-2">
          <img src="/logo.png" alt="OpenPulsechain" className="h-11 w-11 rounded-full" />
          <span className="text-lg font-bold bg-gradient-to-r from-[#00D4FF] to-[#8000E0] bg-clip-text text-transparent">OpenPulsechain</span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {PAGES.map((page) => (
            <button
              key={page.id}
              onClick={() => handleNav(page.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activePage === page.id
                  ? 'bg-[#8000E0]/20 text-[#00D4FF] border border-[#8000E0]/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {page.label}
            </button>
          ))}
          <a
            href="https://github.com/openpulsechain/openpulsechain"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-4 text-gray-400 hover:text-[#00D4FF] transition-colors"
          >
            <Github className="h-5 w-5" />
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden text-gray-400 hover:text-white transition-colors"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/5 bg-gray-950/90 backdrop-blur-xl px-4 py-3 space-y-1">
          {PAGES.map((page) => (
            <button
              key={page.id}
              onClick={() => handleNav(page.id)}
              className={`block w-full text-left rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activePage === page.id
                  ? 'bg-[#8000E0]/20 text-[#00D4FF]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {page.label}
            </button>
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
    </header>
  )
}
