import type { Kind } from '@/lib/db/types'
import type {
  ListSupplyProductsQuery,
  MarketsApyQuery,
} from '@/lib/protocols/morpho/v1/offchain/generated/graphql'
import { CHAIN_NAME_MAPPING } from '@/lib/protocols/utils'

// ─── Primitive Product ID builders ───────────────────────────────────────────

export function buildVaultProductId(chainId: number, address: string): string {
  return `metamorpho:v1:${CHAIN_NAME_MAPPING[chainId] ?? chainId}:vault:${address.toLowerCase()}`
}

export function buildMarketProductId(
  chainId: number,
  marketId: string
): string {
  return `morphoblue:v1:${CHAIN_NAME_MAPPING[chainId] ?? chainId}:market:${marketId}`
}

// ─── Market Product ID builder ──────────────────────────────────────────────────────────
export function buildProductId(
  product:
    | NonNullable<ListSupplyProductsQuery['vaults']['items']>[number]
    | NonNullable<MarketsApyQuery['markets']['items']>[number],
  kind: Kind
): string {
  if (kind === 'supply') {
    const vault = product as NonNullable<
      ListSupplyProductsQuery['vaults']['items']
    >[number]
    return buildVaultProductId(vault.asset.chain.id, vault.address)
  }
  const market = product as NonNullable<
    MarketsApyQuery['markets']['items']
  >[number]
  return buildMarketProductId(market.loanAsset.chain.id, market.marketId)
}
