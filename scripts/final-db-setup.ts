import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function finalAdjustments() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not found')

  const client = new MongoClient(uri)

  try {
    await client.connect()
    const {
      MONGODB_DB_NAME,
      MONGODB_COLLECTION_SPOT,
      MONGODB_COLLECTION_HOURLY,
      MONGODB_COLLECTION_DAILY,
      MONGODB_COLLECTION_WEEKLY,
      MONGODB_COLLECTION_MONTHLY,
      MONGODB_COLLECTION_YEARLY,
    } = await import('../src/lib/db/mongodb')

    const db = client.db(MONGODB_DB_NAME)

    // Aggregation collections to revert to standard
    const standardCollections = [
      MONGODB_COLLECTION_HOURLY,
      MONGODB_COLLECTION_DAILY,
      MONGODB_COLLECTION_WEEKLY,
      MONGODB_COLLECTION_MONTHLY,
      MONGODB_COLLECTION_YEARLY,
    ]

    for (const name of standardCollections) {
      console.log(`\n--- Reverting ${name} to Standard Collection ---`)

      const colInfo = await db.command({ listCollections: 1, filter: { name } })
      const existing = colInfo.cursor.firstBatch[0]

      if (existing && !existing.options?.timeseries) {
        console.log(`Collection ${name} is already a standard collection.`)
      } else {
        if (existing) {
          console.log(`Dropping Time Series collection ${name}...`)
          await db.collection(name).drop()
        }
        console.log(`Creating standard collection: ${name}...`)
        await db.createCollection(name)
      }

      console.log(`Setting up UNIQUE index for ${name}...`)
      await db.collection(name).createIndex(
        {
          timestamp: 1,
          'metadata.protocol': 1,
          'metadata.chain.name': 1,
          'metadata.market.name': 1,
          'metadata.vault.symbol': 1,
        },
        { unique: true, name: 'unique_record' }
      )
    }

    console.log(
      '\nFinal adjustments complete. "spot" is TS, others are Standard with Unique Indexes.'
    )
    process.exit(0)
  } catch (error) {
    console.error('Adjustment failed:', error)
    process.exit(1)
  }
}

finalAdjustments()
