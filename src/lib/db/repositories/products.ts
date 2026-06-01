import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'
import { products } from '@/lib/db/schema'
import type { Product } from '@/lib/db/types'

/** Map a fetched Product document (current Mongo-shaped object) → products row. */
function toRow(p: Product) {
  return {
    id: p._id,
    active: p.active ?? true,
    kind: p.kind,
    provider: p.protocol.provider,
    productType: p.protocol.type,
    version: p.protocol.version,
    protocolName: p.protocol.name,
    chainId: p.protocol.chain.id,
    chainName: p.protocol.chain.name,
    assetSymbol: p.asset.symbol,
    assetName: p.asset.name,
    assetAddress: p.asset.address,
    assetDecimals: p.asset.decimals,
    protocolAddress: p.protocol.address,
    subgraphUrl: p.protocol.subgraphUrl ?? null,
    meta: p.protocol.meta,
    collaterals: 'collaterals' in p ? p.collaterals : null,
    createdAt: p.createdAt ?? new Date(),
    updatedAt: new Date(),
  }
}

/** Upsert products by id. created_at set on insert only; everything else refreshed. */
export async function upsertProducts(items: Product[]): Promise<void> {
  if (items.length === 0) return
  const rows = items.map(toRow)
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(products)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: products.id,
        set: {
          active: sql`excluded.active`,
          kind: sql`excluded.kind`,
          provider: sql`excluded.provider`,
          productType: sql`excluded.product_type`,
          version: sql`excluded.version`,
          protocolName: sql`excluded.protocol_name`,
          chainId: sql`excluded.chain_id`,
          chainName: sql`excluded.chain_name`,
          assetSymbol: sql`excluded.asset_symbol`,
          assetName: sql`excluded.asset_name`,
          assetAddress: sql`excluded.asset_address`,
          assetDecimals: sql`excluded.asset_decimals`,
          protocolAddress: sql`excluded.protocol_address`,
          subgraphUrl: sql`excluded.subgraph_url`,
          meta: sql`excluded.meta`,
          collaterals: sql`excluded.collaterals`,
          updatedAt: sql`excluded.updated_at`,
          // created_at deliberately NOT in set → preserved from original insert
        },
      })
  }
}

/** Deactivate all currently-active products for the given providers. Returns count. */
export async function deactivateProviders(
  providers: string[]
): Promise<number> {
  if (providers.length === 0) return 0
  const updated = await db
    .update(products)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(inArray(products.provider, providers), eq(products.active, true))
    )
    .returning({ id: products.id })
  return updated.length
}

/** Active product ids (+ createdAt) — used by gap detection / status. */
export async function listActiveProducts(): Promise<
  { id: string; provider: string; kind: string; createdAt: Date }[]
> {
  return db
    .select({
      id: products.id,
      provider: products.provider,
      kind: products.kind,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(eq(products.active, true))
}
