export interface DecomposedProductId {
  provider: 'aave' | 'morpho' | 'compound'
  version: string
  chainName: string
  productType: 'reserve' | 'market' | 'vault'
  address: string
  kind: 'supply' | 'borrow'
}

const PREFIX_TO_PROVIDER: Record<string, DecomposedProductId['provider']> = {
  aave: 'aave',
  morphoblue: 'morpho',
  metamorpho: 'morpho',
  compoundcomet: 'compound',
}

/**
 * Fallback parser for productIds NOT present in the products table (orphans).
 * Handles the irregular formats:
 *   aave/compound        — kind is the last colon segment
 *   morphoblue (borrow)  — no kind suffix, inferred 'borrow'
 *   metamorpho (supply)  — no kind suffix, inferred 'supply'
 * Returns null when the prefix is unrecognized.
 */
export function decomposeProductId(
  productId: string
): DecomposedProductId | null {
  const segments = productId.split(':')
  const prefix = segments[0]
  const provider = PREFIX_TO_PROVIDER[prefix]
  if (!provider) return null

  const last = segments[segments.length - 1]
  const hasKindSuffix = last === 'supply' || last === 'borrow'
  const kind: DecomposedProductId['kind'] = hasKindSuffix
    ? (last as 'supply' | 'borrow')
    : prefix === 'metamorpho'
      ? 'supply'
      : 'borrow' // morphoblue

  const core = hasKindSuffix ? segments.slice(0, -1) : segments
  // core = [prefix, version, chainName, productType, address]
  return {
    provider,
    version: core[1],
    chainName: core[2],
    productType: core[3] as DecomposedProductId['productType'],
    address: core[4],
    kind,
  }
}
