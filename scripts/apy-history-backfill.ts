/**
 * @file scripts/apy-history-backfill.ts
 * Backfill historical APY data into apy.daily and apy.hourly collections.
 *
 * Fetches historical data from each protocol's API/subgraph and writes it
 * into MongoDB. All writes are idempotent (upserts on composite _id).
 *
 * Usage:
 *   # Backfill all protocols into production DB
 *   pnpm apy:backfill
 *
 *   # Backfill a single protocol
 *   pnpm apy:backfill -- --protocol aave
 *
 *   # Dry-run (no writes)
 *   pnpm apy:backfill -- --dry-run
 *
 *   # Use a different database (for testing)
 *   pnpm apy:backfill -- --db-name yieldoptimizer_test
 *
 *   # Filter by chain
 *   pnpm apy:backfill -- --protocol compound --chain ethereum
 *
 *   # Custom date range (ISO dates)
 *   pnpm apy:backfill -- --start 2024-03-28 --end 2026-03-28
 *
 *   # Skip hourly backfill (daily only)
 *   pnpm apy:backfill -- --daily-only
 */
import type { Collection, Document } from 'mongodb'
import { MongoClient } from 'mongodb'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  MONGODB_DB_NAME,
  MONGODB_URI,
} from '@/lib/db/mongodb'
// import type {
//   ApyBreakdown,
//   BorrowMarketState,
//   SupplyMarketState,
// } from '@/lib/db/types'
import {
  type HistoryDataPoint,
  fetchAaveHistory,
} from '@/lib/protocols/aave/v3/apy-history'
import {
  fetchCompoundDailyHistory,
  fetchCompoundHourlyHistory,
} from '@/lib/protocols/compound/v3/apy-history'
import { fetchMorphoHistory } from '@/lib/protocols/morpho/v1/apy-history'

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const idx = args.indexOf(flag)
    return idx !== -1 ? args[idx + 1] : undefined
  }
  const has = (flag: string) => args.includes(flag)

  const protocol = get('--protocol')
  const chain = get('--chain')
  const dbName = get('--db-name') ?? MONGODB_DB_NAME
  const dryRun = has('--dry-run')
  const dailyOnly = has('--daily-only')
  const startStr = get('--start')
  const endStr = get('--end')

  // Default: 2 years ago to now
  const now = new Date()
  const twoYearsAgo = new Date(now)
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  const startDate = startStr ? new Date(startStr) : twoYearsAgo
  const endDate = endStr ? new Date(endStr) : now

  return { protocol, chain, dbName, dryRun, dailyOnly, startDate, endDate }
}

// ─── Document builders ────────────────────────────────────────────────────────

function buildDailyId(productId: string, date: Date): string {
  return `${productId}:${date.toISOString().slice(0, 10)}`
}

function buildHourlyId(productId: string, hour: Date): string {
  return `${productId}:${hour.toISOString().slice(0, 13)}`
}

