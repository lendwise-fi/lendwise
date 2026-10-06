import type { BorrowPosition } from '@/types'

import {
  type HealthFactorResult,
  type RiskReservePosition,
  calculateHealthFactor,
} from './health-factor'

export function healthFactorFromBorrowPositions(
  borrowPositions: BorrowPosition[]
): HealthFactorResult {
  const reserves: RiskReservePosition[] = []
  const prices: Record<string, number | null | undefined> = {}

  for (const position of borrowPositions) {
    const loanReserveId = `liability:${position.protocol}:${position.loanAssetAddress}:${position.id}`
    const hasLoanPrice = 'loanAssetPriceUsd' in position
    const hasLiabilityWeight = 'loanLiabilityWeight' in position
    prices[loanReserveId] = hasLoanPrice ? position.loanAssetPriceUsd : 1
    reserves.push({
      reserveId: loanReserveId,
      liabilityAmount: hasLoanPrice
        ? position.loanAssetAmount
        : position.loanAssetAmountUsd,
      liabilityWeight: hasLiabilityWeight ? position.loanLiabilityWeight : 1,
    })

    for (const collateral of position.collaterals) {
      const collateralWeight = collateral.lltv ?? collateral.ltv
      const collateralReserveId = `collateral:${position.protocol}:${collateral.address}:${position.id}`
      const hasCollateralPrice = 'priceUsd' in collateral
      prices[collateralReserveId] = hasCollateralPrice ? collateral.priceUsd : 1
      reserves.push({
        reserveId: collateralReserveId,
        collateralAmount: hasCollateralPrice
          ? collateral.amount
          : collateral.amountUsd,
        collateralWeight,
      })
    }
  }

  return calculateHealthFactor(reserves, prices)
}
