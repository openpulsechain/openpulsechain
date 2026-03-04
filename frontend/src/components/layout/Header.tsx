import { Activity, Github } from 'lucide-react'

interface HeaderProps {
  activePage: string
  onNavigate: (page: string) => void
}

export function Header({ activePage, onNavigate }: HeaderProps) {
  return (
    <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-emerald-400" />
          <span className="text-lg font-bold text-white">OpenPulse</span>
        </div>

        <nav className="flex items-center gap-1">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'bridge', label: 'Bridge' },
          ].map((page) => (
            <button
              key={page.id}
              onClick={() => onNavigate(page.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activePage === page.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {page.label}
            </button>
          ))}
          <a
            href="https://github.com/eva-sentience/pulsechain-analytics"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-4 text-gray-400 hover:text-white"
          >
            <Github className="h-5 w-5" />
          </a>
        </nav>
      </div>
    </header>
  )
}
