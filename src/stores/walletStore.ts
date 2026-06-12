import type { WalletClient } from 'viem'
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
  chainFamily: 'evm' | 'stellar' | 'bitcoin'
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
  clients: Record<string, WalletClient>
  hiddenAddresses: Set<string> // Addresses explicitly disconnected by user
  lastNotificationSeenAt: string
  network: string
  networks: Network[]
  userId: string
  addWallet: (wallet: Wallet) => void
  addWallets: (wallets: Wallet[]) => void
  updateWallet: (address: string, updates: Partial<Wallet>) => void
  removeWallet: (address: string) => void
  hasWallet: (address: string) => boolean
  isHidden: (address: string) => boolean
  hideAddress: (address: string) => void
  unhideAddress: (address: string) => void
  setClient: (address: string, client: WalletClient) => void
  removeClient: (address: string) => void
  getClient: (address: string) => WalletClient | undefined
  clearAllClients: () => void
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      wallets: [],
      clients: {},
      hiddenAddresses: new Set<string>(),
      lastNotificationSeenAt: Date.now().toString(),
      network: 'ethereum',
      networks: [],
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

      isHidden: (address) => {
        const state = get()
        return state.hiddenAddresses.has(address.toLowerCase())
      },

      hideAddress: (address) =>
        set((state) => {
          const newHidden = new Set(state.hiddenAddresses)
          newHidden.add(address.toLowerCase())
          return { hiddenAddresses: newHidden }
        }),

      unhideAddress: (address) =>
        set((state) => {
          const newHidden = new Set(state.hiddenAddresses)
          newHidden.delete(address.toLowerCase())
          return { hiddenAddresses: newHidden }
        }),

      setClient: (address, client) =>
        set((state) => ({
          clients: { ...state.clients, [address.toLowerCase()]: client },
        })),

      removeClient: (address) =>
        set((state) => {
          const clients = { ...state.clients }
          delete clients[address.toLowerCase()]
          return { clients }
        }),

      getClient: (address) => {
        const state = get()
        return state.clients[address.toLowerCase()]
      },

      clearAllClients: () => set({ clients: {} }),
    }),
    {
      name: 'persist:account',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const { state } = JSON.parse(str)
          return {
            state: {
              ...state,
              hiddenAddresses: new Set(state.hiddenAddresses || []),
              clients: {}, // Don't persist clients (they need to be recreated)
            },
          }
        },
        setItem: (name, value) => {
          const { state } = value
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                hiddenAddresses: Array.from(state.hiddenAddresses),
                clients: {}, // Don't persist clients
              },
            })
          )
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
)
