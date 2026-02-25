import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function checkIndexes() {
  try {
    const { getDb } = await import('../src/lib/db/mongodb')
    const db = await getDb()

    const collections = [
      'spot',
      'hourly',
      'daily',
      'weekly',
      'monthly',
      'yearly',
    ]

    for (const collectionName of collections) {
      console.log(`\n--- Indexes for ${collectionName} ---`)
      try {
        const collection = db.collection(collectionName)
        const indexes = await collection.indexes()
        console.log(JSON.stringify(indexes, null, 2))
      } catch (error) {
        console.log(
          `Collection ${collectionName} might not exist or failed to fetch indexes:`,
          error instanceof Error ? error.message : error
        )
      }
    }

    process.exit(0)
  } catch (error) {
    console.error('Failed to check indexes:', error)
    process.exit(1)
  }
}

checkIndexes()
