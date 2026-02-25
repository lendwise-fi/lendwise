'use server'

import { ProtocolName } from '@/config/protocols'
import { getDb } from '@/lib/db/mongodb'
import type { ApyTimeSeriesDocument } from '@/lib/db/types'
import { fetchAaveV3Apy } from '@/lib/protocols/aave'
import { fetchCompoundV3Apy } from '@/lib/protocols/compound'
import { fetchMorphoV1Apy } from '@/lib/protocols/morpho'

/**
 * Write multiple APY snapshots to MongoDB 'spot' time-series collection.
 *
 * MongoDB Atlas Time Series collections automatically handle efficient storage
 * based on the 'timestamp' and 'metadata' (protocol, market, chain).
 */
export async function writeApySnapshots(
  collectionName: string,
  snapshots: ApyTimeSeriesDocument[]
): Promise<void> {
  if (snapshots.length === 0) return

  const db = await getDb()
  const collection = db.collection<ApyTimeSeriesDocument>(collectionName)

  const documents: ApyTimeSeriesDocument[] = snapshots

  try {
    await collection.insertMany(documents, { ordered: false })
  } catch (error) {
    console.error('[db:mongodb-apy] Failed to write snapshots:', error)
    throw error
  }
}

export type CollectApySpotResult = {
  success: boolean
  counts: Partial<Record<ProtocolName, number>> & {
    total: number
  }
  errors: string[]
  durationMs: number
}

/**
 * Orchestrates the hourly APY collection across all protocols.
 * Fetches from AAVE, Morpho, and Compound in parallel, then writes to MongoDB.
 *
 * @param protocol - Optional protocol ID to filter by (e.g. 'aave_v3'). If omitted, runs all.
 */
export async function collectApySpot(
  protocol?: ProtocolName
): Promise<CollectApySpotResult> {
  const start = Date.now()
  const errors: string[] = []
  const allSnapshots: ApyTimeSeriesDocument[] = []

  // Define tasks mapping
  // We map specific protocol IDs to their corresponding fetcher functions.
  // If 'protocol' is undefined, we run ALL of them.
  // If 'protocol' is defined, we ONLY run the matching one.

  const tasks: Partial<
    Record<ProtocolName, () => Promise<ApyTimeSeriesDocument[]>>
  > = {
    aave_v3: fetchAaveV3Apy,
    morpho_v1: fetchMorphoV1Apy,
    compound_v3: fetchCompoundV3Apy,
  }

  const promises: Promise<ApyTimeSeriesDocument[]>[] = []

  if (protocol) {
    const task = tasks[protocol]
    if (task) {
      promises.push(task())
    } else {
      errors.push(`Unknown protocol ID: ${protocol}`)
      return {
        success: false,
        counts: { total: 0 },
        errors,
        durationMs: 0,
      }
    }
  } else {
    // Run all
    Object.values(tasks).forEach((task) => {
      if (task) promises.push(task())
    })
  }

  // Execute selected tasks
  const results = await Promise.allSettled(promises)

  const protoCount: Partial<Record<ProtocolName, number>> = {}

  // Count results based on protocol
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const snapshots = result.value
      if (snapshots.length > 0) {
        // Identify source by first item's protocol field or inference
        const proto = snapshots[0].metadata.protocol.name as ProtocolName
        protoCount[proto] = snapshots.length
        allSnapshots.push(...snapshots)
      }
    } else {
      errors.push(`fetch error: ${result.reason}`)
    }
  }

  // Write all snapshots to MongoDB
  if (allSnapshots.length > 0) {
    try {
      await writeApySnapshots('spot', allSnapshots)
      console.log(
        `[cron:collect-apy] Wrote ${allSnapshots.length} snapshots to MongoDB${
          protocol ? ` for protocol ${protocol}` : ''
        }`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`mongodb write: ${msg}`)
      console.error('[cron:collect-apy] Failed to write to MongoDB:', msg)
      throw err
    }
  }

  const durationMs = Date.now() - start

  const countDetails = Object.entries(protoCount)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')

  console.log(
    `[cron:collect-apy] Completed in ${durationMs}ms — ${countDetails} total:${allSnapshots.length}`
  )

  return {
    success: errors.length === 0,
    counts: {
      ...protoCount,
      total: allSnapshots.length,
    },
    errors,
    durationMs,
  }
}
