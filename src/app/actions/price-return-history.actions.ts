'use server'

import { unstable_cache } from 'next/cache'

import { priceReturnHistory } from '@/lib/db/repositories/price'

export interface PricePoint {
  date: string
  /**
   * Daily return of the pair price, in percent.
   * Pair price at day t: p_t = collateralUsd_t / loanUsd_t
   * Return:               r_t = 100 * (p_t - p_{t-1}) / p_{t-1}
   * The series starts at the second available day so every point is a
   * real computed return (no synthetic 0).
   */
  returnPct: number
}

async function _loadPriceReturnHistory(
  collateralSymbol: string,
  loanSymbol: string,
  days = 730
): Promise<PricePoint[]> {
  try {
    return await priceReturnHistory(collateralSymbol, loanSymbol, days)
  } catch (err) {
    console.error('[price-return-history] Failed to load:', err)
    return []
  }
}

export const loadPriceReturnHistory = unstable_cache(
  _loadPriceReturnHistory,
  ['price-return-history'],
  { revalidate: 3600 }
)
