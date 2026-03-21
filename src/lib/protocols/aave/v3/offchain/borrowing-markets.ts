import { cache } from 'react'

import { SupplyMarket } from '@/types'

import { client } from '.'
import { AAVE_CONFIG } from '../../config'
import { getNetworkName } from '../utils'
import { ListBorrowingProductsQuery } from './generated/graphql'
import { LIST_BORROWING_PRODUCTS } from './queries'

// CPU-heavy transformation memoized
const _formatBorrowingMarkets = cache(
  (markets: ListBorrowingProductsQuery['markets']): SupplyMarket[] =>
    markets.flatMap((market) =>
      market.reserves
        .filter(
          (reserve) =>
            reserve.borrowInfo !== null &&
            reserve.borrowInfo?.borrowingState !== 'DISABLED'
        )
        .map((reserve) => {
          const totalSupply = BigInt(reserve.size.amount.raw)
          const totalBorrow = BigInt(
            reserve.borrowInfo?.total.amount.raw || '0'
          )
          const available =
            totalSupply > totalBorrow ? totalSupply - totalBorrow : 0n
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
            assetAmount: totalSupply.toString(),
            assetAmountUsd: reserve.size.usd,
            liquidityAmount: available.toString(),
            liquidityAmountUsd: Math.max(
              0,
              reserve.size.usd - (reserve.borrowInfo?.total.usd || 0)
            ),
            collaterals: [],
            apy: reserve.borrowInfo?.apy.value || 0,
            apyDaily: reserve.borrowInfo?.apy.value || 0,
            apyMonthly: reserve.borrowInfo?.apy.value || 0,
            apyYearly: reserve.borrowInfo?.apy.value || 0,
            link: `https://app.aave.com/reserve-overview/?underlyingAsset=${reserve.underlyingToken.address.toLowerCase()}&marketName=proto_${market.chain.name.toLowerCase()}_v3`,
          }
        })
    )
)

export async function getBorrowingMarkets(): Promise<SupplyMarket[]> {
  const { data, error } = await client
    .query<ListBorrowingProductsQuery>(LIST_BORROWING_PRODUCTS, {
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

  return data?.markets ? _formatBorrowingMarkets(data.markets) : []
}
