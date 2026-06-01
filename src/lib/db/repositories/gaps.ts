import { sql } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'

export interface GapRow {
  productId: string
  hour: Date
}
export interface IncompleteRow {
  productId: string
  hour: Date
  count: number
}

/**
 * Missing slots: active products × hour boundaries (after product creation)
 * that have no apy_hourly row in the window. Pure set difference via generate_series.
 * Only products with at least one row in the window are considered ("collected").
 */
export async function findGaps(
  windowStart: Date,
  windowEnd: Date
): Promise<GapRow[]> {
  const res = await db.execute(sql`
    WITH boundaries AS (
      SELECT generate_series(${windowStart}::timestamptz, ${windowEnd}::timestamptz - interval '1 hour', interval '1 hour') AS hour
    ),
    collected AS (
      SELECT DISTINCT product_id FROM apy_hourly
      WHERE hour >= ${windowStart} AND hour < ${windowEnd}
    ),
    expected AS (
      SELECT p.id AS product_id, b.hour
      FROM products p
      JOIN collected c ON c.product_id = p.id
      CROSS JOIN boundaries b
      WHERE p.active AND b.hour >= date_trunc('hour', p.created_at)
    )
    SELECT e.product_id, e.hour
    FROM expected e
    LEFT JOIN apy_hourly h ON h.product_id = e.product_id AND h.hour = e.hour
    WHERE h.product_id IS NULL
    ORDER BY e.hour
  `)
  return (res.rows as { product_id: string; hour: Date }[]).map((r) => ({
    productId: r.product_id,
    hour: new Date(r.hour),
  }))
}

/** Incomplete slots: rows present but quality_count < 6 and not healed. */
export async function findIncomplete(
  windowStart: Date,
  windowEnd: Date
): Promise<IncompleteRow[]> {
  const res = await db.execute(sql`
    SELECT product_id, hour, quality_count
    FROM apy_hourly
    WHERE hour >= ${windowStart} AND hour < ${windowEnd}
      AND quality_count < 6 AND healed = false
    ORDER BY hour
  `)
  return (
    res.rows as { product_id: string; hour: Date; quality_count: number }[]
  ).map((r) => ({
    productId: r.product_id,
    hour: new Date(r.hour),
    count: r.quality_count,
  }))
}

/** Mark stale 'building' rows (past hours, count<6) as 'partial'. Returns count. */
export async function markStale(
  windowStart: Date,
  windowEnd: Date
): Promise<number> {
  const res = await db.execute(sql`
    UPDATE apy_hourly SET quality_status = 'partial'
    WHERE hour >= ${windowStart} AND hour < ${windowEnd}
      AND quality_count < 6 AND quality_status = 'building'
  `)
  return res.rowCount ?? 0
}

export interface HealRow {
  productId: string
  hour: Date
  apy: {
    base: number
    rewards: number
    fees: number
    net: number
    rewardItems: unknown[]
  }
  market: Record<string, number | null>
  source: 'refetch' | 'nearest-neighbor'
  healedFrom: string
  gapKind: 'missing' | 'incomplete'
}

/**
 * Write healed rows. missing → INSERT … ON CONFLICT DO NOTHING (never clobber organic).
 * incomplete → upsert overwrite. Marks healed=true.
 */
export async function writeHealed(rows: HealRow[]): Promise<number> {
  let written = 0
  for (const r of rows) {
    const m = r.market
    const count = r.source === 'refetch' ? 6 : 0
    const status = r.source === 'refetch' ? 'complete' : 'partial'
    const conflict =
      r.gapKind === 'incomplete'
        ? sql`DO UPDATE SET apy_base=excluded.apy_base, apy_rewards=excluded.apy_rewards, apy_fees=excluded.apy_fees, apy_net=excluded.apy_net, reward_items=excluded.reward_items, supply_assets=excluded.supply_assets, supply_assets_usd=excluded.supply_assets_usd, utilization_rate=excluded.utilization_rate, asset_price_usd=excluded.asset_price_usd, borrow_assets=excluded.borrow_assets, borrow_assets_usd=excluded.borrow_assets_usd, collateral_assets_usd=excluded.collateral_assets_usd, price_collateral_in_loan_asset=excluded.price_collateral_in_loan_asset, quality_count=excluded.quality_count, quality_status=excluded.quality_status, healed=true, heal_source=excluded.heal_source, healed_from=excluded.healed_from`
        : sql`DO NOTHING`
    const res = await db.execute(sql`
      INSERT INTO apy_hourly (
        product_id, hour, apy_base, apy_rewards, apy_fees, apy_net, reward_items,
        supply_assets, supply_assets_usd, utilization_rate, asset_price_usd,
        borrow_assets, borrow_assets_usd, collateral_assets_usd, price_collateral_in_loan_asset,
        quality_count, quality_expected_count, quality_first_slot, quality_last_slot, quality_status,
        healed, heal_source, healed_from
      ) VALUES (
        ${r.productId}, ${r.hour}, ${r.apy.base}, ${r.apy.rewards}, ${r.apy.fees}, ${r.apy.net},
        ${JSON.stringify(r.apy.rewardItems)}::jsonb,
        ${m.supplyAssets ?? null}, ${m.supplyAssetsUsd ?? null}, ${m.utilizationRate ?? null}, ${m.assetPriceUsd ?? null},
        ${m.borrowAssets ?? null}, ${m.borrowAssetsUsd ?? null}, ${m.collateralAssetsUsd ?? null}, ${m.priceCollateralInLoanAsset ?? null},
        ${count}, 6, ${r.hour}, ${r.hour}, ${status}, true, ${r.source}, ${r.healedFrom}
      )
      ON CONFLICT (product_id, hour) ${conflict}
    `)
    written += res.rowCount ?? 0
  }
  return written
}

/** Donor rows for nearest-neighbor heal (Compound + fallback). */
export async function fetchDonors(
  productIds: string[],
  start: Date,
  end: Date
): Promise<Record<string, unknown>[]> {
  if (productIds.length === 0) return []
  const res = await db.execute(sql`
    SELECT product_id, hour, apy_base, apy_rewards, apy_fees, apy_net, reward_items,
           supply_assets, supply_assets_usd, utilization_rate, asset_price_usd,
           borrow_assets, borrow_assets_usd, collateral_assets_usd, price_collateral_in_loan_asset
    FROM apy_hourly
    WHERE product_id = ANY(${productIds}) AND hour >= ${start} AND hour <= ${end}
  `)
  return res.rows as Record<string, unknown>[]
}

/** TTL replacement — delete hourly rows older than 180 days. Returns count. */
export async function pruneHourly(): Promise<number> {
  const res = await db.execute(
    sql`DELETE FROM apy_hourly WHERE hour < now() - interval '180 days'`
  )
  return res.rowCount ?? 0
}
