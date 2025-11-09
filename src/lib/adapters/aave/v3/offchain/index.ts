import { cacheExchange, createClient, fetchExchange } from '@urql/core'
import type { Address } from 'viem'

import type { BaseDataAdapter } from '@/lib/adapters/types'
import { BorrowPosition, LendPosition } from '@/types'

import { AAVE_CONFIG } from '../../config'
import { ALL_MARKETS_GQL_PARAMS } from './config'
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

const client = createClient({
  url: AAVE_CONFIG.aave_v3.offchainApiUrl!,
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
              ...ALL_MARKETS_GQL_PARAMS,
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
    console.error('Unexpected error fetching Aave V3 positions:', err)
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
              ...ALL_MARKETS_GQL_PARAMS,
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

        const collaterals: BorrowPosition['collaterals'] = []
        // account.deposits.map((deposit) => {
        //   return {
        //     address: deposit.asset.id,
        //     name: deposit.asset.name,
        //     symbol: deposit.asset.symbol,
        //     decimals: deposit.asset.decimals,
        //     amount: deposit.amount,
        //     amountUSD:
        //       Number(
        //         formatUnits(BigInt(deposit.amount ?? 0), deposit.asset.decimals)
        //       ) * deposit.asset.lastPriceUSD,
        //   }
        // })

        return data.userBorrows.map(
          (position): BorrowPosition => ({
            id: address,
            protocol: AAVE_CONFIG.aave_v3.id,
            healthFactor:
              healthFactorMapParams.get(
                `${address}-${position.market.address}-${position.market.chain.chainId}`
              ) ?? 0,
            userAddress: address,
            poolName: position.market.name,
            poolAddress: position.market.address,
            poolChainNetwork: position.market.chain.name,
            loanAssetName: position.currency.name,
            loanAssetSymbol: position.currency.symbol,
            loanAssetDecimals: position.currency.decimals,
            loanAssetAmount: position.debt.amount.value,
            loanAssetAmountUsd: position.debt.usd,
            collaterals,
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

export const aaveV3OffchainAdapter: BaseDataAdapter = {
  dataSourceType: 'offchain',
  getUserLendPositions,
  getUserBorrowPositions,
}
