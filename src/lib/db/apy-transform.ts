import type {
  ApyTimeSeriesDocument,
  MarketApyTimeSeriesDocument,
  VaultApyTimeSeriesDocument,
} from '@/lib/db/types'

/**
 * Converts a legacy ApyTimeSeriesDocument (from protocol fetchers) into the
 * standardized vault and market documents for storage in the "apy" collection.
 *
 * - Vault doc: lender-only view (supply APY + supply amounts), kind: 'vault'.
 * - Market doc: full view (supply + borrow APY and amounts), kind: 'market'.
 */
export function apySnapshotToVaultAndMarket(
  doc: ApyTimeSeriesDocument
): {
  vault: VaultApyTimeSeriesDocument
  market: MarketApyTimeSeriesDocument
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

  const vault: VaultApyTimeSeriesDocument = {
    kind: 'vault',
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

  const market: MarketApyTimeSeriesDocument = {
    kind: 'market',
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
    market.collateralAssets = collateralAssets
    market.collateralAssetsUsd = collateralAssetsUsd
    if (collateralAssets > 0 && supplyAssets > 0) {
      market.price_collateral_in_loan_asset =
        (collateralAssetsUsd / collateralAssets) / (supplyAssetsUsd / supplyAssets)
    }
  }

  return { vault, market }
}
