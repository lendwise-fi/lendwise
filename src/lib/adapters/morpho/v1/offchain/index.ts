import { cacheExchange, createClient, fetchExchange } from '@urql/core'
import type { Address } from 'viem'

import type { DataAdapter } from '@/lib/adapters/types'
import { generateSlug } from '@/lib/utils'
import {
  BorrowPosition,
  LendPosition,
  MarketRate,
  MarketRateInterval,
} from '@/types'

import { MORPHO_CONFIG } from '../../config'
import {
  MarketBorrowRatesQuery,
  UserBorrowPositionsQuery,
  UserLendPositionsQuery,
} from './generated/graphql'
import {
  MARKET_BORROW_RATES,
  USER_BORROW_POSITIONS,
  USER_LEND_POSITIONS,
} from './queries'

const client = createClient({
  url: MORPHO_CONFIG.morpho_v1.offchainApiUrl!,
  exchanges: [cacheExchange, fetchExchange],
  fetchOptions: {
    headers: {
      'Content-Type': 'application/json',
    },
    // Add timeout to prevent long-hanging requests
    signal: AbortSignal.timeout(20000), // 20 second timeout
  },
  // Force POST requests instead of GET
  preferGetMethod: false,
  // Retry failed requests once
  requestPolicy: 'network-only',
})

async function getUserLendPositions({
  addresses,
}: {
  addresses: Address[]
}): Promise<LendPosition[]> {
  if (!addresses || addresses.length === 0) {
    return []
  }

  try {
    // Get all chain IDs from MORPHO_CONFIG
    const chainIds = Object.keys(MORPHO_CONFIG.morpho_v1.chains).map(Number)

    const allPositions: LendPosition[] = []
    let skip = 0
    let hasMore = true

    // Fetch all pages until we have all positions
    while (hasMore) {
      const { data, error } = await client
        .query<UserLendPositionsQuery>(USER_LEND_POSITIONS, {
          where: {
            chainId_in: chainIds,
            userAddress_in: addresses,
          },
          first: 100,
          skip,
        })
        .toPromise()

      if (error) {
        console.error('Failed to fetch Morpho V1 positions:', error)
        // Check if it's a timeout error
        if (error.message?.includes('Time-out') || error.networkError) {
          console.warn('Morpho V1 API timeout - returning empty positions')
        }
        return allPositions // Return what we have so far
      }

      if (!data || !data.vaultPositions || !data.vaultPositions.items) {
        break
      }

      const positions = data.vaultPositions.items
        .filter((position) => {
          // Only include supply positions (positive balance)
          const balance = BigInt(position.state?.assets ?? 0)
          return balance > 0n
        })
        .map(
          (position): LendPosition => ({
            id: position.id,
            protocol: MORPHO_CONFIG.morpho_v1.id,
            userAddress: position.user.address.toLowerCase(),
            poolName: position.vault.name,
            poolAddress: position.vault.address,
            poolChainNetwork: position.vault.chain.network,
            assetName: position.vault.asset.name,
            assetSymbol: position.vault.asset.symbol,
            assetDecimals: position.vault.asset.decimals,
            assetAmount: position.state?.assets ?? 0,
            assetAmountUsd: position.state?.assetsUsd ?? 0,
            apy: position.vault.state?.avgNetApy
              ? position.vault.state.avgNetApy * 100
              : 0,
            link: `https://app.morpho.org/${position.vault.chain.network.toLowerCase()}/vault/${position.vault.address}/${generateSlug(position.vault.name)}?subTab=yourPosition`,
          })
        )

      allPositions.push(...positions)

      // Check if there are more pages to fetch
      const pageInfo = data.vaultPositions.pageInfo
      if (pageInfo && pageInfo.countTotal > skip + pageInfo.count) {
        skip += pageInfo.count
      } else {
        hasMore = false
      }
    }

    return allPositions
  } catch (err) {
    console.error('Unexpected error fetching Morpho V1 positions:', err)
    return []
  }
}

