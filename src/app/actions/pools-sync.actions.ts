'use server'

import { type ProtocolName } from '@/config/protocols'
import { MONGODB_COLLECTION_POOLS, getDb } from '@/lib/db/mongodb'
import type { BorrowPool, LendPool, Pool } from '@/lib/db/types'
import { fetchAaveV3Pools } from '@/lib/protocols/aave'
import { fetchMorphoV1Pools } from '@/lib/protocols/morpho'

// ─── Protocol tasks ───────────────────────────────────────────────────────────

const PROTOCOL_TASKS: Partial<
  Record<ProtocolName, () => Promise<(LendPool | BorrowPool)[]>>
> = {
  aave_v3: fetchAaveV3Pools,
  morpho_v1: fetchMorphoV1Pools,
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Upsert pool documents into the pools collection.
 *
 * Uses _id as the upsert key — deterministic slug ensures idempotency.
 * Sets createdAt only on insert, always updates updatedAt.
 */
async function writePoolDocs(pools: Pool[]): Promise<void> {
  if (pools.length === 0) return

  const db = await getDb()
  const collection = db.collection<Pool>(MONGODB_COLLECTION_POOLS)

  const ops = pools.map((pool) => ({
    updateOne: {
      filter: { _id: pool._id },
      update: {
        $set: { ...pool, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  }))

  const result = await collection.bulkWrite(ops, { ordered: false })

  console.log(
    `[db:pools] upserted ${result.upsertedCount} new,` +
      ` updated ${result.modifiedCount} existing` +
      ` (${result.matchedCount} matched)`
  )
}

// ─── Result type ──────────────────────────────────────────────────────────────

export type SyncPoolsResult = {
  success: boolean
  counts: Partial<Record<ProtocolName, number>> & { total: number }
  errors: string[]
  durationMs: number
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Orchestrates pool metadata sync across all protocols (or a single one).
 * Fetchers run in parallel. Results are upserted into the pools collection.
 *
 * Safe to run multiple times — upsert on _id slug is idempotent.
 * Governance changes (new collaterals, IRM params) are picked up on each run.
 *
 * @param protocol - Optional protocol ID to run a single fetcher.
 */
export async function syncPools(
  protocol?: ProtocolName
): Promise<SyncPoolsResult> {
  const start = Date.now()
  const errors: string[] = []

  const tasks: [ProtocolName, () => Promise<(LendPool | BorrowPool)[]>][] =
    protocol
      ? PROTOCOL_TASKS[protocol]
        ? [[protocol, PROTOCOL_TASKS[protocol]!]]
        : []
      : (Object.entries(PROTOCOL_TASKS) as [
          ProtocolName,
          () => Promise<(LendPool | BorrowPool)[]>,
        ][])

  if (tasks.length === 0) {
    return {
      success: false,
      counts: { total: 0 },
      errors: [`Unknown protocol: ${protocol}`],
      durationMs: 0,
    }
  }

  const results = await Promise.allSettled(tasks.map(([, fetch]) => fetch()))

  const allPools: Pool[] = []
  const protoCounts: Partial<Record<ProtocolName, number>> = {}

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const protoId = tasks[i][0]

    if (result.status === 'fulfilled') {
      protoCounts[protoId] = result.value.length
      allPools.push(...result.value)
    } else {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      errors.push(`[${protoId}] fetch error: ${msg}`)
      console.error(`[sync:pools] ${protoId} failed:`, msg)
    }
  }

  if (allPools.length > 0) {
    try {
      await writePoolDocs(allPools)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`mongodb write: ${msg}`)
      console.error('[sync:pools] Failed to write to MongoDB:', msg)
      throw err
    }
  }

  const durationMs = Date.now() - start
  const countSummary = Object.entries(protoCounts)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')

  console.log(
    `[sync:pools] Completed in ${durationMs}ms — ${countSummary} total:${allPools.length}`
  )

  return {
    success: errors.length === 0,
    counts: { ...protoCounts, total: allPools.length },
    errors,
    durationMs,
  }
}
