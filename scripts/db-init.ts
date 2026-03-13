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
  MONGODB_COLLECTION_SPOT,
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_POOLS,
} from '@/lib/db/mongodb'

// ─── Config ───────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB_NAME  = process.env.MONGODB_DB_NAME

if (!MONGODB_URI) throw new Error('Missing env: MONGODB_URI')
if (!MONGODB_DB_NAME)  throw new Error('Missing env: MONGODB_DB_NAME')

/** TTL for apy.spot documents — 90 days in seconds */
const SPOT_TTL_SECONDS = 90 * 24 * 60 * 60

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const collections = await db
    .listCollections({ name }, { nameOnly: true })
    .toArray()
  return collections.length > 0
}

// ─── Collection setup ─────────────────────────────────────────────────────────

/**
 * apy.spot — MongoDB Time Series collection.
 *
 * Configuration:
 *   timeField:   "timestamp" — 10-minute slot boundary (UTC)
 *   metaField:   "meta"      — bucketing key (poolId, kind, protocol, chain, asset)
 *   granularity: "minutes"   — optimizes bucket size for 10-min ingestion
 *   TTL:         90 days     — spot data beyond 90 days is dropped automatically
 */
async function createSpotCollection(db: Db): Promise<void> {
  if (await collectionExists(db, MONGODB_COLLECTION_SPOT)) {
    console.log(`  ⚠️  ${MONGODB_COLLECTION_SPOT} already exists — skipping creation`)
  } else {
    await db.createCollection(MONGODB_COLLECTION_SPOT, {
      timeseries: {
        timeField:   'timestamp',
        metaField:   'meta',
        granularity: 'minutes',
      },
      expireAfterSeconds: SPOT_TTL_SECONDS,
    })
    console.log(`  ✅ Created Time Series collection: ${MONGODB_COLLECTION_SPOT}`)
  }

  const col = db.collection(MONGODB_COLLECTION_SPOT)

  // Latest spot for a single pool — primary UI query
  await col.createIndex(
    { 'meta.poolId': 1, timestamp: -1 },
    { name: 'spot_poolId_timestamp' }
  )

  // Cross-pool query — "all lend USDC pools on Ethereum over last 7 days"
  await col.createIndex(
    { 'meta.asset.symbol': 1, 'meta.kind': 1, 'meta.chain.id': 1, timestamp: -1 },
    { name: 'spot_asset_kind_chain_timestamp' }
  )

  // Daily job — aggregate all spots for a protocol in a time window
  await col.createIndex(
    { 'meta.protocol': 1, timestamp: -1 },
    { name: 'spot_protocol_timestamp' }
  )

  console.log(`  ✅ Indexes created on: ${MONGODB_COLLECTION_SPOT}`)
}

/**
 * apy.daily — Classic MongoDB collection.
 *
 * Not a Time Series — requires upserts for idempotency (daily job reruns).
 */
async function createDailyCollection(db: Db): Promise<void> {
  if (await collectionExists(db, MONGODB_COLLECTION_DAILY)) {
    console.log(`  ⚠️  ${MONGODB_COLLECTION_DAILY} already exists — skipping creation`)
  } else {
    await db.createCollection(MONGODB_COLLECTION_DAILY)
    console.log(`  ✅ Created collection: ${MONGODB_COLLECTION_DAILY}`)
  }

  const col = db.collection(MONGODB_COLLECTION_DAILY)

  // Primary upsert key — unique constraint enforces one doc per (poolId, date)
  await col.createIndex(
    { poolId: 1, date: -1 },
    { unique: true, name: 'daily_poolId_date' }
  )

  // UI query — "all lend USDC pools on Ethereum over last 90 days"
  await col.createIndex(
    { 'meta.asset.symbol': 1, 'meta.kind': 1, 'meta.chain.id': 1, date: -1 },
    { name: 'daily_asset_kind_chain_date' }
  )

  // Optimization engine — cross-protocol comparison for a given asset
  await col.createIndex(
    { 'meta.protocol': 1, 'meta.asset.symbol': 1, date: -1 },
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
 * pools — Static registry of all lend/borrow pools.
 *
 * Classic collection. _id is the deterministic slug.
 */
async function createPoolsCollection(db: Db): Promise<void> {
  if (await collectionExists(db, MONGODB_COLLECTION_POOLS)) {
    console.log(`  ⚠️  ${MONGODB_COLLECTION_POOLS} already exists — skipping creation`)
  } else {
    await db.createCollection(MONGODB_COLLECTION_POOLS)
    console.log(`  ✅ Created collection: ${MONGODB_COLLECTION_POOLS}`)
  }

  const col = db.collection(MONGODB_COLLECTION_POOLS)

  // Protocol + asset + kind lookup — primary filter in UI
  await col.createIndex(
    { 'protocol.name': 1, 'asset.symbol': 1, kind: 1 },
    { name: 'pools_protocol_asset_kind' }
  )

  // Native ID uniqueness — prevents duplicate pools from the same protocol
  // kind is required — lend and borrow share the same native.id on AAVE
  await col.createIndex(
    { 'native.id': 1, 'protocol.name': 1, kind: 1 },
    { unique: true, name: 'pools_native_id_protocol' }
  )

  // Active pool filter by chain
  await col.createIndex(
    { active: 1, 'protocol.chain.id': 1 },
    { name: 'pools_active_chain' }
  )

  console.log(`  ✅ Indexes created on: ${MONGODB_COLLECTION_POOLS}`)
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

    console.log(`📦 ${MONGODB_COLLECTION_SPOT}`)
    await createSpotCollection(db)

    console.log(`\n📦 ${MONGODB_COLLECTION_DAILY}`)
    await createDailyCollection(db)

    console.log(`\n📦 ${MONGODB_COLLECTION_POOLS}`)
    await createPoolsCollection(db)

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