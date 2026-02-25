import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const DRY_RUN = process.argv.includes('--dry-run')

async function migrate() {
  console.log(`Starting migration (DRY_RUN: ${DRY_RUN})...`)

  try {
    const { getDb, MONGODB_COLLECTION_SPOT } = await import(
      '../src/lib/db/mongodb'
    )
    const db = await getDb()
    const spot = db.collection(MONGODB_COLLECTION_SPOT)

    // Find all documents with the old nested structure (market inside chain)
    const query = { 'metadata.chain.market': { $exists: true } }
    const count = await spot.countDocuments(query)

    console.log(
      `Found ${count} documents requiring migration in 'spot' collection.`
    )

    if (count === 0) {
      console.log('No documents found with old structure.')
      const anyDoc = await spot.findOne({})
      if (anyDoc) {
        console.log(
          'Sample document metadata (current):',
          JSON.stringify(anyDoc.metadata, null, 2)
        )
      } else {
        console.log('The collection "spot" is empty.')
      }
      process.exit(0)
    }

    if (DRY_RUN) {
      const sample = await spot.findOne(query)
      console.log(
        'Sample before migration:',
        JSON.stringify(sample?.metadata, null, 2)
      )

      const oldMetadata = sample?.metadata as any
      const newMetadata = {
        protocol: oldMetadata.protocol,
        chain: {
          id: oldMetadata.chain.id,
          name: oldMetadata.chain.name,
        },
        market: {
          name: oldMetadata.chain.market.name,
          address: oldMetadata.chain.market.address,
        },
        vault: oldMetadata.chain.market.vault,
      }
      console.log(
        'Sample after migration (simulated):',
        JSON.stringify(newMetadata, null, 2)
      )
      console.log('Dry run complete. No changes were made.')
      process.exit(0)
    }

    // Perform migration using updateMany with aggregation pipeline
    const result = await spot.updateMany(query, [
      {
        $set: {
          'metadata.market': {
            name: '$metadata.chain.market.name',
            address: '$metadata.chain.market.address',
          },
          'metadata.vault': '$metadata.chain.market.vault',
          'metadata.chain': {
            id: '$metadata.chain.id',
            name: '$metadata.chain.name',
          },
        },
      },
      {
        $unset: 'metadata.chain.market',
      },
    ])

    console.log(
      `Migration complete. Modified ${result.modifiedCount} documents.`
    )
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

migrate()
