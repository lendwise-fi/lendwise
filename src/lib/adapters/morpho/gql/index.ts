import { cacheExchange, createClient, fetchExchange } from '@urql/core'
import { Address } from 'viem'

import { MORPHO_CONFIG } from '@/config/protocols'
import { BorrowPosition, LendPosition } from '@/types'

import {
  UserBorrowPositionsQuery,
  UserLendPositionsQuery,
} from './generated/graphql'
import { USER_BORROW_POSITIONS, USER_LEND_POSITIONS } from './queries'

const MORPHO_GRAPHQL_URL = 'https://api.morpho.org/graphql'

const client = createClient({
  url: MORPHO_GRAPHQL_URL,
  exchanges: [cacheExchange, fetchExchange],
  fetchOptions: {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // Add timeout to prevent long-hanging requests
    signal: AbortSignal.timeout(20000), // 20 second timeout
  },
  // Retry failed requests once
  requestPolicy: 'network-only',
})

async function getUserLendPositions(
  addresses: Address[]
): Promise<LendPosition[]> {
  // Return empty array if no addresses provided
  if (!addresses || addresses.length === 0) {
    return []
  }

  try {
    // Get all chain IDs from MORPHO_CONFIG
    const chainIds = Object.keys(MORPHO_CONFIG).map(Number)

    const { data, error } = await client
      .query<UserLendPositionsQuery>(USER_LEND_POSITIONS, {
        where: {
          chainId_in: chainIds,
          userAddress_in: [...addresses],
        },
      })
      .toPromise()

    if (error) {
      console.error('Failed to fetch Morpho positions:', error)
      // Check if it's a timeout error
      if (error.message?.includes('Time-out') || error.networkError) {
        console.warn('Morpho API timeout - returning empty positions')
      }
      return []
    }

    if (!data || !data.vaultPositions || !data.vaultPositions.items) {
      return []
    }

    return data.vaultPositions.items.map((position) => ({
      id: position.id,
      protocol: 'morpho',
      userId: position.user.id,
      userAddress: position.user.address,
      poolId: position.vault.id,
      poolName: position.vault.name,
      poolAddress: position.vault.address,
      poolSymbol: position.vault.asset.symbol,
      poolChainId: position.vault.chain.id,
      poolChainCurrency: position.vault.chain.currency,
      poolChainNetwork: position.vault.chain.network,
      assetName: position.vault.asset.name,
      assetSymbol: position.vault.asset.symbol,
      assetDecimals: position.vault.asset.decimals,
      assetAmount: position.state?.assets ?? 0,
      assetAmountUsd: position.state?.assetsUsd ?? 0,
      netApy: position.vault.state?.netApyWithoutRewards ?? 0,
    }))
  } catch (err) {
    console.error('Unexpected error fetching Morpho positions:', err)
    return []
  }
}

async function getUserBorrowPositions(
  addresses: Address[]
): Promise<BorrowPosition[]> {
  // Return empty array if no addresses provided
  if (!addresses || addresses.length === 0) {
    return []
  }

  try {
    // Get all chain IDs from MORPHO_CONFIG
    const chainIds = Object.keys(MORPHO_CONFIG).map(Number)

    const { data, error } = await client
      .query<UserBorrowPositionsQuery>(USER_BORROW_POSITIONS, {
        where: {
          chainId_in: chainIds,
          userAddress_in: [...addresses],
        },
      })
      .toPromise()

    if (error) {
      console.error('Failed to fetch Morpho positions:', error)
      // Check if it's a timeout error
      if (error.message?.includes('Time-out') || error.networkError) {
        console.warn('Morpho API timeout - returning empty positions')
      }
      return []
    }

    if (!data || !data.marketPositions || !data.marketPositions.items) {
      return []
    }

    return data.marketPositions.items.map((position) => ({
      id: position.id,
      protocol: 'morpho',
      healthFactor: position.healthFactor ?? 0,
      userId: position.user.id,
      userAddress: position.user.address,
      poolId: position.market.id,
      poolName: `${position.market.collateralAsset?.symbol}/${position.market.loanAsset?.symbol}`,
      poolSymbol: position.market.loanAsset.symbol,
      poolChainId: position.market.morphoBlue.chain.id,
      poolChainCurrency: position.market.morphoBlue.chain.currency,
      poolChainNetwork: position.market.morphoBlue.chain.network,
      loanAssetName: position.market.loanAsset.name,
      loanAssetSymbol: position.market.loanAsset.symbol,
      loanAssetDecimals: position.market.loanAsset.decimals,
      loanAssetAmount: position.state?.borrowAssets ?? 0,
      loanAssetAmountUsd: position.state?.borrowAssetsUsd ?? 0,
      collateralAssetName: position.market.collateralAsset?.name,
      collateralAssetSymbol: position.market.collateralAsset?.symbol,
      collateralAssetDecimals: position.market.collateralAsset?.decimals,
      collateralAssetAmount: position.state?.collateral ?? 0,
      collateralAssetAmountUsd: position.state?.collateralUsd ?? 0,
      netApy: 0,
    }))
  } catch (err) {
    console.error('Unexpected error fetching Morpho positions:', err)
    return []
  }
}

export const gqlAdapter = {
  getUserLendPositions,
  getUserBorrowPositions,
}
