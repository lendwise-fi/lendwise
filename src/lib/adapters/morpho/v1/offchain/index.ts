import type { Address } from 'viem'

import { createGraphQLClient } from '@/lib/adapters/shared'
import type { DataAdapter } from '@/lib/adapters/types'
import { generateSlug } from '@/lib/utils'
import {
  BorrowPosition,
  LendMarket,
  LendPosition,
  MarketRate,
  TimeframeLabel,
} from '@/types'

import { MORPHO_CONFIG } from '../../config'
import {
  ListLendingMarketsQuery,
  MarketBorrowHistoryRatesQuery,
  MarketLendHistoryRatesQuery,
  TimeseriesInterval,
  UserBorrowPositionsQuery,
  UserLendPositionsQuery,
  VaultFilters,
} from './generated/graphql'
import {
  LIST_LENDING_MARKETS,
  MARKET_BORROW_HISTORY_RATES,
  MARKET_LEND_HISTORY_RATES,
  USER_BORROW_POSITIONS,
  USER_LEND_POSITIONS,
} from './queries'

const client = createGraphQLClient(MORPHO_CONFIG.morpho_v1.offchainApiUrl!)

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
            poolId: position.vault.id,
            poolChainId: Number(position.vault.chain.id),
            poolChainNetwork: position.vault.chain.network.toLowerCase(),
            assetAddress: position.vault.asset.address,
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
          poolChainNetwork:
            position.market.morphoBlue.chain.network.toLowerCase(),
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

const TIMEFRAME_MAP: Record<TimeframeLabel, TimeseriesInterval> = {
  '24h': TimeseriesInterval.Hour,
  '7d': TimeseriesInterval.Day,
  '1M': TimeseriesInterval.Day,
  '3M': TimeseriesInterval.Week,
  '1Y': TimeseriesInterval.Week,
  Max: TimeseriesInterval.Quarter,
}

async function getMarketBorrowHistoryRates({
  poolId,
  interval,
  fromTimestamp,
}: {
  poolId: string
  interval: TimeframeLabel
  fromTimestamp: number
}): Promise<MarketRate[]> {
  console.log('borrow', poolId)
  const { data, error } = await client
    .query<MarketBorrowHistoryRatesQuery>(MARKET_BORROW_HISTORY_RATES, {
      marketId: poolId,
      options: {
        startTimestamp: fromTimestamp,
        endTimestamp: null,
        interval: TIMEFRAME_MAP[interval],
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

async function getMarketLendHistoryRates({
  poolId,
  interval,
  fromTimestamp,
}: {
  poolId: string
  interval: TimeframeLabel
  fromTimestamp: number
}): Promise<MarketRate[]> {
  console.log('lend', poolId)
  const { data, error } = await client
    .query<MarketLendHistoryRatesQuery>(MARKET_LEND_HISTORY_RATES, {
      marketId: poolId,
      options: {
        startTimestamp: fromTimestamp,
        endTimestamp: null,
        interval: TIMEFRAME_MAP[interval],
      },
    })
    .toPromise()

  if (error) {
    console.error(`Failed to fetch Morpho V1 lend rates:`, error)
    if (error.message?.includes('Time-out') || error.networkError) {
      console.warn(`Morpho V1 API timeout - returning empty rates`)
    }
    return []
  }

  return (
    data?.market.historicalState?.netSupplyApy.reverse().map((item) => ({
      timestamp: item.x,
      rate: item.y ?? 0,
    })) ?? []
  )
}

async function getLendingMarkets(): Promise<LendMarket[]> {
  const allMarkets: LendMarket[] = []
  let skip = 0
  let hasMore = true

  try {
    while (hasMore) {
      const { data, error } = await client
        .query<ListLendingMarketsQuery>(LIST_LENDING_MARKETS, {
          first: 100,
          skip,
          where: {
            totalAssetsUsd_gte: 1000,
            chainId_in: Object.keys(MORPHO_CONFIG.morpho_v1.chains).map((key) =>
              Number(key)
            ),
          } as VaultFilters,
        })
        .toPromise()

      if (error) {
        console.error(`Failed to fetch Morpho V1 lending markets:`, error)
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
        poolName: vault.name,
        poolId: vault.id,
        poolAddress: vault.address,
        poolChainId: vault.asset.chain.id,
        poolChainNetwork: vault.asset.chain.network.toLowerCase(),
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
    console.error('Unexpected error fetching Morpho V1 lending markets:', err)
    return []
  }
}

export const morphoV1OffchainAdapter: DataAdapter = {
  dataSourceType: 'offchain',
  getUserLendPositions,
  getUserBorrowPositions,
  getMarketBorrowHistoryRates,
  getMarketLendHistoryRates,
  getLendingMarkets,
}
