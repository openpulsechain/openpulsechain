import { Settings as SettingsIcon, Bell, Trash2, ExternalLink, Github } from 'lucide-react'
import { useStore } from '../../lib/store'
import { clearCache } from '../../lib/api'
import { shortenAddress } from '../../lib/format'

export function Settings() {
  const wallets = useStore((s) => s.wallets)
  const removeWallet = useStore((s) => s.removeWallet)
  const notifications = useStore((s) => s.notifications)
  const setNotifications = useStore((s) => s.setNotifications)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-4 w-4 text-pulse-cyan" />
        <h2 className="text-sm font-semibold text-white">Settings</h2>
      </div>

      {/* Notifications */}
      <div className="bg-gray-800/30 rounded-lg p-3 border border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs text-white">Push Notifications</span>
          </div>
          <button
            onClick={() => setNotifications(!notifications)}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              notifications ? 'bg-pulse-cyan' : 'bg-gray-700'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              notifications ? 'left-[18px]' : 'left-0.5'
            }`} />
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5">
          Get notified when scam alerts are detected on your watched tokens.
        </p>
      </div>

      {/* Managed wallets */}
      <div className="bg-gray-800/30 rounded-lg p-3 border border-white/5">
        <div className="text-xs text-gray-300 font-medium mb-2">Watched Wallets</div>
        {wallets.length === 0 ? (
          <p className="text-[10px] text-gray-500">No wallets added. Go to Portfolio to add one.</p>
        ) : (
          <div className="space-y-1.5">
            {wallets.map((w) => (
              <div key={w.address} className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-white">{w.label}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{shortenAddress(w.address, 6)}</div>
                </div>
                <button
                  onClick={() => removeWallet(w.address)}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cache */}
      <div className="bg-gray-800/30 rounded-lg p-3 border border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-300 font-medium">Clear Cache</div>
            <p className="text-[10px] text-gray-500 mt-0.5">Force refresh all data from APIs.</p>
          </div>
          <button
            onClick={clearCache}
            className="px-2.5 py-1 rounded-md bg-gray-700 text-xs text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Links */}
      <div className="space-y-1.5 pt-2">
        <a
          href="https://www.openpulsechain.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-pulse-cyan transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" /> OpenPulsechain Dashboard
        </a>
        <a
          href="https://api.openpulsechain.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-pulse-cyan transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" /> API Documentation
        </a>
        <a
          href="https://github.com/openpulsechain/openpulsechain"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-pulse-cyan transition-colors"
        >
          <Github className="h-3.5 w-3.5" /> Source Code (MIT)
        </a>
      </div>

      <div className="text-center text-[10px] text-gray-600 pt-2">
        OpenPulsechain Extension v1.0.0
      </div>
    </div>
  )
}
