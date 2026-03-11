import type {
  ApyTimeSeriesDocument,
  BorrowApyTimeSeriesDocument,
  LendApyTimeSeriesDocument,
} from '@/lib/db/types'

/**
 * Converts a legacy ApyTimeSeriesDocument (from protocol fetchers) into the
 * standardized lend and borrow documents for storage.
 *
 * - Lend doc: lender-only (supply APY + amounts), kind: 'lend'.
 * - Borrow doc: supply + borrow APY and amounts, kind: 'borrow'.
 */
export function apySnapshotToLendAndBorrow(
  doc: ApyTimeSeriesDocument
): {
  lend: LendApyTimeSeriesDocument
  borrow: BorrowApyTimeSeriesDocument
} {
  const { metadata, supplyApy, borrowApy, supplyAssets, supplyAssetsUsd, borrowAssets, borrowAssetsUsd, collateralAssets, collateralAssetsUsd } = doc

  const priceInDollars =
    supplyAssets > 0 ? supplyAssetsUsd / supplyAssets : 0

  const loan_asset = {
    symbol: metadata.vault.symbol,
    name: metadata.vault.name,
    address: metadata.vault.address,
    price_in_dollars: priceInDollars,
  }

  const supplyApyStandard = {
    native: supplyApy.native,
    rewards: supplyApy.rewards,
    fees: supplyApy.fees,
    net: supplyApy.total,
    rateData: supplyApy.protocolData,
  }

  const borrowApyStandard = {
    native: borrowApy.native,
    rewards: borrowApy.rewards,
    fees: borrowApy.fees,
    net: borrowApy.total,
    rateData: borrowApy.protocolData,
  }

  const lend: LendApyTimeSeriesDocument = {
    kind: 'lend',
    timestamp: doc.timestamp,
    metadata: {
      chain: metadata.chain,
      protocol: metadata.protocol,
      vault: {
        loan_asset,
        vaultData: supplyApy.protocolData,
      },
    },
    supplyApy: supplyApyStandard,
    supplyAssets,
    supplyAssetsUsd,
  }

  const borrow: BorrowApyTimeSeriesDocument = {
    kind: 'borrow',
    timestamp: doc.timestamp,
    metadata: {
      chain: metadata.chain,
      protocol: metadata.protocol,
      market: {
        loan_asset,
        marketData: borrowApy.protocolData,
      },
    },
    supplyApy: supplyApyStandard,
    borrowApy: borrowApyStandard,
    supplyAssets,
    supplyAssetsUsd,
    borrowAssets,
    borrowAssetsUsd,
  }

  if (collateralAssets !== undefined && collateralAssetsUsd !== undefined) {
    borrow.collateralAssets = collateralAssets
    borrow.collateralAssetsUsd = collateralAssetsUsd
    if (collateralAssets > 0 && supplyAssets > 0) {
      borrow.price_collateral_in_loan_asset =
        (collateralAssetsUsd / collateralAssets) / (supplyAssetsUsd / supplyAssets)
    }
  }

  return { lend, borrow }
}
