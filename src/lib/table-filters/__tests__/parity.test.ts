import { PGlite } from '@electric-sql/pglite'
import { and, sql as drizzleSql } from 'drizzle-orm'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { beforeAll, describe, expect, it } from 'vitest'

import { resolveAvailableLiquidity } from '@/lib/db/last-observation'
import { apyHourly } from '@/lib/db/schema'
import {
  type FilterableRow,
  type TableFilter,
  matchesFilters,
} from '@/lib/table-filters'
import { hourlyFilterColumns, toSqlConds } from '@/lib/table-filters/to-sql'

/**
 * The predicate is data with two readers: one applies it to an object, one
 * compiles it into a `where`. Two writings of one predicate always drift — the
 * APY pipeline produced three instances in one week (points vs rows, candidates
 * vs changes, an existence probe on a shifted window). So the equality is
 * EXECUTED here, against a real PostgreSQL, rather than argued in review.
 */

interface Fixture {
  id: string
  supplyAssetsUsd: number | null
  utilizationRate: number | null
  apyNet: number
  lastSupplyAssetsUsd?: number | null
  lastUtilizationRate?: number | null
  availableLiquidityUsd?: number | null
}

const FIXTURES: Fixture[] = [
  {
    id: 'healthy',
    supplyAssetsUsd: 5_000_000,
    utilizationRate: 0.6,
    apyNet: 0.043,
  },
  {
    id: 'exactly-at-floor',
    supplyAssetsUsd: 100_000,
    utilizationRate: 0,
    apyNet: 0.05,
  },
  { id: 'thin', supplyAssetsUsd: 22_000, utilizationRate: 0.5, apyNet: 3.42 },
  {
    id: 'outlier-positive',
    supplyAssetsUsd: 27_800_000,
    utilizationRate: 1,
    apyNet: 2979.96,
  },
  {
    id: 'outlier-negative',
    supplyAssetsUsd: 8_900_000,
    utilizationRate: 1,
    apyNet: -2979.96,
  },
  {
    id: 'fully-utilised',
    supplyAssetsUsd: 1_000_000,
    utilizationRate: 1,
    apyNet: 0.2,
  },
  { id: 'idle', supplyAssetsUsd: 1_000_000, utilizationRate: 0, apyNet: 0 },
  {
    id: 'unknown-tvl',
    supplyAssetsUsd: null,
    utilizationRate: null,
    apyNet: 0.05,
  },
  {
    id: 'unknown-utilization',
    supplyAssetsUsd: 500_000,
    utilizationRate: null,
    apyNet: 0.05,
  },
  { id: 'zero-deposits', supplyAssetsUsd: 0, utilizationRate: 0, apyNet: 0.05 },
  // The mean TVL sits just under the $100k floor; the last observed reading
  // sits just over it. `last ?? mean` on the JS side and `COALESCE(last, mean)`
  // on the SQL side must agree that this market is now ABOVE the floor — a
  // fixture where the two readings land on the same side of 100k would never
  // exercise the COALESCE path at all.
  {
    id: 'last-tvl-crosses-floor',
    supplyAssetsUsd: 99_000,
    utilizationRate: 0.4,
    apyNet: 0.05,
    lastSupplyAssetsUsd: 101_000,
  },
  // The mean utilisation rate sits at 95%; the last observed rate at 99.5%.
  // Liquidity's derivation reads the raw utilisation column (kind-independent,
  // see Finding 1), so this crosses the "utilization gte 99%" boundary — it
  // used to NOT cross it under the old (wrong) borrow-side subtraction, which
  // never looked at `utilization_rate` at all.
  {
    id: 'last-util-crosses-99pct',
    supplyAssetsUsd: 2_000_000,
    utilizationRate: 0.95,
    apyNet: 0.06,
    lastUtilizationRate: 0.995,
  },
  {
    id: 'explicit-unknown-cash',
    supplyAssetsUsd: 500_000,
    utilizationRate: 0.8,
    availableLiquidityUsd: null,
    apyNet: 0.05,
  },
  {
    id: 'explicit-zero-cash',
    supplyAssetsUsd: 500_000,
    utilizationRate: 0,
    availableLiquidityUsd: 0,
    apyNet: 0.05,
  },
  {
    id: 'cash-differs-from-irm',
    supplyAssetsUsd: 1_000_000,
    utilizationRate: 0.9,
    availableLiquidityUsd: 750_000,
    apyNet: 0.05,
  },
]

const fixtureCash = (f: Fixture): number | null =>
  resolveAvailableLiquidity({
    supplyAssetsUsd: f.lastSupplyAssetsUsd ?? f.supplyAssetsUsd,
    utilizationRate: f.lastUtilizationRate ?? f.utilizationRate,
    availableLiquidityUsd: f.availableLiquidityUsd,
  }).availableLiquidityUsd

const asRow = (f: Fixture): FilterableRow => ({
  assetAmountUsd: f.lastSupplyAssetsUsd ?? f.supplyAssetsUsd,
  liquidityAmountUsd: fixtureCash(f),
  utilizationRate: f.lastUtilizationRate ?? f.utilizationRate,
  apy: f.apyNet,
})

const DDL = `
  CREATE TABLE apy_hourly (
    product_id text NOT NULL,
    hour timestamptz NOT NULL,
    apy_base double precision NOT NULL,
    apy_rewards double precision NOT NULL,
    apy_fees double precision NOT NULL,
    apy_net double precision NOT NULL,
    supply_assets_usd double precision,
    utilization_rate double precision,
    last_supply_assets_usd double precision,
    last_utilization_rate double precision,
    available_liquidity_usd double precision,
    last_available_liquidity_usd double precision,
    PRIMARY KEY (product_id, hour)
  );
`

