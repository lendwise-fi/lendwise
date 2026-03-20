import { cache } from 'react'

import { SupplyMarket } from '@/types'

import { getChainClients } from '.'
import { COMPOUND_CONFIG } from '../../config'
import { CHAIN_NAME_MAPPING } from '../utils'
import { ListSupplyingProductsQuery } from './generated/graphql'
import { LIST_SUPPLYING_PRODUCTS } from './queries'

// CPU-heavy transformation memoized
const _formatSupplyingMarkets = cache(
  (
    markets: ListSupplyingProductsQuery['markets'],
    chainName: string,
    chainId: number
  ): SupplyMarket[] =>
    markets.map((market) => {
      const token = market.configuration.baseToken.token
      return {
        protocol: COMPOUND_CONFIG.compound_v3.id,
        network:
          CHAIN_NAME_MAPPING[chainId]?.protocolName || chainName!.toLowerCase(),
        poolName: market.configuration.baseToken.token.name,
        poolId: market.id,
        poolAddress: market.id,
        poolChainId: chainId,
        assetAddress: token.address,
        assetName: token.name,
        assetSymbol: token.symbol,
        assetDecimals: token.decimals || 18,
        assetAmount: BigInt(market.accounting.totalBaseSupply),
        assetAmountUsd: market.accounting.totalBaseSupplyUsd,
        liquidityAmount: BigInt(market.accounting.totalBaseSupply),
        liquidityAmountUsd: market.accounting.totalBaseSupplyUsd,
        collaterals: [],
        apy: market.accounting.netSupplyApr,
        apyDaily: market.accounting.netSupplyApr,
        apyMonthly: market.accounting.netSupplyApr,
        apyYearly: market.accounting.netSupplyApr,
        link: `https://app.compound.finance/?market=${token.symbol.toLowerCase()}-${CHAIN_NAME_MAPPING[chainId] ? CHAIN_NAME_MAPPING[chainId].marketSlug : 'mainnet'}`,
      }
    })
)

export async function getSupplyingMarkets(): Promise<SupplyMarket[]> {
  const chainClients = await getChainClients()
  const results = await Promise.allSettled(
    chainClients.map(async ({ client, chainName, chainId }) => {
      console.log(chainId)
      const { data, error } = await client
        .query<ListSupplyingProductsQuery>(LIST_SUPPLYING_PRODUCTS, {})
        .toPromise()

      if (error) {
        console.error('Compound V3 GraphQL fetch error:', error)
        if (error.message?.includes('Time-out') || error.networkError) {
          console.warn('Timeout → returning empty array')
          return []
        }
        throw error
      }

      return data?.markets
        ? _formatSupplyingMarkets(data.markets, chainName!, chainId)
        : []
    })
  )

  return results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )
}
