import { generateSlug } from '@/lib/utils'
import { SupplyMarket } from '@/types'

import { client } from '.'
import { MORPHO_CONFIG } from '../../config'
import { CHAIN_NAME_MAPPING } from '../utils'
import { ListSupplyingProductsQuery } from './generated/graphql'
import { LIST_SUPPLYING_PRODUCTS } from './queries'

export async function getSupplyingMarkets(): Promise<SupplyMarket[]> {
  const allMarkets: SupplyMarket[] = []
  let skip = 0
  let hasMore = true

  try {
    while (hasMore) {
      const { data, error } = await client
        .query<ListSupplyingProductsQuery>(LIST_SUPPLYING_PRODUCTS, {
          first: 100,
          skip,
          where: {
            totalAssetsUsd_gte: 100000,
            chainId_in: Object.keys(MORPHO_CONFIG.morpho_v1.chains).map((key) =>
              Number(key)
            ),
            listed: true,
          },
        })
        .toPromise()

      if (error) {
        console.error(`Failed to fetch Morpho V1 supplying markets:`, error)
        if (error.message?.includes('Time-out') || error.networkError) {
          console.warn(`Morpho V1 API timeout - returning empty markets`)
        }
        return allMarkets // Return what we have so far
      }

      if (!data || !data.vaults || !data.vaults.items) {
        break
      }

      const markets = data.vaults.items.map((vault) => ({
        protocol: MORPHO_CONFIG.morpho_v1.id,
        network:
          CHAIN_NAME_MAPPING[vault.asset.chain.id]?.protocolName ||
          vault.asset.chain.network.toLowerCase(),
        poolName: vault.name,
        poolId: vault.id,
        poolAddress: vault.address,
        poolChainId: vault.asset.chain.id,
        assetAddress: vault.asset.address,
        assetName: vault.asset.name,
        assetSymbol: vault.asset.symbol,
        assetDecimals: vault.asset.decimals,
        assetAmount: BigInt(vault?.state?.totalAssets ?? 0),
        assetAmountUsd: vault?.state?.totalAssetsUsd ?? 0,
        liquidityAmount: BigInt(vault.liquidity?.underlying ?? 0),
        liquidityAmountUsd: vault.liquidity?.usd ?? 0,
        collaterals: vault.state?.allocation?.map((allocation) =>
          allocation.market.collateralAsset
            ? {
                symbol: allocation.market.collateralAsset.symbol ?? '',
              }
            : []
        ),
        apy: vault?.state?.avgNetApy ?? 0,
        apyDaily: vault?.state?.apyDaily ?? vault?.state?.avgNetApy ?? 0,
        apyMonthly: vault?.state?.avgNetApy ?? 0,
        apyYearly: vault?.state?.apyYearly ?? vault?.state?.avgNetApy ?? 0,
        link: `https://app.morpho.org/${vault.asset.chain.network.toLowerCase()}/vault/${vault.address}/${generateSlug(vault.name)}`,
      }))

      allMarkets.push(...markets)

      const pageInfo = data.vaults.pageInfo
      if (pageInfo && pageInfo.countTotal > skip + pageInfo.count) {
        skip += pageInfo.count
      } else {
        hasMore = false
      }
    }

    return allMarkets
  } catch (err) {
    console.error('Unexpected error fetching Morpho V1 supplying markets:', err)
    return []
  }
}
