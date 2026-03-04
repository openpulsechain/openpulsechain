import { useState } from 'react'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { OverviewPage } from './components/pages/OverviewPage'
import { BridgePage } from './components/pages/BridgePage'

export default function App() {
  const [page, setPage] = useState('overview')

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <Header activePage={page} onNavigate={setPage} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {page === 'overview' ? <OverviewPage /> : <BridgePage />}
      </main>
      <Footer />
    </div>
  )
}
