import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function setupIndexes() {
  try {
    const {
      getDb,
      MONGODB_COLLECTION_HOURLY,
      MONGODB_COLLECTION_DAILY,
      MONGODB_COLLECTION_WEEKLY,
      MONGODB_COLLECTION_MONTHLY,
      MONGODB_COLLECTION_YEARLY,
    } = await import('../src/lib/db/mongodb')

    const db = await getDb()

    const collections = [
      MONGODB_COLLECTION_HOURLY,
      MONGODB_COLLECTION_DAILY,
      MONGODB_COLLECTION_WEEKLY,
      MONGODB_COLLECTION_MONTHLY,
      MONGODB_COLLECTION_YEARLY,
    ]

    const indexSpec = {
      timestamp: 1,
      'metadata.protocol': 1,
      'metadata.chain.name': 1,
      'metadata.market.name': 1,
      'metadata.vault.symbol': 1,
    }

    const indexOptions = { unique: true, name: 'unique_snapshot_record' }

    for (const collectionName of collections) {
      console.log(
        `Setting up unique index for collection: ${collectionName} ...`
      )
      try {
        const collection = db.collection(collectionName)
        const result = await collection.createIndex(
          indexSpec as any,
          indexOptions
        )
        console.log(`Successfully created index: ${result}`)
      } catch (error) {
        console.error(
          `Failed to create index for ${collectionName}:`,
          error instanceof Error ? error.message : error
        )
      }
    }

    console.log('\nAll indexes set up successfully.')
    process.exit(0)
  } catch (error) {
    console.error('Failed to setup indexes:', error)
    process.exit(1)
  }
}

setupIndexes()
