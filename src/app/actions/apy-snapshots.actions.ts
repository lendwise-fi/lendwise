'use server'

import type { ProtocolName } from '@/config/protocols'
import { upsertHourlySlots } from '@/lib/db/repositories/apy'
import type { SpotPayload } from '@/lib/db/types'
import { fetchAaveV3ApySpot } from '@/lib/protocols/aave'
import { fetchCompoundV3ApySpot } from '@/lib/protocols/compound'
import { fetchMorphoV1ApySpot } from '@/lib/protocols/morpho'

// ─── Protocol tasks ───────────────────────────────────────────────────────────

const PROTOCOL_TASKS: Partial<
  Record<ProtocolName, () => Promise<SpotPayload[]>>
> = {
  aave_v3: fetchAaveV3ApySpot,
  morpho_v1: fetchMorphoV1ApySpot,
  compound_v3: fetchCompoundV3ApySpot,
}

// ─── Hour standardization ───────────────────────────────────────────────────────

/**
 * Normalize a timestamp to the top of the current hour (UTC).
 * 11:17:42Z → 11:00:00.000Z
 */
function normalizeHourTimestamp(date: Date): Date {
  const d = new Date(date)
  d.setUTCMinutes(0, 0, 0)
  return d
}

// ─── Write hourly slot ──────────────────────────────────────────────────────

/**
 * Upsert one collection slot into apy_hourly via a chunked multi-row statement.
 * Duplicate productIds within the slot are collapsed (one observation per
 * product) — Compound collapses ~1280 payloads → ~40 rows.
 */
async function writeApySlot(
  payloads: SpotPayload[],
  slotTime: Date
): Promise<number> {
  if (payloads.length === 0) return 0
  const hour = normalizeHourTimestamp(slotTime)

  let written: number
  try {
    written = await upsertHourlySlots(payloads, hour, slotTime)
  } catch (err) {
    // Drizzle wraps the driver error ("Failed query: …"); surface the real cause.
    const cause = (err as { cause?: { message?: string } })?.cause
    throw new Error(
      `[db:hourly] upsert failed: ${cause?.message ?? (err as Error).message}`,
      { cause: err }
    )
  }

  const dupes = payloads.length - written
  console.log(
    `[db:hourly] Upserted ${written} rows from ${payloads.length} payloads` +
      (dupes > 0 ? ` (${dupes} duplicate productIds collapsed)` : '') +
      ` for hour ${hour.toISOString()}`
  )
  return written
}

// ─── Result type ──────────────────────────────────────────────────────────────

export type CollectApyResult = {
  success: boolean
  counts: Partial<Record<ProtocolName, number>> & { total: number }
  errors: string[]
  durationMs: number
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Collect APY snapshots from all protocols (or a single one) and upsert
 * rolling averages into apy_hourly.
 *
 * Called every 10 minutes by QStash.
 * Each call contributes one slot to the current hour's rolling average.
 *
 * @param protocol - Optional — run a single protocol fetcher only.
 */
export async function collectApySpot(
  protocol?: ProtocolName
): Promise<CollectApyResult> {
  const start = Date.now()
  const slotTime = new Date()
  const errors: string[] = []

  const tasks: [ProtocolName, () => Promise<SpotPayload[]>][] = protocol
    ? PROTOCOL_TASKS[protocol]
      ? [[protocol, PROTOCOL_TASKS[protocol]]]
      : []
    : (Object.entries(PROTOCOL_TASKS) as [
        ProtocolName,
        () => Promise<SpotPayload[]>,
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

  const allPayloads: SpotPayload[] = []
  const protoCounts: Partial<Record<ProtocolName, number>> = {}

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const protoId = tasks[i][0]

    if (result.status === 'fulfilled') {
      protoCounts[protoId] = result.value.length
      allPayloads.push(...result.value)
      console.log(
        `[cron:${protoId}] Fetched ${result.value.length} spot payloads`
      )
    } else {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      errors.push(`[${protoId}] ${msg}`)
      console.error(`[cron:collect-apy] ${protoId} failed:`, msg)
    }
  }

  if (allPayloads.length > 0) {
    await writeApySlot(allPayloads, slotTime)
  }

  const durationMs = Date.now() - start
  const totalCount = allPayloads.length

  console.log(
    `[cron:collect-apy] Completed in ${durationMs}ms —` +
      ` ${Object.entries(protoCounts)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ')}` +
      ` total:${totalCount}`
  )

  return {
    success: errors.length === 0,
    counts: { ...protoCounts, total: totalCount },
    errors,
    durationMs,
  }
}
