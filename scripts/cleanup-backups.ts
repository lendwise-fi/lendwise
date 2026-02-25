import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function cleanup() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not found')

  const client = new MongoClient(uri)

  try {
    await client.connect()
    const { MONGODB_DB_NAME } = await import('../src/lib/db/mongodb')
    const db = client.db(MONGODB_DB_NAME)

    const collections = await db.listCollections().toArray()
    const backups = collections.filter((c) =>
      c.name.endsWith('_backup_standard')
    )

    for (const b of backups) {
      console.log(`Dropping backup collection: ${b.name}`)
      await db.collection(b.name).drop()
    }

    console.log('Cleanup complete.')
    process.exit(0)
  } catch (error) {
    console.error('Cleanup failed:', error)
    process.exit(1)
  }
}

cleanup()
