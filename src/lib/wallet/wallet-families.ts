import type { ChainFamily } from '@/lib/protocols/core/toolkit/chain-slugs'
import type { Wallet } from '@/stores/walletStore'

// Every family, in the order the wallet dialog offers them. A new family fails
// to compile here until it is placed.
const FAMILY_ORDER = {
  evm: true,
  stellar: true,
  solana: true,
} satisfies Record<ChainFamily, true>

/** The chain families a wallet can be connected on, EVM first. */
export const WALLET_FAMILIES = Object.keys(FAMILY_ORDER) as ChainFamily[]

/**
 * What connects and disconnects a wallet of this family: wagmi (RainbowKit)
 * for EVM, our own context for Stellar and Solana.
 */
export function walletConnector(
  family: ChainFamily
): 'wagmi' | 'stellar' | 'solana' {
  switch (family) {
    case 'evm':
      return 'wagmi'
    case 'stellar':
      return 'stellar'
    case 'solana':
      return 'solana'
    default: {
      const unreachable: never = family
      return unreachable
    }
  }
}

/**
 * Whether a Stellar or Solana wallet is the active one and signed in. An EVM
 * wallet's connection is wagmi's to tell.
 */
export function hasActiveSignedInWallet(
  wallets: readonly Pick<Wallet, 'chainFamily' | 'isActive' | 'isConnected'>[]
): boolean {
  return wallets.some(
    (w) =>
      walletConnector(w.chainFamily) !== 'wagmi' && w.isActive && w.isConnected
  )
}
