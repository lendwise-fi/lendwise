'use server'

import { unstable_cache } from 'next/cache'

import { getProtocolAdapter, getProtocolIds } from '@/config/protocols'
import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  getDb,
} from '@/lib/db/mongodb'
import { BorrowProduct, SupplyProduct } from '@/types'

// Minimum data point thresholds per horizon
const THRESHOLDS = {
  weekly: 7,
  monthly: 180,
  yearly: 365,
} as const

interface ApyEnrichment {
  apyDaily?: number // 7-day avg from apy.daily (short term)
  apyMonthly?: number // 6-month avg from apy.daily (medium term)
  apyYearly?: number // 12-month avg from apy.daily (long term)
}

/**
 * Fetch the most recent hourly APY (apy.net) per productId from apy.hourly.
 * Uses the compound index { productId: 1, hour: -1 } for efficiency.
 */
async function fetchLatestHourlyApy(
  productIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (productIds.length === 0) return map

  try {
    const db = await getDb()
    const docs = await db
      .collection(MONGODB_COLLECTION_HOURLY!)
      .aggregate([
        { $match: { productId: { $in: productIds } } },
        { $sort: { productId: 1, hour: -1 } },
        { $group: { _id: '$productId', latestNet: { $first: '$apy.net' } } },
      ])
      .toArray()

    for (const doc of docs) {
      if (typeof doc.latestNet === 'number') {
        map.set(doc._id as string, doc.latestNet)
      }
    }
  } catch (err) {
    console.error(
      '[products] Failed to fetch latest hourly APY from MongoDB:',
      err
    )
  }

  return map
}

/**
 * Batch-query apy.daily and compute window averages for each productId.
 * Uses conditional aggregation so all windows are computed in one pass.
 */
async function fetchApyEnrichments(
  productIds: string[]
): Promise<Map<string, ApyEnrichment>> {
  const map = new Map<string, ApyEnrichment>()
  if (productIds.length === 0) return map

  try {
    const db = await getDb()
    const now = new Date()
    const date365dAgo = new Date(
      now.getTime() - THRESHOLDS.yearly * 24 * 60 * 60 * 1000
    )
    const date180dAgo = new Date(
      now.getTime() - THRESHOLDS.monthly * 24 * 60 * 60 * 1000
    )
    const date7dAgo = new Date(
      now.getTime() - THRESHOLDS.weekly * 24 * 60 * 60 * 1000
    )

    const docs = await db
      .collection(MONGODB_COLLECTION_DAILY!)
      .aggregate([
        {
          $match: {
            productId: { $in: productIds },
            date: { $gte: date365dAgo },
          },
        },
        {
          $group: {
            _id: '$productId',
            count365: { $sum: 1 },
            sum365: { $sum: '$apy.net' },
            count180: {
              $sum: { $cond: [{ $gte: ['$date', date180dAgo] }, 1, 0] },
            },
            sum180: {
              $sum: {
                $cond: [{ $gte: ['$date', date180dAgo] }, '$apy.net', 0],
              },
            },
            count7: {
              $sum: { $cond: [{ $gte: ['$date', date7dAgo] }, 1, 0] },
            },
            sum7: {
              $sum: {
                $cond: [{ $gte: ['$date', date7dAgo] }, '$apy.net', 0],
              },
            },
          },
        },
      ])
      .toArray()

    for (const doc of docs) {
      map.set(doc._id as string, {
        apyDaily:
          doc.count7 >= THRESHOLDS.weekly ? doc.sum7 / doc.count7 : undefined,
        apyMonthly:
          doc.count180 >= THRESHOLDS.monthly
            ? doc.sum180 / doc.count180
            : undefined,
        apyYearly:
          doc.count365 >= THRESHOLDS.yearly
            ? doc.sum365 / doc.count365
            : undefined,
      })
    }
  } catch (err) {
    console.error(
      '[products] Failed to fetch APY enrichments from MongoDB:',
      err
    )
  }

  return map
}

async function _loadSupplyProducts(): Promise<SupplyProduct[]> {
  const protocolIds = getProtocolIds()

  const results = await Promise.allSettled(
    protocolIds.map(async (protocolId) => {
      const adapterLoader = getProtocolAdapter(protocolId)
      if (!adapterLoader) throw new Error(`No adapter found for ${protocolId}`)

      const protocolAdapter = await adapterLoader()
      return protocolAdapter.getSupplyProducts()
    })
  )

  const allSupplyProducts: SupplyProduct[] = []

  results.forEach((result, index) => {
    const protocolId = protocolIds[index]
    if (result.status === 'fulfilled') {
      allSupplyProducts.push(...result.value)
    } else {
      console.error(`Adapter ${protocolId} failed:`, result.reason)
    }
  })

  // Enrich with MongoDB APY data (all horizons)
  const productIds = allSupplyProducts
    .map((p) => p.productId)
    .filter(Boolean) as string[]

  const [enrichments, latestHourly] = await Promise.all([
    fetchApyEnrichments(productIds),
    fetchLatestHourlyApy(productIds),
  ])

  const enriched = allSupplyProducts.map((p) => {
    if (!p.productId) return p
    const e = enrichments.get(p.productId)
    return {
      ...p,
      apy: latestHourly.get(p.productId) ?? p.apy,
      apyDaily: e?.apyDaily,
      apyMonthly: e?.apyMonthly,
      apyYearly: e?.apyYearly,
    }
  })

  return enriched.sort((a, b) => b.apy - a.apy)
}

export const loadSupplyProducts = unstable_cache(
  _loadSupplyProducts,
  ['supplying-markets'],
  { revalidate: 60, tags: ['supplying-markets'] }
)

async function _loadBorrowProducts(): Promise<BorrowProduct[]> {
  const protocolIds = getProtocolIds()

  const results = await Promise.allSettled(
    protocolIds.map(async (protocolId) => {
      const adapterLoader = getProtocolAdapter(protocolId)
      if (!adapterLoader) throw new Error(`No adapter found for ${protocolId}`)

      const protocolAdapter = await adapterLoader()
      return protocolAdapter.getBorrowProducts()
    })
  )

  const allBorrowProducts: BorrowProduct[] = []

  results.forEach((result, index) => {
    const protocolId = protocolIds[index]
    if (result.status === 'fulfilled') {
      allBorrowProducts.push(...result.value)
    } else {
      console.error(`Adapter ${protocolId} failed:`, result.reason)
    }
  })

  // Enrich with MongoDB APY data (all horizons)
  const productIds = allBorrowProducts
    .map((p) => p.productId)
    .filter(Boolean) as string[]

  const [enrichments, latestHourly] = await Promise.all([
    fetchApyEnrichments(productIds),
    fetchLatestHourlyApy(productIds),
  ])

  const enriched = allBorrowProducts.map((p) => {
    if (!p.productId) return p
    const e = enrichments.get(p.productId)
    return {
      ...p,
      apy: latestHourly.get(p.productId) ?? p.apy,
      apyDaily: e?.apyDaily,
      apyMonthly: e?.apyMonthly,
      apyYearly: e?.apyYearly,
    }
  })

  return enriched.sort((a, b) => b.apy - a.apy)
}

export const loadBorrowProducts = unstable_cache(
  _loadBorrowProducts,
  ['borrowProducts'],
  { revalidate: 60, tags: ['borrowProducts'] }
)
