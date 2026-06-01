'use server'

import { unstable_cache } from 'next/cache'

import { dbBackend } from '@/lib/db/env'
import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_PRODUCTS,
  getDb,
} from '@/lib/db/mongodb'
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

async function getBestProductId(
  symbol: string,
  dailyColName: string,
  productsColName: string
): Promise<string | null> {
  const db = await getDb()
  const productsCol = db.collection(productsColName)
  const dailyCol = db.collection(dailyColName)

  const products = await productsCol
    .find({ 'asset.symbol': symbol }, { projection: { _id: 1 } })
    .toArray()

  if (products.length === 0) return null

  const ids = products.map((p) => String(p._id))

  // Prefer products that store real USD prices (>$100) — this excludes adapters
  // that store per-wei prices (~1e-15) or prices in base-token units (~0.998 for
  // Compound WBTC which tracks USDC price, not WBTC price).
  const [best] = await dailyCol
    .aggregate([
      {
        $match: {
          productId: { $in: ids },
          'market.assetPriceUsd': { $gt: 100 },
        },
      },
      { $group: { _id: '$productId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ])
    .toArray()

  if (best) return best._id as string

  // Fallback for stablecoins and low-price assets: relax threshold to > 0
  const [fallback] = await dailyCol
    .aggregate([
      {
        $match: {
          productId: { $in: ids },
          'market.assetPriceUsd': { $gt: 0 },
        },
      },
      { $group: { _id: '$productId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ])
    .toArray()

  return fallback?._id ?? ids[0]
}

async function _loadPriceReturnHistory(
  collateralSymbol: string,
  loanSymbol: string,
  days = 730
): Promise<PricePoint[]> {
  try {
    if (dbBackend() === 'postgres')
      return await priceReturnHistory(collateralSymbol, loanSymbol, days)

    const dailyCol = MONGODB_COLLECTION_DAILY!
    const productsCol = MONGODB_COLLECTION_PRODUCTS!

    const [collateralId, loanId] = await Promise.all([
      getBestProductId(collateralSymbol, dailyCol, productsCol),
      getBestProductId(loanSymbol, dailyCol, productsCol),
    ])

    if (!collateralId || !loanId) return []

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const db = await getDb()
    const col = db.collection(dailyCol)

    const [collateralDocs, loanDocs] = await Promise.all([
      col
        .find(
          {
            productId: collateralId,
            date: { $gte: since },
            'market.assetPriceUsd': { $gt: 0 },
          },
          { projection: { date: 1, 'market.assetPriceUsd': 1 } }
        )
        .sort({ date: 1 })
        .toArray(),
      col
        .find(
          {
            productId: loanId,
            date: { $gte: since },
            'market.assetPriceUsd': { $gt: 0 },
          },
          { projection: { date: 1, 'market.assetPriceUsd': 1 } }
        )
        .sort({ date: 1 })
        .toArray(),
    ])

    // Intraday pair price p_t = collateralUsd_t / loanUsd_t, keyed by day.
    const loanByDate = new Map<string, number>()
    for (const doc of loanDocs) {
      const key = (doc.date as Date).toISOString().slice(0, 10)
      loanByDate.set(key, doc['market']['assetPriceUsd'] as number)
    }

    const pairs: { date: Date; price: number }[] = []
    for (const doc of collateralDocs) {
      const key = (doc.date as Date).toISOString().slice(0, 10)
      const loanPrice = loanByDate.get(key)
      if (!loanPrice) continue
      pairs.push({
        date: doc.date as Date,
        price: (doc['market']['assetPriceUsd'] as number) / loanPrice,
      })
    }

    if (pairs.length < 2) return []

    // Daily return of the pair price. Skip the first point (no prior day).
    const out: PricePoint[] = []
    for (let i = 1; i < pairs.length; i++) {
      const prev = pairs[i - 1].price
      const curr = pairs[i].price
      if (prev <= 0) continue
      out.push({
        date: pairs[i].date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        returnPct: ((curr - prev) / prev) * 100,
      })
    }
    return out
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
