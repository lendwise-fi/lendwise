import { NextResponse } from 'next/server'

import { sql } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'
import { latestReport } from '@/lib/db/repositories/reports'

// ─── Handler ─────────────────────────────────────────────────────────────────

async function qualityHandler(): Promise<NextResponse> {
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
    Map<
      string,
      {
        productCount: number
        complete: number
        healed: number
        totalCount: number
      }
    >
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
    return await qualityHandler()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[status:quality] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
