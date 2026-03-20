'use server'

import { type ProtocolName } from '@/config/protocols'
import { MONGODB_COLLECTION_PRODUCTS, getDb } from '@/lib/db/mongodb'
import type { BorrowProduct, Product, SupplyProduct } from '@/lib/db/types'
import { fetchAaveV3Products } from '@/lib/protocols/aave'
import { fetchCompoundV3Products } from '@/lib/protocols/compound'
import { fetchMorphoV1Products } from '@/lib/protocols/morpho'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ProductUpdateOperation = {
  $set: Partial<Product> & { updatedAt: Date }
  $setOnInsert: { createdAt: Date }
  $unset: { [key: string]: true | '' | 1 }
}

// ─── Protocol tasks ───────────────────────────────────────────────────────────

const PROTOCOL_TASKS: Partial<
  Record<ProtocolName, () => Promise<(SupplyProduct | BorrowProduct)[]>>
> = {
  aave_v3: fetchAaveV3Products,
  morpho_v1: fetchMorphoV1Products,
  compound_v3: fetchCompoundV3Products,
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Upsert product documents into the products collection.
 *
 * Uses _id as the upsert key — deterministic slug ensures idempotency.
 * Sets createdAt only on insert, always updates updatedAt.
 */
async function writeProductDocs(products: Product[]): Promise<void> {
  if (products.length === 0) return

  const db = await getDb()
  const collection = db.collection<Product>(MONGODB_COLLECTION_PRODUCTS)

  const ops = products.map((product) => {
    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...productData
    } = product
    return {
      updateOne: {
        filter: { _id: product._id },
        update: {
          $set: { ...productData, updatedAt: new Date() },
          $setOnInsert: { createdAt: product.createdAt || new Date() },
          $unset: { subgraphUrl: true },
        } satisfies ProductUpdateOperation,
        upsert: true,
      },
    }
  })

  const result = await collection.bulkWrite(ops, { ordered: false })

  console.log(
    `[db:products] upserted ${result.upsertedCount} new,` +
      ` updated ${result.modifiedCount} existing` +
      ` (${result.matchedCount} matched)`
  )
}

// ─── Result type ──────────────────────────────────────────────────────────────

export type SyncProductsResult = {
  success: boolean
  counts: Partial<Record<ProtocolName, number>> & { total: number }
  errors: string[]
  durationMs: number
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Orchestrates product metadata sync across all protocols (or a single one).
 * Fetchers run in parallel. Results are upserted into the products collection.
 *
 * Safe to run multiple times — upsert on _id slug is idempotent.
 * Governance changes (new collaterals, IRM params) are picked up on each run.
 *
 * @param protocol - Optional protocol ID to run a single fetcher.
 */
export async function syncProducts(
  protocol?: ProtocolName
): Promise<SyncProductsResult> {
  const start = Date.now()
  const errors: string[] = []

  const tasks: [
    ProtocolName,
    () => Promise<(SupplyProduct | BorrowProduct)[]>,
  ][] = protocol
    ? PROTOCOL_TASKS[protocol]
      ? [[protocol, PROTOCOL_TASKS[protocol]!]]
      : []
    : (Object.entries(PROTOCOL_TASKS) as [
        ProtocolName,
        () => Promise<(SupplyProduct | BorrowProduct)[]>,
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

  const allProducts: Product[] = []
  const protoCounts: Partial<Record<ProtocolName, number>> = {}

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const protoId = tasks[i][0]

    if (result.status === 'fulfilled') {
      protoCounts[protoId] = result.value.length
      allProducts.push(...result.value)
    } else {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      errors.push(`[${protoId}] fetch error: ${msg}`)
      console.error(`[sync:products] ${protoId} failed:`, msg)
    }
  }

  if (allProducts.length > 0) {
    try {
      await writeProductDocs(allProducts)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`mongodb write: ${msg}`)
      console.error('[sync:products] Failed to write to MongoDB:', msg)
      throw err
    }
  }

  const durationMs = Date.now() - start
  const countSummary = Object.entries(protoCounts)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')

  console.log(
    `[sync:products] Completed in ${durationMs}ms — ${countSummary} total:${allProducts.length}`
  )

  return {
    success: errors.length === 0,
    counts: { ...protoCounts, total: allProducts.length },
    errors,
    durationMs,
  }
}
