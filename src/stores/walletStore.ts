import type { WalletClient } from 'viem'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ChainFamily } from '@/lib/protocols/core/toolkit/chain-slugs'
import { normalizeAddress } from '@/lib/wallet/address'

export interface StellarSession {
  address: string
  networkPassphrase: string
  issuedAt: number
  expiresAt: number
}

export interface Wallet {
  address: string
  name: string
  ens: string | null
  walletType: string | null
  smartContractWalletType: string | null
  isActive: boolean
  isConnected: boolean
  isCurrentlyConnected: boolean
  chainFamily: ChainFamily
  avatarUri: string
  roles: string[]
  isUpdating: boolean
  stellarSession?: StellarSession
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
  isHidden: (address: string, family?: ChainFamily) => boolean
  hideAddress: (address: string, family?: ChainFamily) => void
  unhideAddress: (address: string, family?: ChainFamily) => void
  setClient: (address: string, client: WalletClient) => void
  removeClient: (address: string) => void
  getClient: (address: string) => WalletClient | undefined
  clearAllClients: () => void
}

/** Whether a stored wallet is the one at `address`, by its own family's rules. */
function isSameWallet(w: Wallet, address: string): boolean {
  return (
    normalizeAddress(w.chainFamily, w.address) ===
    normalizeAddress(w.chainFamily, address)
  )
}

/** Dedupe key: families never collide, EVM is case-insensitive. */
function walletKey(w: Wallet): string {
  return `${w.chainFamily}:${normalizeAddress(w.chainFamily, w.address)}`
}

// Hidden addresses are persisted as plain strings, without a family. `0x…`
// keeps its lowercase form; a Solana or Stellar key keeps its case.
function hiddenKey(address: string, family: ChainFamily = 'evm'): string {
  return normalizeAddress(family, address)
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
            (w) => walletKey(w) === walletKey(wallet)
          )
          if (exists) return state
          return { wallets: [...state.wallets, wallet] }
        }),

      addWallets: (newWallets) =>
        set((state) => {
          const seen = new Set(state.wallets.map(walletKey))
          const uniqueNewWallets = newWallets.filter((wallet) => {
            const key = walletKey(wallet)
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          if (uniqueNewWallets.length === 0) return state
          return { wallets: [...state.wallets, ...uniqueNewWallets] }
        }),

      updateWallet: (address, updates) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            isSameWallet(w, address) ? { ...w, ...updates } : w
          ),
        })),

      removeWallet: (address) =>
        set((state) => ({
          wallets: state.wallets.filter((w) => !isSameWallet(w, address)),
        })),

      hasWallet: (address) => {
        const state = get()
        return state.wallets.some((w) => isSameWallet(w, address))
      },

      isHidden: (address, family) => {
        const state = get()
        return state.hiddenAddresses.has(hiddenKey(address, family))
      },

      hideAddress: (address, family) =>
        set((state) => {
          const newHidden = new Set(state.hiddenAddresses)
          newHidden.add(hiddenKey(address, family))
          return { hiddenAddresses: newHidden }
        }),

      unhideAddress: (address, family) =>
        set((state) => {
          const newHidden = new Set(state.hiddenAddresses)
          newHidden.delete(hiddenKey(address, family))
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
