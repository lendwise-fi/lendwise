import { NextResponse } from 'next/server'

import { sql } from 'drizzle-orm'

import { dbBackend } from '@/lib/db/env'
import {
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_PRODUCTS,
  getDb,
} from '@/lib/db/mongodb'
import { db } from '@/lib/db/postgres'
import { latestReport } from '@/lib/db/repositories/reports'
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

// ─── Postgres handler ──────────────────────────────────────────────────────

async function qualityHandlerPostgres(): Promise<NextResponse> {
  const hours = 168
  const now = new Date()
  const windowEnd = new Date(now)
  windowEnd.setUTCMinutes(0, 0, 0)
  const windowStart = new Date(windowEnd)
  windowStart.setUTCHours(windowStart.getUTCHours() - hours)

  const totalsRes = await db.execute(
    sql`SELECT provider, count(*)::int AS n FROM products WHERE active GROUP BY provider`
  )
  const totals = new Map<string, number>()
  for (const r of totalsRes.rows as { provider: string; n: number }[]) {
    totals.set(r.provider, r.n)
  }

  const aggRes = await db.execute(sql`
    SELECT p.provider, h.hour,
           count(*)::int AS product_count,
           count(*) FILTER (WHERE h.quality_count >= 6)::int AS complete,
           count(*) FILTER (WHERE h.healed)::int AS healed,
           sum(h.quality_count)::int AS total_count
    FROM apy_hourly h JOIN products p ON p.id = h.product_id
    WHERE h.hour >= ${windowStart} AND h.hour < ${windowEnd} AND p.active
    GROUP BY p.provider, h.hour
  `)
  const byProto = new Map<
    string,
    Map<string, { productCount: number; complete: number; healed: number; totalCount: number }>
  >()
  for (const r of aggRes.rows as {
    provider: string
    hour: Date
    product_count: number
    complete: number
    healed: number
    total_count: number
  }[]) {
    const key = new Date(r.hour).toISOString()
    if (!byProto.has(r.provider)) byProto.set(r.provider, new Map())
    byProto.get(r.provider)!.set(key, {
      productCount: r.product_count,
      complete: r.complete,
      healed: r.healed,
      totalCount: r.total_count,
    })
  }

  const boundaries: Date[] = []
  for (
    let c = new Date(windowStart);
    c < windowEnd;
    c.setUTCHours(c.getUTCHours() + 1)
  ) {
    boundaries.push(new Date(c))
  }

  const protocols = [
    { key: 'morpho', label: 'Morpho' },
    { key: 'aave', label: 'AAVE' },
    { key: 'compound', label: 'Compound' },
  ]

  const rows = protocols.map(({ key, label }) => {
    const totalProducts = totals.get(key) ?? 0
    const hourMap = byProto.get(key)
    let complete = 0
    let partial = 0
    let missing = 0

    const slots = boundaries.map((h) => {
      const agg = hourMap?.get(h.toISOString())
      if (!agg || agg.productCount === 0) {
        missing++
        return {
          hour: h.toISOString(),
          count: 0,
          status: 'partial' as const,
          healed: false,
          productCount: 0,
          expectedProducts: totalProducts,
        }
      }
      const isComplete =
        totalProducts > 0 ? agg.complete / totalProducts >= 0.95 : false
      if (isComplete) complete++
      else partial++
      return {
        hour: h.toISOString(),
        count: Math.min(6, Math.round(agg.totalCount / agg.productCount)),
        status: isComplete ? ('complete' as const) : ('partial' as const),
        healed: agg.healed > 0,
        productCount: agg.productCount,
        expectedProducts: totalProducts,
      }
    })

    return {
      protocol: key,
      label,
      totalProducts,
      slots,
      summary: { complete, partial, missing, total: boundaries.length },
    }
  })

  const [gap, heal] = await Promise.all([
    latestReport('gap-detection'),
    latestReport('gap-healing'),
  ])
  const gp = (gap?.payload ?? {}) as {
    collected?: {
      missingSlots?: number
      incompleteSlots?: number
      expectedSlots?: number
    }
  }
  const hp = (heal?.payload ?? {}) as {
    totalGaps?: number
    healed?: number
    healedByRefetch?: number
    healedByNeighbor?: number
    noDonor?: number
  }

  return NextResponse.json({
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      hours,
    },
    protocols: rows,
    latestReports: {
      gapDetection: gap
        ? {
            id: gap.id,
            createdAt: gap.createdAt,
            missingSlots: gp.collected?.missingSlots ?? 0,
            incompleteSlots: gp.collected?.incompleteSlots ?? 0,
            expectedSlots: gp.collected?.expectedSlots ?? 0,
          }
        : null,
      gapHealing: heal
        ? {
            id: heal.id,
            createdAt: heal.createdAt,
            totalGaps: hp.totalGaps ?? 0,
            healed: hp.healed ?? 0,
            healedByRefetch: hp.healedByRefetch ?? 0,
            healedByNeighbor: hp.healedByNeighbor ?? 0,
            noDonor: hp.noDonor ?? 0,
          }
        : null,
    },
  })
}

// ─── Endpoint ────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    if (dbBackend() === 'postgres') return await qualityHandlerPostgres()
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
