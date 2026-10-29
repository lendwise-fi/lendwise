import type { BorrowProduct, Collateral, SupplyProduct } from '@/lib/db/types'
import type { FetchOpts } from '@/lib/protocols/core/types'

import {
  type KaminoReserveMetric,
  type KaminoReserveStats,
  fetchMarkets,
  fetchReserveMetrics,
  fetchReserveStats,
} from '../common/api'
import { KAMINO_API_URL, KAMINO_PROVIDER } from '../common/config'
import {
  SOLANA_CHAIN_ID,
  coversSolana,
  isBorrowableReserve,
  isListedReserve,
} from '../listing'
import type { KaminoBorrowMeta, KaminoSupplyMeta } from './types'
import { buildProductId } from './utils'

/** Markets whose symbols are read in parallel. */
const METRICS_CONCURRENCY = 4

const CHAIN = { id: SOLANA_CHAIN_ID, name: 'solana' }

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  )
  return out
}

/**
 * Full catalogue: one supply product per listed reserve, plus a borrow product
 * when the reserve is borrowable (see `isBorrowableReserve`).
 *
 * Batch stats carry no symbol, so each market with at least one listed reserve
 * is read once through `/reserves/metrics`. A market whose symbols cannot be
 * read is skipped with a warning (its products come back at the next sync);
 * the other markets are unaffected.
 *
 * Decimals are not published by either endpoint, so `asset.decimals` is 0
 * here. Nothing in the catalogue reads it; token amounts of positions are
 * converted from the history/obligation payloads instead.
 */
export async function fetchKaminoProducts(
  opts?: FetchOpts
): Promise<(SupplyProduct | BorrowProduct)[]> {
  if (!coversSolana(opts)) return []

  const markets = await fetchMarkets()
  const marketNames = new Map(markets.map((m) => [m.address, m.name]))
  const reserves = (
    await fetchReserveStats(markets.map((m) => m.address))
  ).filter(isListedReserve)

  const byMarket = new Map<string, KaminoReserveStats[]>()
  for (const r of reserves) {
    const list = byMarket.get(r.market) ?? []
    list.push(r)
    byMarket.set(r.market, list)
  }

  const metricsByMarket = new Map<string, Map<string, KaminoReserveMetric>>()
  await mapWithConcurrency(
    [...byMarket.keys()],
    METRICS_CONCURRENCY,
    async (market) => {
      try {
        const metrics = await fetchReserveMetrics(market)
        metricsByMarket.set(market, new Map(metrics.map((m) => [m.reserve, m])))
      } catch (error) {
        console.warn(
          `[products:kamino] Skipping market ${market}: symbols unavailable (${error instanceof Error ? error.message : String(error)})`
        )
      }
    }
  )

  const now = new Date()
  const products: (SupplyProduct | BorrowProduct)[] = []

  for (const [market, marketReserves] of byMarket) {
    const metrics = metricsByMarket.get(market)
    if (!metrics) continue
    const marketName = marketNames.get(market) ?? market

    // Collateral of a borrow in this market: every listed reserve that can
    // back a loan. Kamino collateral is cross-reserve per obligation.
    const collaterals: Collateral[] = []
    for (const c of marketReserves) {
      const m = metrics.get(c.reserve)
      if (!m || c.maxLtv <= 0) continue
      collaterals.push({
        symbol: m.symbol,
        name: m.symbol,
        address: m.mint,
        decimals: 0,
        ltv: c.maxLtv,
        lltv: c.liquidationLtv,
        canBeCollateral: true,
      })
    }

    for (const r of marketReserves) {
      const m = metrics.get(r.reserve)
      if (!m) continue // listed in stats but absent from metrics: no symbol
      const meta: KaminoSupplyMeta & KaminoBorrowMeta = {
        market,
        reserve: r.reserve,
        mint: r.mint,
        marketName,
        symbol: m.symbol,
      }
      const base = {
        active: true,
        createdAt: now,
        updatedAt: now,
        asset: {
          symbol: m.symbol,
          name: m.symbol,
          address: r.mint,
          decimals: 0,
        },
        protocol: {
          provider: KAMINO_PROVIDER,
          type: 'reserve' as const,
          version: 'v1',
          name: 'KaminoLend',
          subgraphUrl: KAMINO_API_URL,
          chain: CHAIN,
          address: r.reserve,
          meta,
        },
      }
      products.push({
        ...base,
        _id: buildProductId(market, r.reserve, 'supply'),
        kind: 'supply',
      } satisfies SupplyProduct<KaminoSupplyMeta>)
      if (isBorrowableReserve(r)) {
        products.push({
          ...base,
          _id: buildProductId(market, r.reserve, 'borrow'),
          kind: 'borrow',
          collaterals,
        } satisfies BorrowProduct<KaminoBorrowMeta>)
      }
    }
  }

  console.log(`[pools:kamino] Fetched ${products.length} product documents`)
  return products
}
