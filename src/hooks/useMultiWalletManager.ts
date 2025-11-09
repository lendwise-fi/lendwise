'use client'

import { useCallback } from 'react'

import { createWalletClient, custom } from 'viem'
import type { Address, Chain, WalletClient } from 'viem'
import { useAccount } from 'wagmi'

import { useWalletStore } from '@/stores/walletStore'

/**
 * Hook to manage multiple wallet addresses with isolated Viem clients.
 * Each address gets its own WalletClient for independent transaction signing.
 */
export function useMultiWalletManager() {
  const { chain } = useAccount()
  const {
    wallets,
    clients,
    setClient,
    removeClient,
    getClient,
    removeWallet,
    clearAllClients,
  } = useWalletStore()

  /**
   * Create a WalletClient for a specific address
   */
  const createClient = useCallback(
    (address: Address, targetChain?: Chain): WalletClient => {
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('No Ethereum provider found')
      }

      return createWalletClient({
        account: address,
        chain: targetChain || chain,
        transport: custom(window.ethereum),
      })
    },
    [chain]
  )

  /**
   * Add or update a client for an address
   */
  const addOrUpdateClient = useCallback(
    (address: Address, targetChain?: Chain) => {
      try {
        const client = createClient(address, targetChain)
        setClient(address, client)
        return client
      } catch (error) {
        console.error('[MultiWallet] Failed to create client:', error)
        return null
      }
    },
    [createClient, setClient]
  )

  /**
   * Disconnect an address - removes wallet and client from app
   */
  const disconnectAddress = useCallback(
    (address: Address) => {
      removeWallet(address)
      removeClient(address)
    },
    [removeWallet, removeClient]
  )

  /**
   * Recreate all clients (useful after chain change)
   */
  const recreateAllClients = useCallback(
    (targetChain?: Chain) => {
      wallets.forEach((wallet) => {
        addOrUpdateClient(wallet.address as Address, targetChain)
      })
    },
    [wallets, addOrUpdateClient]
  )

  /**
   * Clear all clients (useful on full disconnect)
   */
  const clearClients = useCallback(() => {
    clearAllClients()
  }, [clearAllClients])

  /**
   * Get active addresses (addresses with wallets in store)
   */
  const addresses = wallets.map((w) => w.address as Address)

  return {
    // State
    addresses,
    wallets,
    clients,

    // Client management
    createClient,
    addOrUpdateClient,
    getClient,
    
    // Address management
    disconnectAddress,
    recreateAllClients,
    clearClients,
  }
}
