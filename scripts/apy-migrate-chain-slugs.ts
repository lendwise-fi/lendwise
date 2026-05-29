/**
 * @file scripts/apy-migrate-chain-slugs.ts
 * Migrate documents whose productId / _id contain a numeric chainId (e.g. 59144, 43114, 56)
 * to use the canonical slug (linea, avalanche, bsc).
 *
 * Affected collections: apy.daily, apy.hourly, products
 *
 * For apy.daily and apy.hourly the _id encodes the productId, so migration
 * requires delete + insert (MongoDB does not allow updating _id).
 * For products the _id uses market-name format — only productId needs updating.
 *
 * Usage:
 *   pnpm apy:migrate-slugs
 *   pnpm apy:migrate-slugs -- --dry-run
 *   pnpm apy:migrate-slugs -- --db-name yieldoptimizer_test
 *   pnpm apy:migrate-slugs -- --collection daily   # only apy.daily
 */
import { MongoClient } from 'mongodb'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_PRODUCTS,
  MONGODB_DB_NAME,
  MONGODB_URI,
} from '@/lib/db/mongodb'
import { CHAIN_SLUG_MAP } from '@/lib/protocols/chain-slugs'

// ─── Derived from CHAIN_SLUG_MAP — no hardcoded IDs ──────────────────────────

const SLUG_BY_ID = CHAIN_SLUG_MAP as Record<number, string>

// Matches any registered numeric chain ID between colons in a productId
// e.g. ":59144:" or ":43114:" — rebuilt automatically when chain-slugs.ts changes
const registeredIds = Object.keys(CHAIN_SLUG_MAP).join('|')
const NUMERIC_CHAIN_REGEX = new RegExp(`:(?:${registeredIds}):`)

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
    collection: get('--collection'), // 'daily' | 'hourly' | 'products' | undefined (all)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function replaceNumericChainIds(value: string): string {
  return value.replace(/:(\d+):/g, (match, id) => {
    const slug = SLUG_BY_ID[Number(id)]
    return slug ? `:${slug}:` : match
  })
}

// ─── Migration for apy.daily / apy.hourly (both _id and productId change) ────

async function migrateApyCollection(
  client: MongoClient,
  dbName: string,
  collectionName: string,
  dryRun: boolean,
  log: (msg: string) => void
): Promise<{ found: number; migrated: number }> {
  const collection = client.db(dbName).collection(collectionName)

  const docs = await collection
    .find({ productId: NUMERIC_CHAIN_REGEX })
    .toArray()

  log(`  [${collectionName}] Found ${docs.length} documents to migrate`)

  if (docs.length === 0 || dryRun) {
    if (dryRun && docs.length > 0) {
      const sample = docs[0]
      log(`  [${collectionName}] Sample:`)
      log(`    _id (before):        ${sample._id}`)
      log(
        `    _id (after):         ${replaceNumericChainIds(String(sample._id))}`
      )
      log(`    productId (before):  ${sample.productId}`)
      log(
        `    productId (after):   ${replaceNumericChainIds(String(sample.productId))}`
      )
    }
    return { found: docs.length, migrated: 0 }
  }

  let migrated = 0
  const batchSize = 200

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)

    // Build insert + delete pairs in a single session-less transaction workaround:
    // Insert all new docs first, then delete the old ones.
    // If insert fails (duplicate), we skip — means already migrated.
    const newDocs = batch.map((doc) => ({
      ...doc,
      _id: replaceNumericChainIds(String(doc._id)) as unknown as typeof doc._id,
      productId: replaceNumericChainIds(String(doc.productId)),
    }))

    // Insert new documents (ignore duplicates — idempotent)
    try {
      const insertResult = await collection.insertMany(newDocs, {
        ordered: false,
      })
      migrated += insertResult.insertedCount
    } catch (err: unknown) {
      // BulkWriteError: some docs may already exist — count the inserted ones
      if (err && typeof err === 'object' && 'insertedCount' in err) {
        migrated += (err as { insertedCount: number }).insertedCount
      } else {
        throw err
      }
    }

    // Delete old documents
    const oldIds = batch.map((doc) => doc._id)
    await collection.deleteMany({ _id: { $in: oldIds } })

    log(
      `  [${collectionName}] Batch ${Math.floor(i / batchSize) + 1}: migrated ${Math.min(batchSize, batch.length)} documents`
    )
  }

  return { found: docs.length, migrated }
}

