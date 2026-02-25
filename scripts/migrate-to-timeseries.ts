import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function migrate() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not found')

  const client = new MongoClient(uri) // No strict mode here

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

    const collectionsConfig = [
      { name: MONGODB_COLLECTION_SPOT, granularity: 'minutes' },
      { name: MONGODB_COLLECTION_HOURLY, granularity: 'hours' },
      { name: MONGODB_COLLECTION_DAILY, granularity: 'hours' },
      { name: MONGODB_COLLECTION_WEEKLY, granularity: 'hours' },
      { name: MONGODB_COLLECTION_MONTHLY, granularity: 'hours' },
      { name: MONGODB_COLLECTION_YEARLY, granularity: 'hours' },
    ]

    for (const config of collectionsConfig) {
      const name = config.name
      const backupName = `${name}_backup_standard`

      console.log(
        `\n--- Migrating ${name} to Time Series (Granularity: ${config.granularity}) ---`
      )

      // 1. Check if collection exists and is already Time Series
      const colInfo = await db.command({ listCollections: 1, filter: { name } })
      const existing = colInfo.cursor.firstBatch[0]
      const backupInfo = await db.command({
        listCollections: 1,
        filter: { name: backupName },
      })
      const hasBackup = backupInfo.cursor.firstBatch.length > 0

      if (existing && existing.options?.timeseries) {
        console.log(`Collection ${name} is already a Time Series collection.`)
        // If we have a backup and it's already TS, maybe we still need to migrate data?
        // But if someone manually created it, we should be careful.
        // For this run, we'll proceed to migration if we have a backup.
      } else {
        // 2. Rename existing to backup if it exists
        if (existing) {
          console.log(
            `Renaming existing standard collection ${name} to ${backupName}...`
          )
          try {
            await db.collection(name).rename(backupName)
          } catch (e: any) {
            console.error(`Rename failed: ${e.message}`)
            continue
          }
        }

        // 3. Create as Time Series
        console.log(`Creating new Time Series collection: ${name}...`)
        await db.createCollection(name, {
          timeseries: {
            timeField: 'timestamp',
            metaField: 'metadata',
            granularity: config.granularity as any,
          },
        })
      }

      // 4. Setup index (Secondary, NOT UNIQUE)
      console.log(`Setting up secondary index for ${name}...`)
      await db.collection(name).createIndex(
        {
          timestamp: 1,
          'metadata.protocol': 1,
          'metadata.chain.name': 1,
          'metadata.market.name': 1,
          'metadata.vault.symbol': 1,
        },
        { name: 'snapshot_lookup' }
      )

      // 5. Migrate data if backup exists
      if (existing || hasBackup) {
        console.log(`Migrating data from ${backupName} to ${name}...`)
        const count = await db.collection(backupName).countDocuments()
        if (count > 0) {
          // Use aggregation with $out would replace, but we want to insert into existing TS
          // So we use a cursor to batch insert
          const cursor = db.collection(backupName).find({})
          let batch: any[] = []
          let inserted = 0

          while (await cursor.hasNext()) {
            const doc = await cursor.next()
            if (doc) {
              const { _id, ...rest } = doc // Remove _id to let TS handle it or avoid conflicts
              batch.push(rest)
            }

            if (batch.length >= 1000) {
              await db.collection(name).insertMany(batch)
              inserted += batch.length
              console.log(`...inserted ${inserted}/${count}`)
              batch = []
            }
          }

          if (batch.length > 0) {
            await db.collection(name).insertMany(batch)
            inserted += batch.length
          }
          console.log(`Data migration for ${name} complete. Total: ${inserted}`)
        } else {
          console.log(`Backup collection ${backupName} is empty.`)
        }
      }
    }

    console.log('\nAll collections successfully migrated to Time Series.')
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

migrate()
