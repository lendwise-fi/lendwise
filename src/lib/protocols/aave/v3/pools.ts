import type { BorrowPool, Collateral, LendPool } from '@/lib/db/types'
import { AAVE_CONFIG } from '@/lib/protocols/aave/config'
import type { MarketsApyQuery } from '@/lib/protocols/aave/v3/offchain/generated/graphql'
import { MARKETS_APY } from '@/lib/protocols/aave/v3/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'

// ─── Pool ID builder ──────────────────────────────────────────────────────────

function buildPoolId(
  marketName: string,
  assetSymbol: string,
  kind: 'lend' | 'borrow'
): string {
  return `aave-${marketName}-${assetSymbol.toLowerCase()}-${kind}`
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Fetch static pool metadata for all active AAVE v3 markets.
 * Returns LendPool and BorrowPool documents ready for MongoDB upsert.
 *
 * One reserve → two documents (lend + borrow).
 * Borrow pool collaterals are built from all reserves in the same market
 * where canBeCollateral = true.
 *
 * Reuses MARKETS_APY query — aToken/vToken fields must be present.
 */
export async function fetchAaveV3Pools(
  chainFilter?: string
): Promise<(LendPool | BorrowPool)[]> {
  const config = AAVE_CONFIG.aave_v3
  const client = createGraphQLClient(config.offchainApiUrl!)

  let chainIds = Object.keys(config.chains).map(Number)

  if (chainFilter) {
    const found = Object.entries(config.chains).find(
      ([, c]) => c.name.toLowerCase() === chainFilter.toLowerCase()
    )
    if (!found) {
      console.warn(
        `[pools:aave] Chain filter '${chainFilter}' not found in config`
      )
      return []
    }
    chainIds = [Number(found[0])]
  }

  const { data, error } = await client
    .query<MarketsApyQuery>(MARKETS_APY, { request: { chainIds } })
    .toPromise()

  if (error) {
    console.error('[pools:aave] Failed to fetch markets:', error.message)
    return []
  }

  if (!data?.markets) return []

  const pools: (LendPool | BorrowPool)[] = []
  const now = new Date()

  for (const market of data.markets) {
    const chain = {
      id: market.chain.chainId,
      name: market.chain.name.toLowerCase(),
    }

    // ─── Build collateral list for this market ──────────────────────────────
    // All reserves that can be used as collateral across this market.
    // Each borrow pool gets this full list — AAVE is multi-collateral.
    const marketCollaterals: Collateral[] = market.reserves
      .filter((r) => r.supplyInfo?.canBeCollateral === true)
      .map((r) => ({
        symbol: r.underlyingToken.symbol,
        name: r.underlyingToken.name,
        address: r.underlyingToken.address,
        decimals: 0, // not in current query — enrich if needed
        ltv: Number(r.supplyInfo?.maxLTV?.value ?? 0),
        lltv: Number(r.supplyInfo?.liquidationThreshold?.value ?? 0),
        canBeCollateral: true,
      }))

    for (const reserve of market.reserves) {
      const asset = {
        symbol: reserve.underlyingToken.symbol,
        name: reserve.underlyingToken.name,
        address: reserve.underlyingToken.address,
        decimals: 0, // not in current query
      }

      const lendId = buildPoolId(market.name, asset.symbol, 'lend')
      const borrowId = buildPoolId(market.name, asset.symbol, 'borrow')

      // ─── Lend pool ──────────────────────────────────────────────────────────

      const lendPool: LendPool = {
        _id: lendId,
        kind: 'lend',
        protocol: {
          name: 'aave',
          market: market.name,
          chain,
          address: market.address,
        },
        native: {
          type: 'reserve',
          id: `${reserve.underlyingToken.address}-lend`,
        },
        asset,
        protocolMeta: {
          aTokenSymbol: reserve.aToken?.symbol ?? '',
        },
        subgraphUrl: config.offchainApiUrl!,
        active: true,
        createdAt: now,
        updatedAt: now,
      }

      // ─── Borrow pool ────────────────────────────────────────────────────────

      const borrowPool: BorrowPool = {
        _id: borrowId,
        kind: 'borrow',
        protocol: {
          name: 'aave',
          market: market.name,
          chain,
          address: market.address,
        },
        native: {
          type: 'reserve',
          id: `${reserve.underlyingToken.address}-borrow`,
        },
        asset,
        collaterals: marketCollaterals,
        protocolMeta: {
          variableRateSlope1: Number(
            reserve.borrowInfo?.variableRateSlope1?.value ?? 0
          ),
          variableRateSlope2: Number(
            reserve.borrowInfo?.variableRateSlope2?.value ?? 0
          ),
          optimalUsageRate: Number(
            reserve.borrowInfo?.optimalUsageRate?.value ?? 0
          ),
          baseVariableBorrowRate: Number(
            reserve.borrowInfo?.baseVariableBorrowRate?.value ?? 0
          ),
          vTokenSymbol: reserve.vToken?.symbol ?? '',
        },
        subgraphUrl: config.offchainApiUrl!,
        active: true,
        createdAt: now,
        updatedAt: now,
      }

      pools.push(lendPool, borrowPool)
    }
  }

  console.log(
    `[pools:aave] Fetched ${pools.length} pool documents (${pools.length / 2} reserves)`
  )
  return pools
}
