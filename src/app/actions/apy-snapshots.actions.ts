'use server'

import { ProtocolName } from '@/config/protocols'
import { MONGODB_COLLECTION_SPOT, getDb } from '@/lib/db/mongodb'
import type { ApySpot, BorrowApySpot, LendApySpot } from '@/lib/db/types'
import { fetchAaveV3Apy } from '@/lib/protocols/aave'
import { fetchCompoundV3Apy } from '@/lib/protocols/compound'
import { fetchMorphoV1Apy } from '@/lib/protocols/morpho'

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Upsert APY spot documents into the Time Series collection.
 *
 * MongoDB Time Series does not support native upserts — idempotency is
 * achieved by checking existence on (meta.poolId, timestamp) before inserting.
 * Any number of QStash retries on the same slot produces exactly one document.
 */
export async function writeApySpots(spots: ApySpot[]): Promise<void> {
  if (spots.length === 0) return

  const db = await getDb()
  const collection = db.collection<ApySpot>(MONGODB_COLLECTION_SPOT)

  // Deduplicate in memory first — in case the fetcher produced duplicates
  const seen = new Set<string>()
  const deduped: ApySpot[] = []

  for (const spot of spots) {
    const key = `${spot.meta.poolId}::${spot.timestamp.toISOString()}`
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(spot)
    }
  }

  // Check which (poolId, timestamp) pairs already exist in the collection
  const keys = deduped.map((s) => ({
    poolId: s.meta.poolId,
    timestamp: s.timestamp,
  }))

  const existing = await collection
    .find(
      {
        $or: keys.map((k) => ({
          'meta.poolId': k.poolId,
          timestamp: k.timestamp,
        })),
      },
      { projection: { 'meta.poolId': 1, timestamp: 1 } }
    )
    .toArray()

  const existingKeys = new Set(
    existing.map((d) => `${d.meta.poolId}::${d.timestamp.toISOString()}`)
  )

  // Only insert documents that don't already exist for this slot
  const toInsert = deduped.filter((s) => {
    const key = `${s.meta.poolId}::${s.timestamp.toISOString()}`
    return !existingKeys.has(key)
  })

  if (toInsert.length === 0) {
    console.log(
      `[db:spot] All ${deduped.length} slots already exist — skipping insert`
    )
    return
  }

  try {
    await collection.insertMany(
      toInsert as Parameters<typeof collection.insertMany>[0],
      { ordered: false }
    )
    console.log(
      `[db:spot] Inserted ${toInsert.length} new spots` +
        (deduped.length - toInsert.length > 0
          ? ` (${deduped.length - toInsert.length} already existed)`
          : '')
    )
  } catch (error) {
    console.error('[db:spot] Failed to write spots:', error)
    throw error
  }
}

// ─── Result type ──────────────────────────────────────────────────────────────

export type CollectApySpotResult = {
  success: boolean
  counts: Partial<Record<ProtocolName, number>> & { total: number }
  errors: string[]
  durationMs: number
}

// ─── Protocol tasks ───────────────────────────────────────────────────────────

const PROTOCOL_TASKS: Partial<
  Record<ProtocolName, () => Promise<(LendApySpot | BorrowApySpot)[]>>
> = {
  aave_v3: fetchAaveV3Apy,
  morpho_v1: fetchMorphoV1Apy,
  compound_v3: fetchCompoundV3Apy,
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Orchestrates APY spot collection across all protocols (or a single one).
 * Fetchers run in parallel. Results are written to apy.spot with slot-based
 * deduplication — safe to retry any number of times via QStash.
 *
 * Each fetcher now returns ApySpot documents directly —
 * no intermediate format or transform step.
 *
 * @param protocol - Optional protocol ID to run a single fetcher.
 *                   If omitted, all fetchers run in parallel.
 */
export async function collectApySpot(
  protocol?: ProtocolName
): Promise<CollectApySpotResult> {
  const start = Date.now()
  const errors: string[] = []

  // Build task list
  const tasks: [
    ProtocolName,
    () => Promise<(LendApySpot | BorrowApySpot)[]>,
  ][] = protocol
    ? PROTOCOL_TASKS[protocol]
      ? [[protocol, PROTOCOL_TASKS[protocol]!]]
      : []
    : (Object.entries(PROTOCOL_TASKS) as [
        ProtocolName,
        () => Promise<(LendApySpot | BorrowApySpot)[]>,
      ][])

  if (tasks.length === 0) {
    return {
      success: false,
      counts: { total: 0 },
      errors: [`Unknown protocol: ${protocol}`],
      durationMs: 0,
    }
  }

  // Run all fetchers in parallel
  const results = await Promise.allSettled(tasks.map(([, fetch]) => fetch()))

  const allSpots: ApySpot[] = []
  const protoCount: Partial<Record<ProtocolName, number>> = {}

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const protoId = tasks[i][0]

    if (result.status === 'fulfilled') {
      const spots = result.value
      // Each fetcher returns lend + borrow pairs — divide by 2 for market count
      protoCount[protoId] = spots.length
      allSpots.push(...spots)
    } else {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      errors.push(`[${protoId}] fetch error: ${msg}`)
      console.error(`[cron:collect-apy] ${protoId} failed:`, msg)
    }
  }

  // Write to MongoDB
  if (allSpots.length > 0) {
    try {
      await writeApySpots(allSpots)

      const lendCount = allSpots.filter((s) => s.meta.kind === 'lend').length
      const borrowCount = allSpots.filter(
        (s) => s.meta.kind === 'borrow'
      ).length
      console.log(
        `[cron:collect-apy] Wrote ${allSpots.length} docs` +
          ` (${lendCount} lend, ${borrowCount} borrow)` +
          ` → ${MONGODB_COLLECTION_SPOT}` +
          (protocol ? ` for protocol ${protocol}` : '')
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`mongodb write: ${msg}`)
      console.error('[cron:collect-apy] Failed to write to MongoDB:', msg)
      throw err
    }
  }

  const durationMs = Date.now() - start

  const countSummary = Object.entries(protoCount)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')

  console.log(
    `[cron:collect-apy] Completed in ${durationMs}ms — ${countSummary} total:${allSpots.length}`
  )

  return {
    success: errors.length === 0,
    counts: { ...protoCount, total: allSpots.length },
    errors,
    durationMs,
  }
}
