import type { Kind } from '@/lib/db/types'
import type {
  ListSupplyingProductsQuery,
  MarketsApyQuery,
} from '@/lib/protocols/morpho/v1/offchain/generated/graphql'
import { CHAIN_NAME_MAPPING } from '@/lib/protocols/utils'

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
    const chain = vault.asset.chain
    return `metamorpho:v1:${CHAIN_NAME_MAPPING[chain.id] ?? chain.id}:vault:${vault.address.toLowerCase()}`
  }
  const market = product as NonNullable<
    MarketsApyQuery['markets']['items']
  >[number]

  const chain = market.loanAsset.chain
  return `morphoblue:v1:${CHAIN_NAME_MAPPING[chain.id] ?? chain.id}:market:${market.uniqueKey}`
}
