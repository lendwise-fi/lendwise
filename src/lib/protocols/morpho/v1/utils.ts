import { arbitrum, optimism } from 'viem/chains'

import type { Kind } from '@/lib/db/types'
import type {
  ListSupplyingProductsQuery,
  MarketsApyQuery,
} from '@/lib/protocols/morpho/v1/offchain/generated/graphql'

// ─── Market Product ID builder ──────────────────────────────────────────────────────────
export function buildProductId(
  product:
    | NonNullable<ListSupplyingProductsQuery['vaults']['items']>[number]
    | NonNullable<MarketsApyQuery['markets']['items']>[number],
  kind: Kind
): string {
  if (kind === 'supply') {
    const vault = product as NonNullable<
      ListSupplyingProductsQuery['vaults']['items']
    >[number]
    const network = vault.asset.chain.network.toLowerCase().replaceAll(' ', '')
    return `metamorpho:v1:${network}:vault:${vault.address.toLowerCase()}`
  }
  const market = product as NonNullable<
    MarketsApyQuery['markets']['items']
  >[number]

  const network = market.loanAsset.chain.network
    .toLowerCase()
    .replaceAll(' ', '')
  return `morphoblue:v1:${network}:market:${market.uniqueKey}`
}

export const CHAIN_NAME_MAPPING: Record<string, { protocolName: string }> = {
  [arbitrum.id]: {
    protocolName: 'arbitrum',
  },
  [optimism.id]: {
    protocolName: 'optimism',
  },
}
