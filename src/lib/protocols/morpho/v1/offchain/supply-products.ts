import { CHAIN_NAME_MAPPING } from '@/lib/protocols/utils'
import { generateSlug } from '@/lib/utils'
import { SupplyProduct } from '@/types'

import { client } from '.'
import { MORPHO_CONFIG } from '../../config'
import { buildVaultProductId } from '../utils'
import { ListSupplyProductsQuery } from './generated/graphql'
import { LIST_SUPPLY_PRODUCTS } from './queries'

export async function getSupplyProducts(): Promise<SupplyProduct[]> {
  const allMarkets: SupplyProduct[] = []
  let skip = 0
  let hasMore = true

  try {
    while (hasMore) {
      const { data, error } = await client
        .query<ListSupplyProductsQuery>(LIST_SUPPLY_PRODUCTS, {
          first: 100,
          skip,
          where: {
            listed: true,
            totalAssetsUsd_gte: 100000,
            chainId_in: Object.keys(MORPHO_CONFIG.morpho_v1.chains).map((key) =>
              Number(key)
            ),
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

      const markets = data.vaults.items.map((vault): SupplyProduct => {
        const network = CHAIN_NAME_MAPPING[vault.asset.chain.id]
        if (!network)
          throw new Error(
            `No slug registered for chainId ${vault.asset.chain.id} — add it to chain-slugs.ts`
          )
        return {
          protocol: MORPHO_CONFIG.morpho_v1.id,
          network,
          poolName: vault.name,
          poolId: vault.address,
          poolAddress: vault.address,
          poolChainId: vault.asset.chain.id,
          assetAddress: vault.asset.address,
          assetName: vault.asset.name,
          assetSymbol: vault.asset.symbol,
          assetDecimals: vault.asset.decimals,
          assetAmount: (vault.state?.totalAssets ?? 0).toString(),
          assetAmountUsd: vault.state?.totalAssetsUsd ?? 0,
          liquidityAmount: (vault.liquidity?.underlying ?? 0).toString(),
          liquidityAmountUsd: vault.liquidity?.usd ?? 0,
          apy: vault?.state?.avgNetApy ?? 0,
          productId: buildVaultProductId(vault.asset.chain.id, vault.address),
          link: `https://app.morpho.org/${vault.asset.chain.network.toLowerCase()}/vault/${vault.address}/${generateSlug(vault.name)}`,
        }
      })

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
