import type { BorrowPosition, LendPosition } from '@/types'

import type {
  UserBorrowPositionsQuery,
  UserLendPositionsQuery,
} from './generated/graphql'

/**
 * Optimism-specific data transformers for Compound V3.
 * The Optimism subgraph (spencer.papercliplabs.eth) has a different schema than Messari.
 */

/**
 * Transform Optimism query data into LendPosition array.
 *
 * Schema differences from Messari:
 * - Uses `accounting.baseBalance` instead of `balance`
 * - Uses `accounting.baseBalanceUsd` instead of calculating from price
 * - Uses `configuration.baseToken.token` for asset info
 * - Uses `protocol.accounting.avgSupplyApr` for APY
 */
export function getUserLendPositions(
  data: unknown,
  protocolId: string
): LendPosition[] {
  const queryData = data as UserLendPositionsQuery
  if (!queryData?.accounts) return []

  return queryData.accounts.flatMap((account) => {
    if (!account.positions) return []

    return account.positions
      .filter((position) => {
        // Only include supply positions (positive balance)
        const balance = BigInt(position.accounting?.baseBalance ?? 0)
        return balance > 0n
      })
      .map((position): LendPosition => {
        const token = position.market?.configuration?.baseToken?.token
        const accounting = position.accounting
        const marketConfig = position.market?.configuration
        const protocolAccounting = position.market?.protocol?.accounting

        return {
          id: accounting?.id ?? `${account.address}-${position.market?.id}`,
          protocol: protocolId,
          userAddress: account.address.toLowerCase(),
          poolName: marketConfig?.name ?? marketConfig?.symbol ?? 'Unknown',
          poolAddress: position.market?.id ?? '',
          poolChainNetwork: 'Optimism',
          assetName: token?.name ?? 'Unknown',
          assetSymbol: token?.symbol ?? 'Unknown',
          assetDecimals: token?.decimals ?? 18,
          assetAmount: accounting?.baseBalance ?? 0,
          assetAmountUsd: parseFloat(accounting?.baseBalanceUsd ?? '0'),
          apy: protocolAccounting?.avgSupplyApr ?? 0,
          link: `https://app.compound.finance/?market=${token?.symbol?.toLowerCase()}-op`,
        }
      })
  })
}

/**
 * Transform Optimism query data into BorrowPosition array.
 *
 * Schema differences from Messari:
 * - Uses `accounting.baseBalance` (negative for borrows)
 * - Uses `accounting.baseBalanceUsd` for USD value
 * - Uses `protocol.accounting.avgBorrowApr` for APY
 */
export function getUserBorrowPositions(
  data: unknown,
  protocolId: string
): BorrowPosition[] {
  const queryData = data as UserBorrowPositionsQuery
  if (!queryData?.accounts) return []

  return queryData.accounts.flatMap((account) => {
    if (!account.positions) return []

    return account.positions
      .filter((position) => {
        // Only include borrow positions (negative balance)
        const balance = BigInt(position.accounting?.baseBalance ?? 0)
        return balance < 0n
      })
      .map((position): BorrowPosition => {
        const token = position.market?.configuration?.baseToken?.token
        const accounting = position.accounting
        const marketConfig = position.market?.configuration
        const protocolAccounting = position.market?.protocol?.accounting

        return {
          id: accounting?.id ?? `${account.address}-${position.market?.id}`,
          protocol: protocolId,
          healthFactor: 0,
          userAddress: account.address.toLowerCase(),
          poolName: marketConfig?.name ?? marketConfig?.symbol ?? 'Unknown',
          poolAddress: position.market.id,
          poolChainNetwork: 'Optimism',
          loanAssetName: token?.name ?? 'Unknown',
          loanAssetSymbol: token?.symbol ?? 'Unknown',
          loanAssetDecimals: token?.decimals ?? 18,
          loanAssetAmount: 0,
          loanAssetAmountUsd: 0,
          collaterals: [],
          apy: protocolAccounting?.avgBorrowApr ?? 0,
          link: `https://app.compound.finance/?market=${token?.symbol?.toLowerCase()}-optimism`,
        }
      })
  })
}