// ─── Migration for products (_id also uses buildProductId format — delete+insert) ───

async function migrateProductsCollection(
  client: MongoClient,
  dbName: string,
  collectionName: string,
  dryRun: boolean,
  log: (msg: string) => void
): Promise<{ found: number; migrated: number }> {
  const collection = client.db(dbName).collection(collectionName)

  // products._id uses buildReserveProductId: "aave:v3:59144:reserve:0x...:supply"
  // Same format as apy collections — requires delete + insert to change _id
  const docs = await collection.find({ _id: NUMERIC_CHAIN_REGEX }).toArray()

  log(`  [${collectionName}] Found ${docs.length} documents to migrate`)

  if (docs.length === 0 || dryRun) {
    if (dryRun && docs.length > 0) {
      const sample = docs[0]
      log(`  [${collectionName}] Sample:`)
      log(`    _id (before):  ${sample._id}`)
      log(`    _id (after):   ${replaceNumericChainIds(String(sample._id))}`)
    }
    return { found: docs.length, migrated: 0 }
  }

  let migrated = 0
  const batchSize = 200

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)

    const newDocs = batch.map((doc) => ({
      ...doc,
      _id: replaceNumericChainIds(String(doc._id)) as unknown as typeof doc._id,
      productId: replaceNumericChainIds(String(doc.productId)),
    }))

    try {
      const insertResult = await collection.insertMany(newDocs, {
        ordered: false,
      })
      migrated += insertResult.insertedCount
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'insertedCount' in err) {
        migrated += (err as { insertedCount: number }).insertedCount
      } else {
        throw err
      }
    }

    const oldIds = batch.map((doc) => doc._id)
    await collection.deleteMany({ _id: { $in: oldIds } })

    log(
      `  [${collectionName}] Batch ${Math.floor(i / batchSize) + 1}: migrated ${Math.min(batchSize, batch.length)} documents`
    )
  }

  return { found: docs.length, migrated }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dbName, dryRun, collection } = parseArgs()
  const log = console.log

  log('\n🔄 Chain Slug Migration\n')
  log(`  Database:   ${dbName}`)
  log(`  Dry run:    ${dryRun}`)
  log(`  Collection: ${collection ?? 'all'}`)
  const mappingPreview = Object.entries(SLUG_BY_ID)
    .map(([k, v]) => `${k} → ${v}`)
    .join(', ')
  log(`\n  Chain map: ${mappingPreview}\n`)

  const client = new MongoClient(MONGODB_URI!)
  let totalFound = 0
  let totalMigrated = 0

  try {
    await client.connect()

    const runDaily = !collection || collection === 'daily'
    const runHourly = !collection || collection === 'hourly'
    const runProducts = !collection || collection === 'products'

    if (runDaily) {
      const r = await migrateApyCollection(
        client,
        dbName,
        MONGODB_COLLECTION_DAILY!,
        dryRun,
        log
      )
      totalFound += r.found
      totalMigrated += r.migrated
    }

    if (runHourly) {
      const r = await migrateApyCollection(
        client,
        dbName,
        MONGODB_COLLECTION_HOURLY!,
        dryRun,
        log
      )
      totalFound += r.found
      totalMigrated += r.migrated
    }

    if (runProducts) {
      const r = await migrateProductsCollection(
        client,
        dbName,
        MONGODB_COLLECTION_PRODUCTS!,
        dryRun,
        log
      )
      totalFound += r.found
      totalMigrated += r.migrated
    }

    log(`\n📈 Summary:`)
    log(`  Documents found:    ${totalFound}`)

    if (dryRun) {
      log(`\n🔒 Dry run — no data written`)
      log(`✅ Dry run complete\n`)
    } else {
      log(`  Documents migrated: ${totalMigrated}`)
      log(`\n✅ Migration complete\n`)
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
