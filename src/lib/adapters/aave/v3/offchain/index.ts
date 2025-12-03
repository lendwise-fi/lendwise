import type { Address } from 'viem'

import { createGraphQLClient } from '@/lib/adapters/shared'
import type { DataAdapter } from '@/lib/adapters/types'
import {
  BorrowPosition,
  LendPosition,
  MarketRate,
  TimeframeLabel,
} from '@/types'

import { AAVE_CONFIG } from '../../config'
import {
  MarketBorrowHistoryRatesQuery,
  MarketLendHistoryRatesQuery,
  MarketsQuery,
  TimeWindow,
  UserBorrowPositionsQuery,
  UserLendCollateralsQuery,
  UserLendPositionsQuery,
  UserMarketHealthFactorQuery,
} from './generated/graphql'
import {
  ALL_MARKETS,
  MARKET_BORROW_HISTORY_RATES,
  MARKET_LEND_HISTORY_RATES,
  USER_BORROW_POSITIONS,
  USER_LEND_COLLATERALS,
  USER_LEND_POSITIONS,
  USER_MARKET_HEALTH_FACTOR,
} from './queries'

const client = createGraphQLClient(AAVE_CONFIG.aave_v3.offchainApiUrl!)

async function getMarketsParams(chainIds?: string[]) {
  const markets = await getAllAvailableMarkets(chainIds)
  return markets.map((market) => ({
    chainId: market.chain.chainId,
    address: market.address,
  }))
}

async function getAllAvailableMarkets(chainIds?: string[]) {
  const { data, error } = await client
    .query<MarketsQuery>(ALL_MARKETS, {
      request: {
        chainIds: chainIds ?? Object.keys(AAVE_CONFIG.aave_v3.chains),
      },
    })
    .toPromise()

  if (error) {
    console.error('Failed to fetch Aave V3 markets:', error.message)
    // Check if it's a timeout error
    if (error.message?.includes('Time-out') || error.networkError) {
      console.warn('Aave V3 API timeout - returning empty markets')
    }
    return []
  }

  if (!data || !data.markets) {
    return []
  }

  return data.markets
}

async function getUserLendPositions({
  addresses,
}: {
  addresses: Address[]
}): Promise<LendPosition[]> {
  if (!addresses || addresses.length === 0) {
    return []
  }

  try {
    const marketsParams = await getMarketsParams()
    const lendingPositionsResults = await Promise.all(
      addresses.map(async (address) => {
        const { data, error } = await client
          .query<UserLendPositionsQuery>(USER_LEND_POSITIONS, {
            request: {
              collateralsOnly: false,
              user: address,
              markets: marketsParams,
              orderBy: {
                apy: 'DESC',
              },
            },
          })
          .toPromise()

        if (error) {
          console.error('Failed to fetch Aave V3 positions:', error.message)
          // Check if it's a timeout error
          if (error.message?.includes('Time-out') || error.networkError) {
            console.warn('Aave V3 API timeout - returning empty positions')
          }
          return []
        }

        if (!data || !data.userSupplies) {
          return []
        }

        return data.userSupplies
          .filter((position) => {
            // Only include supply positions (positive balance)
            const balance = BigInt(position.balance.amount.raw)
            return balance > 0n
          })
          .map(
            (position): LendPosition => ({
              id: address,
              protocol: AAVE_CONFIG.aave_v3.id,
              userAddress: address.toLowerCase() as Address,
              poolName: position.market.name,
              poolAddress: position.market.address,
              poolId: position.market.address,
              poolChainId: position.market.chain.chainId,
              poolChainNetwork: position.market.chain.name.toLowerCase(),
              assetAddress: position.currency.address,
              assetName: position.currency.name,
              assetSymbol: position.currency.symbol,
              assetDecimals: position.currency.decimals,
              assetAmount: position.balance.amount.raw,
              assetAmountUsd: position.balance.usd,
              apy: position.apy.formatted,
              link: `https://app.aave.com/reserve-overview/?underlyingAsset=${position.currency.address.toLowerCase()}&marketName=proto_${position.market.chain.name.toLowerCase()}_v3`,
            })
          )
      })
    )

    return lendingPositionsResults.flat()
  } catch (err) {
    console.error('Unexpected error fetching Aave V3 positions:', err)
    return []
  }
}

async function getUserBorrowPositions({
  addresses,
}: {
  addresses: Address[]
}): Promise<BorrowPosition[]> {
  if (!addresses || addresses.length === 0) {
    return []
  }
  try {
    const marketsParams = await getMarketsParams()
    const borrowPositionsResults = await Promise.all(
      addresses.map(async (address) => {
        const healthFactorKeys = new Set<string>()
        const healthFactorMapParams = new Map<string, number>()

        const { data, error } = await client
          .query<UserBorrowPositionsQuery>(USER_BORROW_POSITIONS, {
            request: {
              user: address,
              markets: marketsParams,
              orderBy: {
                apy: 'DESC',
              },
            },
          })
          .toPromise()

        if (error) {
          console.error('Failed to fetch Aave V3 positions:', error.message)
          if (error.message?.includes('Time-out') || error.networkError) {
            console.warn('Aave V3 API timeout - returning empty positions')
          }
          return []
        }

        if (!data || !data.userBorrows || !data.userBorrows.length) {
          return []
        }

        data.userBorrows.forEach((position) => {
          healthFactorKeys.add(
            `${address}-${position.market.address}-${position.market.chain.chainId}`
          )
        })

        await Promise.all(
          Array.from(healthFactorKeys).map(async (key) => {
            if (healthFactorMapParams.has(key)) {
              return
            }
            const [user, market, chainId] = key.split('-')
            const request = {
              user: user.toLowerCase(),
              chainId: Number(chainId),
              market: market.toLowerCase(),
            }
            const { data, error } = await client
              .query<UserMarketHealthFactorQuery>(USER_MARKET_HEALTH_FACTOR, {
                request,
              })
              .toPromise()

            if (error) {
              console.error(
                'Failed to fetch health factor for request:',
                request,
                error.message
              )
              if (error.message?.includes('Time-out') || error.networkError) {
                console.warn('Aave V3 API timeout - returning empty positions')
              }
              return
            }

            healthFactorMapParams.set(
              key,
              data?.userMarketState?.healthFactor ?? 0
            )
          })
        )

        const { data: collateralsData, error: collateralsError } = await client
          .query<UserLendCollateralsQuery>(USER_LEND_COLLATERALS, {
            request: {
              collateralsOnly: true,
              user: address,
              markets: await getMarketsParams(
                data?.userBorrows.map(
                  (position) => position.market.chain.chainId
                )
              ),
              orderBy: {
                apy: 'DESC',
              },
            },
          })
          .toPromise()

        if (collateralsError) {
          console.error(
            'Failed to fetch Aave V3 positions:',
            collateralsError.message
          )
          if (
            collateralsError.message?.includes('Time-out') ||
            collateralsError.networkError
          ) {
            console.warn('Aave V3 API timeout - returning empty positions')
          }
          return []
        }

        const markets_collaterals: Record<
          string,
          BorrowPosition['collaterals']
        > = {}
        collateralsData?.userSupplies?.forEach((position) => {
          if (
            !markets_collaterals[
              `${position.market.chain.chainId}-${position.market.address}`
            ]
          ) {
            markets_collaterals[
              `${position.market.chain.chainId}-${position.market.address}`
            ] = []
          }
          markets_collaterals[
            `${position.market.chain.chainId}-${position.market.address}`
          ].push({
            address: position.currency.address,
            name: position.currency.name,
            symbol: position.currency.symbol,
            decimals: position.currency.decimals,
            amount: Number(position.balance.amount.value),
            amountUSD: Number(position.balance.usd),
          })
        })

        return data.userBorrows.map(
          (position): BorrowPosition => ({
            id: address,
            protocol: AAVE_CONFIG.aave_v3.id,
            healthFactor:
              healthFactorMapParams.get(
                `${address}-${position.market.address}-${position.market.chain.chainId}`
              ) ?? 0,
            userAddress: address,
            poolId: position.market.address,
            poolName: position.market.name,
            poolAddress: position.market.address,
            poolChainId: position.market.chain.chainId,
            poolChainNetwork: position.market.chain.name.toLowerCase(),
            loanAssetAddress: position.currency.address,
            loanAssetName: position.currency.name,
            loanAssetSymbol: position.currency.symbol,
            loanAssetDecimals: position.currency.decimals,
            loanAssetAmount: position.debt.amount.value,
            loanAssetAmountUsd: position.debt.usd,
            loanTimestamp: 0,
            collaterals:
              markets_collaterals[
                `${position.market.chain.chainId}-${position.market.address}`
              ],
            apy: position.apy.formatted,
            link: `https://app.aave.com/reserve-overview/?underlyingAsset=${position.currency.address.toLowerCase()}&marketName=proto_${position.market.chain.name.toLowerCase()}_v3`,
          })
        )
      })
    )
    return borrowPositionsResults.flat()
  } catch (err) {
    console.error('Unexpected error fetching Aave V3 positions:', err)
    return []
  }
}

