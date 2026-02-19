import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env file BEFORE importing the database module
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function testMongo() {
  console.log('Testing MongoDB connection...')
  try {
    // Dynamic import to ensure dotenv.config() has run
    const { getDb } = await import('../src/lib/db/mongodb')

    const db = await getDb()
    console.log('Successfully connected to MongoDB!')

    const collections = await db.listCollections().toArray()
    console.log(
      'Available collections:',
      collections.map((c) => c.name)
    )

    // Simple write/read test
    const testColl = db.collection('test_connection')
    await testColl.insertOne({ test: true, timestamp: new Date() })
    console.log('Successfully wrote to test_connection collection')

    const result = await testColl.findOne({ test: true })
    console.log('Successfully read from test_connection collection:', result)

    // Clean up
    await testColl.deleteOne({ _id: result?._id })
    console.log('Successfully cleaned up test_connection collection')

    process.exit(0)
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error)
    process.exit(1)
  }
}

testMongo()
