import { cache } from 'react'

import { CHAIN_NAME_MAPPING } from '@/lib/protocols/utils'
import { SupplyProduct } from '@/types'

import { getChainClients } from '.'
import { COMPOUND_CONFIG } from '../../config'
import { SLUG_MAPPING, buildProductId } from '../utils'
import { ListSupplyProductsQuery } from './generated/graphql'
import { LIST_SUPPLY_PRODUCTS } from './queries'

// CPU-heavy transformation memoized
const _formatSupplyProducts = cache(
  (
    markets: ListSupplyProductsQuery['markets'],
    chainName: string,
    chainId: number
  ): SupplyProduct[] =>
    markets.map((market) => {
      const token = market.configuration.baseToken.token
      const totalSupply = BigInt(market.accounting.totalBaseSupply)
      const totalBorrow = BigInt(market.accounting.totalBaseBorrow ?? 0)
      const available = totalSupply > totalBorrow ? totalSupply - totalBorrow : 0n
      const availableUsd = Math.max(
        0,
        market.accounting.totalBaseSupplyUsd - (market.accounting.totalBaseBorrowUsd ?? 0)
      )
      return {
        protocol: COMPOUND_CONFIG.compound_v3.id,
        network: CHAIN_NAME_MAPPING[chainId] || chainName!.toLowerCase(),
        poolName: market.configuration.baseToken.token.name,
        poolId: market.id,
        poolAddress: market.id,
        poolChainId: chainId,
        assetAddress: token.address,
        assetName: token.name,
        assetSymbol: token.symbol,
        assetDecimals: token.decimals || 18,
        // assetAmount = total deposited (denominator), liquidityAmount = available (numerator)
        // → pie = available / total = 1 - borrow utilization (0–100%)
        assetAmount: market.accounting.totalBaseSupply.toString(),
        assetAmountUsd: market.accounting.totalBaseSupplyUsd,
        liquidityAmount: available.toString(),
        liquidityAmountUsd: availableUsd,
        collaterals: [],
        apy: market.accounting.netSupplyApr,
        productId: buildProductId(
          market.id,
          { id: chainId, name: chainName! },
          'supply'
        ),
        link: `https://app.compound.finance/?market=${token.symbol.toLowerCase()}-${SLUG_MAPPING[chainId] ?? 'mainnet'}`,
      }
    })
)

export async function getSupplyProducts(): Promise<SupplyProduct[]> {
  const chainClients = await getChainClients()
  const results = await Promise.allSettled(
    chainClients.map(async ({ client, chainName, chainId }) => {
      const { data, error } = await client
        .query<ListSupplyProductsQuery>(LIST_SUPPLY_PRODUCTS, {})
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
        ? _formatSupplyProducts(data.markets, chainName!, chainId)
        : []
    })
  )

  return results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )
}
