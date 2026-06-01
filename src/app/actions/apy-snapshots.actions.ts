'use server'

import type { Collection } from 'mongodb'

import type { ProtocolName } from '@/config/protocols'
import { dbBackend, dualWriteEnabled } from '@/lib/db/env'
import { MONGODB_COLLECTION_HOURLY, getDb } from '@/lib/db/mongodb'
import { upsertHourlySlots } from '@/lib/db/repositories/apy'
import type {
  ApySlot,
  BorrowMarketState,
  SpotPayload,
  SupplyMarketState,
} from '@/lib/db/types'
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

// ─── Hour normalization ───────────────────────────────────────────────────────

/**
 * Normalize a timestamp to the top of the current hour (UTC).
 * 11:17:42Z → 11:00:00.000Z
 */
function normalizeHourTimestamp(date: Date): Date {
  const d = new Date(date)
  d.setUTCMinutes(0, 0, 0)
  return d
}

// ─── Composite _id ────────────────────────────────────────────────────────────

/**
 * Build a deterministic _id for an hourly document.
 * Guarantees idempotent upserts — running the job twice on the same hour
 * updates the existing document instead of creating a duplicate.
 *
 * Example: "aave:v3:ethereum:reserve:0x1111...:borrow:2026-03-20T00"
 */
function buildHourlyId(productId: string, hour: Date): string {
  return `${productId}:${hour.toISOString().slice(0, 13)}`
}

// ─── MongoDB aggregation pipeline upsert ─────────────────────────────────────

/**
 * Upsert a single pool's hourly document using a MongoDB aggregation pipeline.
 *
 * On INSERT  → sets all fields from the first slot.
 * On UPDATE  → increments rolling averages for all numeric fields atomically.
 *              rewardItems is replaced with the latest snapshot.
 *
 * Atomic — no read-before-write race condition.
 */
