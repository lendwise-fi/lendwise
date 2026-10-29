import { base58 } from '@scure/base'

import type { ChainFamily } from '@/lib/protocols/core/toolkit/chain-slugs'

const SOLANA_ADDRESS_BYTES = 32
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/

/** A Solana address is a base58 string that decodes to exactly 32 bytes. */
export function isSolanaAddress(address: string): boolean {
  // Bound the input first: base58 decoding is quadratic.
  if (address.length < 32 || address.length > 44) return false
  if (!BASE58_RE.test(address)) return false
  try {
    return base58.decode(address).length === SOLANA_ADDRESS_BYTES
  } catch {
    return false
  }
}

/**
 * The form used to compare, dedupe and key an address. Only EVM addresses are
 * case-insensitive (`0x…` checksums are cosmetic); Stellar StrKeys and Solana
 * base58 keys are case-sensitive and must never be lowercased.
 */
export function normalizeAddress(family: ChainFamily, address: string): string {
  return family === 'evm' ? address.toLowerCase() : address
}
