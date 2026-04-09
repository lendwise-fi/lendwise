import { NextResponse } from 'next/server'

import {
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_PRODUCTS,
  getDb,
} from '@/lib/db/mongodb'
import type { Product } from '@/lib/db/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlotInfo {
  hour: string
  count: number
  status: 'complete' | 'partial' | 'building'
  healed: boolean
  productCount: number
  expectedProducts: number
}

interface ProtocolRow {
  protocol: string
  label: string
  totalProducts: number
  slots: SlotInfo[]
  summary: {
    complete: number
    partial: number
    missing: number
    total: number
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function detectProtocol(productId: string): string {
  if (
    productId.startsWith('morphoblue:') ||
    productId.startsWith('metamorpho:')
  )
    return 'morpho'
  if (productId.startsWith('aave:')) return 'aave'
  if (productId.startsWith('compoundcomet:')) return 'compound'
  return 'other'
}

function generateHourBoundaries(start: Date, end: Date): Date[] {
  const hours: Date[] = []
  const current = new Date(start)
  while (current < end) {
    hours.push(new Date(current))
    current.setUTCHours(current.getUTCHours() + 1)
  }
  return hours
}

// ─── Endpoint ────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const db = await getDb()
    const hours = 168 // 7 days

    const now = new Date()
    const windowEnd = new Date(now)
    windowEnd.setUTCMinutes(0, 0, 0)

    const windowStart = new Date(windowEnd)
    windowStart.setUTCHours(windowStart.getUTCHours() - hours)

    const hourBoundaries = generateHourBoundaries(windowStart, windowEnd)

    // Get active products grouped by protocol
    const productsCollection = db.collection<Product>(
      MONGODB_COLLECTION_PRODUCTS
    )
    const activeProductDocs = await productsCollection
      .find({ active: true }, { projection: { _id: 1, createdAt: 1 } })
      .toArray()
    const activeProducts = activeProductDocs.map((p) => p._id)

    // Map productId → createdAt (floored to hour boundary)
    const productCreatedAt = new Map<string, Date>()
    for (const p of activeProductDocs) {
      if (p.createdAt) {
        const ca = new Date(p.createdAt)
        ca.setUTCMinutes(0, 0, 0)
        productCreatedAt.set(p._id, ca)
      }
    }

    const productsByProtocol = new Map<string, string[]>()
    for (const pid of activeProducts) {
      const proto = detectProtocol(pid)
      const list = productsByProtocol.get(proto) ?? []
      list.push(pid)
      productsByProtocol.set(proto, list)
    }

    // Aggregate hourly quality per protocol per hour
    const hourlyCollection = db.collection(MONGODB_COLLECTION_HOURLY)

    const pipeline = [
      {
        $match: {
          hour: { $gte: windowStart, $lt: windowEnd },
          productId: { $in: activeProducts },
        },
      },
      {
        $group: {
          _id: {
            hour: '$hour',
            productId: '$productId',
          },
          count: { $first: '$quality.count' },
          status: { $first: '$quality.status' },
          healed: { $first: { $ifNull: ['$healed', false] } },
        },
      },
    ]

    const rawDocs = await hourlyCollection.aggregate(pipeline).toArray()

    // Build lookup: protocol → hour → { totalComplete, totalPartial, totalHealed, productCount }
    type HourAgg = {
      complete: number
      partial: number
      healed: number
      totalCount: number
      productCount: number
    }
    const protoHourMap = new Map<string, Map<string, HourAgg>>()

    for (const doc of rawDocs) {
      const productId = doc._id.productId as string
      const hourDate = doc._id.hour as Date
      const proto = detectProtocol(productId)
      const hourKey = hourDate.toISOString()

      if (!protoHourMap.has(proto)) protoHourMap.set(proto, new Map())
      const hourMap = protoHourMap.get(proto)!

      if (!hourMap.has(hourKey)) {
        hourMap.set(hourKey, {
          complete: 0,
          partial: 0,
          healed: 0,
          totalCount: 0,
          productCount: 0,
        })
      }

      const agg = hourMap.get(hourKey)!
      agg.productCount++
      agg.totalCount += doc.count ?? 0
      if (doc.healed) agg.healed++
      if ((doc.count ?? 0) >= 6) {
        agg.complete++
      } else {
        agg.partial++
      }
    }

    // Build response rows
    const protocols = [
      { key: 'morpho', label: 'Morpho' },
      { key: 'aave', label: 'AAVE' },
      { key: 'compound', label: 'Compound' },
    ]

    const rows: ProtocolRow[] = protocols.map(({ key, label }) => {
      const totalProducts = productsByProtocol.get(key)?.length ?? 0
      const hourMap = protoHourMap.get(key)

      let summaryComplete = 0
      let summaryPartial = 0
      let summaryMissing = 0

      const slots: SlotInfo[] = hourBoundaries.map((h) => {
        const hourKey = h.toISOString()
        const agg = hourMap?.get(hourKey)

        if (!agg || agg.productCount === 0) {
          summaryMissing++
          return {
            hour: hourKey,
            count: 0,
            status: 'partial' as const,
            healed: false,
            productCount: 0,
            expectedProducts: totalProducts,
          }
        }

        // Determine slot quality based on ratio of complete products
        const protoProductsList = productsByProtocol.get(key) ?? []
        const expectedAtHourForRatio =
          protoProductsList.filter((pid) => {
            const ca = productCreatedAt.get(pid)
            return !ca || h <= ca ? false : true
          }).length || totalProducts
        const completeRatio = agg.complete / expectedAtHourForRatio
        const isComplete = completeRatio >= 0.95
        const isPartial = agg.productCount > 0

        if (isComplete) {
          summaryComplete++
        } else if (isPartial) {
          summaryPartial++
        } else {
          summaryMissing++
        }

        // Count how many products existed at this hour
        const protoProducts = productsByProtocol.get(key) ?? []
        const expectedAtHour = protoProducts.filter((pid) => {
          const ca = productCreatedAt.get(pid)
          return !ca || h <= ca ? false : true
        }).length

        return {
          hour: hourKey,
          count: Math.min(6, Math.round(agg.totalCount / agg.productCount)),
          status: isComplete ? ('complete' as const) : ('partial' as const),
          healed: agg.healed > 0,
          productCount: agg.productCount,
          expectedProducts: expectedAtHour || totalProducts,
        }
      })

      return {
        protocol: key,
        label,
        totalProducts,
        slots,
        summary: {
          complete: summaryComplete,
          partial: summaryPartial,
          missing: summaryMissing,
          total: hourBoundaries.length,
        },
      }
    })

    // Latest gap-detection and gap-healing reports
    const reportsCol = db.collection('pipeline.reports')
    const [latestGap, latestHeal] = await Promise.all([
      reportsCol.findOne(
        { type: 'gap-detection' },
        { sort: { createdAt: -1 }, projection: { gaps: 0, incomplete: 0 } }
      ),
      reportsCol.findOne({ type: 'gap-healing' }, { sort: { createdAt: -1 } }),
    ])

    return NextResponse.json({
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        hours,
      },
      protocols: rows,
      latestReports: {
        gapDetection: latestGap
          ? {
              id: latestGap._id.toHexString(),
              createdAt: latestGap.createdAt,
              missingSlots: latestGap.collected?.missingSlots ?? 0,
              incompleteSlots: latestGap.collected?.incompleteSlots ?? 0,
              expectedSlots: latestGap.collected?.expectedSlots ?? 0,
            }
          : null,
        gapHealing: latestHeal
          ? {
              id: latestHeal._id.toHexString(),
              createdAt: latestHeal.createdAt,
              totalGaps: latestHeal.totalGaps ?? 0,
              healed: latestHeal.healed ?? 0,
              healedByRefetch: latestHeal.healedByRefetch ?? 0,
              healedByNeighbor: latestHeal.healedByNeighbor ?? 0,
              noDonor: latestHeal.noDonor ?? 0,
            }
          : null,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[status:quality] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
