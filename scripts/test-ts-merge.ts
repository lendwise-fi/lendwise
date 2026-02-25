import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function testMerge() {
  try {
    const { getDb, MONGODB_COLLECTION_HOURLY } = await import(
      '../src/lib/db/mongodb'
    )
    const db = await getDb()

    console.log(`Testing $merge into ${MONGODB_COLLECTION_HOURLY}...`)

    const pipeline = [
      { $limit: 1 }, // Just take one document from spot
      {
        $project: {
          _id: 0,
          timestamp: new Date(),
          metadata: {
            protocol: 'test',
            chain: { id: 1, name: 'test-chain' },
            market: { name: 'test-market', address: '0x0' },
            vault: { symbol: 'TEST', name: 'Test Token', address: '0x0' },
          },
          supplyApy: 1,
          borrowApy: 1,
        },
      },
      {
        $merge: {
          into: MONGODB_COLLECTION_HOURLY,
          on: [
            'timestamp',
            'metadata.protocol',
            'metadata.chain.name',
            'metadata.market.name',
            'metadata.vault.symbol',
          ],
          whenMatched: 'replace',
          whenNotMatched: 'insert',
        },
      },
    ]

    await db.collection('spot').aggregate(pipeline).toArray()
    console.log(
      'Test successful! $merge works on Time Series without unique index?'
    )

    process.exit(0)
  } catch (error: any) {
    console.error('Test failed:', error.message)
    process.exit(1)
  }
}

testMerge()