let pg: PGlite

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(DDL)
  for (const f of FIXTURES) {
    await pg.query(
      `INSERT INTO apy_hourly
         (product_id, hour, apy_base, apy_rewards, apy_fees, apy_net,
          supply_assets_usd, utilization_rate,
          last_supply_assets_usd, last_utilization_rate, available_liquidity_usd, last_available_liquidity_usd)
       VALUES ($1, now(), 0, 0, 0, $2, $3, $4, $5, $6, $7, $7)`,
      [
        f.id,
        f.apyNet,
        f.supplyAssetsUsd,
        f.utilizationRate,
        f.lastSupplyAssetsUsd ?? null,
        f.lastUtilizationRate ?? null,
        fixtureCash(f),
      ]
    )
  }
})

async function sqlSide(
  filters: TableFilter[],
  fixtures: Fixture[] = FIXTURES
): Promise<string[]> {
  const included = new Set(fixtures.map((f) => f.id))
  const conds = toSqlConds(filters, hourlyFilterColumns(apyHourly))
  const query = new QueryBuilder()
    // Explicitly aliased: a plain `{ id: apyHourly.productId }` compiles to
    // `select "product_id" ...` with no `AS "id"` — Drizzle's own row mapper
    // (bypassed here, since we run the compiled text through PGlite directly)
    // is what normally reconciles that. Without the alias the query still
    // runs, but every row comes back keyed `product_id` and `r.id` below is
    // `undefined` for every case — a harness bug, not a predicate divergence.
    .select({ id: drizzleSql<string>`${apyHourly.productId}`.as('id') })
    .from(apyHourly)
    .where(conds.length ? and(...conds) : undefined)
  const { sql, params } = query.toSQL()
  const res = await pg.query<{ id: string }>(sql, params as unknown[])
  return res.rows
    .map((r) => r.id)
    .filter((id) => included.has(id))
    .sort()
}

function jsSide(
  filters: TableFilter[],
  fixtures: Fixture[] = FIXTURES
): string[] {
  return fixtures
    .filter((f) => matchesFilters(asRow(f), filters, 'intraday'))
    .map((f) => f.id)
    .sort()
}

/** Every case is run through both evaluators and compared, never asserted flat. */
const CASES: { name: string; filters: TableFilter[] }[] = [
  { name: 'no filters', filters: [] },
  {
    name: 'the defaults',
    filters: [
      { id: crypto.randomUUID(), field: 'deposits', op: 'gte', value: 100_000 },
      { id: crypto.randomUUID(), field: 'netApy', op: 'lte', value: 10 },
      { id: crypto.randomUUID(), field: 'netApy', op: 'gte', value: -10 },
    ],
  },
  {
    name: 'deposits gte',
    filters: [
      { id: crypto.randomUUID(), field: 'deposits', op: 'gte', value: 100_000 },
    ],
  },
  {
    name: 'deposits gt',
    filters: [
      { id: crypto.randomUUID(), field: 'deposits', op: 'gt', value: 100_000 },
    ],
  },
  {
    name: 'deposits lte',
    filters: [
      { id: crypto.randomUUID(), field: 'deposits', op: 'lte', value: 100_000 },
    ],
  },
  {
    name: 'deposits lt',
    filters: [
      { id: crypto.randomUUID(), field: 'deposits', op: 'lt', value: 100_000 },
    ],
  },
  {
    name: 'deposits eq',
    filters: [
      { id: crypto.randomUUID(), field: 'deposits', op: 'eq', value: 100_000 },
    ],
  },
  {
    name: 'deposits ne',
    filters: [
      { id: crypto.randomUUID(), field: 'deposits', op: 'ne', value: 100_000 },
    ],
  },
  {
    name: 'liquidity gte',
    filters: [
      { id: crypto.randomUUID(), field: 'liquidity', op: 'gte', value: 1 },
    ],
  },
  {
    name: 'liquidity eq zero',
    filters: [
      { id: crypto.randomUUID(), field: 'liquidity', op: 'eq', value: 0 },
    ],
  },
  {
    name: 'utilization gte 99%',
    filters: [
      { id: crypto.randomUUID(), field: 'utilization', op: 'gte', value: 0.99 },
    ],
  },
  {
    name: 'utilization lt 50%',
    filters: [
      { id: crypto.randomUUID(), field: 'utilization', op: 'lt', value: 0.5 },
    ],
  },
  {
    name: 'utilization ne 0',
    filters: [
      { id: crypto.randomUUID(), field: 'utilization', op: 'ne', value: 0 },
    ],
  },
  {
    name: 'net apy lte',
    filters: [
      { id: crypto.randomUUID(), field: 'netApy', op: 'lte', value: 10 },
    ],
  },
  {
    name: 'net apy gte negative bound',
    filters: [
      { id: crypto.randomUUID(), field: 'netApy', op: 'gte', value: -10 },
    ],
  },
  {
    name: 'deposits gte 0 (floor at zero)',
    filters: [
      { id: crypto.randomUUID(), field: 'deposits', op: 'gte', value: 0 },
    ],
  },
]

describe('one predicate, two evaluators', () => {
  it.each(CASES)('renders the same set — $name', async ({ filters }) => {
    expect(await sqlSide(filters)).toEqual(jsSide(filters))
  })

  it('filters actual cash independently of IRM utilization and refuses unknown cash', async () => {
    const filters: TableFilter[] = [
      { id: 'cash', field: 'liquidity', op: 'gte', value: 700_000 },
    ]
    expect(await sqlSide(filters)).toContain('cash-differs-from-irm')
    expect(await sqlSide(filters)).not.toContain('explicit-unknown-cash')
    expect(await sqlSide(filters)).toEqual(jsSide(filters))
  })
})
