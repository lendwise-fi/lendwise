import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'
import { apyDaily, apyHourly, products } from '@/lib/db/schema'
import type {
  BorrowMarketState,
  RewardItem,
  SpotPayload,
  SupplyMarketState,
} from '@/lib/db/types'

/**
 * Build a parenthesized `($1, $2, …)` list for `col IN (...)`.
 * neon-http does not bind a JS array as a Postgres array, so `= ANY($1)` fails
 * with "op ANY/ALL (array) requires array on right side". Expanding to IN works.
 * Caller must guard against empty input.
 */
function inList(values: string[]) {
  return sql`(${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  )})`
}

// ─── Hourly running-mean upsert ─────────────────────────────────────────────

/** Columns averaged with the incremental-mean formula on conflict. */
const MEAN_COLUMNS = [
  'apy_base',
  'apy_rewards',
  'apy_fees',
  'apy_net',
  'supply_assets',
  'supply_assets_usd',
  'utilization_rate',
  'asset_price_usd',
  'borrow_assets',
  'borrow_assets_usd',
  'collateral_assets_usd',
  'price_collateral_in_loan_asset',
] as const

/**
 * Emits `col = <running mean>` for each averaged column.
 * NULL-safe: if either side is NULL, keep the non-null one (matches old $cond logic).
 *   new_avg = (old*count + new) / (count+1)
 */
function meanSetClause() {
  const parts = MEAN_COLUMNS.map(
    (c) => sql`${sql.raw(c)} = CASE
      WHEN apy_hourly.${sql.raw(c)} IS NULL THEN excluded.${sql.raw(c)}
      WHEN excluded.${sql.raw(c)} IS NULL THEN apy_hourly.${sql.raw(c)}
      ELSE (apy_hourly.${sql.raw(c)} * apy_hourly.quality_count + excluded.${sql.raw(c)})
           / (apy_hourly.quality_count + 1)
    END`
  )
  return sql.join(parts, sql`, `)
}

/**
 * Rows per multi-row upsert. Kept small so a single statement stays well under
 * the neon-http request-payload cap (the backfill hit it at ~2000 rows) and the
 * Postgres 65535-param bind limit (250 × 20 = 5000).
 */
const UPSERT_CHUNK = 250

/** One VALUES tuple for the bulk hourly upsert. */
function hourlyValueTuple(p: SpotPayload, hour: Date, slotTime: Date) {
  const isSupply = p.kind === 'supply'
  const sm = p.market as SupplyMarketState
  const bm = p.market as BorrowMarketState
  return sql`(
    ${p.productId}, ${hour},
    ${p.apy.base}, ${p.apy.rewards}, ${p.apy.fees}, ${p.apy.net},
    ${JSON.stringify(p.apy.rewardItems)}::jsonb,
    ${isSupply ? sm.supplyAssets : bm.supplyAssets},
    ${isSupply ? sm.supplyAssetsUsd : bm.supplyAssetsUsd},
    ${p.market.utilizationRate}, ${p.market.assetPriceUsd},
    ${isSupply ? null : bm.borrowAssets},
    ${isSupply ? null : bm.borrowAssetsUsd},
    ${isSupply ? null : (bm.collateralAssetsUsd ?? null)},
    ${isSupply ? null : (bm.priceCollateralInLoanAsset ?? null)},
    1, 6, ${slotTime}, ${slotTime}, 'building'
  )`
}

/**
 * Upsert many products' hourly rolling-average rows in chunked multi-row
 * statements. Each row's running mean resolves independently against its own
 * `excluded` values. ProductIds within a slot are unique, so no row is touched
 * twice per statement.
 */
