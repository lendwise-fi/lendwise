import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env file BEFORE importing the database module
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function testMongoQuery() {
  console.log('Testing MongoDB APY Query logic...')
  try {
    const { getDb } = await import('../src/lib/db/mongodb')
    const db = await getDb()
    const collection = db.collection('spot')

    // 1. Insert test data
    console.log('Inserting test data...')
    const now = new Date()
    const testData = [
      {
        timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
        metadata: {
          protocol: 'aave_v3',
          chain: { id: 42161, name: 'arbitrum' },
          market: { name: 'Aave V3 Arbitrum', address: '0x123' },
          vault: { symbol: 'USDC', name: 'USDC', address: '0x456' },
        },
        supplyApy: 5.0,
        borrowApy: 4.0,
      },
      {
        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        metadata: {
          protocol: 'aave_v3',
          chain: { id: 42161, name: 'arbitrum' },
          market: { name: 'Aave V3 Arbitrum', address: '0x123' },
          vault: { symbol: 'USDC', name: 'USDC', address: '0x456' },
        },
        supplyApy: 4.5,
        borrowApy: 3.5,
      },
      {
        timestamp: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        metadata: {
          protocol: 'compound_v3',
          chain: { id: 1, name: 'ethereum' },
          market: { name: 'Compound V3 USDC', address: '0xabc' },
          vault: { symbol: 'WETH', name: 'WETH', address: '0xdef' },
        },
        supplyApy: 2.0,
        borrowApy: 1.0,
      },
    ]

    await collection.insertMany(testData)
    console.log('Test data inserted.')

    // 2. Test filtering by protocol and market
    console.log('\nQuerying by protocol (aave_v3) and market (USDC)...')
    const results1 = await collection
      .find({
        'metadata.protocol': 'aave_v3',
        $or: [
          { 'metadata.vault.symbol': 'USDC' },
          { 'metadata.market.name': 'USDC' },
        ],
      })
      .toArray()
    console.log(`Found ${results1.length} results. Expected: 2.`)

    // 3. Test filtering by range (7 days)
    console.log('\nQuerying by range (last 7 days)...')
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 7)

    const results2 = await collection
      .find({
        timestamp: { $gte: sevenDaysAgo },
      })
      .toArray()
    console.log(
      `Found ${results2.length} results. Expected: 2 (the aave_v3 records).`
    )

    // 4. Test filtering by chain
    console.log('\nQuerying by chain (ethereum)...')
    const results3 = await collection
      .find({
        'metadata.chain.name': 'ethereum',
      })
      .toArray()
    console.log(`Found ${results3.length} results. Expected: 1.`)

    // Clean up
    console.log('\nCleaning up test data...')
    await collection.deleteMany({
      'metadata.protocol': { $in: ['aave_v3', 'compound_v3'] },
      timestamp: { $gte: new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000) },
    })
    console.log('Clean up complete.')

    process.exit(0)
  } catch (error) {
    console.error('Test failed:', error)
    process.exit(1)
  }
}

testMongoQuery()
