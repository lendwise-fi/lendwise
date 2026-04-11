import { cache } from 'react'

import { SupplyProduct } from '@/types'

import { client } from '.'
import { AAVE_CONFIG } from '../../config'
import { buildReserveProductId, getNetworkName } from '../utils'
import { ListSupplyProductsQuery } from './generated/graphql'
import { LIST_SUPPLY_PRODUCTS } from './queries'

// CPU-heavy transformation memoized
const _formatSupplyProducts = cache(
  (markets: ListSupplyProductsQuery['markets']): SupplyProduct[] =>
    markets.flatMap((market) =>
      market.reserves.map((reserve) => ({
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
        liquidityAmount: reserve.supplyInfo.supplyCap.amount.raw.toString(),
        liquidityAmountUsd: reserve.supplyInfo.supplyCap.usd,
        collaterals: [],
        apy: reserve.supplyInfo.apy.value,
        productId: buildReserveProductId(
          market.chain.chainId,
          reserve.underlyingToken.address,
          'supply'
        ),
        link: `https://app.aave.com/reserve-overview/?underlyingAsset=${reserve.underlyingToken.address.toLowerCase()}&marketName=proto_${market.chain.name.toLowerCase()}_v3`,
      }))
    )
)

export async function getSupplyProducts(): Promise<SupplyProduct[]> {
  const { data, error } = await client
    .query<ListSupplyProductsQuery>(LIST_SUPPLY_PRODUCTS, {
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

  return data?.markets ? _formatSupplyProducts(data.markets) : []
}
