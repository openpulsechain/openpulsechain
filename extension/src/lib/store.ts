import { create } from 'zustand'

export type Section = 'safety' | 'portfolio' | 'bridge' | 'explorer' | 'smartmoney' | 'alerts' | 'settings'

interface WalletEntry {
  address: string
  label: string
}

interface ExtensionState {
  // Navigation
  activeSection: Section
  setActiveSection: (s: Section) => void
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void

  // Wallets (persisted in chrome.storage)
  wallets: WalletEntry[]
  addWallet: (address: string, label?: string) => void
  removeWallet: (address: string) => void
  loadWallets: () => Promise<void>

  // Settings
  notifications: boolean
  setNotifications: (v: boolean) => void
  loadSettings: () => Promise<void>
}

function saveToStorage(key: string, value: unknown) {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.set({ [key]: value })
  } else {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

function getFromStorage(key: string): Promise<unknown> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(key, (result) => resolve(result[key]))
    } else {
      const val = localStorage.getItem(key)
      resolve(val ? JSON.parse(val) : undefined)
    }
  })
}

export const useStore = create<ExtensionState>((set, get) => ({
  activeSection: 'safety',
  setActiveSection: (s) => set({ activeSection: s, menuOpen: false }),
  menuOpen: false,
  setMenuOpen: (open) => set({ menuOpen: open }),

  wallets: [],
  addWallet: (address, label) => {
    const addr = address.toLowerCase()
    const current = get().wallets
    if (current.some((w) => w.address === addr)) return
    const updated = [...current, { address: addr, label: label || `Wallet ${current.length + 1}` }]
    set({ wallets: updated })
    saveToStorage('wallets', updated)
  },
  removeWallet: (address) => {
    const updated = get().wallets.filter((w) => w.address !== address.toLowerCase())
    set({ wallets: updated })
    saveToStorage('wallets', updated)
  },
  loadWallets: async () => {
    const saved = (await getFromStorage('wallets')) as WalletEntry[] | undefined
    if (saved && Array.isArray(saved)) {
      set({ wallets: saved })
    }
  },

  notifications: true,
  setNotifications: (v) => {
    set({ notifications: v })
    saveToStorage('notifications', v)
  },
  loadSettings: async () => {
    const notif = (await getFromStorage('notifications')) as boolean | undefined
    if (notif !== undefined) set({ notifications: notif })
  },
}))
