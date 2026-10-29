'use client'

import { useConnectModal } from '@rainbow-me/rainbowkit'

import { useSolanaWallet } from '@/contexts/SolanaWalletContext'
import { useStellarWallet } from '@/contexts/StellarWalletContext'
import type { ChainFamily } from '@/lib/protocols/core/toolkit/chain-slugs'
import { walletConnector } from '@/lib/wallet/wallet-families'

/**
 * Opens the wallet connection of a chain family: RainbowKit's modal for EVM,
 * the Stellar or the Solana wallet picker otherwise.
 */
export function useConnectWalletFamily(): (family: ChainFamily) => void {
  const { openConnectModal } = useConnectModal()
  const { connectStellar } = useStellarWallet()
  const { connectSolana } = useSolanaWallet()

  return (family) => {
    const connector = walletConnector(family)
    switch (connector) {
      case 'wagmi':
        openConnectModal?.()
        return
      case 'stellar':
        void connectStellar()
        return
      case 'solana':
        void connectSolana()
        return
      default: {
        const unreachable: never = connector
        return unreachable
      }
    }
  }
}
