/**
 * Protocol-owned `meta` of Kamino products. Base58 keys, case kept. Task 4
 * (history) reads `market` and `reserve` back from here.
 */
interface KaminoMetaBase {
  /** Lending market address. */
  market: string
  /** Reserve address within the market. */
  reserve: string
  /** Liquidity token mint. */
  mint: string
  /** Market display name, e.g. "Main Market". */
  marketName: string
  /** Liquidity token symbol, e.g. "USDC". */
  symbol: string
}

export type KaminoSupplyMeta = KaminoMetaBase
export type KaminoBorrowMeta = KaminoMetaBase
