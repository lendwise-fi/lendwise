import { z } from 'zod'

/**
 * Tolerant zod schemas for the public Kamino API. Unknown fields are ignored
 * (zod objects strip them), numeric strings become numbers, and each schema
 * transforms the raw payload into the normalized shape exported below. Keep the
 * raw field names in this file; consumers only see the normalized types.
 */

/** Number or numeric string (`"0.0441"`, `"4.6e-16"`) -> finite number. */
const num = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number)
  .pipe(z.number().finite())

const optNum = num.nullish().transform((v) => v ?? null)

const SF_SCALE = 2 ** 60

/** Kamino "scaled fraction" (value * 2^60, as a decimal string) -> number. */
const sfToNumber = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform((v) => Number(BigInt(v)) / SF_SCALE)

// ── Markets ──────────────────────────────────────────────────────────────────

const marketSchema = z
  .object({
    lendingMarket: z.string().min(1),
    name: z.string(),
    description: z.string().nullish(),
    isPrimary: z.boolean().nullish(),
    isCurated: z.boolean().nullish(),
    lookupTable: z.string().nullish(),
  })
  .transform((m) => ({
    address: m.lendingMarket,
    name: m.name,
    description: m.description ?? '',
    isPrimary: m.isPrimary ?? false,
    isCurated: m.isCurated ?? false,
    lookupTable: m.lookupTable ?? null,
  }))
export const marketsResponseSchema = z.array(marketSchema)
export type KaminoMarket = z.output<typeof marketSchema>

/** `/markets/batch/metadata`: market -> its reserve addresses. */
export const marketsMetadataResponseSchema = z.record(
  z.string(),
  z.object({ reserves: z.array(z.string()) })
)

// ── Reserve stats (spot) ─────────────────────────────────────────────────────

const rewardApySchema = z
  .object({
    rewardToken: z.string(),
    apy: num,
    tokensPerSecond: optNum,
  })
  .transform((r) => ({
    rewardToken: r.rewardToken,
    apy: r.apy,
    tokensPerSecond: r.tokensPerSecond,
  }))

export const reserveStatsSchema = z
  .object({
    token: z.string(),
    collateralMintAddress: z.string().nullish(),
    status: z.string(),
    rateType: z.string(),
    fixedTerm: z
      .object({ termSeconds: num, apy: num })
      .nullish()
      .transform((v) => v ?? null),
    protocolTakeRatePct: optNum,
    supplyApy: z.object({ current: num }),
    borrowApy: z.object({ current: num }),
    supplyApyBreakdown: z.object({
      lending: num,
      incentives: num,
      seasonRewards: optNum,
      underlying: optNum,
      total: num,
    }),
    borrowApyBreakdown: z.object({
      borrow: num,
      incentives: num,
      seasonRewards: optNum,
      total: num,
    }),
    supplyRewardApys: z.array(rewardApySchema).nullish(),
    borrowRewardApys: z.array(rewardApySchema).nullish(),
    utilization: z.object({ current: num }),
    liquidityAvailable: num,
    liquidityAvailableUsd: num,
    totalSupply: num,
    totalSupplyUsd: num,
    totalBorrow: num,
    totalBorrowUsd: num,
    maxLTV: num,
    liqLTV: num,
    borrowFactor: num,
    depositLimit: optNum,
    borrowLimit: optNum,
    minLiquidationBonus: optNum,
    maxLiquidationBonus: optNum,
  })
  .transform((r) => ({
    mint: r.token,
    collateralMint: r.collateralMintAddress ?? null,
    status: r.status,
    rateType: r.rateType,
    fixedTerm: r.fixedTerm,
    protocolTakeRatePct: r.protocolTakeRatePct,
    supplyApy: r.supplyApy.current,
    borrowApy: r.borrowApy.current,
    supplyApyBreakdown: r.supplyApyBreakdown,
    borrowApyBreakdown: r.borrowApyBreakdown,
    supplyRewards: r.supplyRewardApys ?? [],
    borrowRewards: r.borrowRewardApys ?? [],
    utilization: r.utilization.current,
    liquidityAvailable: r.liquidityAvailable,
    liquidityAvailableUsd: r.liquidityAvailableUsd,
    totalSupply: r.totalSupply,
    totalSupplyUsd: r.totalSupplyUsd,
    totalBorrow: r.totalBorrow,
    totalBorrowUsd: r.totalBorrowUsd,
    maxLtv: r.maxLTV,
    liquidationLtv: r.liqLTV,
    borrowFactor: r.borrowFactor,
    depositLimit: r.depositLimit,
    borrowLimit: r.borrowLimit,
    minLiquidationBonus: r.minLiquidationBonus,
    maxLiquidationBonus: r.maxLiquidationBonus,
  }))
/** `/reserves/batch/stats`: reserve address -> stats (the payload carries no market). */
export const reserveStatsResponseSchema = z.record(z.string(), z.unknown())
export type KaminoReserveStatsBody = z.output<typeof reserveStatsSchema>

// ── Reserve account data (on-chain metadata) ────────────────────────────────

