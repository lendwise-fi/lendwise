import type { ChainFamily } from '@/lib/protocols/core/toolkit/chain-slugs'
import { formatAddress } from '@/lib/utils'
import { normalizeAddress } from '@/lib/wallet/address'

type Family = ChainFamily

/** How long a row's reconnect request waits for the wallet to connect. */
const EXPECTED_TTL_MS = 2 * 60 * 1000

// The wallet list closes when the wallet's own window opens, so the address a
// row asked to reconnect is kept here until the connection comes back.
let expected: { address: string; family: Family; at: number } | null = null

export function expectReconnect(
  address: string,
  family: Family,
  now: number = Date.now()
): void {
  expected = { address, family, at: now }
}

/** The address the next connection of `family` was meant for, read once. */
export function takeExpectedReconnect(
  family: Family,
  now: number = Date.now()
): string | null {
  const e = expected
  if (!e || e.family !== family) return null
  expected = null
  return now - e.at <= EXPECTED_TTL_MS ? e.address : null
}

export function resetExpectedReconnect(): void {
  expected = null
}

/**
 * A wallet connects the account it is open on. When that is not the row the
 * user clicked, say which account it is on and which one to switch to.
 */
export function reconnectHint({
  expected,
  actual,
  family,
  walletName,
}: {
  expected: string | null
  actual: string
  family: Family
  walletName: string
}): string | null {
  if (!expected) return null
  const same =
    normalizeAddress(family, expected) === normalizeAddress(family, actual)
  if (same) return null
  return `${walletName} is on ${formatAddress(actual)}. Switch it to ${formatAddress(expected)} to reconnect that address.`
}
