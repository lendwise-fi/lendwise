import type { ChainFamily } from '@/lib/protocols/core/toolkit/chain-slugs'

/** Display name of a chain family. A new family fails to compile here. */
export function familyLabel(family: ChainFamily): string {
  switch (family) {
    case 'evm':
      return 'EVM'
    case 'stellar':
      return 'Stellar'
    case 'solana':
      return 'Solana'
    default: {
      const unreachable: never = family
      return unreachable
    }
  }
}

/**
 * The line under a wallet in the wallet list: its family, and whether it can
 * sign right now (an EVM wallet needs a wagmi client, a Stellar wallet a
 * session, a Solana wallet a live connection).
 */
export function walletSubtitle(
  wallet: { chainFamily: ChainFamily; isConnected: boolean },
  hasClient: boolean
): string {
  const label = familyLabel(wallet.chainFamily)
  switch (wallet.chainFamily) {
    case 'stellar':
      return wallet.isConnected ? label : `${label} · Not signed in`
    case 'evm':
      return hasClient ? label : `${label} · Not connected`
    case 'solana':
      return wallet.isConnected ? label : `${label} · Not connected`
    default: {
      const unreachable: never = wallet.chainFamily
      return unreachable
    }
  }
}

/**
 * The wallet list's row menu. A wallet that cannot sign right now is offered a
 * way back in, and leaving the list is "Remove": there is nothing to
 * disconnect.
 */
export function walletRowMenu(
  wallet: { chainFamily: ChainFamily; isConnected: boolean },
  hasClient: boolean
): { connect: 'Connect' | 'Sign in' | null; remove: 'Remove' | 'Disconnect' } {
  const connected = isWalletConnected(wallet, hasClient)
  switch (wallet.chainFamily) {
    case 'stellar':
      return connected
        ? { connect: null, remove: 'Disconnect' }
        : { connect: 'Sign in', remove: 'Remove' }
    case 'evm':
      return connected
        ? { connect: null, remove: 'Disconnect' }
        : { connect: 'Connect', remove: 'Remove' }
    case 'solana':
      // No reconnect handler until the Solana connection lands.
      return {
        connect: null,
        remove: connected ? 'Disconnect' : 'Remove',
      }
    default: {
      const unreachable: never = wallet.chainFamily
      return unreachable
    }
  }
}

/**
 * Whether the row shows as connected: an EVM wallet needs a wagmi client, the
 * other families carry their own connection flag.
 */
export function isWalletConnected(
  wallet: { chainFamily: ChainFamily; isConnected: boolean },
  hasClient: boolean
): boolean {
  switch (wallet.chainFamily) {
    case 'evm':
      return hasClient
    case 'stellar':
    case 'solana':
      return wallet.isConnected
    default: {
      const unreachable: never = wallet.chainFamily
      return unreachable
    }
  }
}
