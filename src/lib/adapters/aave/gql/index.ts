import { cacheExchange, createClient, fetchExchange } from '@urql/core'
import type { Address } from 'viem'

import { BorrowPosition, LendPosition } from '@/types'

import { PROTOCOL_ID, marketsGqlParams } from '..'
import {
  UserBorrowPositionsQuery,
  UserLendPositionsQuery,
  UserMarketHealthFactorQuery,
} from './generated/graphql'
import {
  USER_BORROW_POSITIONS,
  USER_LEND_POSITIONS,
  USER_MARKET_HEALTH_FACTOR,
} from './queries'

const AAVE_GRAPHQL_URL = 'https://api.v3.aave.com/graphql'

const client = createClient({
  url: AAVE_GRAPHQL_URL,
  exchanges: [cacheExchange, fetchExchange],
  fetchOptions: {
    method: 'POST',
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

async function getUserLendPositions(
  addresses: Address[]
): Promise<LendPosition[]> {
  if (!addresses || addresses.length === 0) {
    return []
  }
  try {
    const lendingPositionsResults = await Promise.all(
      addresses.map(async (address) => {
        const { data, error } = await client
          .query<UserLendPositionsQuery>(USER_LEND_POSITIONS, {
            request: {
              collateralsOnly: false,
              user: address,
              ...marketsGqlParams,
              orderBy: {
                apy: 'DESC',
              },
            },
          })
          .toPromise()

        if (error) {
          console.error('Failed to fetch Aave positions:', error.message)
          // Check if it's a timeout error
          if (error.message?.includes('Time-out') || error.networkError) {
            console.warn('Aave API timeout - returning empty positions')
          }
          return []
        }

        if (!data || !data.userSupplies) {
          return []
        }

        return data.userSupplies.map(
          (position): LendPosition => ({
            id: address,
            protocol: PROTOCOL_ID,
            userId: address,
            userAddress: address,
            poolId: position.market.address,
            poolName: position.market.name,
            poolAddress: position.market.address,
            poolChainId: position.market.chain.chainId,
            poolChainCurrency: position.currency.symbol,
            poolChainNetwork: position.market.chain.name,
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
    console.error('Unexpected error fetching Aave positions:', err)
    return []
  }
}

async function getUserBorrowPositions(
  addresses: Address[]
): Promise<BorrowPosition[]> {
  if (!addresses || addresses.length === 0) {
    return []
  }
  try {
    const borrowPositionsResults = await Promise.all(
      addresses.map(async (address) => {
        const healthFactorKeys = new Set<string>()
        const healthFactorMapParams = new Map<string, number>()

        const { data, error } = await client
          .query<UserBorrowPositionsQuery>(USER_BORROW_POSITIONS, {
            request: {
              user: address,
              ...marketsGqlParams,
              orderBy: {
                apy: 'DESC',
              },
            },
          })
          .toPromise()

        if (error) {
          console.error('Failed to fetch Aave positions:', error.message)
          if (error.message?.includes('Time-out') || error.networkError) {
            console.warn('Aave API timeout - returning empty positions')
          }
          return []
        }

        if (!data || !data.userBorrows) {
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
                console.warn('Aave API timeout - returning empty positions')
              }
              return
            }

            healthFactorMapParams.set(
              key,
              data?.userMarketState?.healthFactor ?? 0
            )
          })
        )

        return data.userBorrows.map(
          (position): BorrowPosition => ({
            id: address,
            protocol: PROTOCOL_ID,
            healthFactor:
              healthFactorMapParams.get(
                `${address}-${position.market.address}-${position.market.chain.chainId}`
              ) ?? 0,
            userId: address,
            userAddress: address,
            poolId: position.market.address,
            poolName: position.market.name,
            poolChainId: position.market.chain.chainId,
            poolChainCurrency: position.currency.symbol,
            poolChainNetwork: position.market.chain.name,
            loanAssetName: position.currency.name,
            loanAssetSymbol: position.currency.symbol,
            loanAssetDecimals: position.currency.decimals,
            loanAssetAmount: position.debt.amount.value,
            loanAssetAmountUsd: position.debt.usd,
            collateralAssetName: '',
            collateralAssetSymbol: '',
            collateralAssetDecimals: 0,
            collateralAssetAmount: BigInt(0),
            collateralAssetAmountUsd: 0,
            apy: position.apy.formatted,
            link: `https://app.aave.com/reserve-overview/?underlyingAsset=${position.currency.address.toLowerCase()}&marketName=proto_${position.market.chain.name.toLowerCase()}_v3`,
          })
        )
      })
    )
    return borrowPositionsResults.flat()
  } catch (err) {
    console.error('Unexpected error fetching Aave positions:', err)
    return []
  }
}

export const gqlAdapter = {
  getUserLendPositions,
  getUserBorrowPositions,
}