async function getUserBorrowPositions({
  addresses,
}: {
  addresses: Address[]
}): Promise<BorrowPosition[]> {
  // Return empty array if no addresses provided
  if (!addresses || addresses.length === 0) {
    return []
  }

  try {
    // Get all chain IDs from MORPHO_CONFIG
    const chainIds = Object.keys(MORPHO_CONFIG.morpho_v1.chains).map(Number)

    const allPositions: BorrowPosition[] = []
    let skip = 0
    let hasMore = true

    // Fetch all pages until we have all positions
    while (hasMore) {
      const { data, error } = await client
        .query<UserBorrowPositionsQuery>(USER_BORROW_POSITIONS, {
          where: {
            chainId_in: chainIds,
            userAddress_in: [...addresses],
          },
          first: 100,
          skip,
        })
        .toPromise()

      if (error) {
        console.error('Failed to fetch Morpho V1 positions:', error)
        // Check if it's a timeout error
        if (error.message?.includes('Time-out') || error.networkError) {
          console.warn('Morpho V1 API timeout - returning empty positions')
        }
        return allPositions // Return what we have so far
      }

      if (!data || !data.marketPositions || !data.marketPositions.items) {
        break
      }

      const positions = data.marketPositions.items.map(
        (position): BorrowPosition => ({
          id: position.id,
          protocol: MORPHO_CONFIG.morpho_v1.id,
          healthFactor: Number(position.healthFactor),
          userAddress: position.user.address,
          poolId: position.market.id,
          poolName: `${position.market.collateralAsset?.symbol}/${position.market.loanAsset?.symbol}`,
          poolAddress: position.market.uniqueKey,
          poolChainId: position.market.morphoBlue.chain.id,
          poolChainNetwork: position.market.morphoBlue.chain.network,
          loanAssetAddress: position.market.loanAsset.address,
          loanAssetName: position.market.loanAsset.name,
          loanAssetSymbol: position.market.loanAsset.symbol,
          loanAssetDecimals: position.market.loanAsset.decimals,
          loanAssetAmount: position.state
            ? position.state.borrowAssets /
              Number(`1e${position.market.loanAsset.decimals}`)
            : 0,
          loanAssetAmountUsd: position.state?.borrowAssetsUsd ?? 0,
          loanTimestamp: 0,
          collaterals: [
            {
              address: position.market.collateralAsset?.address,
              name: position.market.collateralAsset?.name ?? '',
              symbol: position.market.collateralAsset?.symbol ?? '',
              decimals: position.market.collateralAsset?.decimals ?? 0,
              amount: position.state?.collateral,
              amountUSD: position.state?.collateralUsd ?? 0,
            },
          ],
          apy: position.market.state?.avgBorrowApy
            ? Number((position.market.state.avgBorrowApy * 100).toFixed(2))
            : 0,
          link: `https://app.morpho.org/${position.market.morphoBlue.chain.network.toLowerCase()}/market/${position.market.uniqueKey}/${generateSlug(position.market.collateralAsset?.symbol + '-' + position.market.loanAsset?.symbol)}?subTab=yourPosition`,
        })
      )

      allPositions.push(...positions)

      // Check if there are more pages to fetch
      const pageInfo = data.marketPositions.pageInfo
      if (pageInfo && pageInfo.countTotal > skip + pageInfo.count) {
        skip += pageInfo.count
      } else {
        hasMore = false
      }
    }
    return allPositions
  } catch (err) {
    console.error('Unexpected error fetching Morpho V1 positions:', err)
    return []
  }
}

async function getMarketBorrowRates({
  poolId,
  interval,
  fromTimestamp,
}: {
  poolId: string
  interval: MarketRateInterval
  fromTimestamp: number
}): Promise<MarketRate[]> {
  const { data, error } = await client
    .query<MarketBorrowRatesQuery>(MARKET_BORROW_RATES, {
      marketId: poolId,
      options: {
        startTimestamp: fromTimestamp,
        endTimestamp: null,
        interval,
      },
    })
    .toPromise()

  if (error) {
    console.error(`Failed to fetch Morpho V1 borrow rates:`, error)
    if (error.message?.includes('Time-out') || error.networkError) {
      console.warn(`Morpho V1 API timeout - returning empty rates`)
    }
    return []
  }

  return (
    data?.market.historicalState?.netBorrowApy.reverse().map((item) => ({
      timestamp: item.x,
      rate: item.y ?? 0,
    })) ?? []
  )
}

async function getMarketLendRates() {
  return []
}

export const morphoV1OffchainAdapter: DataAdapter = {
  dataSourceType: 'offchain',
  getUserLendPositions,
  getUserBorrowPositions,
  getMarketBorrowRates,
  getMarketLendRates,
}