export async function upsertHourlySlots(
  payloads: SpotPayload[],
  hour: Date,
  slotTime: Date
): Promise<number> {
  // One observation per product per slot. Some adapters (Compound) emit the
  // same Comet productId once per collateral; collapse to the last occurrence
  // so a single multi-row statement never touches the same key twice
  // (Postgres: "ON CONFLICT DO UPDATE command cannot affect row a second time").
  const deduped = Array.from(
    new Map(payloads.map((p) => [p.productId, p])).values()
  )
  for (let i = 0; i < deduped.length; i += UPSERT_CHUNK) {
    const chunk = deduped.slice(i, i + UPSERT_CHUNK)
    const rows = chunk.map((p) => hourlyValueTuple(p, hour, slotTime))
    await db.execute(sql`
      INSERT INTO apy_hourly (
        product_id, hour,
        apy_base, apy_rewards, apy_fees, apy_net, reward_items,
        supply_assets, supply_assets_usd, utilization_rate, asset_price_usd,
        borrow_assets, borrow_assets_usd, collateral_assets_usd, price_collateral_in_loan_asset,
        quality_count, quality_expected_count, quality_first_slot, quality_last_slot, quality_status
      ) VALUES ${sql.join(rows, sql`, `)}
      ON CONFLICT (product_id, hour) DO UPDATE SET
        ${meanSetClause()},
        reward_items = excluded.reward_items,
        quality_count = apy_hourly.quality_count + 1,
        quality_last_slot = excluded.quality_last_slot,
        quality_status = CASE WHEN apy_hourly.quality_count + 1 >= 6 THEN 'complete' ELSE 'building' END
    `)
  }
  return deduped.length
}

/** Upsert a single product's hourly row (thin wrapper over the batch path). */
export async function upsertHourlySlot(
  payload: SpotPayload,
  hour: Date,
  slotTime: Date
): Promise<void> {
  await upsertHourlySlots([payload], hour, slotTime)
}

// ─── Daily aggregation (one set-based statement) ────────────────────────────

/**
 * Aggregate all hourly rows in [windowStart, windowEnd) into apy_daily,
 * one row per product, in a single statement. reward_items = last slot of the day.
 * Idempotent: re-running the same day replaces rows and bumps quality_revision.
 */
export async function aggregateDaily(
  windowStart: Date,
  windowEnd: Date,
  computedAt: Date
): Promise<number> {
  const res = await db.execute(sql`
    WITH agg AS (
      SELECT
        product_id,
        avg(apy_base)    AS apy_base,
        avg(apy_rewards) AS apy_rewards,
        avg(apy_fees)    AS apy_fees,
        avg(apy_net)     AS apy_net,
        avg(supply_assets)     AS supply_assets,
        avg(supply_assets_usd) AS supply_assets_usd,
        avg(utilization_rate)  AS utilization_rate,
        avg(asset_price_usd)   AS asset_price_usd,
        avg(borrow_assets)     AS borrow_assets,
        avg(borrow_assets_usd) AS borrow_assets_usd,
        avg(collateral_assets_usd) AS collateral_assets_usd,
        avg(price_collateral_in_loan_asset) AS price_collateral_in_loan_asset,
        count(*) AS actual_count,
        (array_agg(reward_items ORDER BY hour DESC))[1] AS reward_items
      FROM apy_hourly
      WHERE hour >= ${windowStart} AND hour < ${windowEnd}
      GROUP BY product_id
    )
    INSERT INTO apy_daily (
      product_id, date, apy_base, apy_rewards, apy_fees, apy_net, reward_items,
      supply_assets, supply_assets_usd, utilization_rate, asset_price_usd,
      borrow_assets, borrow_assets_usd, collateral_assets_usd, price_collateral_in_loan_asset,
      quality_actual_count, quality_expected_count, quality_completeness, quality_status,
      quality_revision, quality_computed_at
    )
    SELECT
      product_id, ${windowStart}, apy_base, apy_rewards, apy_fees, apy_net, reward_items,
      supply_assets, supply_assets_usd, utilization_rate, asset_price_usd,
      borrow_assets, borrow_assets_usd, collateral_assets_usd, price_collateral_in_loan_asset,
      actual_count, 24, least(actual_count::float / 24, 1),
      CASE WHEN actual_count >= 24 THEN 'complete'
           WHEN actual_count >= 12 THEN 'partial' ELSE 'missing' END,
      0, ${computedAt}
    FROM agg
    ON CONFLICT (product_id, date) DO UPDATE SET
      apy_base = excluded.apy_base, apy_rewards = excluded.apy_rewards,
      apy_fees = excluded.apy_fees, apy_net = excluded.apy_net,
      reward_items = excluded.reward_items,
      supply_assets = excluded.supply_assets, supply_assets_usd = excluded.supply_assets_usd,
      utilization_rate = excluded.utilization_rate, asset_price_usd = excluded.asset_price_usd,
      borrow_assets = excluded.borrow_assets, borrow_assets_usd = excluded.borrow_assets_usd,
      collateral_assets_usd = excluded.collateral_assets_usd,
      price_collateral_in_loan_asset = excluded.price_collateral_in_loan_asset,
      quality_actual_count = excluded.quality_actual_count,
      quality_completeness = excluded.quality_completeness,
      quality_status = excluded.quality_status,
      quality_computed_at = excluded.quality_computed_at,
      quality_revision = apy_daily.quality_revision + 1
  `)
  return res.rowCount ?? 0
}

