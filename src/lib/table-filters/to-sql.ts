import { type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import type { FilterFieldId, FilterOp, TableFilter } from './types'

/**
 * Where each filterable field lives in a given query.
 *
 * Passed in rather than hardcoded because three shapes have to be served: the
 * `apy_hourly` table, the `apy_daily` table, and the `latest` CTE in
 * `queryLatestApy` — same column names, different aliases.
 */
export type FilterColumns = Record<FilterFieldId, SQL | AnyPgColumn>

/** Daily means and hourly last readings use the same stored cash quantity. */
interface OrderableLike {
  supplyAssetsUsd: AnyPgColumn
  availableLiquidityUsd: AnyPgColumn
  utilizationRate: AnyPgColumn
  apyNet: AnyPgColumn
  lastSupplyAssetsUsd?: AnyPgColumn
  lastAvailableLiquidityUsd?: AnyPgColumn
  lastUtilizationRate?: AnyPgColumn
}

export function hourlyFilterColumns(t: OrderableLike): FilterColumns {
  const deposits = t.lastSupplyAssetsUsd
    ? sql`COALESCE(${t.lastSupplyAssetsUsd}, ${t.supplyAssetsUsd})`
    : t.supplyAssetsUsd
  // An explicit unknown cash reading cannot fall back to an earlier mean.
  const liquidity = t.lastAvailableLiquidityUsd ?? t.availableLiquidityUsd
  const utilization = t.lastUtilizationRate
    ? sql`COALESCE(${t.lastUtilizationRate}, ${t.utilizationRate})`
    : t.utilizationRate
  return { deposits, liquidity, netApy: t.apyNet, utilization }
}

/**
 * The SQL half of each operator. Keyed by the same union as `OPERATORS.js`, and
 * `satisfies` makes a new operator a compile error until both halves exist.
 *
 * No IS NULL handling anywhere: a comparison against NULL yields NULL and the
 * row drops out — which is precisely the behaviour `matchesFilters` reproduces
 * by refusing every operator on a missing value.
 */
const SQL_OPS = {
  eq: (col, v) => sql`${col} = ${v}`,
  ne: (col, v) => sql`${col} <> ${v}`,
  gt: (col, v) => sql`${col} > ${v}`,
  gte: (col, v) => sql`${col} >= ${v}`,
  lt: (col, v) => sql`${col} < ${v}`,
  lte: (col, v) => sql`${col} <= ${v}`,
} as const satisfies Record<
  FilterOp,
  (col: SQL | AnyPgColumn, value: number) => SQL
>

/**
 * Compile a filter list into `where` conditions. ANDed by the caller, exactly
 * as `matchesFilters` ANDs them; an empty list yields no conditions.
 *
 * `apy_net` is NOT NULL in both tables but can hold NaN, which Postgres sorts
 * above every real number. The finiteness guard stays where it is
 * (`finiteApy()` in the repository) — this function only ever emits the user's
 * predicate.
 */
export function toSqlConds(
  filters: TableFilter[],
  columns: FilterColumns
): SQL[] {
  return filters.map((f) => SQL_OPS[f.op](columns[f.field], f.value))
}
