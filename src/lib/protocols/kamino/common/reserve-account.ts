import { base58 } from '@scure/base'

/**
 * Minimal decoder of a Kamino Reserve account (klend, 8624 bytes, base64).
 * Offsets verified against `/reserves/metrics` on the primary market
 * (58/58 mints and symbols equal, 2026-10-29):
 *   128..160   liquidity.mintPubkey
 *   272        liquidity.mintDecimals (u64 LE)
 *   5032..5064 config.tokenInfo.name (NUL-terminated UTF-8)
 */
const RESERVE_ACCOUNT_SIZE = 8624
const MINT_OFFSET = 128
const DECIMALS_OFFSET = 272
const NAME_OFFSET = 5032
const NAME_LENGTH = 32

export interface DecodedReserveAccount {
  mint: string
  decimals: number
  symbol: string
}

export function decodeReserveAccount(base64: string): DecodedReserveAccount {
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length !== RESERVE_ACCOUNT_SIZE) {
    throw new Error(`unexpected reserve account size ${bytes.length}`)
  }
  const mint = base58.encode(bytes.subarray(MINT_OFFSET, MINT_OFFSET + 32))
  const rawDecimals = bytes.readBigUInt64LE(DECIMALS_OFFSET)
  if (rawDecimals > 36n) throw new Error(`implausible decimals ${rawDecimals}`)
  const nameBytes = bytes.subarray(NAME_OFFSET, NAME_OFFSET + NAME_LENGTH)
  const end = nameBytes.indexOf(0)
  const symbol = nameBytes
    .subarray(0, end === -1 ? NAME_LENGTH : end)
    .toString('utf8')
    .trim()
  if (!symbol) throw new Error('empty token name')
  return { mint, decimals: Number(rawDecimals), symbol }
}