// ─── Enrichment reads (used by products.actions) ────────────────────────────

/** Latest hourly net APY per product (replaces $sort+$group $first). */
export async function latestHourlyNet(
  productIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (productIds.length === 0) return map
  const res = await db.execute(sql`
    SELECT DISTINCT ON (product_id) product_id, apy_net
    FROM apy_hourly
    WHERE product_id IN ${inList(productIds)}
    ORDER BY product_id, hour DESC
  `)
  for (const r of res.rows as { product_id: string; apy_net: number }[]) {
    map.set(r.product_id, r.apy_net)
  }
  return map
}

export interface ApyEnrichment {
  apyDaily?: number
  apyMonthly?: number
  apyYearly?: number
}

/**
 * 7d / 30d / 365d net-APY windowed averages, matching the 7D / 1M / 1Y horizon
 * labels exposed in the UI. Each value is the mean of whatever daily rows exist
 * in its window and is returned as soon as ≥1 row is present — partial coverage
 * is surfaced rather than hidden, so freshly-tracked products still show a
 * value instead of a dash.
 */
export async function apyEnrichments(
  productIds: string[]
): Promise<Map<string, ApyEnrichment>> {
  const map = new Map<string, ApyEnrichment>()
  if (productIds.length === 0) return map
  const res = await db.execute(sql`
    SELECT
      product_id,
      avg(apy_net) FILTER (WHERE date >= now() - interval '7 days')   AS avg7,
      count(*)     FILTER (WHERE date >= now() - interval '7 days')   AS n7,
      avg(apy_net) FILTER (WHERE date >= now() - interval '30 days')  AS avg30,
      count(*)     FILTER (WHERE date >= now() - interval '30 days')  AS n30,
      avg(apy_net)                                                    AS avg365,
      count(*)                                                        AS n365
    FROM apy_daily
    WHERE product_id IN ${inList(productIds)} AND date >= now() - interval '365 days'
    GROUP BY product_id
  `)
  for (const r of res.rows as {
    product_id: string
    avg7: number | null
    n7: number | string
    avg30: number | null
    n30: number | string
    avg365: number | null
    n365: number | string
  }[]) {
    const avg = (v: number | null) => (v != null ? Number(v) : undefined)
    map.set(r.product_id, {
      apyDaily: Number(r.n7) >= 1 ? avg(r.avg7) : undefined,
      apyMonthly: Number(r.n30) >= 1 ? avg(r.avg30) : undefined,
      apyYearly: Number(r.n365) >= 1 ? avg(r.avg365) : undefined,
    })
  }
  return map
}

// ─── Filtered read (JOIN products — replaces the regex path) ────────────────

export interface ApyFilters {
  kind: 'supply' | 'borrow'
  protocol?: string // 'aave' | 'morpho' | 'compound' (or '<provider>_<version>')
  market?: string // protocol_name, e.g. "AaveV3Ethereum"
  chainId?: number
  asset?: string // asset symbol — NOW actually applied
  collateral?: string // borrow only; matched against collaterals jsonb
  from?: Date
  to?: Date
}

export interface Page {
  first: number
  skip: number
  orderBy: 'hour' | 'date'
  orderDir: 'asc' | 'desc'
}

