import type { Kind } from '@/lib/db/types'
import type {
  ListSupplyProductsQuery,
  MarketsApyQuery,
} from '@/lib/protocols/morpho/v1/offchain/generated/graphql'
import { CHAIN_NAME_MAPPING } from '@/lib/protocols/utils'

// ─── Primitive Product ID builders ───────────────────────────────────────────

export function buildVaultProductId(chainId: number, address: string): string {
  const network = CHAIN_NAME_MAPPING[chainId]
  if (!network) throw new Error(`No slug registered for chainId ${chainId} — add it to chain-slugs.ts`)
  return `metamorpho:v1:${network}:vault:${address.toLowerCase()}`
}

export function buildMarketProductId(
  chainId: number,
  marketId: string
): string {
  const network = CHAIN_NAME_MAPPING[chainId]
  if (!network) throw new Error(`No slug registered for chainId ${chainId} — add it to chain-slugs.ts`)
  return `morphoblue:v1:${network}:market:${marketId}`
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
