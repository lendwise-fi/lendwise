/**
 * @file scripts/products-clean-inactive.ts
 * Remove inactive products and all their APY history.
 *
 * Finds all documents in `products` where active=false, then deletes:
 *   - the product documents themselves
 *   - all matching documents in apy.daily   (where productId matches)
 *   - all matching documents in apy.hourly  (where productId matches)
 *
 * Usage:
 *   pnpm products:clean-inactive
 *   pnpm products:clean-inactive -- --dry-run
 *   pnpm products:clean-inactive -- --db-name yieldoptimizer_test
 */
import { MongoClient } from 'mongodb'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_PRODUCTS,
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
  const has = (flag: string) => args.includes(flag)
  return {
    dbName: get('--db-name') ?? MONGODB_DB_NAME,
    dryRun: has('--dry-run'),
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dbName, dryRun } = parseArgs()
  const log = console.log

  log('\n🧹 Inactive Products Cleanup\n')
  log(`  Database: ${dbName}`)
  log(`  Dry run:  ${dryRun}\n`)

  const client = new MongoClient(MONGODB_URI!)

  try {
    await client.connect()
    const db = client.db(dbName)

    const products = db.collection<{ _id: string; active: boolean }>(
      MONGODB_COLLECTION_PRODUCTS!
    )
    const daily = db.collection(MONGODB_COLLECTION_DAILY!)
    const hourly = db.collection(MONGODB_COLLECTION_HOURLY!)

    // ── 1. Find inactive products ────────────────────────────────────────────

    const inactiveDocs = await products
      .find({ active: false }, { projection: { _id: 1 } })
      .toArray()

    if (inactiveDocs.length === 0) {
      log('✅ No inactive products found.\n')
      return
    }

    log(`Found ${inactiveDocs.length} inactive product(s):\n`)
    for (const doc of inactiveDocs) {
      log(`  ${doc._id}`)
    }
    log()

    // In the products collection, _id IS the productId
    // (e.g. "aave:v3:ethereum:reserve:0x...:supply")
    const productIds = inactiveDocs.map((d) => String(d._id))

    // ── 2. Count APY documents to be removed ────────────────────────────────

    const [dailyCount, hourlyCount] = await Promise.all([
      daily.countDocuments({ productId: { $in: productIds } }),
      hourly.countDocuments({ productId: { $in: productIds } }),
    ])

    log(`Documents to delete:`)
    log(`  products:    ${inactiveDocs.length}`)
    log(`  apy.daily:   ${dailyCount}`)
    log(`  apy.hourly:  ${hourlyCount}`)

    if (dryRun) {
      log('\n🔒 Dry run — no data deleted\n')

      if (inactiveDocs.length > 0) {
        log('  Sample product:')
        log(`    _id: ${inactiveDocs[0]._id}`)
      }

      log('\n✅ Dry run complete\n')
      return
    }

    // ── 3. Delete APY history first, then products ───────────────────────────

    log('\n🗑️  Deleting...')

    const [dailyResult, hourlyResult] = await Promise.all([
      daily.deleteMany({ productId: { $in: productIds } }),
      hourly.deleteMany({ productId: { $in: productIds } }),
    ])

    log(`  apy.daily:   ${dailyResult.deletedCount} deleted`)
    log(`  apy.hourly:  ${hourlyResult.deletedCount} deleted`)

    const productsResult = await products.deleteMany({
      _id: { $in: productIds },
    })

    log(`  products:    ${productsResult.deletedCount} deleted`)

    log('\n✅ Cleanup complete\n')
  } catch (err) {
    console.error('\n❌ Cleanup failed:', err)
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
