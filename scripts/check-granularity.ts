import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function checkGranularity() {
  try {
    const { getDb, MONGODB_COLLECTION_SPOT } = await import(
      '../src/lib/db/mongodb'
    )
    const db = await getDb()

    // 1. Get collection info with direct command
    const listColResult = await db.command({
      listCollections: 1,
      filter: { name: MONGODB_COLLECTION_SPOT },
    })
    console.log(
      `\n--- Config for ${MONGODB_COLLECTION_SPOT} (Direct Command) ---`
    )
    console.log(
      JSON.stringify(
        listColResult.cursor.firstBatch[0] || 'Collection not found',
        null,
        2
      )
    )

    // 2. Check recent data frequency with more samples
    console.log(`\n--- Recent Data Samples for ${MONGODB_COLLECTION_SPOT} ---`)
    const collection = db.collection(MONGODB_COLLECTION_SPOT)
    const samples = await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(1000)
      .toArray()

    if (samples.length > 0) {
      // Calculate diffs between same series
      const seriesKey = (s: any) =>
        `${s.metadata.protocol}-${s.metadata.vault.symbol}-${s.metadata.chain.name}`
      const grouped: Record<string, Date[]> = {}

      samples.forEach((s) => {
        const key = seriesKey(s)
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(s.timestamp)
      })

      console.log('\n--- Calculated Intervals (Sample of first 5 series) ---')
      let count = 0
      for (const [key, dates] of Object.entries(grouped)) {
        if (dates.length > 1) {
          const diffSeconds = (dates[0].getTime() - dates[1].getTime()) / 1000
          console.log(
            `${key}: ${diffSeconds} seconds interval (${dates.length} points found)`
          )
          count++
          if (count >= 5) break
        }
      }
    } else {
      console.log('No data found in spot collection.')
    }

    process.exit(0)
  } catch (error) {
    console.error('Failed to check granularity:', error)
    process.exit(1)
  }
}

checkGranularity()