/**
 * Returns rows joined with their product, plus a total count, for a hourly/daily query.
 * Filters hit indexed columns on products — no regex, no full scan.
 */
export async function queryApy(
  grain: 'hourly' | 'daily',
  f: ApyFilters,
  page: Page
) {
  // Column names are identical across both tables; cast for unified typing.
  const table = (grain === 'hourly' ? apyHourly : apyDaily) as typeof apyHourly
  const timeCol = grain === 'hourly' ? apyHourly.hour : apyDaily.date

  const conds = [eq(products.kind, f.kind)]
  if (f.protocol) conds.push(eq(products.provider, f.protocol.split('_')[0]))
  if (f.market) conds.push(eq(products.protocolName, f.market))
  if (f.chainId) conds.push(eq(products.chainId, f.chainId))
  if (f.asset) conds.push(eq(products.assetSymbol, f.asset))
  if (f.collateral)
    conds.push(
      sql`${products.collaterals} @> ${JSON.stringify([{ symbol: f.collateral }])}::jsonb`
    )
  if (f.from) conds.push(gte(timeCol, f.from))
  if (f.to) conds.push(lte(timeCol, f.to))
  const where = and(...conds)

  const order = page.orderDir === 'desc' ? desc(timeCol) : asc(timeCol)

  const [countRows, rows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .innerJoin(products, eq(table.productId, products.id))
      .where(where),
    db
      .select({ row: table, product: products })
      .from(table)
      .innerJoin(products, eq(table.productId, products.id))
      .where(where)
      .orderBy(order)
      .limit(Math.min(page.first, 10_000))
      .offset(page.skip),
  ])

  return { rows, countTotal: countRows[0]?.n ?? 0 }
}

// ─── Single-product time series ──────────────────────────────────────────────

/** One slot of a product's full APY + market-state history. */
export interface ProductApyHistoryPoint {
  t: Date
  base: number
  rewards: number
  fees: number
  net: number
  rewardItems: RewardItem[]
  supplyAssetsUsd: number | null
  borrowAssetsUsd: number | null
  collateralAssetsUsd: number | null
  utilizationRate: number | null
  assetPriceUsd: number | null
}

/**
 * Full APY + market-state series for a single product, ordered oldest→newest.
 * Reads our own pipeline tables (apy_hourly / apy_daily) by exact productId, so
 * values match the products table exactly. Powers the product detail drawer.
 */
export async function productApyHistory(
  productId: string,
  grain: 'hourly' | 'daily',
  from?: Date
): Promise<ProductApyHistoryPoint[]> {
  // Columns are identical across both tables; cast for unified typing.
  const table = (grain === 'hourly' ? apyHourly : apyDaily) as typeof apyHourly
  const timeCol = grain === 'hourly' ? apyHourly.hour : apyDaily.date

  const conds = [eq(table.productId, productId)]
  if (from) conds.push(gte(timeCol, from))

  const rows = await db
    .select({
      t: timeCol,
      base: table.apyBase,
      rewards: table.apyRewards,
      fees: table.apyFees,
      net: table.apyNet,
      rewardItems: table.rewardItems,
      supplyAssetsUsd: table.supplyAssetsUsd,
      borrowAssetsUsd: table.borrowAssetsUsd,
      collateralAssetsUsd: table.collateralAssetsUsd,
      utilizationRate: table.utilizationRate,
      assetPriceUsd: table.assetPriceUsd,
    })
    .from(table)
    .where(and(...conds))
    .orderBy(asc(timeCol))
    .limit(10_000)

  return rows.map((r) => ({
    t: new Date(r.t),
    base: r.base,
    rewards: r.rewards,
    fees: r.fees,
    net: r.net,
    rewardItems: (r.rewardItems as RewardItem[]) ?? [],
    supplyAssetsUsd: r.supplyAssetsUsd,
    borrowAssetsUsd: r.borrowAssetsUsd,
    collateralAssetsUsd: r.collateralAssetsUsd,
    utilizationRate: r.utilizationRate,
    assetPriceUsd: r.assetPriceUsd,
  }))
}
