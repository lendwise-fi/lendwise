/**
 * @file scripts/db-init.ts
 * MongoDB initialization script.
 *
 * Creates all collections with the correct configuration and indexes.
 * Safe to run multiple times — uses createCollection with checkExists
 * and createIndex which is idempotent by default.
 *
 * Usage:
 *   npx tsx scripts/db-init.ts
 *   bun run scripts/db-init.ts
 */
import { Db, MongoClient } from 'mongodb'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_PRODUCTS,
  MONGODB_DB_NAME,
  MONGODB_URI,
} from '@/lib/db/mongodb'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const collections = await db
    .listCollections({ name }, { nameOnly: true })
    .toArray()
  return collections.length > 0
}

// ─── Collection setup ─────────────────────────────────────────────────────────

/**
 * apy.hourly — Classic MongoDB collection.
 *
 * Stores rolling average APY across all 10-min slots within each hour.
 * Upserted every 10 minutes — no Time Series constraints.
 * TTL: 180 days — longer retention than the old apy.spot (90 days).
 */
async function createHourlyCollection(db: Db): Promise<void> {
  if (await collectionExists(db, MONGODB_COLLECTION_HOURLY)) {
    console.log(
      `  ⚠️  ${MONGODB_COLLECTION_HOURLY} already exists — skipping creation`
    )
  } else {
    await db.createCollection(MONGODB_COLLECTION_HOURLY)
    console.log(`  ✅ Created collection: ${MONGODB_COLLECTION_HOURLY}`)
  }

  const col = db.collection(MONGODB_COLLECTION_HOURLY)

  // Primary upsert key — unique constraint enforces one doc per (productId, hour)
  await col.createIndex(
    { 'meta.productId': 1, hour: -1 },
    { unique: true, name: 'hourly_productId_hour' }
  )

  // Cross-products query — "all supply USDC products on Ethereum over last 7 days"
  await col.createIndex(
    { 'meta.asset': 1, 'meta.kind': 1, 'meta.chainId': 1, hour: -1 },
    { name: 'hourly_asset_kind_chain_hour' }
  )

  // Daily job — aggregate all hourly docs for a protocol in a time window
  await col.createIndex(
    { 'meta.protocol': 1, hour: -1 },
    { name: 'hourly_protocol_hour' }
  )

  // TTL — 180 days
  await col.createIndex(
    { hour: 1 },
    { expireAfterSeconds: 180 * 24 * 60 * 60, name: 'hourly_ttl' }
  )

  console.log(`  ✅ Indexes created on: ${MONGODB_COLLECTION_HOURLY}`)
}

/**
 * apy.daily — Classic MongoDB collection.
 *
 * Not a Time Series — requires upserts for idempotency (daily job reruns).
 */
async function createDailyCollection(db: Db): Promise<void> {
  if (await collectionExists(db, MONGODB_COLLECTION_DAILY)) {
    console.log(
      `  ⚠️  ${MONGODB_COLLECTION_DAILY} already exists — skipping creation`
    )
  } else {
    await db.createCollection(MONGODB_COLLECTION_DAILY)
    console.log(`  ✅ Created collection: ${MONGODB_COLLECTION_DAILY}`)
  }

  const col = db.collection(MONGODB_COLLECTION_DAILY)

  // Primary upsert key — unique constraint enforces one doc per (productId, date)
  await col.createIndex(
    { 'meta.productId': 1, date: -1 },
    { unique: true, name: 'daily_productId_date' }
  )

  // UI query — "all supply USDC products on Ethereum over last 90 days"
  await col.createIndex(
    { 'meta.asset': 1, 'meta.kind': 1, 'meta.chainId': 1, date: -1 },
    { name: 'daily_asset_kind_chain_date' }
  )

  // Optimization engine — cross-protocol comparison for a given asset
  await col.createIndex(
    { 'meta.protocol': 1, 'meta.asset': 1, date: -1 },
    { name: 'daily_protocol_asset_date' }
  )

  // Filter unreliable daily documents
  await col.createIndex(
    { 'quality.status': 1, date: -1 },
    { name: 'daily_quality_status_date' }
  )

  console.log(`  ✅ Indexes created on: ${MONGODB_COLLECTION_DAILY}`)
}

/**
 * products — Static registry of all supply/borrow products.
 *
 * Classic collection. _id is the deterministic slug.
 */
async function createProductsCollection(db: Db): Promise<void> {
  if (await collectionExists(db, MONGODB_COLLECTION_PRODUCTS)) {
    console.log(
      `  ⚠️  ${MONGODB_COLLECTION_PRODUCTS} already exists — skipping creation`
    )
  } else {
    await db.createCollection(MONGODB_COLLECTION_PRODUCTS)
    console.log(`  ✅ Created collection: ${MONGODB_COLLECTION_PRODUCTS}`)
  }

  const col = db.collection(MONGODB_COLLECTION_PRODUCTS)

  // Provider + asset + kind lookup — primary filter in UI
  await col.createIndex(
    { 'protocol.provider': 1, 'asset.symbol': 1, kind: 1 },
    { name: 'products_provider_asset_kind' }
  )

  // Protocol name + asset + kind — supports deployment-level filtering (e.g. AaveV3Ethereum)
  await col.createIndex(
    { 'protocol.name': 1, 'asset.symbol': 1, kind: 1 },
    { name: 'products_name_asset_kind' }
  )

  // Active product filter by chain
  await col.createIndex(
    { active: 1, 'protocol.chain.id': 1 },
    { name: 'products_active_chain' }
  )

  console.log(`  ✅ Indexes created on: ${MONGODB_COLLECTION_PRODUCTS}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🚀 Kompo — MongoDB initialization\n')
  console.log(`  Database: ${MONGODB_DB_NAME}`)
  console.log(`  URI:      ${MONGODB_URI!.replace(/:\/\/.*@/, '://***@')}\n`)

  const client = new MongoClient(MONGODB_URI!)

  try {
    await client.connect()
    const db = client.db(MONGODB_DB_NAME)

    console.log(`📦 ${MONGODB_COLLECTION_HOURLY}`)
    await createHourlyCollection(db)

    console.log(`\n📦 ${MONGODB_COLLECTION_DAILY}`)
    await createDailyCollection(db)

    console.log(`\n📦 ${MONGODB_COLLECTION_PRODUCTS}`)
    await createProductsCollection(db)

    console.log('\n✅ Initialization complete\n')
    process.exit(0)
  } catch (err) {
    console.error('\n❌ Initialization failed:', err)
    await client.close()
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()
