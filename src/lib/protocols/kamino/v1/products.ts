import type { BorrowProduct, Collateral, SupplyProduct } from '@/lib/db/types'
import type { FetchOpts } from '@/lib/protocols/core/types'

import {
  type KaminoReserveAccount,
  type KaminoReserveStats,
  fetchMarkets,
  fetchReserveAccounts,
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

const CHAIN = { id: SOLANA_CHAIN_ID, name: 'solana' }

/**
 * Full catalogue: one supply product per listed reserve, plus a borrow product
 * when the reserve is borrowable (see `isBorrowableReserve`).
 *
 * Batch stats carry neither symbol nor decimals, so they are decoded from the
 * on-chain Reserve accounts (`fetchReserveAccounts`). That read must succeed
 * as a whole: any failure rejects (KaminoApiError), because the catalogue sync
 * treats a product missing from the result as delisted. A reserve whose
 * decoded mint differs from its stats mint (layout change) is skipped with a
 * warning.
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

  const accounts = await fetchReserveAccounts([...byMarket.keys()])
  const accountByReserve = new Map<string, KaminoReserveAccount>(
    accounts.map((a) => [`${a.market}:${a.reserve}`, a])
  )

  const now = new Date()
  const products: (SupplyProduct | BorrowProduct)[] = []

  for (const [market, marketReserves] of byMarket) {
    const metrics = new Map<string, KaminoReserveAccount>()
    for (const r of marketReserves) {
      const a = accountByReserve.get(`${market}:${r.reserve}`)
      if (!a) {
        console.warn(
          `[products:kamino] No account data for reserve ${r.reserve}: skipped`
        )
      } else if (a.mint !== r.mint) {
        console.warn(
          `[products:kamino] Reserve ${r.reserve}: decoded mint ${a.mint} != stats mint ${r.mint}: skipped`
        )
      } else {
        metrics.set(r.reserve, a)
      }
    }
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
        decimals: m.decimals,
        ltv: c.maxLtv,
        lltv: c.liquidationLtv,
        canBeCollateral: true,
      })
    }

    for (const r of marketReserves) {
      const m = metrics.get(r.reserve)
      if (!m) continue // listed in stats but no valid account data (warned above)
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
          decimals: m.decimals,
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
