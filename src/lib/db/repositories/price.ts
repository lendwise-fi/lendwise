import { sql } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'

export interface PricePoint {
  date: string
  returnPct: number
}

/** Best productId for a symbol — most daily rows with a realistic USD price. */
export async function bestProductId(symbol: string): Promise<string | null> {
  const primary = await db.execute(sql`
    SELECT d.product_id
    FROM apy_daily d
    JOIN products p ON p.id = d.product_id
    WHERE p.asset_symbol = ${symbol} AND d.asset_price_usd > 100
    GROUP BY d.product_id ORDER BY count(*) DESC LIMIT 1
  `)
  const top = (primary.rows as { product_id: string }[])[0]
  if (top) return top.product_id

  const fb = await db.execute(sql`
    SELECT d.product_id
    FROM apy_daily d
    JOIN products p ON p.id = d.product_id
    WHERE p.asset_symbol = ${symbol} AND d.asset_price_usd > 0
    GROUP BY d.product_id ORDER BY count(*) DESC LIMIT 1
  `)
  return (fb.rows as { product_id: string }[])[0]?.product_id ?? null
}

/** Latest USD spot price for a symbol — freshest hourly observation. */
export async function latestPrice(symbol: string): Promise<number | null> {
  const id = await bestProductId(symbol)
  if (!id) return null
  const res = await db.execute(sql`
    SELECT asset_price_usd
    FROM apy_hourly
    WHERE product_id = ${id} AND asset_price_usd > 0
    ORDER BY hour DESC LIMIT 1
  `)
  return (res.rows as { asset_price_usd: number }[])[0]?.asset_price_usd ?? null
}

/**
 * Daily return of the pair price p_t = collateralUsd_t / loanUsd_t.
 * JOIN on date + LAG() window function — replaces the JS map-join + manual prev loop.
 */
export async function priceReturnHistory(
  collateralSymbol: string,
  loanSymbol: string,
  days = 730
): Promise<PricePoint[]> {
  const [cid, lid] = await Promise.all([
    bestProductId(collateralSymbol),
    bestProductId(loanSymbol),
  ])
  if (!cid || !lid) return []

  const res = await db.execute(sql`
    WITH pair AS (
      SELECT c.date AS date, c.asset_price_usd / l.asset_price_usd AS price
      FROM apy_daily c
      JOIN apy_daily l ON l.date = c.date AND l.product_id = ${lid}
      WHERE c.product_id = ${cid}
        AND c.date >= now() - (${days} || ' days')::interval
        AND c.asset_price_usd > 0 AND l.asset_price_usd > 0
    ),
    ret AS (
      SELECT date, price, lag(price) OVER (ORDER BY date) AS prev FROM pair
    )
    SELECT date, (price - prev) / prev * 100 AS return_pct
    FROM ret WHERE prev IS NOT NULL AND prev > 0 ORDER BY date
  `)
  return (res.rows as { date: Date; return_pct: number }[]).map((r) => ({
    date: new Date(r.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    returnPct: r.return_pct,
  }))
}
