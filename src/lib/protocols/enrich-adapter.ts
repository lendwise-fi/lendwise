import type { BorrowMarketState, SupplyMarketState } from '@/lib/db/types'

export type RawDailyDoc = {
  _id: string
  productId: string
  date: Date
}

export type MarketPatch = {
  _id: string
  market: SupplyMarketState | BorrowMarketState
}

export type Logger = (msg: string) => void

export interface EnrichAdapter {
  /** Display name for logs */
  name: string
  /**
   * Canonical productId prefix, e.g. "aave:v3".
   * The main script builds the MongoDB filter: `^{prefix}:` or `^{prefix}:{chain}:`
   */
  productIdPrefix: string
  /**
   * Extract the group key from a raw daily doc.
   * Documents with the same key are batched together for a single DeFiLlama fetch.
   * Returns null if the document should be skipped (unrecognized format).
   */
  getGroupKey(doc: RawDailyDoc): string | null
  /**
   * Enrich a batch of documents sharing the same group key.
   * Returns $set patches ready for bulkWrite.
   */
  enrichGroup(docs: RawDailyDoc[], log: Logger): Promise<MarketPatch[]>
}
