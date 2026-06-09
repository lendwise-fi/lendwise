/**
 * @file scripts/fix-daily-nan.ts
 * Repair NaN rows in apy_daily for a given UTC day.
 *
 * Postgres double precision stores 'NaN' when an upstream APR→APY goes bad. The
 * daily aggregate of such a slot is NaN for that whole day. This:
 *   1. Re-aggregates the day from apy_hourly (fixes products whose hourly is now
 *      clean — the usual case once the bad hourly slot has been healed/pruned).
 *   2. Deletes any apy_daily row still NaN afterwards (no hourly source to
 *      rebuild from, e.g. a product with zero hourly coverage that day) so the
 *      chart connects across a 1-day gap instead of rendering "NaN%".
 *
 * Usage:
 *   pnpm fix:daily-nan -- --date 2026-04-03            # apply
 *   pnpm fix:daily-nan -- --date 2026-04-03 --dry-run  # report only
 */
import { sql } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'
import { aggregateDaily } from '@/lib/db/repositories/apy'

const NAN_FILTER = sql`apy_base = 'NaN'::float8 OR apy_fees = 'NaN'::float8
  OR apy_rewards = 'NaN'::float8 OR apy_net = 'NaN'::float8`

async function countNan(date: string): Promise<number> {
  const res = await db.execute(sql`
    SELECT count(*) AS n FROM apy_daily
    WHERE date = ${date}::date AND (${NAN_FILTER})
  `)
  return Number((res.rows[0] as { n: number | string }).n)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const dateIdx = args.indexOf('--date')
  const date = dateIdx !== -1 ? args[dateIdx + 1] : undefined

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('❌ Pass --date YYYY-MM-DD')
    process.exit(1)
  }

  console.log(`\n🩹 Fix daily NaN for ${date}${dryRun ? ' (dry-run)' : ''}\n`)

  const before = await countNan(date)
  console.log(`  NaN rows before: ${before}`)

  if (dryRun) {
    console.log('\n✅ Dry-run complete (no writes)\n')
    process.exit(0)
  }

  // 1. Re-aggregate the day from hourly. Window is [date, date+1).
  const windowStart = new Date(`${date}T00:00:00.000Z`)
  const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000)
  const rebuilt = await aggregateDaily(windowStart, windowEnd, new Date())
  console.log(`  Re-aggregated ${rebuilt} rows from hourly`)

  const afterAgg = await countNan(date)
  console.log(`  NaN rows after re-aggregation: ${afterAgg}`)

  // 2. Delete any leftover NaN rows (no hourly source to rebuild from).
  const del = await db.execute(sql`
    DELETE FROM apy_daily WHERE date = ${date}::date AND (${NAN_FILTER})
  `)
  console.log(`  Deleted ${del.rowCount ?? 0} unrecoverable NaN rows`)

  const remaining = await countNan(date)
  console.log(`\n  NaN rows remaining: ${remaining}`)
  console.log(`\n✅ Done\n`)
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Fix failed:', err)
  process.exit(1)
})
