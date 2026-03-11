import { attachDatabasePool } from '@vercel/functions'
import { Db, MongoClient, MongoClientOptions, ServerApiVersion } from 'mongodb'

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"')
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

let client: MongoClient
let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>
  }

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options)
    globalWithMongo._mongoClientPromise = client.connect()
  }
  clientPromise = globalWithMongo._mongoClientPromise
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

export const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'apy'

/** One collection per timeframe. Spot = time-series (QStash ~5min); others = classic (aggregated). */
export const MONGODB_COLLECTION_SPOT =
  process.env.MONGODB_COLLECTION_SPOT || 'spot'
export const MONGODB_COLLECTION_HOURLY =
  process.env.MONGODB_COLLECTION_HOURLY || 'hourly'
export const MONGODB_COLLECTION_DAILY =
  process.env.MONGODB_COLLECTION_DAILY || 'daily'
export const MONGODB_COLLECTION_WEEKLY =
  process.env.MONGODB_COLLECTION_WEEKLY || 'weekly'
export const MONGODB_COLLECTION_MONTHLY =
  process.env.MONGODB_COLLECTION_MONTHLY || 'monthly'
export const MONGODB_COLLECTION_YEARLY =
  process.env.MONGODB_COLLECTION_YEARLY || 'yearly'

/**
 * Convenience function to get the database instance.
 * Automatically attaches the database pool for Vercel functions performance.
 */
export async function getDb(dbName: string = MONGODB_DB_NAME): Promise<Db> {
  const client = await clientPromise
  attachDatabasePool(client)
  return client.db(dbName)
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise
