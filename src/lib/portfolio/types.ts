import type { UserPosition } from '@/types'

export type PortfolioChainFamily = 'evm' | 'stellar'

export interface PortfolioWalletInput {
  address: string
  chainFamily: PortfolioChainFamily
}

export interface PortfolioPartialFailure {
  chainFamily: PortfolioChainFamily
  protocolId?: string
  message: string
}

export interface UserPortfolioPositionsResult {
  positions: UserPosition
  failures: PortfolioPartialFailure[]
}

export const EMPTY_USER_POSITIONS: UserPosition = {
  supply: {},
  borrow: {},
}

export function mergeUserPositions(...positions: UserPosition[]): UserPosition {
  const merged: UserPosition = {
    supply: {},
    borrow: {},
  }

  for (const position of positions) {
    for (const [protocol, supply] of Object.entries(position.supply)) {
      merged.supply[protocol] = [...(merged.supply[protocol] ?? []), ...supply]
    }
    for (const [protocol, borrow] of Object.entries(position.borrow)) {
      merged.borrow[protocol] = [...(merged.borrow[protocol] ?? []), ...borrow]
    }
  }

  return merged
}
