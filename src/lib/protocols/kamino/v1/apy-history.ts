import { isFiniteApyBlock } from '@/lib/apy-validation'
import type { BorrowMarketState, SupplyMarketState } from '@/lib/db/types'
import { requestedProducts } from '@/lib/protocols/core/history-result'
import { processBatches } from '@/lib/protocols/core/toolkit'
import type {
  HistoryDataPoint,
  HistoryFailure,
  HistoryParams,
  HistoryResult,
} from '@/lib/protocols/core/types'

import {
  type KaminoReserveHistoryPoint,
  fetchMarkets,
  fetchReserveHistory,
  fetchReserveStats,
} from '../common/api'
import { KAMINO_HISTORY_CONCURRENCY } from '../common/config'
import {
  SOLANA_CHAIN_ID,
  coversSolana,
  isBorrowableReserve,
  isListedReserve,
} from '../listing'
import { buildProductId } from './utils'

type Kind = 'supply' | 'borrow'

/** One product to answer for, with the reserve that carries its history. */
interface Wanted {
  productId: string
  kind: Kind
  market: string
  reserve: string
}

/** `numerator / denominator`, or null when either is unknown or the base is not positive. */
function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den <= 0) return null
  return num / den
}

/**
 * Utilization of a history point: borrowed / supplied. Token units when both are
 * known, USD otherwise. Unknown stays null, never 0.
 */
function utilization(p: KaminoReserveHistoryPoint): number | null {
  return (
    ratio(p.totalBorrows, p.totalSupply) ?? ratio(p.borrowTvl, p.depositTvl)
  )
}

function toPoint(
  w: Wanted,
  p: KaminoReserveHistoryPoint
): HistoryDataPoint | null {
  // History carries the same measure as the spot job: base = interest rate,
  // rewards = incentives (null = none), fees = 0. Rewards are a single total
  // here, so there are no rewardItems.
  const rewards =
    w.kind === 'supply' ? (p.supplyRewardsApy ?? 0) : (p.borrowRewardsApy ?? 0)
  const base = w.kind === 'supply' ? p.supplyApy : p.borrowApy
  const apy = {
    base,
    rewards,
    fees: 0,
    net: w.kind === 'supply' ? base + rewards : base - rewards,
    rewardItems: [],
  }
  if (!isFiniteApyBlock(apy)) return null

  const supplyState = {
    supplyAssets: p.totalSupply,
    supplyAssetsUsd: p.depositTvl,
    utilizationRate: utilization(p),
    assetPriceUsd: p.assetPriceUsd,
  }
  const market: SupplyMarketState | BorrowMarketState =
    w.kind === 'supply'
      ? supplyState
      : {
          ...supplyState,
          borrowAssets: p.totalBorrows,
          borrowAssetsUsd: p.borrowTvl,
          collateralAssetsUsd: null, // multi-collateral market
          priceCollateralInLoanAsset: null,
        }

  return {
    timestamp: new Date(p.timestamp),
    productId: w.productId,
    kind: w.kind,
    apy,
    market,
  }
}

/** The products listed today, as enumeration sees them (no floors exist). */
async function enumerateListed(): Promise<Wanted[]> {
  const markets = await fetchMarkets()
  const reserves = (
    await fetchReserveStats(markets.map((m) => m.address))
  ).filter(isListedReserve)
  const out: Wanted[] = []
  for (const r of reserves) {
    const ref = { market: r.market, reserve: r.reserve }
    out.push({
      ...ref,
      kind: 'supply',
      productId: buildProductId(r.market, r.reserve, 'supply'),
    })
    if (isBorrowableReserve(r)) {
      out.push({
        ...ref,
        kind: 'borrow',
        productId: buildProductId(r.market, r.reserve, 'borrow'),
      })
    }
  }
  return out
}

/**
 * YieldAdapter.getApyHistory for Kamino v1.
 *
 * - `targets`: market and reserve are read back from `meta` — no enumeration,
 *   so a reserve Kamino no longer lists (or one under any future floor) is
 *   still repairable.
 * - `productIds` alone: enumerate the listing and intersect.
 * - neither: every listed product.
 *
 * A supply and a borrow product of the same reserve share one history request.
 * Reserves are fetched `KAMINO_HISTORY_CONCURRENCY` at a time. `includeMarket`
 * is ignored: a single upstream carries rates and market state together.
 */
export async function getKaminoApyHistory(
  params: HistoryParams
): Promise<HistoryResult> {
  if (!coversSolana(params)) return { points: [], failures: [] }
  const log = params.onProgress ?? console.log
  const failures: HistoryFailure[] = []

  const requested = requestedProducts(params)
  let wanted: Wanted[]
  if (params.targets?.length) {
    wanted = []
    for (const t of params.targets) {
      if (t.chainId !== SOLANA_CHAIN_ID) continue
      const { market, reserve } = t.meta
      if (
        typeof market !== 'string' ||
        typeof reserve !== 'string' ||
        !market ||
        !reserve
      ) {
        failures.push({
          productId: t.productId,
          reason: 'catalogue meta carries no market/reserve',
        })
        continue
      }
      wanted.push({ productId: t.productId, kind: t.kind, market, reserve })
    }
  } else {
    const listed = await enumerateListed()
    if (requested) {
      wanted = listed.filter((w) => requested.ids.has(w.productId))
      const found = new Set(wanted.map((w) => w.productId))
      for (const productId of requested.ids) {
        if (!found.has(productId)) {
          failures.push({
            productId,
            reason: 'not in the Kamino catalogue',
          })
        }
      }
    } else {
      wanted = listed
    }
  }

  // One request per reserve, shared by its supply and borrow products.
  const byReserve = new Map<string, Wanted[]>()
  for (const w of wanted) {
    const key = `${w.market}:${w.reserve}`
    const list = byReserve.get(key) ?? []
    list.push(w)
    byReserve.set(key, list)
  }

  // Params are unix seconds, the client takes epoch milliseconds.
  const startMs = params.startTimestamp * 1000
  const endMs = params.endTimestamp * 1000
  const frequency = params.interval === 'DAY' ? 'day' : 'hour'

  log(
    `[history:kamino] Fetching ${byReserve.size} reserves for ${wanted.length} products (${frequency})`
  )

  const points: HistoryDataPoint[] = []
  await processBatches(
    [...byReserve.values()],
    async (products) => {
      const { market, reserve } = products[0]
      try {
        const history = await fetchReserveHistory({
          market,
          reserve,
          start: startMs,
          end: endMs,
          frequency,
        })
        const inWindow = history.filter(
          (h) => h.timestamp >= startMs && h.timestamp <= endMs
        )
        for (const w of products) {
          const mapped: HistoryDataPoint[] = []
          for (const h of inWindow) {
            const point = toPoint(w, h)
            if (point) mapped.push(point)
          }
          if (mapped.length === 0) {
            failures.push({
              productId: w.productId,
              reason: 'listed but returned no history points',
            })
          }
          for (const pt of mapped) points.push(pt)
        }
        log(
          `[history:kamino] reserve ${reserve}: ${inWindow.length} rows (${products.length} products)`
        )
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        log(`[history:kamino] reserve ${reserve}: ${reason}`)
        for (const w of products) {
          failures.push({ productId: w.productId, reason })
        }
      }
      return true
    },
    KAMINO_HISTORY_CONCURRENCY
  )

  log(
    `[history:kamino] Total: ${points.length} data points${failures.length > 0 ? `, ${failures.length} unanswered` : ''}`
  )
  return { points, failures }
}
