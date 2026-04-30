'use server'

import { unstable_cache } from 'next/cache'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_PRODUCTS,
  getDb,
} from '@/lib/db/mongodb'

export interface PricePoint {
  date: string
  ratio: number
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

async function _loadPriceRatioHistory(
  collateralSymbol: string,
  loanSymbol: string,
  days = 730
): Promise<PricePoint[]> {
  try {
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

    const loanByDate = new Map<string, number>()
    for (const doc of loanDocs) {
      const key = (doc.date as Date).toISOString().slice(0, 10)
      loanByDate.set(key, doc['market']['assetPriceUsd'] as number)
    }

    const ratios: { date: Date; ratio: number }[] = []
    for (const doc of collateralDocs) {
      const key = (doc.date as Date).toISOString().slice(0, 10)
      const loanPrice = loanByDate.get(key)
      if (!loanPrice) continue
      ratios.push({
        date: doc.date as Date,
        ratio: (doc['market']['assetPriceUsd'] as number) / loanPrice,
      })
    }

    if (ratios.length === 0) return []

    return ratios.map((r) => ({
      date: r.date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      ratio: r.ratio,
    }))
  } catch (err) {
    console.error('[price-ratio-history] Failed to load:', err)
    return []
  }
}

export const loadPriceRatioHistory = unstable_cache(
  _loadPriceRatioHistory,
  ['price-ratio-history'],
  { revalidate: 3600 }
)
