import { attachDatabasePool } from '@vercel/functions'
import type { Collection, Document } from 'mongodb'
import { Db, MongoClient, MongoClientOptions, ServerApiVersion } from 'mongodb'

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"')
}
if (!process.env.MONGODB_DB_NAME) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_DB_NAME"')
}
if (!process.env.MONGODB_COLLECTION_PRODUCTS) {
  throw new Error(
    'Invalid/Missing environment variable: "MONGODB_COLLECTION_PRODUCTS"'
  )
}
if (!process.env.MONGODB_COLLECTION_HOURLY) {
  throw new Error(
    'Invalid/Missing environment variable: "MONGODB_COLLECTION_HOURLY"'
  )
}
if (!process.env.MONGODB_COLLECTION_DAILY) {
  throw new Error(
    'Invalid/Missing environment variable: "MONGODB_COLLECTION_DAILY"'
  )
}

const uri = process.env.MONGODB_URI
const options: MongoClientOptions = {
  appName: 'optimizer',
  maxIdleTimeMS: 5000,
  compressors: ['zstd', 'zlib', 'snappy'],
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
}

let clientPromise: Promise<MongoClient>

async function initClient(): Promise<MongoClient> {
  const client = new MongoClient(uri, options)
  await client.connect()
  attachDatabasePool(client)
  return client
}

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>
  }

  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = initClient()
  }
  clientPromise = globalWithMongo._mongoClientPromise
} else {
  // In production mode, it's best to not use a global variable.
  clientPromise = initClient()
}

export const MONGODB_URI = process.env.MONGODB_URI
export const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME
export const MONGODB_COLLECTION_PRODUCTS =
  process.env.MONGODB_COLLECTION_PRODUCTS
export const MONGODB_COLLECTION_HOURLY = process.env.MONGODB_COLLECTION_HOURLY
export const MONGODB_COLLECTION_DAILY = process.env.MONGODB_COLLECTION_DAILY

/**
 * Unique index used by $merge in APY aggregation pipelines (hourly, daily, etc.).
 * Must match the `on` array in the $merge stage.
 */
export const APY_MERGE_INDEX_SPEC = {
  kind: 1 as const,
  timestamp: 1 as const,
  'metadata.protocol.name': 1 as const,
  'metadata.chain.name': 1 as const,
  loanAssetSymbol: 1 as const,
}

/**
 * Ensures the target collection has a unique index on the APY merge key.
 * Call before running an aggregation that uses $merge into this collection.
 */
export async function ensureApyMergeIndex<T extends Document = Document>(
  collection: Collection<T>
): Promise<void> {
  const indexName = 'apy_merge_key_unique'
  const exists = await collection.indexExists(indexName).catch(() => false)
  if (exists) return
  await collection.createIndex(APY_MERGE_INDEX_SPEC, {
    unique: true,
    name: indexName,
  })
}

/**
 * Convenience function to get the database instance.
 * Automatically attaches the database pool for Vercel functions performance.
 */
export async function getDb(dbName: string = MONGODB_DB_NAME): Promise<Db> {
  const client = await clientPromise
  return client.db(dbName)
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise
