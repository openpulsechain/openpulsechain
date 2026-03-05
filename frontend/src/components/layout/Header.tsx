import { Activity, Github } from 'lucide-react'

interface HeaderProps {
  activePage: string
  onNavigate: (page: string) => void
}

export function Header({ activePage, onNavigate }: HeaderProps) {
  return (
    <header className="border-b border-white/5 bg-gray-950/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-[#00D4FF]" />
          <span className="text-lg font-bold bg-gradient-to-r from-[#00D4FF] to-[#8000E0] bg-clip-text text-transparent">OpenPulse</span>
        </div>

        <nav className="flex items-center gap-1">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'dex', label: 'DEX' },
            { id: 'bridge', label: 'Bridge' },
          ].map((page) => (
            <button
              key={page.id}
              onClick={() => onNavigate(page.id)}
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
            href="https://github.com/eva-sentience/pulsechain-analytics"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-4 text-gray-400 hover:text-[#00D4FF] transition-colors"
          >
            <Github className="h-5 w-5" />
          </a>
        </nav>
      </div>
    </header>
  )
}
