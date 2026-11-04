import type { BorrowProduct } from '@/types'

/** A selected XOXNO variant names the collateral; the symbol filter only groups rows. */
export function optimizerCollateralSymbol(
  markets: BorrowProduct[],
  filteredSymbol?: string
): string {
  const selected = markets.find((m) => m.xoxno)
  if (selected?.xoxno) {
    const choice = selected.xoxnoSelection
    const spoke = selected.xoxno.spokes.find(
      (s) => s.spokeId === choice?.spokeId
    )
    return (
      spoke?.collaterals.find(
        (c) =>
          c.hubId === choice?.collateralHubId &&
          c.asset === choice?.collateralAsset
      )?.symbol ?? '?'
    )
  }
  return filteredSymbol ?? markets[0]?.collaterals[0]?.symbol ?? '?'
}
