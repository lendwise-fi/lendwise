import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Wallet {
  address: string
  name: string
  ens: string | null
  walletType: string | null
  smartContractWalletType: string | null
  isActive: boolean
  isConnected: boolean
  isCurrentlyConnected: boolean
  isBitcoin: boolean
  avatarUri: string
  roles: string[]
  isUpdating: boolean
}

export interface Network {
  id: number
  name: string
}

interface WalletState {
  wallets: Wallet[]
  baseCurrency: string
  lastNotificationSeenAt: string
  network: string
  networks: Network[]
  theme: string
  userId: string
  addWallet: (wallet: Wallet) => void
  addWallets: (wallets: Wallet[]) => void
  updateWallet: (address: string, updates: Partial<Wallet>) => void
  removeWallet: (address: string) => void
  hasWallet: (address: string) => boolean
  setBaseCurrency: (currency: string) => void
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      wallets: [],
      baseCurrency: 'EUR',
      lastNotificationSeenAt: Date.now().toString(),
      network: 'ethereum',
      networks: [],
      theme: 'dark',
      userId: '',

      addWallet: (wallet) =>
        set((state) => {
          const exists = state.wallets.some(
            (w) => w.address.toLowerCase() === wallet.address.toLowerCase()
          )
          if (exists) return state
          return { wallets: [...state.wallets, wallet] }
        }),

      addWallets: (newWallets) =>
        set((state) => {
          const existingAddresses = new Set(
            state.wallets.map((w) => w.address.toLowerCase())
          )
          const uniqueNewWallets = newWallets.filter(
            (wallet) => !existingAddresses.has(wallet.address.toLowerCase())
          )
          if (uniqueNewWallets.length === 0) return state
          return { wallets: [...state.wallets, ...uniqueNewWallets] }
        }),

      updateWallet: (address, updates) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.address.toLowerCase() === address.toLowerCase()
              ? { ...w, ...updates }
              : w
          ),
        })),

      removeWallet: (address) =>
        set((state) => ({
          wallets: state.wallets.filter(
            (w) => w.address.toLowerCase() !== address.toLowerCase()
          ),
        })),

      hasWallet: (address) => {
        const state = get()
        return state.wallets.some(
          (w) => w.address.toLowerCase() === address.toLowerCase()
        )
      },

      setBaseCurrency: (currency) =>
        set(() => ({
          baseCurrency: currency,
        })),
    }),
    {
      name: 'persist:account',
    }
  )
)
