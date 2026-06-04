import { NextResponse } from 'next/server'

import { sql } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'
import { latestReport } from '@/lib/db/repositories/reports'

// ─── Handler ─────────────────────────────────────────────────────────────────

async function qualityHandler(): Promise<NextResponse> {
  const hours = 168
  const now = new Date()
  // windowEnd = start of the current hour → boundary between settled history and
  // the in-progress hour. queryEnd extends one hour past it so the live hour's
  // rows are fetched and shown as a "filling" cell (not counted as settled).
  const windowEnd = new Date(now)
  windowEnd.setUTCMinutes(0, 0, 0)
  const windowStart = new Date(windowEnd)
  windowStart.setUTCHours(windowStart.getUTCHours() - hours)
  const queryEnd = new Date(windowEnd)
  queryEnd.setUTCHours(queryEnd.getUTCHours() + 1)
  const currentHourKey = windowEnd.toISOString()

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
           -- "full" = 6 native spots OR healed (neighbor-heal has valid APY but
           -- quality_count=0, so count it as complete and let the ring flag it).
           count(*) FILTER (WHERE h.quality_count >= 6 OR h.healed)::int AS complete,
           count(*) FILTER (WHERE h.healed)::int AS healed,
           sum(h.quality_count)::int AS total_count
    FROM apy_hourly h JOIN products p ON p.id = h.product_id
    WHERE h.hour >= ${windowStart} AND h.hour < ${queryEnd} AND p.active
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

  // Per-(provider, hour) EXPECTED pool count — scoped exactly like gap detection
  // (findGaps): only products collected at some point in the window, and only
  // for hours at/after each product's created_at. Without this the denominator
  // is today's full set for every past hour, so a market created mid-window
  // shows as "missing" for the hours before it existed.
  const expectedRes = await db.execute(sql`
    WITH boundaries AS (
      SELECT generate_series(
        ${windowStart}::timestamptz,
        ${queryEnd}::timestamptz - interval '1 hour',
        interval '1 hour'
      ) AS hour
    ),
    collected AS (
      SELECT DISTINCT product_id FROM apy_hourly
      WHERE hour >= ${windowStart} AND hour < ${queryEnd}
    )
    SELECT p.provider, b.hour, count(*)::int AS expected
    FROM products p
    JOIN collected c ON c.product_id = p.id
    CROSS JOIN boundaries b
    WHERE p.active AND b.hour >= date_trunc('hour', p.created_at)
    GROUP BY p.provider, b.hour
  `)
  const expectedByProto = new Map<string, Map<string, number>>()
  for (const r of expectedRes.rows as {
    provider: string
    hour: Date
    expected: number
  }[]) {
    const key = new Date(r.hour).toISOString()
    if (!expectedByProto.has(r.provider))
      expectedByProto.set(r.provider, new Map())
    expectedByProto.get(r.provider)!.set(key, r.expected)
  }

  const boundaries: Date[] = []
  for (
    let c = new Date(windowStart);
    c < queryEnd;
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
    const expectedMap = expectedByProto.get(key)
    let complete = 0
    let partial = 0
    let missing = 0

    const slots = boundaries.map((h) => {
      const hourKey = h.toISOString()
      // Pools that were expected to report THIS hour (created_at-scoped), not
      // today's full set — falls back to the current total for safety.
      const expectedProducts = expectedMap?.get(hourKey) ?? totalProducts
      const agg = hourMap?.get(hourKey)

      // The live, still-filling hour — never an anomaly, shown as in-progress
      // and excluded from the settled completeness summary.
      if (hourKey === currentHourKey) {
        return {
          hour: hourKey,
          count: agg
            ? Math.min(6, Math.round(agg.totalCount / agg.productCount))
            : 0,
          status: 'in_progress' as const,
          inProgress: true,
          healed: agg ? agg.healed > 0 : false,
          productCount: agg?.productCount ?? 0,
          fullProducts: agg?.complete ?? 0,
          expectedProducts,
        }
      }

      if (!agg || agg.productCount === 0) {
        missing++
        return {
          hour: hourKey,
          count: 0,
          status: 'missing' as const,
          healed: false,
          productCount: 0,
          fullProducts: 0,
          expectedProducts,
        }
      }
      const isComplete =
        expectedProducts > 0 ? agg.complete / expectedProducts >= 0.95 : false
      if (isComplete) complete++
      else partial++
      return {
        hour: hourKey,
        count: Math.min(6, Math.round(agg.totalCount / agg.productCount)),
        status: isComplete ? ('complete' as const) : ('partial' as const),
        healed: agg.healed > 0,
        // Products that reported at least one spot this hour.
        productCount: agg.productCount,
        // Products that reported all 6 spots (or were healed) — the real signal.
        fullProducts: agg.complete,
        expectedProducts,
      }
    })

    return {
      protocol: key,
      label,
      totalProducts,
      slots,
      // total excludes the live hour (last boundary) — only settled hours count.
      summary: { complete, partial, missing, total: boundaries.length - 1 },
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
