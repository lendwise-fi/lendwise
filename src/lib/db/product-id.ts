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
  morpho: 'morpho',
  compoundcomet: 'compound',
}

/**
 * Fallback parser for productIds NOT present in the products table (orphans).
 * Every provider now uses a uniform shape with the kind as the last segment:
 *   {prefix}:{version}:{chainName}:{productType}:{address}:{supply|borrow}
 * Returns null when the prefix is unrecognized or the kind suffix is missing.
 */
export function decomposeProductId(
  productId: string
): DecomposedProductId | null {
  const segments = productId.split(':')
  const prefix = segments[0]
  const provider = PREFIX_TO_PROVIDER[prefix]
  if (!provider) return null

  const last = segments[segments.length - 1]
  if (last !== 'supply' && last !== 'borrow') return null

  const core = segments.slice(0, -1)
  // core = [prefix, version, chainName, productType, address]
  return {
    provider,
    version: core[1],
    chainName: core[2],
    productType: core[3] as DecomposedProductId['productType'],
    address: core[4],
    kind: last,
  }
}