function normalizeDateMidnight(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function normalizeHour(date: Date): Date {
  const d = new Date(date)
  d.setUTCMinutes(0, 0, 0)
  return d
}

function buildDailyDoc(point: HistoryDataPoint): Document {
  const date = normalizeDateMidnight(point.timestamp)
  return {
    _id: buildDailyId(point.productId, date),
    date,
    productId: point.productId,
    apy: point.apy,
    market: point.market,
    quality: {
      count: 1,
      expectedCount: 24,
      firstSlot: date,
      lastSlot: date,
      status: 'historical',
    },
  }
}

function buildHourlyDoc(point: HistoryDataPoint): Document {
  const hour = normalizeHour(point.timestamp)
  return {
    _id: buildHourlyId(point.productId, hour),
    hour,
    productId: point.productId,
    apy: point.apy,
    market: point.market,
    quality: {
      count: 1,
      expectedCount: 6,
      firstSlot: hour,
      lastSlot: hour,
      status: 'historical',
    },
  }
}

// ─── Batch writer ─────────────────────────────────────────────────────────────

async function batchUpsert(
  collection: Collection,
  docs: Document[],
  label: string,
  log: (msg: string) => void
): Promise<number> {
  if (docs.length === 0) return 0

  const batchSize = 500
  let written = 0

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    const ops = batch.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: doc },
        upsert: true,
      },
    }))

    const result = await collection.bulkWrite(ops, { ordered: false })
    written += result.upsertedCount
    log(
      `  [${label}] batch ${Math.floor(i / batchSize) + 1}: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`
    )
  }

  return written
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { protocol, chain, dbName, dryRun, dailyOnly, startDate, endDate } =
    parseArgs()

  const startTs = Math.floor(startDate.getTime() / 1000)
  const endTs = Math.floor(endDate.getTime() / 1000)

  // 180-day boundary for hourly data (TTL on the collection)
  const hourlyStart = new Date()
  hourlyStart.setDate(hourlyStart.getDate() - 179)
  const hourlyStartTs = Math.floor(hourlyStart.getTime() / 1000)

  console.log('\n📊 APY History Backfill\n')
  console.log(`  Database:   ${dbName}`)
  console.log(`  Protocol:   ${protocol ?? 'all'}`)
  console.log(`  Chain:      ${chain ?? 'all'}`)
  console.log(
    `  Range:      ${startDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`
  )
  console.log(`  Dry run:    ${dryRun}`)
  console.log(`  Daily only: ${dailyOnly}`)
  console.log()

  const log = console.log

  // ─── Fetch data ─────────────────────────────────────────────────────────────

  const dailyPoints: HistoryDataPoint[] = []
  const hourlyPoints: HistoryDataPoint[] = []

  const protocols = protocol ? [protocol] : ['aave', 'morpho', 'compound']

  for (const proto of protocols) {
    switch (proto) {
      case 'aave': {
        log('🔵 Fetching Aave history...')
        // Aave API only supports up to LAST_YEAR — daily points only
        const aavePoints = await fetchAaveHistory({
          chainFilter: chain,
          onProgress: log,
        })
        for (const pt of aavePoints) dailyPoints.push(pt)
        // For hourly: create one hourly doc at 00:00 for each daily point (within 180d)
        if (!dailyOnly) {
          for (const pt of aavePoints) {
            if (pt.timestamp.getTime() >= hourlyStart.getTime()) {
              hourlyPoints.push(pt)
            }
          }
        }
        break
      }

      case 'morpho': {
        log('🟣 Fetching Morpho history...')
        // Daily history
        const morphoDailyPoints = await fetchMorphoHistory({
          chainFilter: chain,
          startTimestamp: startTs,
          endTimestamp: endTs,
          interval: 'DAY',
          onProgress: log,
        })
        for (const pt of morphoDailyPoints) dailyPoints.push(pt)

        // Hourly history (only last 180 days)
        if (!dailyOnly) {
          log('🟣 Fetching Morpho hourly history...')
          const morphoHourlyPoints = await fetchMorphoHistory({
            chainFilter: chain,
            startTimestamp: Math.max(startTs, hourlyStartTs),
            endTimestamp: endTs,
            interval: 'HOUR',
            onProgress: log,
          })
          for (const pt of morphoHourlyPoints) hourlyPoints.push(pt)
        }
        break
      }

      case 'compound': {
        log('🟢 Fetching Compound daily history...')
        const compoundDailyPoints = await fetchCompoundDailyHistory({
          chainFilter: chain,
          startTimestamp: startTs,
          endTimestamp: endTs,
          onProgress: log,
        })
        for (const pt of compoundDailyPoints) dailyPoints.push(pt)

        if (!dailyOnly) {
          log('🟢 Fetching Compound hourly history...')
          const compoundHourlyPoints = await fetchCompoundHourlyHistory({
            chainFilter: chain,
            startTimestamp: Math.max(startTs, hourlyStartTs),
            endTimestamp: endTs,
            onProgress: log,
          })
          for (const pt of compoundHourlyPoints) hourlyPoints.push(pt)
        }
        break
      }

      default:
        log(`⚠️  Unknown protocol: ${proto} (valid: aave, morpho, compound)`)
    }
  }

  // ─── Also create daily docs from hourly Compound data ─────────────────────
  // Compound hourly data that falls outside the daily fetch range should be aggregated
  // into daily docs too — but we already have a dedicated daily fetch for Compound.

  console.log(`\n📈 Summary:`)
  console.log(`  Daily points:  ${dailyPoints.length}`)
  console.log(`  Hourly points: ${hourlyPoints.length}`)

  if (dryRun) {
    console.log('\n🔒 Dry run — no data written to database')

    // Show sample data
    if (dailyPoints.length > 0) {
      const sample = dailyPoints[0]
      console.log('\n  Sample daily point:')
      console.log(`    productId: ${sample.productId}`)
      console.log(
        `    date:      ${sample.timestamp.toISOString().slice(0, 10)}`
      )
      console.log(`    kind:      ${sample.kind}`)
      console.log(`    apy.net:   ${(sample.apy.net * 100).toFixed(4)}%`)
    }

    // Count unique products
    const uniqueProducts = new Set(dailyPoints.map((p) => p.productId))
    console.log(`\n  Unique products: ${uniqueProducts.size}`)

    console.log('\n✅ Dry run complete\n')
    process.exit(0)
  }

  // ─── Write to MongoDB ───────────────────────────────────────────────────────

  const client = new MongoClient(MONGODB_URI!)

  try {
    await client.connect()
    const db = client.db(dbName)

    // Build documents
    const dailyDocs = dailyPoints.map(buildDailyDoc)
    const hourlyDocs = hourlyPoints.map(buildHourlyDoc)

    console.log(`\n💾 Writing to database: ${dbName}`)

    // Write daily
    if (dailyDocs.length > 0) {
      const dailyCollection = db.collection(MONGODB_COLLECTION_DAILY)
      const dailyWritten = await batchUpsert(
        dailyCollection,
        dailyDocs,
        'daily',
        log
      )
      console.log(
        `\n  ✅ Daily: ${dailyWritten} new documents inserted (${dailyDocs.length - dailyWritten} already existed)`
      )
    }

    // Write hourly
    if (hourlyDocs.length > 0) {
      const hourlyCollection = db.collection(MONGODB_COLLECTION_HOURLY)
      const hourlyWritten = await batchUpsert(
        hourlyCollection,
        hourlyDocs,
        'hourly',
        log
      )
      console.log(
        `  ✅ Hourly: ${hourlyWritten} new documents inserted (${hourlyDocs.length - hourlyWritten} already existed)`
      )
    }

    console.log('\n✅ Backfill complete\n')
  } catch (err) {
    console.error('\n❌ Backfill failed:', err)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
