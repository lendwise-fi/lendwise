import type { XoxnoSelection } from '@/lib/protocols/xoxno/v1/types'
import type { BorrowProduct, SupplyProduct } from '@/types'

type Product = SupplyProduct | BorrowProduct

export function hasXoxnoSelection(product: Product): boolean {
  if (!product.xoxno) return true
  const selection = product.xoxnoSelection
  const spoke = product.xoxno.spokes.find(
    (s) => s.spokeId === selection?.spokeId
  )
  if (!spoke || !spoke.canOpenAccount || spoke.paused || spoke.frozen)
    return false
  return 'collaterals' in product
    ? spoke.canBorrow &&
        spoke.collaterals.some(
          (c) =>
            c.hubId === selection?.collateralHubId &&
            c.asset === selection.collateralAsset &&
            c.canSupply &&
            c.canBeCollateral &&
            !c.paused &&
            !c.frozen
        )
    : spoke.canSupply
}

/** A spoke projects its own risk; catalogue-wide collateral labels carry no risk. */
export function selectXoxnoProduct<T extends Product>(
  product: T,
  selection?: XoxnoSelection
): T {
  if (!product.xoxno) return product
  const spoke = product.xoxno.spokes.find(
    (s) => s.spokeId === selection?.spokeId
  )
  return {
    ...product,
    xoxnoSelection: spoke ? selection : undefined,
    ...('collaterals' in product
      ? {
          collaterals: (spoke?.collaterals ?? []).map((c) => ({
            address: c.asset,
            symbol: c.symbol,
            name: c.name,
            decimals: c.decimals,
            logoURI: c.logoUrl ?? undefined,
            ltv: c.ltv,
            lltv: c.lltv,
          })),
        }
      : {}),
  }
}
