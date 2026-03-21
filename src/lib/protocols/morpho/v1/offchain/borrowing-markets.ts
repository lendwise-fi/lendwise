import { cache } from 'react'

import { CHAIN_NAME_MAPPING } from '@/lib/protocols/utils'
import { SupplyMarket } from '@/types'

import { client } from '.'
import { MORPHO_CONFIG } from '../../config'
import { ListBorrowingProductsQuery } from './generated/graphql'
import { LIST_BORROWING_PRODUCTS } from './queries'

// CPU-heavy transformation memoized
const _formatBorrowingMarkets = cache(
  (markets: ListBorrowingProductsQuery['markets']): SupplyMarket[] =>
    markets.items?.map((market) => {
      const chainIdForMarket = market.morphoBlue.chain.id
      const networkForMarket =
        CHAIN_NAME_MAPPING[chainIdForMarket] ||
        market.morphoBlue.chain.network.toLowerCase()
      const totalSupply = BigInt(market.state?.supplyAssets ?? 0)
      const totalBorrow = BigInt(market.state?.borrowAssets ?? 0)
      const available =
        totalSupply > totalBorrow ? totalSupply - totalBorrow : 0n
      const collateralSymbol = market.collateralAsset?.symbol ?? 'none'
      return {
        protocol: MORPHO_CONFIG.morpho_v1.id,
        network: networkForMarket,
        poolName: `${market.loanAsset.symbol}/${collateralSymbol}`,
        poolId: market.id,
        poolAddress: market.loanAsset.address,
        poolChainId: chainIdForMarket,
        assetAddress: market.loanAsset.address,
        assetName: market.loanAsset.name,
        assetSymbol: market.loanAsset.symbol,
        assetDecimals: market.loanAsset.decimals,
        assetAmount: totalSupply.toString(),
        assetAmountUsd: market.state?.supplyAssetsUsd ?? 0,
        liquidityAmount: available.toString(),
        liquidityAmountUsd: Math.max(
          0,
          (market.state?.supplyAssetsUsd ?? 0) -
            (market.state?.borrowAssetsUsd ?? 0)
        ),
        collaterals: market.collateralAsset
          ? [{ symbol: market.collateralAsset.symbol }]
          : [],
        apy: market.state?.netBorrowApy ?? 0,
        apyDaily: market.state?.netBorrowApy ?? 0,
        apyMonthly: market.state?.netBorrowApy ?? 0,
        apyYearly: market.state?.netBorrowApy ?? 0,
        link: `https://app.morpho.org/${market.morphoBlue.chain.network.toLowerCase()}/market/${market.uniqueKey}`,
      }
    }) || []
)

export async function getBorrowingMarkets(): Promise<SupplyMarket[]> {
  const allMarkets: SupplyMarket[] = []
  let skip = 0
  let hasMore = true

  try {
    while (hasMore) {
      const { data, error } = await client
        .query<ListBorrowingProductsQuery>(LIST_BORROWING_PRODUCTS, {
          first: 100,
          skip,
          where: {
            chainId_in: Object.keys(MORPHO_CONFIG.morpho_v1.chains).map((key) =>
              Number(key)
            ),
          },
        })
        .toPromise()

      if (error) {
        console.error(`Failed to fetch Morpho V1 borrowing markets:`, error)
        if (error.message?.includes('Time-out') || error.networkError) {
          console.warn(`Morpho V1 API timeout - returning empty markets`)
        }
        return allMarkets
      }

      if (!data || !data.markets || !data.markets.items) {
        break
      }

      allMarkets.push(..._formatBorrowingMarkets(data.markets))

      const pageInfo = data.markets.pageInfo
      if (pageInfo && pageInfo.countTotal > skip + pageInfo.count) {
        skip += pageInfo.count
      } else {
        hasMore = false
      }
    }

    return allMarkets
  } catch (err) {
    console.error('Unexpected error fetching Morpho V1 borrowing markets:', err)
    return []
  }
}
