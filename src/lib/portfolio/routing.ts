import { StrKey } from '@stellar/stellar-sdk'
import { type Address, isAddress } from 'viem'

import type { ChainFamily } from '@/lib/protocols/core/toolkit/chain-slugs'
import { isSolanaAddress } from '@/lib/wallet/address'

import { MAX_PORTFOLIO_WALLETS, type PortfolioWalletInput } from './types'

/** Far above any real address (Stellar 56, EVM 42, Solana 44). */
const MAX_ADDRESS_LENGTH = 128

const CHAIN_FAMILIES: readonly ChainFamily[] = ['evm', 'stellar', 'solana']

export type RoutedPortfolioWallets = Record<ChainFamily, string[]> & {
  evm: Address[]
}

/**
 * Splits wallets by chain family. A `G…` address only ever reaches Stellar
 * adapters, a `0x…` one EVM adapters and a base58 key Solana ones (kept
 * case-exact); anything malformed is dropped.
 */
export function routePortfolioWallets(
  wallets: PortfolioWalletInput[]
): RoutedPortfolioWallets {
  const evm = new Map<string, Address>()
  const stellar = new Set<string>()
  const solana = new Set<string>()

  for (const w of wallets.slice(0, MAX_PORTFOLIO_WALLETS)) {
    if (w.chainFamily === 'evm' && isAddress(w.address, { strict: false })) {
      evm.set(w.address.toLowerCase(), w.address)
    } else if (
      w.chainFamily === 'stellar' &&
      StrKey.isValidEd25519PublicKey(w.address)
    ) {
      stellar.add(w.address)
    } else if (w.chainFamily === 'solana' && isSolanaAddress(w.address)) {
      solana.add(w.address)
    }
  }

  return {
    evm: [...evm.values()],
    stellar: [...stellar],
    solana: [...solana],
  }
}

/**
 * Public-input guard: keeps only well-formed wallet entries so malformed
 * client payloads can never throw inside routing.
 */
export function sanitizeWalletInputs(input: unknown): PortfolioWalletInput[] {
  if (!Array.isArray(input)) return []
  return input.filter(
    (w): w is PortfolioWalletInput =>
      typeof w === 'object' &&
      w !== null &&
      typeof (w as { address?: unknown }).address === 'string' &&
      (w as { address: string }).address.length <= MAX_ADDRESS_LENGTH &&
      CHAIN_FAMILIES.includes(
        (w as { chainFamily?: unknown }).chainFamily as ChainFamily
      )
  )
}