/** `/kamino-market/reserves/account-data`: per market, base64 Reserve accounts. */
export const reserveAccountsResponseSchema = z.array(
  z.object({
    market: z.string().min(1),
    reserves: z.array(z.unknown()),
  })
)
export const reserveAccountItemSchema = z.object({
  pubkey: z.string().min(1),
  data: z.string().min(1),
})

// ── Reserve history ──────────────────────────────────────────────────────────

const historyRowSchema = z
  .object({
    timestamp: z
      .string()
      .transform((s) => Date.parse(s))
      .pipe(z.number().finite()),
    metrics: z.object({
      status: z.string().nullish(),
      symbol: z.string().nullish(),
      decimals: optNum,
      mintAddress: z.string().nullish(),
      assetPriceUSD: optNum,
      supplyInterestAPY: num,
      borrowInterestAPY: num,
      supplyRewardsApy: optNum,
      borrowRewardsApy: optNum,
      depositTvl: optNum,
      borrowTvl: optNum,
      totalSupply: optNum,
      totalBorrows: optNum,
      loanToValue: optNum,
      /** Legacy name used by older rows. */
      loanToValuePct: optNum,
      liquidationThreshold: optNum,
      borrowFactor: optNum,
    }),
  })
  .transform(({ timestamp, metrics: m }) => ({
    timestamp,
    status: m.status ?? null,
    symbol: m.symbol ?? null,
    decimals: m.decimals,
    mint: m.mintAddress ?? null,
    assetPriceUsd: m.assetPriceUSD,
    supplyApy: m.supplyInterestAPY,
    borrowApy: m.borrowInterestAPY,
    supplyRewardsApy: m.supplyRewardsApy,
    borrowRewardsApy: m.borrowRewardsApy,
    depositTvl: m.depositTvl,
    borrowTvl: m.borrowTvl,
    totalSupply: m.totalSupply,
    totalBorrows: m.totalBorrows,
    ltv: m.loanToValue ?? m.loanToValuePct,
    liquidationThreshold: m.liquidationThreshold,
    borrowFactor: m.borrowFactor,
  }))
export const reserveHistoryResponseSchema = z.object({
  history: z.array(z.unknown()),
})
export { historyRowSchema }
export type KaminoReserveHistoryPoint = z.output<typeof historyRowSchema>

// ── Obligations ──────────────────────────────────────────────────────────────

/** Placeholder for an unused slot in the fixed-size on-chain arrays. */
const EMPTY_RESERVE = '11111111111111111111111111111111'

const obligationSchema = z
  .object({
    obligationAddress: z.string(),
    obligationTag: z.number().nullish(),
    humanTag: z.string().nullish(),
    refreshedStats: z
      .object({
        userTotalDeposit: num,
        userTotalBorrow: num,
        userTotalBorrowBorrowFactorAdjusted: num,
        borrowLimit: num,
        borrowLiquidationLimit: num,
        liquidationLtv: num,
        loanToValue: num,
        netAccountValue: num,
      })
      .nullish(),
    state: z.object({
      lendingMarket: z.string(),
      owner: z.string(),
      elevationGroup: z.number().nullish(),
      deposits: z.array(
        z.object({
          depositReserve: z.string(),
          depositedAmount: z.string(),
          marketValueSf: sfToNumber,
        })
      ),
      borrows: z.array(
        z.object({
          borrowReserve: z.string(),
          borrowedAmountSf: z.string(),
          marketValueSf: sfToNumber,
        })
      ),
    }),
  })
  .transform((o) => ({
    address: o.obligationAddress,
    market: o.state.lendingMarket,
    owner: o.state.owner,
    tag: o.obligationTag ?? null,
    humanTag: o.humanTag ?? null,
    elevationGroup: o.state.elevationGroup ?? 0,
    /** Non-empty deposit slots; `amount` is raw collateral-token units. */
    deposits: o.state.deposits
      .filter(
        (d) => d.depositReserve !== EMPTY_RESERVE && d.depositedAmount !== '0'
      )
      .map((d) => ({
        reserve: d.depositReserve,
        amount: d.depositedAmount,
        marketValueUsd: d.marketValueSf,
      })),
    /** Non-empty borrow slots; `amountSf` is the on-chain scaled-fraction (x 2^60) liquidity amount. */
    borrows: o.state.borrows
      .filter(
        (b) => b.borrowReserve !== EMPTY_RESERVE && b.borrowedAmountSf !== '0'
      )
      .map((b) => ({
        reserve: b.borrowReserve,
        amountSf: b.borrowedAmountSf,
        marketValueUsd: b.marketValueSf,
      })),
    stats: o.refreshedStats ?? null,
  }))
export const obligationsResponseSchema = z.array(z.unknown())
export { obligationSchema }
export type KaminoObligation = z.output<typeof obligationSchema>

/** Mint, decimals and symbol of a reserve, decoded from its on-chain account. */
export interface KaminoReserveAccount {
  market: string
  reserve: string
  mint: string
  decimals: number
  symbol: string
}
