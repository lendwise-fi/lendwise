import { base58 } from '@scure/base'

/**
 * Minimal decoder of a Kamino Reserve account (klend, 8624 bytes, base64).
 * Layout: klend-sdk codegen (`Reserve`, `ReserveLiquidity`,
 * `ReserveCollateral`, `ReserveConfig`). Offsets include the 8-byte
 * discriminator.
 *
 * Metadata, verified against `/reserves/metrics` on the primary market
 * (58/58 mints and symbols equal, 2026-10-29):
 *   128..160   liquidity.mintPubkey
 *   272        liquidity.mintDecimals (u64 LE)
 *   5032..5064 config.tokenInfo.name (NUL-terminated UTF-8)
 *
 * Risk config and rates, verified on 2026-10-29 against `/reserves/batch/stats`
 * (maxLTV, liqLTV, borrowFactor, totalSupply, totalBorrow) and against
 * `/klend/loans` (the obligation amounts they convert, within 1e-7):
 *   224        liquidity.totalAvailableAmount (u64, lamports)
 *   232        liquidity.borrowedAmountSf (u128, lamports x 2^60)
 *   296        liquidity.cumulativeBorrowRateBsf.value (u256, x 2^60)
 *   344/360/376 liquidity.accumulatedProtocolFeesSf, accumulatedReferrerFeesSf,
 *              pendingReferrerFeesSf (u128, x 2^60)
 *   2592       collateral.mintTotalSupply (u64, collateral lamports)
 *   4872/4873  config.loanToValuePct / liquidationThresholdPct (u8)
 *   5008       config.borrowFactorPct (u64)
 *   5480..5500 config.elevationGroups ([u8; 20], 0 = empty slot)
 */
const RESERVE_ACCOUNT_SIZE = 8624
const MINT_OFFSET = 128
const AVAILABLE_OFFSET = 224
const BORROWED_SF_OFFSET = 232
const DECIMALS_OFFSET = 272
const CUMULATIVE_BORROW_RATE_OFFSET = 296
const PROTOCOL_FEES_SF_OFFSET = 344
const REFERRER_FEES_SF_OFFSET = 360
const PENDING_REFERRER_FEES_SF_OFFSET = 376
const COLLATERAL_SUPPLY_OFFSET = 2592
const LTV_PCT_OFFSET = 4872
const LIQUIDATION_THRESHOLD_PCT_OFFSET = 4873
const BORROW_FACTOR_PCT_OFFSET = 5008
const NAME_OFFSET = 5032
const NAME_LENGTH = 32
const ELEVATION_GROUPS_OFFSET = 5480
const ELEVATION_GROUPS_LENGTH = 20

/** Kamino fixed-point scale of `*Sf` / `*Bsf` values. */
const SF_SCALE = 2 ** 60

export interface DecodedReserveAccount {
  mint: string
  decimals: number
  symbol: string
  /** Max LTV outside eMode, as a fraction. */
  maxLtv: number
  /** Liquidation threshold outside eMode, as a fraction. */
  liquidationThreshold: number
  /** Debt weight outside eMode (1 = none, 1.25 = debt counts 125 %). */
  borrowFactor: number
  /** Elevation groups (eMode) the reserve belongs to. */
  elevationGroups: number[]
  /**
   * Underlying lamports per collateral (kToken) lamport: total liquidity
   * (available + borrowed - fees) / collateral supply, as of the reserve's
   * last refresh. Null while no collateral exists.
   */
  liquidityPerCToken: number | null
  /** Cumulative borrow rate as of the reserve's last refresh. */
  cumulativeBorrowRate: number
}

const u128 = (bytes: Buffer, offset: number) =>
  bytes.readBigUInt64LE(offset) + (bytes.readBigUInt64LE(offset + 8) << 64n)

const u256 = (bytes: Buffer, offset: number) =>
  u128(bytes, offset) + (u128(bytes, offset + 16) << 128n)

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

  const totalLiquiditySf =
    (bytes.readBigUInt64LE(AVAILABLE_OFFSET) << 60n) +
    u128(bytes, BORROWED_SF_OFFSET) -
    u128(bytes, PROTOCOL_FEES_SF_OFFSET) -
    u128(bytes, REFERRER_FEES_SF_OFFSET) -
    u128(bytes, PENDING_REFERRER_FEES_SF_OFFSET)
  const collateralSupply = bytes.readBigUInt64LE(COLLATERAL_SUPPLY_OFFSET)

  return {
    mint,
    decimals: Number(rawDecimals),
    symbol,
    maxLtv: bytes.readUInt8(LTV_PCT_OFFSET) / 100,
    liquidationThreshold:
      bytes.readUInt8(LIQUIDATION_THRESHOLD_PCT_OFFSET) / 100,
    borrowFactor: Number(bytes.readBigUInt64LE(BORROW_FACTOR_PCT_OFFSET)) / 100,
    elevationGroups: [
      ...bytes.subarray(
        ELEVATION_GROUPS_OFFSET,
        ELEVATION_GROUPS_OFFSET + ELEVATION_GROUPS_LENGTH
      ),
    ].filter((g) => g !== 0),
    liquidityPerCToken:
      collateralSupply > 0n
        ? Number(totalLiquiditySf) / SF_SCALE / Number(collateralSupply)
        : null,
    cumulativeBorrowRate:
      Number(u256(bytes, CUMULATIVE_BORROW_RATE_OFFSET)) / SF_SCALE,
  }
}
