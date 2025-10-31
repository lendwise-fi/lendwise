'use client'

import { useEffect } from 'react'

import { getEnsName } from '@wagmi/core'
import type { Address } from 'viem'
import { useAccount } from 'wagmi'
import { mainnet } from 'wagmi/chains'

import { isEnsSupported } from '@/config/chains'
import { config } from '@/config/wagmi'
import { formatAddress } from '@/lib/utils'
import { type Wallet, useWalletStore } from '@/stores/walletStore'

/**
 * Hook that watches for wallet account changes and automatically updates the wallet store
 * Listens to 'accountsChanged' event from the wallet provider
 */
export function useWalletWatcher() {
  const { address, isConnected, connector, chain } = useAccount()
  const { addWallets, hasWallet } = useWalletStore()

  useEffect(() => {
    if (!isConnected || !connector) {
      return
    }

    let mounted = true

    const setupWatcher = async () => {
      try {
        const provider = await connector.getProvider()

        if (
          !provider ||
          typeof provider !== 'object' ||
          !('on' in provider) ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (provider as any).on !== 'function'
        ) {
          return
        }

        // Function to process and add new accounts
        const processAccounts = async (accounts: string[]) => {
          if (!mounted || !accounts || accounts.length === 0) {
            return
          }

          const newWallets: Wallet[] = []

          for (const accountAddress of accounts) {
            // Check if wallet already exists using Zustand store
            if (!hasWallet(accountAddress)) {
              try {
                // Try to get ENS name only on supported chains
                let ensName: string | null = null

                if (isEnsSupported(chain?.id)) {
                  try {
                    ensName = await Promise.race([
                      getEnsName(config, {
                        address: accountAddress as Address,
                        chainId: mainnet.id, // Always use mainnet for ENS resolution
                      }),
                      new Promise<null>((resolve) =>
                        setTimeout(() => resolve(null), 3000)
                      ),
                    ])
                  } catch (ensError) {
                    console.warn(
                      '[WalletWatcher] Failed to fetch ENS name:',
                      ensError
                    )
                    ensName = null
                  }
                }

                const newWallet: Wallet = {
                  address: accountAddress,
                  name: formatAddress(accountAddress),
                  ens: ensName || null,
                  walletType: null,
                  smartContractWalletType: null,
                  isActive:
                    accountAddress.toLowerCase() === address?.toLowerCase(),
                  isConnected: true,
                  isCurrentlyConnected:
                    accountAddress.toLowerCase() === address?.toLowerCase(),
                  isBitcoin: false,
                  avatarUri: '',
                  roles: [],
                  isUpdating: false,
                }

                newWallets.push(newWallet)
              } catch (error) {
                console.error(
                  '[WalletWatcher] Failed to process account:',
                  error
                )
                // Add wallet anyway without ENS
                newWallets.push({
                  address: accountAddress,
                  name: formatAddress(accountAddress),
                  ens: null,
                  walletType: null,
                  smartContractWalletType: null,
                  isActive:
                    accountAddress.toLowerCase() === address?.toLowerCase(),
                  isConnected: true,
                  isCurrentlyConnected:
                    accountAddress.toLowerCase() === address?.toLowerCase(),
                  isBitcoin: false,
                  avatarUri: '',
                  roles: [],
                  isUpdating: false,
                })
              }
            }
          }

          // Add all new wallets at once using Zustand
          if (newWallets.length > 0) {
            addWallets(newWallets)
          }
        }

        // Listen to accountsChanged event
        const handleAccountsChanged = (accounts: string[]) => {
          processAccounts(accounts)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(provider as any).on('accountsChanged', handleAccountsChanged)

        // Initial fetch of all accounts
        if (
          'request' in provider &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (provider as any).request === 'function'
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const accounts = (await (provider as any).request({
            method: 'eth_accounts',
          })) as string[]

          if (accounts && accounts.length > 0) {
            await processAccounts(accounts)
          }
        }

        // Cleanup function
        return () => {
          mounted = false
          if (
            'removeListener' in provider &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typeof (provider as any).removeListener === 'function'
          ) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(provider as any).removeListener(
              'accountsChanged',
              handleAccountsChanged
            )
          }
        }
      } catch (error) {
        console.error('Failed to setup wallet watcher:', error)
      }
    }

    const cleanup = setupWatcher()

    return () => {
      mounted = false
      cleanup.then((cleanupFn) => cleanupFn?.())
    }
  }, [address, isConnected, connector, chain, hasWallet, addWallets])
}
