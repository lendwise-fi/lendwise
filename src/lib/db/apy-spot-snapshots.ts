import { getDb } from './mongodb'
import { ApyTimeSeriesDocument } from './types'

/**
 * Write multiple APY snapshots to MongoDB 'spot' time-series collection.
 *
 * MongoDB Atlas Time Series collections automatically handle efficient storage
 * based on the 'timestamp' and 'metadata' (protocol, market, chain).
 */
export async function writeApySpotSnapshots(
  snapshots: ApyTimeSeriesDocument[]
): Promise<void> {
  if (snapshots.length === 0) return

  const db = await getDb('apy')
  const collection = db.collection<ApyTimeSeriesDocument>('spot')

  const documents: ApyTimeSeriesDocument[] = snapshots

  try {
    await collection.insertMany(documents, { ordered: false })
  } catch (error) {
    console.error('[db:mongodb-apy] Failed to write snapshots:', error)
    throw error
  }
}