async function upsertHourly(
  collection: Collection<ApySlot>,
  payload: SpotPayload,
  hour: Date,
  slotTime: Date
): Promise<void> {
  const { productId, kind, apy, market } = payload

  const id = buildHourlyId(productId, hour)

  const isSupply = kind === 'supply'
  const supplyMkt = market as SupplyMarketState
  const borrowMkt = market as BorrowMarketState

  // ─── Build market $set fields ─────────────────────────────────────────────
  // Uses MongoDB aggregation expressions — evaluated server-side atomically.

  const marketAvgFields = isSupply
    ? {
        'market.supplyAssets': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: ['$market.supplyAssets', supplyMkt.supplyAssets],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                supplyMkt.supplyAssets,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
        'market.supplyAssetsUsd': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: [
                        '$market.supplyAssetsUsd',
                        supplyMkt.supplyAssetsUsd,
                      ],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                supplyMkt.supplyAssetsUsd,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
        'market.utilizationRate': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: [
                        '$market.utilizationRate',
                        supplyMkt.utilizationRate,
                      ],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                supplyMkt.utilizationRate,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
        'market.assetPriceUsd': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: [
                        '$market.assetPriceUsd',
                        supplyMkt.assetPriceUsd,
                      ],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                supplyMkt.assetPriceUsd,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
      }
    : {
        'market.supplyAssets': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: ['$market.supplyAssets', borrowMkt.supplyAssets],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                borrowMkt.supplyAssets,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
        'market.supplyAssetsUsd': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: [
                        '$market.supplyAssetsUsd',
                        borrowMkt.supplyAssetsUsd,
                      ],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                borrowMkt.supplyAssetsUsd,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
        'market.borrowAssets': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: ['$market.borrowAssets', borrowMkt.borrowAssets],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                borrowMkt.borrowAssets,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
        'market.borrowAssetsUsd': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: [
                        '$market.borrowAssetsUsd',
                        borrowMkt.borrowAssetsUsd,
                      ],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                borrowMkt.borrowAssetsUsd,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
        'market.utilizationRate': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: [
                        '$market.utilizationRate',
                        borrowMkt.utilizationRate,
                      ],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                borrowMkt.utilizationRate,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
        'market.assetPriceUsd': {
          $divide: [
            {
              $add: [
                {
                  $multiply: [
                    {
                      $ifNull: [
                        '$market.assetPriceUsd',
                        borrowMkt.assetPriceUsd,
                      ],
                    },
                    { $ifNull: ['$quality.count', 0] },
                  ],
                },
                borrowMkt.assetPriceUsd,
              ],
            },
            { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
          ],
        },
        // Nullable fields — only average when both prev and new are non-null
        'market.collateralAssetsUsd':
          borrowMkt.collateralAssetsUsd != null
            ? {
                $cond: {
                  if: {
                    $ne: [
                      { $ifNull: ['$market.collateralAssetsUsd', null] },
                      null,
                    ],
                  },
                  then: {
                    $divide: [
                      {
                        $add: [
                          {
                            $multiply: [
                              '$market.collateralAssetsUsd',
                              { $ifNull: ['$quality.count', 0] },
                            ],
                          },
                          borrowMkt.collateralAssetsUsd,
                        ],
                      },
                      { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
                    ],
                  },
                  else: borrowMkt.collateralAssetsUsd,
                },
              }
            : null,
        'market.priceCollateralInLoanAsset':
          borrowMkt.priceCollateralInLoanAsset != null
            ? {
                $cond: {
                  if: {
                    $ne: [
                      { $ifNull: ['$market.priceCollateralInLoanAsset', null] },
                      null,
                    ],
                  },
                  then: {
                    $divide: [
                      {
                        $add: [
                          {
                            $multiply: [
                              '$market.priceCollateralInLoanAsset',
                              { $ifNull: ['$quality.count', 0] },
                            ],
                          },
                          borrowMkt.priceCollateralInLoanAsset,
                        ],
                      },
                      { $add: [{ $ifNull: ['$quality.count', 0] }, 1] },
                    ],
                  },
                  else: borrowMkt.priceCollateralInLoanAsset,
                },
              }
            : null,
      }

  const newCount = { $add: [{ $ifNull: ['$quality.count', 0] }, 1] }

  await collection.updateOne(
    // ✅ Filter on composite _id — safe upsert, no duplicate risk
    { _id: id } as unknown as import('mongodb').Filter<ApySlot>,
    [
      {
        $set: {
          // ✅ Immutable fields — set on insert, never overwritten
          hour,
          productId: { $ifNull: ['$productId', productId] },

          // APY rolling averages
          'apy.base': {
            $divide: [
              {
                $add: [
                  {
                    $multiply: [
                      { $ifNull: ['$apy.base', apy.base] },
                      { $ifNull: ['$quality.count', 0] },
                    ],
                  },
                  apy.base,
                ],
              },
              newCount,
            ],
          },
          'apy.rewards': {
            $divide: [
              {
                $add: [
                  {
                    $multiply: [
                      { $ifNull: ['$apy.rewards', apy.rewards] },
                      { $ifNull: ['$quality.count', 0] },
                    ],
                  },
                  apy.rewards,
                ],
              },
              newCount,
            ],
          },
          'apy.fees': {
            $divide: [
              {
                $add: [
                  {
                    $multiply: [
                      { $ifNull: ['$apy.fees', apy.fees] },
                      { $ifNull: ['$quality.count', 0] },
                    ],
                  },
                  apy.fees,
                ],
              },
              newCount,
            ],
          },
          'apy.net': {
            $divide: [
              {
                $add: [
                  {
                    $multiply: [
                      { $ifNull: ['$apy.net', apy.net] },
                      { $ifNull: ['$quality.count', 0] },
                    ],
                  },
                  apy.net,
                ],
              },
              newCount,
            ],
          },
          // rewardItems — always replace with latest snapshot
          'apy.rewardItems': apy.rewardItems,

          // Market rolling averages
          ...marketAvgFields,

          // Quality
          'quality.count': newCount,
          'quality.expectedCount': 6,
          'quality.firstSlot': { $ifNull: ['$quality.firstSlot', slotTime] },
          'quality.lastSlot': slotTime,
          'quality.status': {
            $switch: {
              branches: [
                { case: { $gte: [newCount, 6] }, then: 'complete' },
                { case: { $lt: [newCount, 6] }, then: 'building' },
              ],
              default: 'partial',
            },
          },
        },
      },
    ],
    { upsert: true }
  )
}

// ─── Write hourly docs ────────────────────────────────────────────────────────

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000
const WRITE_BATCH_SIZE = 50

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('primary marked stale') ||
    msg.includes('not primary') ||
    msg.includes('node is recovering') ||
    msg.includes('ECONNRESET') ||
    msg.includes('socket was unexpectedly closed')
  )
}

