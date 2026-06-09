/**
 * @file scripts/clean-insane-apy.ts
 * Purge glitched APY rows (NaN / Infinity / absurd out-of-range) from apy_hourly
 * + apy_daily, then rebuild the affected past days from the cleaned hourly rows.
 *
 * A rate outside [-100, 100] (i.e. magnitude > 10,000% APY) is an upstream glitch,
 * not a real rate. The BETWEEN bound also rejects NaN and ±Infinity (neither
 * compares true), so one predicate covers every bad case. Mirrors the
 * `isSaneApy` gate now enforced in the Morpho adapter. Note: real incentivised
 * markets can run net borrow APY down to ~-200% — those are kept by design.
 *
 * Steps:
 *   1. Delete insane apy_hourly rows.
 *   2. Delete insane apy_daily rows.
 *   3. Re-aggregate every affected past UTC day from the surviving hourly rows
 *      (today is skipped — the in-progress day is rebuilt by the daily cron).
 *
 * Usage:
 *   pnpm clean:insane-apy -- --dry-run   # report only
 *   pnpm clean:insane-apy                # apply
 */
import { sql } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'
import { aggregateDaily } from '@/lib/db/repositories/apy'

const SANE_APY_MAX = 100

/** Row is insane if any APY component falls outside [-MAX, MAX]; NaN/±Inf fail too. */
const insane = sql`NOT (
  apy_base    BETWEEN ${-SANE_APY_MAX} AND ${SANE_APY_MAX} AND
  apy_rewards BETWEEN ${-SANE_APY_MAX} AND ${SANE_APY_MAX} AND
  apy_fees    BETWEEN ${-SANE_APY_MAX} AND ${SANE_APY_MAX} AND
  apy_net     BETWEEN ${-SANE_APY_MAX} AND ${SANE_APY_MAX}
)`

async function count(table: 'apy_hourly' | 'apy_daily'): Promise<number> {
  const res = await db.execute(
    sql`SELECT count(*) AS n FROM ${sql.raw(table)} WHERE ${insane}`
  )
  return Number((res.rows[0] as { n: number | string }).n)
}

/** Distinct past UTC days touched by insane rows (need daily rebuild). */
async function affectedPastDays(): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT d FROM (
      SELECT to_char(date_trunc('day', hour), 'YYYY-MM-DD') AS d
        FROM apy_hourly WHERE ${insane}
      UNION
      SELECT to_char(date, 'YYYY-MM-DD') AS d
        FROM apy_daily WHERE ${insane}
    ) s
    WHERE d < to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
    ORDER BY d
  `)
  return (res.rows as { d: string }[]).map((r) => r.d)
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')

  console.log(`\n🧼 Clean insane APY${dryRun ? ' (dry-run)' : ''}\n`)

  const [h, d, days] = await Promise.all([
    count('apy_hourly'),
    count('apy_daily'),
    affectedPastDays(),
  ])
  console.log(`  insane apy_hourly rows: ${h}`)
  console.log(`  insane apy_daily rows:  ${d}`)
  console.log(`  past days to rebuild:   ${days.length}${days.length ? ` (${days.join(', ')})` : ''}`)

  if (dryRun) {
    console.log('\n✅ Dry-run complete (no writes)\n')
    process.exit(0)
  }

  const dh = await db.execute(sql`DELETE FROM apy_hourly WHERE ${insane}`)
  console.log(`\n  Deleted ${dh.rowCount ?? 0} hourly rows`)
  const dd = await db.execute(sql`DELETE FROM apy_daily WHERE ${insane}`)
  console.log(`  Deleted ${dd.rowCount ?? 0} daily rows`)

  for (const day of days) {
    const start = new Date(`${day}T00:00:00.000Z`)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const n = await aggregateDaily(start, end, new Date())
    console.log(`  Re-aggregated ${day}: ${n} rows`)
  }

  const [hAfter, dAfter] = await Promise.all([
    count('apy_hourly'),
    count('apy_daily'),
  ])
  console.log(`\n  insane remaining — hourly: ${hAfter}, daily: ${dAfter}`)
  console.log(`\n✅ Done\n`)
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Clean failed:', err)
  process.exit(1)
})
