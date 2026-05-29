/**
 * @file scripts/apy-daily-migrate-ids.ts
 * Migrate apy.daily documents from ObjectId _id to string _id.
 *
 * Target format: "{productId}:{YYYY-MM-DD}"
 * Matches the apy.hourly convention and enables idempotent primary-key upserts.
 *
 * Since _id is immutable, migration = insert new doc with string _id + delete old.
 * Documents that already have a string _id are left untouched (idempotent).
 *
 * Usage:
 *   pnpm apy:daily-migrate-ids
 *   pnpm apy:daily-migrate-ids -- --dry-run
 *   pnpm apy:daily-migrate-ids -- --db-name yieldoptimizer_test
 */
import { MongoClient, ObjectId } from 'mongodb'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_DB_NAME,
  MONGODB_URI,
} from '@/lib/db/mongodb'

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  return {
    dbName: get('--db-name') ?? MONGODB_DB_NAME,
    dryRun: args.includes('--dry-run'),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDailyId(productId: string, date: Date): string {
  return `${productId}:${date.toISOString().slice(0, 10)}`
}

// ─── Migration ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 200

async function main(): Promise<void> {
  const { dbName, dryRun } = parseArgs()
  const log = console.log

  log('\n🔄 apy.daily _id Migration (ObjectId → string)\n')
  log(`  Database: ${dbName}`)
  log(`  Dry run:  ${dryRun}\n`)

  const client = new MongoClient(MONGODB_URI!)

  try {
    await client.connect()
    const col = client.db(dbName).collection(MONGODB_COLLECTION_DAILY!)

    // Only target docs with ObjectId _id
    const filter = { _id: { $type: 'objectId' } } as Parameters<
      typeof col.find
    >[0]
    const total = await col.countDocuments(filter)

    log(`  Found ${total} documents with ObjectId _id`)
    if (total === 0) {
      log('\n✅ Nothing to migrate — all _id values are already strings.\n')
      return
    }

    if (dryRun) {
      // Show a sample
      const sample = await col.findOne(filter)
      if (sample) {
        const sid = buildDailyId(
          sample.productId as string,
          sample.date as Date
        )
        log('\n  Sample:')
        log(`    old _id: ${sample._id} (ObjectId)`)
        log(`    new _id: ${sid}`)
        log(`    productId: ${sample.productId}`)
      }
      log(`\n🔒 Dry run — ${total} documents would be migrated\n`)
      return
    }

    let migrated = 0
    let skipped = 0
    const cursor = col.find(filter).batchSize(BATCH_SIZE)
    const batch: Record<string, unknown>[] = []

    async function flush() {
      if (batch.length === 0) return

      const newDocs = batch.map((doc) => ({
        ...doc,
        _id: buildDailyId(doc.productId as string, doc.date as Date),
      }))
      const oldIds = batch.map((doc) => doc._id as ObjectId)

      // Insert new docs — ignore duplicate key (idempotent re-run)
      try {
        await col.insertMany(
          newDocs as unknown as Parameters<typeof col.insertMany>[0],
          {
            ordered: false,
          }
        )
      } catch (err: unknown) {
        const e = err as { code?: number; insertedCount?: number }
        if (e?.code !== 11000) throw err
        skipped += batch.length - (e.insertedCount ?? 0)
      }

      const del = await col.deleteMany({
        _id: { $in: oldIds },
      } as unknown as Parameters<typeof col.deleteMany>[0])
      migrated += del.deletedCount
      batch.length = 0
    }

    for await (const doc of cursor) {
      batch.push(doc as Record<string, unknown>)
      if (batch.length >= BATCH_SIZE) await flush()
    }
    await flush()

    log(
      `\n✅ Done — ${migrated} migrated, ${skipped} skipped (already existed)\n`
    )
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