async function writeApySlotMongo(
  payloads: SpotPayload[],
  slotTime: Date
): Promise<number> {
  if (payloads.length === 0) return 0

  const db = await getDb()
  const collection = db.collection<ApySlot>(MONGODB_COLLECTION_HOURLY)
  const hour = normalizeHourTimestamp(slotTime)

  let written = 0
  const permanentFailures: string[] = []

  // Process in batches to avoid overwhelming the connection during failovers
  for (let i = 0; i < payloads.length; i += WRITE_BATCH_SIZE) {
    const batch = payloads.slice(i, i + WRITE_BATCH_SIZE)
    let pending = batch
    let attempt = 0

    while (pending.length > 0 && attempt < MAX_RETRIES) {
      if (attempt > 0) {
        const delay = RETRY_DELAY_MS * attempt
        console.warn(
          `[db:hourly] Retry ${attempt}/${MAX_RETRIES} for ${pending.length} docs (waiting ${delay}ms)`
        )
        await new Promise((r) => setTimeout(r, delay))
      }

      const results = await Promise.allSettled(
        pending.map((p) => upsertHourly(collection, p, hour, slotTime))
      )

      const retryable: SpotPayload[] = []
      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled') {
          written++
        } else if (isTransientError(result.reason)) {
          retryable.push(pending[j])
        } else {
          permanentFailures.push(
            result.reason?.message ?? String(result.reason)
          )
        }
      }

      pending = retryable
      attempt++
    }

    // Exhausted retries — record remaining as failures
    if (pending.length > 0) {
      permanentFailures.push(
        `${pending.length} doc(s) failed after ${MAX_RETRIES} retries (transient error)`
      )
    }
  }

  if (permanentFailures.length > 0) {
    throw new Error(
      `[db:hourly] ${permanentFailures.length} upsert(s) failed: ${permanentFailures.slice(0, 5).join('; ')}`
    )
  }

  console.log(
    `[db:hourly] Upserted ${written}/${payloads.length} hourly docs for hour ${hour.toISOString()}`
  )
  return written
}

// ─── Postgres writer ──────────────────────────────────────────────────────────

async function writeApySlotPostgres(
  payloads: SpotPayload[],
  slotTime: Date
): Promise<number> {
  const hour = normalizeHourTimestamp(slotTime)
  let written: number
  try {
    // Chunked multi-row upsert — sequential statements, no per-row fan-out.
    // Returns the deduped row count (Compound collapses ~1280 payloads → ~40).
    written = await upsertHourlySlots(payloads, hour, slotTime)
  } catch (err) {
    // Drizzle wraps the driver error ("Failed query: …"); surface the real cause.
    const cause = (err as { cause?: { message?: string } })?.cause
    throw new Error(
      `[db:hourly:pg] upsert failed: ${cause?.message ?? (err as Error).message}`
    )
  }
  const dupes = payloads.length - written
  console.log(
    `[db:hourly:pg] Upserted ${written} rows from ${payloads.length} payloads` +
      (dupes > 0 ? ` (${dupes} duplicate productIds collapsed)` : '') +
      ` for hour ${hour.toISOString()}`
  )
  return written
}

// ─── Backend dispatch (+ optional dual-write) ──────────────────────────────────

async function writeApySlot(
  payloads: SpotPayload[],
  slotTime: Date
): Promise<number> {
  if (payloads.length === 0) return 0
  if (dbBackend() === 'postgres') {
    const n = await writeApySlotPostgres(payloads, slotTime)
    if (dualWriteEnabled())
      await writeApySlotMongo(payloads, slotTime).catch((e) =>
        console.error('[dual-write:mongo]', e)
      )
    return n
  }
  const n = await writeApySlotMongo(payloads, slotTime)
  if (dualWriteEnabled())
    await writeApySlotPostgres(payloads, slotTime).catch((e) =>
      console.error('[dual-write:pg]', e)
    )
  return n
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
 * rolling averages into apy.hourly.
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
      ? [[protocol, PROTOCOL_TASKS[protocol]!]]
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
