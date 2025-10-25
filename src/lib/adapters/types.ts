import { LendingPosition, MarketStats } from '@/types/lending'

export interface StatsAdapter {
  getMarketStats(): Promise<MarketStats[]>
  // other stats methods can go here
}

export interface ProtocolAdapter {
  /**
   * The unique name of the protocol.
   */
  protocol: string

  /**
   * Fetches the user's lending and borrowing positions from the protocol.
   * @param userAddress The address of the user.
   * @returns A promise that resolves to an array of lending positions.
   */
  getUserPositions(userAddress: `0x${string}`): Promise<LendingPosition[]>

  /**
   * Optional adapter for fetching statistical or historical data.
   */
  stats?: StatsAdapter
}
