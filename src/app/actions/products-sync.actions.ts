'use server'

import { type ProtocolName } from '@/config/protocols'
import {
  deactivateProviders,
  upsertProducts,
} from '@/lib/db/repositories/products'
import type { BorrowProduct, Product, SupplyProduct } from '@/lib/db/types'
import { fetchAaveV3Products } from '@/lib/protocols/aave'
import { fetchCompoundV3Products } from '@/lib/protocols/compound'
import { fetchMorphoV1Products } from '@/lib/protocols/morpho'

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
 * Upsert products into Postgres.
 *
 * Uses the deterministic slug id as the upsert key — idempotent.
 * created_at is set on insert only; updated_at always refreshed.
 */
async function writeProductDocs(products: Product[]): Promise<void> {
  if (products.length === 0) return
  await upsertProducts(products)
}

// ─── Result type ──────────────────────────────────────────────────────────────

export type SyncProductsResult = {
  success: boolean
  counts: Partial<Record<ProtocolName, number>> & {
    total: number
    deactivated: number
  }
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
      counts: { total: 0, deactivated: 0 },
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

  // ─── Deactivate products for successfully fetched protocols ──────────
  // Only deactivate protocols whose fetch succeeded — a failed fetch must
  // not cause all products for that protocol to disappear.
  let deactivated = 0
  const succeededProviders = new Set<string>()

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      const protoId = tasks[i][0] // e.g. "aave_v3"
      const provider = protoId.split('_')[0] // e.g. "aave"
      succeededProviders.add(provider)
    }
  }

  if (succeededProviders.size > 0) {
    try {
      deactivated = await deactivateProviders([...succeededProviders])

      console.log(
        `[sync:products] Deactivated ${deactivated} products` +
          ` for providers: ${[...succeededProviders].join(', ')}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`deactivation: ${msg}`)
      console.error('[sync:products] Failed to deactivate:', msg)
    }
  }

  // ─── Upsert fetched products (re-activates them) ────────────────────
  if (allProducts.length > 0) {
    try {
      await writeProductDocs(allProducts)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`products write: ${msg}`)
      console.error('[sync:products] Failed to write products:', msg)
      throw err
    }
  }

  const durationMs = Date.now() - start
  const countSummary = Object.entries(protoCounts)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')

  console.log(
    `[sync:products] Completed in ${durationMs}ms — ${countSummary}` +
      ` total:${allProducts.length} deactivated:${deactivated}`
  )

  return {
    success: errors.length === 0,
    counts: { ...protoCounts, total: allProducts.length, deactivated },
    errors,
    durationMs,
  }
}
