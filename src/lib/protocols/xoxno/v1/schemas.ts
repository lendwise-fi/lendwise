import { z } from 'zod'

const id = z.number().int().positive().safe()
const contract = z.string().regex(/^C[A-Z2-7]{55}$/)
const amountRaw = z.string().regex(/^\d+$/).nullable()
const decimalAmount = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .nullable()
const finite = z.number().finite()
const nonnegative = finite.nonnegative()
const ratioBps = finite.min(0).max(10_000)
const network = z.enum(['mainnet', 'testnet'])
const capacity = z.object({
  amountRaw,
  amount: decimalAmount,
  usd: nonnegative.nullable(),
})
const priceStatus = z.object({
  valid: z.boolean(),
  stale: z.boolean(),
  deviation: z.boolean(),
  timestamp: nonnegative.nullable(),
})
const token = {
  sac: contract,
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(38).nullable(),
  logoUrl: z.string().nullable(),
}
const assetSpoke = z.object({
  spokeId: id,
  spokeName: z.string(),
  ltvBps: ratioBps,
  supplyCapacity: capacity,
  borrowCapacity: capacity,
  canSupply: z.boolean(),
  canBeCollateral: z.boolean(),
  canBorrow: z.boolean(),
  canOpenAccount: z.boolean(),
})
export const assetsSchema = z.array(
  z.object({
    ...token,
    network,
    hubId: id,
    hubName: z.string(),
    supplyApy: nonnegative.nullable(),
    borrowApy: nonnegative.nullable(),
    priceUsd: nonnegative.nullable(),
    priceStatus,
    spokes: z.array(assetSpoke),
    dataStatus: z.enum(['ready', 'stale', 'incomplete']),
    indexedAt: nonnegative,
    indexedLedger: nonnegative,
  })
)
const positionAsset = z.object({
  ...token,
  hubId: id,
  hubName: z.string(),
  amountRaw,
  amount: decimalAmount,
  apy: nonnegative.nullable(),
  priceUsd: nonnegative.nullable(),
  valueUsd: nonnegative.nullable(),
  priceStatus,
  indexRay: amountRaw,
  indexedAt: nonnegative,
  indexedLedger: nonnegative,
})
export const positionsSchema = z.array(
  z.object({
    accountId: z.string().regex(/^\d+$/),
    nftContract: contract,
    nftImage: z.string(),
    network,
    spokeId: id.nullable(),
    spokeName: z.string().nullable(),
    supplied: z.array(positionAsset),
    borrow: z.array(positionAsset),
    hasDebt: z.boolean().nullable(),
    healthFactor: nonnegative.nullable(),
    borrowLimitUsd: nonnegative.nullable(),
    availableBorrowUsd: nonnegative.nullable(),
    netApy: finite.nullable(),
    dataStatus: z.enum(['ready', 'stale', 'incomplete']),
  })
)
export const reserveSchema = z.object({
  spokeId: id,
  hubId: id,
  asset: contract,
  assetDecimals: z.number().int().min(0).max(38),
  supplyApy: nonnegative.nullable(),
  borrowApy: nonnegative.nullable(),
  utilization: nonnegative.nullable(),
  availableLiquidityShort: nonnegative.nullable(),
  availableLiquidityUsd: nonnegative.nullable(),
  hubPool: z.object({
    suppliedShort: nonnegative.nullable(),
    borrowedShort: nonnegative.nullable(),
    depositsUsd: nonnegative.nullable(),
    borrowsUsd: nonnegative.nullable(),
  }),
  collateralFactorBps: ratioBps,
  liquidationThresholdBps: ratioBps,
  isCollateralizable: z.boolean(),
  isBorrowable: z.boolean(),
  useAsCollateral: z.boolean(),
  paused: z.boolean(),
  frozen: z.boolean(),
  noSeize: z.boolean(),
  irm: z.object({ reserveFactorBps: ratioBps }),
})
export const contextSchema = z.object({
  assets: z.array(
    z.object({
      asset: contract,
      symbol: z.string(),
      name: z.string(),
      decimals: z.number().int().min(0).max(38),
    })
  ),
  hubs: z.array(z.object({ hubId: id, name: z.string().nullable() })),
  spokes: z.array(z.object({ spokeId: id, name: z.string().nullable() })),
  reserves: z.array(z.object({ spokeId: id, hubId: id, asset: contract })),
  reserveDetailsByKey: z.record(z.string(), reserveSchema),
})
export const detailedMarketsSchema = z.array(
  z.object({
    hubId: id,
    asset: contract,
    usdPriceShort: nonnegative,
    valid: z.boolean(),
    stale: z.boolean(),
    deviation: z.boolean(),
  })
)
export const graphSchema = z.object({
  points: z.array(
    z.object({
      timestamp: z.iso.datetime({ offset: true }),
      hubId: id,
      token: contract,
      supplyApy: nonnegative.nullable(),
      borrowApy: nonnegative.nullable(),
      utilization: nonnegative.nullable(),
      totalDepositsUsd: nonnegative.nullable(),
      totalBorrowsUsd: nonnegative.nullable(),
      availableLiquidityUsd: nonnegative.nullable(),
      usdPrice: nonnegative.nullable(),
    })
  ),
})
export type XoxnoContext = z.infer<typeof contextSchema>
export type XoxnoReserve = z.infer<typeof reserveSchema>

const metaCollateral = z.object({
  hubId: id,
  asset: contract,
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(38),
  logoUrl: z.string().nullable(),
  ltv: finite.min(0).max(1),
  lltv: finite.min(0).max(1),
  canBeCollateral: z.boolean(),
  canSupply: z.boolean(),
  supplyCapacity: capacity.nullable(),
  paused: z.boolean(),
  frozen: z.boolean(),
  noSeize: z.boolean(),
})
export const xoxnoMetaSchema = z.object({
  network,
  controller: contract,
  pool: contract,
  nft: contract,
  hubId: id,
  asset: contract,
  hubName: z.string(),
  historySpokeId: id,
  logoUrl: z.string().nullable(),
  spokes: z.array(
    z.object({
      spokeId: id,
      spokeName: z.string(),
      canSupply: z.boolean(),
      canBeCollateral: z.boolean(),
      canBorrow: z.boolean(),
      canOpenAccount: z.boolean(),
      supplyCapacity: capacity.nullable(),
      borrowCapacity: capacity.nullable(),
      ltv: finite.min(0).max(1),
      lltv: finite.min(0).max(1),
      paused: z.boolean(),
      frozen: z.boolean(),
      noSeize: z.boolean(),
      collaterals: z.array(metaCollateral),
    })
  ),
})

export const parseXoxnoMeta = (raw: unknown) => xoxnoMetaSchema.parse(raw)
