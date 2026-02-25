import { cache } from 'react'

import { LendMarket } from '@/types'

import { client } from '.'
import { AAVE_CONFIG } from '../../config'
import { ListLendingMarketsQuery } from './generated/graphql'
import { LIST_LENDING_MARKETS } from './queries'

// CPU-heavy transformation memoized
const _formatLendingMarkets = cache(
  (markets: ListLendingMarketsQuery['markets']): LendMarket[] =>
    markets.flatMap((market) =>
      market.reserves.map((reserve) => ({
        protocol: AAVE_CONFIG.aave_v3.id,
        poolName: reserve.underlyingToken.name,
        poolId: market.address,
        poolAddress: market.address,
        poolChainId: market.chain.chainId,
        poolChainNetwork: market.chain.name.toLowerCase(),
        assetAddress: reserve.underlyingToken.address,
        assetName: reserve.underlyingToken.name,
        assetSymbol: reserve.underlyingToken.symbol,
        assetDecimals: reserve.underlyingToken.decimals,
        assetAmount: BigInt(reserve.size.amount.raw),
        assetAmountUsd: reserve.size.usd,
        liquidityAmount: BigInt(reserve.supplyInfo.supplyCap.amount.raw),
        liquidityAmountUsd: reserve.supplyInfo.supplyCap.usd,
        collaterals: [],
        apy: reserve.supplyInfo.apy.value,
        apyDaily: reserve.supplyInfo.apy.value,
        apyMonthly: reserve.supplyInfo.apy.value,
        apyYearly: reserve.supplyInfo.apy.value,
        link: `https://app.aave.com/reserve-overview/?underlyingAsset=${reserve.underlyingToken.address.toLowerCase()}&marketName=proto_${market.chain.name.toLowerCase()}_v3`,
      }))
    )
)

export async function getLendingMarkets(): Promise<LendMarket[]> {
  const { data, error } = await client
    .query<ListLendingMarketsQuery>(LIST_LENDING_MARKETS, {
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

  return data?.markets ? _formatLendingMarkets(data.markets) : []
}
