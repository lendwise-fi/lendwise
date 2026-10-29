import { isFiniteApyBlock } from '@/lib/apy-validation'
import type {
  BorrowMarketState,
  RewardItem,
  SpotPayload,
  SupplyMarketState,
} from '@/lib/db/types'
import type { FetchOpts } from '@/lib/protocols/core/types'

import {
  type KaminoReserveStats,
  fetchMarkets,
  fetchReserveStats,
} from '../common/api'
import { KAMINO_PROVIDER, KAMINO_REWARD_SYMBOLS } from '../common/config'
import {
  SOLANA_CHAIN_ID,
  coversSolana,
  isBorrowableReserve,
  isListedReserve,
} from '../listing'
import { buildProductId } from './utils'

const warnedRewardMints = new Set<string>()

function rewardSymbol(mint: string): string {
  const symbol = KAMINO_REWARD_SYMBOLS[mint]
  if (symbol) return symbol
  if (!warnedRewardMints.has(mint)) {
    warnedRewardMints.add(mint)
    console.warn(
      `[cron:kamino_v1] Unknown reward mint ${mint}: add it to KAMINO_REWARD_SYMBOLS`
    )
  }
  return mint
}

function rewardItems(
  rewards: KaminoReserveStats['supplyRewards']
): RewardItem[] {
  return rewards
    .filter((r) => r.apy > 0)
    .map((r) => ({
      token: { symbol: rewardSymbol(r.rewardToken), address: r.rewardToken },
      apr: r.apy,
      apy: r.apy,
      source: 'protocol' as const,
      program: null,
    }))
}

/** `totalSupplyUsd / totalSupply`; null when nothing is supplied. */
export function assetPriceUsd(r: KaminoReserveStats): number | null {
  return r.totalSupply > 0 ? r.totalSupplyUsd / r.totalSupply : null
}

/**
 * Spot payloads for the given reserves (listing applied here).
 *
 * Rates are fractions. Supply: base = lending, rewards = incentives, net = base
 * + rewards. Borrow: base = borrow, rewards = incentives, net = base - rewards.
 * The underlying LST yield, seasonRewards and points are left out. The API
 * exposes no protocol fee on top of these rates, so fees = 0.
 * `asset` is the liquidity mint: symbols come from the catalogue
 * (`getProducts`), not from batch stats.
 */
export function buildSpotPayloads(
  reserves: readonly KaminoReserveStats[]
): SpotPayload[] {
  const out: SpotPayload[] = []
  const push = (payload: SpotPayload) => {
    if (!isFiniteApyBlock(payload.apy)) {
      const { base, rewards, fees, net } = payload.apy
      console.warn(
        `[cron:kamino_v1] Dropping non-finite APY ${payload.productId}: base=${base} rewards=${rewards} fees=${fees} net=${net}`
      )
      return
    }
    out.push(payload)
  }

  for (const r of reserves) {
    if (!isListedReserve(r)) continue
    const price = assetPriceUsd(r)

    const supplyBase = r.supplyApyBreakdown.lending
    const supplyRewards = r.supplyApyBreakdown.incentives
    const supplyState: SupplyMarketState = {
      supplyAssets: r.totalSupply,
      supplyAssetsUsd: r.totalSupplyUsd,
      utilizationRate: r.utilization,
      assetPriceUsd: price,
    }
    push({
      productId: buildProductId(r.market, r.reserve, 'supply'),
      kind: 'supply',
      protocol: KAMINO_PROVIDER,
      chainId: SOLANA_CHAIN_ID,
      asset: r.mint,
      apy: {
        base: supplyBase,
        rewards: supplyRewards,
        fees: 0,
        net: supplyBase + supplyRewards,
        rewardItems: rewardItems(r.supplyRewards),
      },
      market: supplyState,
    })

    if (!isBorrowableReserve(r)) continue
    const borrowBase = r.borrowApyBreakdown.borrow
    const borrowRewards = r.borrowApyBreakdown.incentives
    const borrowState: BorrowMarketState = {
      supplyAssets: r.totalSupply,
      supplyAssetsUsd: r.totalSupplyUsd,
      borrowAssets: r.totalBorrow,
      borrowAssetsUsd: r.totalBorrowUsd,
      utilizationRate: r.utilization,
      assetPriceUsd: price,
      collateralAssetsUsd: null, // multi-collateral market
      priceCollateralInLoanAsset: null,
    }
    push({
      productId: buildProductId(r.market, r.reserve, 'borrow'),
      kind: 'borrow',
      protocol: KAMINO_PROVIDER,
      chainId: SOLANA_CHAIN_ID,
      asset: r.mint,
      apy: {
        base: borrowBase,
        rewards: borrowRewards,
        fees: 0,
        net: borrowBase - borrowRewards,
        rewardItems: rewardItems(r.borrowRewards),
      },
      market: borrowState,
    })
  }
  return out
}

/** Current rates of every listed reserve of every market. */
export async function fetchKaminoApySpot(
  opts?: FetchOpts
): Promise<SpotPayload[]> {
  if (!coversSolana(opts)) return []
  const markets = await fetchMarkets()
  const reserves = await fetchReserveStats(markets.map((m) => m.address))
  return buildSpotPayloads(reserves)
}
