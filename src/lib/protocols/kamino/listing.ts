import type { FetchOpts } from '@/lib/protocols/core/types'

import type { KaminoReserveStats } from './common/api'

/** Canonical chain id of Solana in the chain registry. */
export const SOLANA_CHAIN_ID = -2

/**
 * What Kamino lists — the single answer for products, spot and history.
 *
 * `status === 'Active'` drops Hidden and Obsolete reserves (the API still
 * returns them, with dust balances); `rateType === 'variable'` drops the
 * fixed-rate reserves, which report maxLTV 0 and a fixed term instead of a
 * floating rate and do not fit the supply/borrow rate model.
 *
 * No ingestion floor: the API lists a few hundred reserves in total and a tiny
 * one's rate is as meaningful as a large one's. Hiding small pools is display
 * eligibility, applied on the read side.
 */
export function isListedReserve(r: KaminoReserveStats): boolean {
  return r.status === 'Active' && r.rateType === 'variable'
}

/**
 * A listed reserve can be borrowed only when its borrow limit is positive.
 * Measured on the fixtures (2026-10-29): collateral-only reserves (strongSOL,
 * adraSOL) and every Hidden/Obsolete reserve carry `borrowLimit: "0"`, while
 * USDC carries 700M. A null limit (field absent) is treated as not borrowable.
 */
export function isBorrowableReserve(r: KaminoReserveStats): boolean {
  return isListedReserve(r) && (r.borrowLimit ?? 0) > 0
}

/** `false` when `FetchOpts.chainIds` is set and does not include Solana. */
export function coversSolana(opts?: FetchOpts): boolean {
  const ids = opts?.chainIds
  return !ids?.length || ids.includes(SOLANA_CHAIN_ID)
}