const TIMEFRAME_MAP: Record<TimeframeLabel, TimeWindow> = {
  '24h': TimeWindow.LastDay,
  '7d': TimeWindow.LastWeek,
  '1M': TimeWindow.LastMonth,
  '3M': TimeWindow.LastSixMonths,
  '1Y': TimeWindow.LastYear,
  Max: TimeWindow.LastYear,
}

async function getMarketBorrowHistoryRates({
  poolId,
  chainId,
  tokenId,
  interval,
}: {
  poolId: string
  chainId: number
  tokenId: Address
  interval: TimeframeLabel
}): Promise<MarketRate[]> {
  const { data, error } = await client
    .query<MarketBorrowHistoryRatesQuery>(MARKET_BORROW_HISTORY_RATES, {
      request: {
        chainId,
        market: poolId,
        underlyingToken: tokenId,
        window: TIMEFRAME_MAP[interval],
      },
    })
    .toPromise()

  if (error) {
    console.error(`Failed to fetch Aave V3 borrow rates:`, error)
    if (error.message?.includes('Time-out') || error.networkError) {
      console.warn(`Aave V3 API timeout - returning empty rates`)
    }
    return []
  }

  return (
    data?.borrowAPYHistory?.reverse().map((item) => ({
      timestamp: Math.floor(new Date(item.date).getTime() / 1000),
      rate: item.avgRate.value,
    })) ?? []
  )
}

async function getMarketLendHistoryRates({
  poolId,
  chainId,
  tokenId,
  interval,
}: {
  poolId: string
  chainId: number
  tokenId: Address
  interval: TimeframeLabel
}): Promise<MarketRate[]> {
  const { data, error } = await client
    .query<MarketLendHistoryRatesQuery>(MARKET_LEND_HISTORY_RATES, {
      request: {
        chainId,
        market: poolId,
        underlyingToken: tokenId,
        window: TIMEFRAME_MAP[interval],
      },
    })
    .toPromise()

  if (error) {
    console.error(`Failed to fetch Aave V3 borrow rates:`, error)
    if (error.message?.includes('Time-out') || error.networkError) {
      console.warn(`Aave V3 API timeout - returning empty rates`)
    }
    return []
  }

  return (
    data?.supplyAPYHistory?.reverse().map((item) => ({
      timestamp: Math.floor(new Date(item.date).getTime() / 1000),
      rate: item.avgRate.value,
    })) ?? []
  )
}

export const aaveV3OffchainAdapter: DataAdapter = {
  dataSourceType: 'offchain',
  getUserLendPositions,
  getUserBorrowPositions,
  getMarketBorrowHistoryRates,
  getMarketLendHistoryRates,
}
