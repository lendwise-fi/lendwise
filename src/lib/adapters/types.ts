import type { Address } from 'viem'

import { BorrowPosition, LendPosition, MarketStats } from '@/types'

export interface StatsAdapter {
  getMarketStats(): Promise<MarketStats[]>
  // other stats methods can go here
}

export interface GraphqlProtocolAdapter {
  /**
   * The unique name of the protocol.
   */
  protocol: string

  /**
   * Fetches the user's lending positions from the protocol.
   * @param userAddress The address of the user.
   * @returns A promise that resolves to an array of lending positions.
   */
  getUserLendPositions(addresses: Address[]): Promise<LendPosition[]>

  /**
   * Fetches the user's borrowing positions from the protocol.
   * @param userAddress The address of the user.
   * @returns A promise that resolves to an array of borrowing positions.
   */
  getUserBorrowPositions(addresses: Address[]): Promise<BorrowPosition[]>

  /**
   * Optional adapter for fetching statistical or historical data.
   */
  stats?: StatsAdapter
}
