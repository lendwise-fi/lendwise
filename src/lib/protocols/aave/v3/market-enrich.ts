import type { BorrowMarketState, SupplyMarketState } from '@/lib/db/types'
import {
  fetchAaveV3Pools,
  fetchPoolYieldHistory,
  fetchTokenPriceHistory,
  findPool,
} from '@/lib/defillama'
import type {
  EnrichAdapter,
  Logger,
  MarketPatch,
  RawDailyDoc,
} from '@/lib/protocols/enrich-adapter'

// ─── Internal parsed doc type ─────────────────────────────────────────────────

type ParsedAaveDoc = RawDailyDoc & {
  chain: string
  tokenAddress: string
  kind: 'supply' | 'borrow'
  dateStr: string // YYYY-MM-DD
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseDoc(raw: RawDailyDoc): ParsedAaveDoc | null {
  // _id: "aave:v3:{chain}:reserve:{tokenAddress}:{kind}:{YYYY-MM-DD}"
  const parts = raw._id.split(':')
  if (
    parts.length < 7 ||
    parts[0] !== 'aave' ||
    parts[1] !== 'v3' ||
    parts[3] !== 'reserve'
  )
    return null
  const kind = parts[5] as 'supply' | 'borrow'
  if (kind !== 'supply' && kind !== 'borrow') return null
  return { ...raw, chain: parts[2], tokenAddress: parts[4], kind, dateStr: parts[6] }
}

// ─── Price and yield helpers ──────────────────────────────────────────────────

function buildPriceMap(
  prices: { timestamp: number; price: number }[]
): Map<string, number> {
  const map = new Map<string, number>()
  for (const pt of prices) {
    map.set(new Date(pt.timestamp * 1000).toISOString().slice(0, 10), pt.price)
  }
  return map
}

function findNearestPrice(
  map: Map<string, number>,
  dateStr: string
): number | undefined {
  if (map.has(dateStr)) return map.get(dateStr)
  const target = new Date(dateStr).getTime()
  let best: number | undefined
  let bestDelta = Infinity
  for (const [key, price] of map) {
    const delta = Math.abs(new Date(key).getTime() - target)
    if (delta < bestDelta && delta <= 86_400_000) {
      bestDelta = delta
      best = price
    }
  }
  return best
}

function buildYieldMap(
  points: {
    timestamp: string
    totalSupplyUsd: number | null
    totalBorrowUsd: number | null
    tvlUsd: number
    utilization: number | null
  }[]
): Map<string, { supplyUsd: number; borrowUsd: number; utilization: number }> {
  const map = new Map<
    string,
    { supplyUsd: number; borrowUsd: number; utilization: number }
  >()
  for (const pt of points) {
    map.set(pt.timestamp.slice(0, 10), {
      supplyUsd: pt.totalSupplyUsd ?? pt.tvlUsd,
      borrowUsd: pt.totalBorrowUsd ?? 0,
      utilization: pt.utilization ?? 0,
    })
  }
  return map
}

// ─── Market builders ──────────────────────────────────────────────────────────

function buildSupplyMarket(
  supplyAssetsUsd: number,
  utilizationRate: number,
  assetPriceUsd: number
): SupplyMarketState {
  return {
    supplyAssets: assetPriceUsd > 0 ? supplyAssetsUsd / assetPriceUsd : 0,
    supplyAssetsUsd,
    utilizationRate,
    assetPriceUsd,
  }
}

function buildBorrowMarket(
  supplyAssetsUsd: number,
  borrowAssetsUsd: number,
  utilizationRate: number,
  assetPriceUsd: number
): BorrowMarketState {
  return {
    supplyAssets: assetPriceUsd > 0 ? supplyAssetsUsd / assetPriceUsd : 0,
    supplyAssetsUsd,
    borrowAssets: assetPriceUsd > 0 ? borrowAssetsUsd / assetPriceUsd : 0,
    borrowAssetsUsd,
    utilizationRate,
    assetPriceUsd,
    collateralAssetsUsd: null,
    priceCollateralInLoanAsset: null,
  }
}

// ─── Adapter factory ──────────────────────────────────────────────────────────

function createAaveV3Adapter(): EnrichAdapter {
  // Pools list fetched once and cached across all enrichGroup calls
  let poolsPromise: ReturnType<typeof fetchAaveV3Pools> | null = null
  const getPools = () => {
    if (!poolsPromise) poolsPromise = fetchAaveV3Pools()
    return poolsPromise
  }

  return {
    name: 'Aave V3',
    productIdPrefix: 'aave:v3',

    getGroupKey(doc) {
      const parsed = parseDoc(doc)
      if (!parsed) return null
      return `${parsed.chain}:${parsed.tokenAddress}`
    },

    async enrichGroup(docs: RawDailyDoc[], log: Logger): Promise<MarketPatch[]> {
      const parsed = docs.map(parseDoc).filter(Boolean) as ParsedAaveDoc[]
      if (parsed.length === 0) return []

      const { chain, tokenAddress } = parsed[0]
      const pools = await getPools()

      const pool = findPool(pools, chain, tokenAddress)
      if (!pool) {
        log(`[warn] No DeFiLlama pool for ${chain}:${tokenAddress} — skipping ${parsed.length} docs`)
        return []
      }

      const yieldHistory = await fetchPoolYieldHistory(pool.pool)
      if (yieldHistory.length === 0) {
        log(`[warn] Empty yield history for pool ${pool.pool} (${pool.symbol}@${pool.chain})`)
        return []
      }

      const dates = parsed.map((d) => new Date(d.dateStr).getTime())
      const startUnix = Math.floor(Math.min(...dates) / 1000)
      const endUnix = Math.floor(Math.max(...dates) / 1000)
      const days = Math.ceil((endUnix - startUnix) / 86400) + 7

      const priceHistory = await fetchTokenPriceHistory(chain, tokenAddress, startUnix, days)
      const yieldMap = buildYieldMap(yieldHistory)
      const priceMap = buildPriceMap(priceHistory)

      log(
        `[info] ${pool.symbol}@${pool.chain}: ${yieldHistory.length} yield days, ${priceHistory.length} price days → enriching ${parsed.length} docs`
      )

      const patches: MarketPatch[] = []
      for (const doc of parsed) {
        const yieldPt = yieldMap.get(doc.dateStr)
        const price = findNearestPrice(priceMap, doc.dateStr)

        if (!yieldPt || price === undefined) {
          log(`[warn] Missing DeFiLlama data for ${doc._id} — skipping`)
          continue
        }

        const market =
          doc.kind === 'supply'
            ? buildSupplyMarket(yieldPt.supplyUsd, yieldPt.utilization, price)
            : buildBorrowMarket(yieldPt.supplyUsd, yieldPt.borrowUsd, yieldPt.utilization, price)

        patches.push({ _id: doc._id, market })
      }

      return patches
    },
  }
}

export const aaveV3Adapter: EnrichAdapter = createAaveV3Adapter()
