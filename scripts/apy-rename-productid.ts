/**
 * @file scripts/apy-rename-productid.ts
 * Fix _id values in apy.hourly that contain old productId slugs.
 *
 * apy.hourly : _id = "{productId}:{YYYY-MM-DDTHH}" (string)
 *   → old format: "aave:v3:ethereumlido:..." must become "aave:v3:ethereum-lido:..."
 *   → _id is immutable, so migration = insert new doc + delete old
 *   → productId field is already correct — do not touch it
 *
 * apy.daily : _id = ObjectId (unrelated to productId) — nothing to do.
 *
 * Usage:
 *   pnpm apy:rename-productid
 *   pnpm apy:rename-productid -- --dry-run
 *   pnpm apy:rename-productid -- --db-name yieldoptimizer_test
 */
import { MongoClient } from 'mongodb'

import {
  MONGODB_COLLECTION_HOURLY,
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

// ─── Rename rules ─────────────────────────────────────────────────────────────

const RENAMES: [string, string][] = [
  ['aave:v3:ethereumlido:', 'aave:v3:ethereum-lido:'],
  ['aave:v3:ethereumetherfi:', 'aave:v3:ethereum-etherfi:'],
  ['aave:v3:ethereumhorizon:', 'aave:v3:ethereum-horizon:'],
]

function renameId(id: string): string {
  for (const [from, to] of RENAMES) {
    if (id.startsWith(from)) return to + id.slice(from.length)
  }
  return id
}

// ─── Migration ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 200

async function main(): Promise<void> {
  const { dbName, dryRun } = parseArgs()
  const log = console.log

  log('\n🔄 apy.hourly _id Rename Migration\n')
  log(`  Database: ${dbName}`)
  log(`  Dry run:  ${dryRun}\n`)

  const client = new MongoClient(MONGODB_URI!)

  try {
    await client.connect()
    const col = client
      .db(dbName)
      .collection<{ _id: string }>(MONGODB_COLLECTION_HOURLY!)

    let found = 0
    let renamed = 0

    for (const [from] of RENAMES) {
      // Match on _id directly — no secondary index needed, pure primary key scan
      const filter = {
        _id: new RegExp('^' + from.replace(/:/g, '\\:')),
      } as unknown as Parameters<typeof col.find>[0]
      const count = await col.countDocuments(filter)
      if (count === 0) continue

      log(`  ${count} docs with _id starting "${from}"`)
      found += count
      if (dryRun) continue

      const cursor = col.find(filter).batchSize(BATCH_SIZE)
      const batch: Record<string, unknown>[] = []

      async function flush() {
        if (batch.length === 0) return

        const newDocs = batch.map((doc) => ({
          ...doc,
          _id: renameId(doc._id as string),
        }))
        const oldIds = batch.map((doc) => doc._id as string)

        // Insert new docs (ignore duplicate key if already migrated)
        try {
          await col.insertMany(newDocs as unknown as { _id: string }[], {
            ordered: false,
          })
        } catch (err: unknown) {
          if ((err as { code?: number })?.code !== 11000) throw err
        }

        const del = await col.deleteMany({
          _id: { $in: oldIds },
        } as unknown as Parameters<typeof col.deleteMany>[0])
        renamed += del.deletedCount
        batch.length = 0
      }

      for await (const doc of cursor) {
        batch.push(doc as Record<string, unknown>)
        if (batch.length >= BATCH_SIZE) await flush()
      }
      await flush()

      log(`    → ${renamed} renamed`)
    }

    log()
    if (found === 0) {
      log('✅ Nothing to rename — apy.hourly _id values are up to date.\n')
    } else if (dryRun) {
      log(`🔒 Dry run — ${found} docs would be renamed\n`)
    } else {
      log(`✅ Done — ${renamed} / ${found} docs renamed\n`)
    }
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
