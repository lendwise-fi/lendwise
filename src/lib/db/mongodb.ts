import { attachDatabasePool } from '@vercel/functions'
import { Db, MongoClient, MongoClientOptions } from 'mongodb'

/**
 * Singleton MongoDB client.
 * Reuses the same connection across the application lifetime.
 * Especially important in Next.js development mode where hot reloading can create multiple connections.
 */

const uri = process.env.MONGODB_URI
const options: MongoClientOptions = {
  appName: 'optimizer',
  maxIdleTimeMS: 5000,
  // tls: true,
  // connectTimeoutMS: 10000,
  // socketTimeoutMS: 45000,
  // serverApi: {
  //   version: ServerApiVersion.v1,
  //   strict: false,
  //   deprecationErrors: false,
  // },
}

let client: MongoClient
let clientPromise: Promise<MongoClient>

if (!uri) {
  throw new Error('Please add your Mongo URI to .env')
}

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

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise

/**
 * Convenience function to get the database instance.
 */
export async function getDb(dbName?: string): Promise<Db> {
  const client = await clientPromise
  attachDatabasePool(client)
  return client.db(dbName)
}
