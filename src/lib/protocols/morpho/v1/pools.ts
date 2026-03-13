import type {
  BorrowPool,
  LendPool,
  ProtocolMetaMorphoBlue,
  ProtocolMetaMorphoLend,
} from '@/lib/db/types'
import { MORPHO_CONFIG } from '@/lib/protocols/morpho/config'
import type { MarketsApyQuery } from '@/lib/protocols/morpho/v1/offchain/generated/graphql'
import { MARKETS_APY } from '@/lib/protocols/morpho/v1/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'

// ─── Pool ID builder ──────────────────────────────────────────────────────────

function buildPoolId(
  marketName: string,
  loanSymbol: string,
  kind: 'lend' | 'borrow',
  collateralSymbol?: string
): string {
  const base = `morpho-${marketName}-${loanSymbol.toLowerCase()}`
  if (kind === 'borrow' && collateralSymbol) {
    return `${base}-${collateralSymbol.toLowerCase()}-borrow`
  }
  return `${base}-${kind}`
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Fetch static pool metadata for all active Morpho Blue markets.
 * Returns LendPool and BorrowPool documents ready for MongoDB upsert.
 *
 * One market → two documents (lend + borrow).
 * Called by the daily pools sync job.
 */
export async function fetchMorphoV1Pools(
  chainFilter?: string
): Promise<(LendPool | BorrowPool)[]> {
  const config = MORPHO_CONFIG.morpho_v1
  const client = createGraphQLClient(config.offchainApiUrl!)

  let chainIds = Object.keys(config.chains).map(Number)

  if (chainFilter) {
    const found = Object.entries(config.chains).find(
      ([, c]) => c.name.toLowerCase() === chainFilter.toLowerCase()
    )
    if (!found) {
      console.warn(
        `[pools:morpho] Chain filter '${chainFilter}' not found in config`
      )
      return []
    }
    chainIds = [Number(found[0])]
  }

  const pools: (LendPool | BorrowPool)[] = []
  let skip = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await client
      .query<MarketsApyQuery>(MARKETS_APY, {
        first: 100,
        skip,
        where: {
          chainId_in: chainIds,
          borrowAssetsUsd_gte: 10000,
          listed: true,
        },
      })
      .toPromise()

    if (error) {
      console.error('[pools:morpho] Failed to fetch markets:', error.message)
      break
    }

    if (!data?.markets?.items?.length) break

    const now = new Date()

    for (const market of data.markets.items) {
      const chain = {
        id: market.loanAsset.chain.id,
        name: market.loanAsset.chain.network.toLowerCase(),
      }

      const marketName = `MorphoBlue${market.loanAsset.chain.network}`

      const asset = {
        symbol: market.loanAsset.symbol,
        name: market.loanAsset.name,
        address: market.loanAsset.address,
        decimals: market.loanAsset.decimals,
      }

      const lendId = buildPoolId(marketName, asset.symbol, 'lend')
      const borrowId = buildPoolId(
        marketName,
        asset.symbol,
        'borrow',
        market.collateralAsset?.symbol
      )

      // ─── Lend pool ──────────────────────────────────────────────────────────

      const lendPool: LendPool = {
        _id: lendId,
        kind: 'lend',
        protocol: {
          name: 'morpho',
          market: marketName,
          chain,
          address: '', // MetaMorpho vault address — not available at market level
        },
        native: {
          type: 'market',
          id: market.uniqueKey,
        },
        asset,
        protocolMeta: {} as ProtocolMetaMorphoLend,
        subgraphUrl: config.offchainApiUrl!,
        active: true,
        createdAt: now,
        updatedAt: now,
      }

      // ─── Borrow pool ────────────────────────────────────────────────────────

      const collateral = market.collateralAsset
      const lltv =
        market.lltv != null
          ? Number(market.lltv) / 1e18 // lltv is a BigInt scaled by 1e18
          : 0

      const borrowPool: BorrowPool = {
        _id: borrowId,
        kind: 'borrow',
        protocol: {
          name: 'morpho',
          market: marketName,
          chain,
          address: '',
        },
        native: {
          type: 'market',
          id: market.uniqueKey,
        },
        asset,
        collaterals: collateral
          ? [
              {
                symbol: collateral.symbol,
                name: collateral.name,
                address: collateral.address,
                decimals: collateral.decimals,
                ltv: null, // Morpho only exposes lltv
                lltv,
                canBeCollateral: true,
              },
            ]
          : [],
        protocolMeta: {} as ProtocolMetaMorphoBlue,
        subgraphUrl: config.offchainApiUrl!,
        active: true,
        createdAt: now,
        updatedAt: now,
      }

      pools.push(lendPool, borrowPool)
    }

    const pageInfo = data.markets.pageInfo
    if (pageInfo && pageInfo.countTotal > skip + pageInfo.limit) {
      skip += pageInfo.limit
    } else {
      hasMore = false
    }
  }

  console.log(
    `[pools:morpho] Fetched ${pools.length} pool documents (${pools.length / 2} markets)`
  )
  return pools
}
