/**
 * @file scripts/apy-daily-fix-quality.ts
 * Normalize quality fields in apy.daily documents.
 *
 * Two migration passes, applied in order:
 *
 * Pass 1 — root-level quality fields (buggy upsertDailyDoc)
 *   Affected: documents where status/actualCount/completeness/computedAt/expectedCount
 *   are at root level instead of nested under quality.
 *   Fix: move them into quality.* via aggregation pipeline, then $unset root copies.
 *
 * Pass 2 — backfill format normalization (buildDailyDoc used SlotQuality schema)
 *   Affected: documents where quality.count exists (old backfill format).
 *   Fix: rename count→actualCount, compute completeness, set computedAt=date,
 *   set revision=0 if absent, remove quality.firstSlot and quality.lastSlot.
 *
 * Usage:
 *   pnpm apy:fix-quality
 *   pnpm apy:fix-quality -- --dry-run
 *   pnpm apy:fix-quality -- --db-name yieldoptimizer_test
 */
import { MongoClient } from 'mongodb'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_DB_NAME,
  MONGODB_URI,
} from '@/lib/db/mongodb'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  const has = (flag: string) => args.includes(flag)
  return {
    dbName: get('--db-name') ?? MONGODB_DB_NAME,
    dryRun: has('--dry-run'),
  }
}

async function main(): Promise<void> {
  const { dbName, dryRun } = parseArgs()
  const log = console.log

  log('\n🔧 apy.daily quality field migration\n')
  log(`  Database: ${dbName}`)
  log(`  Dry run:  ${dryRun}\n`)

  const client = new MongoClient(MONGODB_URI!)
  try {
    await client.connect()
    const collection = client.db(dbName).collection(MONGODB_COLLECTION_DAILY!)

    // ── Pass 1: root-level quality fields → quality.* ─────────────────────────

    const pass1Count = await collection.countDocuments({
      status: { $exists: true },
    })
    log(`Pass 1 — root-level quality fields: ${pass1Count} documents`)

    if (dryRun && pass1Count > 0) {
      const sample = await collection.findOne({ status: { $exists: true } })
      log('  Sample before:')
      log(`    status (root): ${sample!.status}`)
      log(`    actualCount:   ${sample!.actualCount}`)
      log(`    completeness:  ${sample!.completeness}`)
      log(`    quality:       ${JSON.stringify(sample!.quality)}`)
    }

    // ── Pass 2: backfill format → DailyQuality ────────────────────────────────

    const pass2Count = await collection.countDocuments({
      'quality.count': { $exists: true },
    })
    log(`Pass 2 — backfill format (quality.count): ${pass2Count} documents`)

    if (dryRun && pass2Count > 0) {
      const sample = await collection.findOne({
        'quality.count': { $exists: true },
      })
      log('  Sample before:')
      log(`    quality: ${JSON.stringify(sample!.quality)}`)
    }

    if (pass1Count === 0 && pass2Count === 0) {
      log('\n✅ Nothing to migrate.\n')
      return
    }

    if (dryRun) {
      log('\n🔒 Dry run — no data written\n')
      return
    }

    // Pass 1
    if (pass1Count > 0) {
      const r1 = await collection.updateMany({ status: { $exists: true } }, [
        {
          $set: {
            'quality.status': '$status',
            'quality.actualCount': '$actualCount',
            'quality.expectedCount': '$expectedCount',
            'quality.completeness': '$completeness',
            'quality.computedAt': '$computedAt',
          },
        },
        {
          $unset: [
            'status',
            'actualCount',
            'expectedCount',
            'completeness',
            'computedAt',
          ],
        },
      ])
      log(`  ✅ Pass 1: ${r1.modifiedCount} documents migrated`)
    }

    // Pass 2 — run after pass 1 so that backfill+cron docs already have
    // quality.actualCount set and we only clean up the old fields.
    if (pass2Count > 0) {
      const r2 = await collection.updateMany(
        { 'quality.count': { $exists: true } },
        [
          {
            $set: {
              // Preserve existing actualCount if pass 1 already set it
              'quality.actualCount': {
                $ifNull: ['$quality.actualCount', '$quality.count'],
              },
              'quality.completeness': {
                $ifNull: [
                  '$quality.completeness',
                  {
                    $min: [
                      { $divide: ['$quality.count', '$quality.expectedCount'] },
                      1,
                    ],
                  },
                ],
              },
              'quality.computedAt': {
                $ifNull: ['$quality.computedAt', '$date'],
              },
              'quality.revision': {
                $ifNull: ['$quality.revision', 0],
              },
            },
          },
          {
            $unset: ['quality.count', 'quality.firstSlot', 'quality.lastSlot'],
          },
        ]
      )
      log(`  ✅ Pass 2: ${r2.modifiedCount} documents normalized`)
    }

    log('\n✅ Migration complete\n')
  } catch (err) {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Unexpected error:', err)
    process.exit(1)
  })
