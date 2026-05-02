import { cache } from 'react'

import { BorrowProduct } from '@/types'

import { client } from '.'
import { AAVE_CONFIG } from '../../config'
import { buildProductNetworkSlug, getNetworkName } from '../utils'
import { ListBorrowProductsQuery } from './generated/graphql'
import { LIST_BORROW_PRODUCTS } from './queries'

// CPU-heavy transformation memoized
const _formatBorrowProducts = cache(
  (markets: ListBorrowProductsQuery['markets']): BorrowProduct[] =>
    markets.flatMap((market) => {
      const collateralReserves = market.reserves
        .filter((r) => r.supplyInfo?.canBeCollateral === true)
        .map((r) => ({
          address: r.underlyingToken.address,
          symbol: r.underlyingToken.symbol,
          name: r.underlyingToken.name,
          decimals: r.underlyingToken.decimals,
        }))

      return market.reserves
        .filter(
          (reserve) =>
            reserve.borrowInfo !== null &&
            reserve.borrowInfo?.borrowingState !== 'DISABLED'
        )
        .map((reserve): BorrowProduct => {
          return {
            protocol: AAVE_CONFIG.aave_v3.id,
            network: getNetworkName(market.chain.name),
            poolName: reserve.underlyingToken.name,
            poolId: market.address,
            poolAddress: market.address,
            poolChainId: market.chain.chainId,
            assetAddress: reserve.underlyingToken.address,
            assetName: reserve.underlyingToken.name,
            assetSymbol: reserve.underlyingToken.symbol,
            assetDecimals: reserve.underlyingToken.decimals,
            assetAmount: reserve.size.amount.raw.toString(),
            assetAmountUsd: reserve.size.usd,
            liquidityAmount: String(
              (reserve.supplyInfo.total.raw ?? 0) -
                (reserve.borrowInfo?.total?.amount?.raw ?? 0)
            ),
            liquidityAmountUsd:
              reserve.size.usd - (reserve.borrowInfo?.total?.usd ?? 0),
            collaterals: collateralReserves,
            apy: reserve.borrowInfo?.apy.value || 0,
            productId: `aave:v3:${buildProductNetworkSlug(market.chain.name)}:reserve:${reserve.underlyingToken.address.toLowerCase()}:borrow`,
            link: `https://app.aave.com/reserve-overview/?underlyingAsset=${reserve.underlyingToken.address.toLowerCase()}&marketName=proto_${market.chain.name.toLowerCase()}_v3`,
          }
        })
    })
)

export async function getBorrowProducts(): Promise<BorrowProduct[]> {
  const { data, error } = await client
    .query<ListBorrowProductsQuery>(LIST_BORROW_PRODUCTS, {
      request: {
        chainIds: Object.keys(AAVE_CONFIG.aave_v3.chains).map(Number),
      },
    })
    .toPromise()

  if (error) {
    console.error('Aave V3 GraphQL fetch error:', error)
    if (error.message?.includes('Time-out') || error.networkError) {
      console.warn('Timeout → returning empty array')
      return []
    }
    throw error
  }

  return data?.markets ? _formatBorrowProducts(data.markets) : []
}
