import type {
  LendingAsset,
  LendingPosition,
  PositionAsset,
} from '@xoxno/sdk-js/stellar-lending/read'

import { XOXNO_MAINNET } from '../config'

export const SAC_A = `C${'A'.repeat(55)}`
export const SAC_B = `C${'B'.repeat(55)}`
export const OWNER = `G${'A'.repeat(55)}`
export const priceStatus = {
  valid: true,
  stale: false,
  deviation: false,
  timestamp: 1_000,
}
export const capacity = { amountRaw: '10000000', amount: '1', usd: 2 }

export function sdkAsset(
  sac = SAC_A,
  hubId = 1,
  spokeIds = [1, 2]
): LendingAsset {
  return {
    sac,
    hubId,
    hubName: `Hub ${hubId}`,
    network: 'mainnet',
    symbol: 'SAME',
    name: sac === SAC_A ? 'Asset A' : 'Asset B',
    decimals: 7,
    logoUrl: 'https://example.com/token.svg',
    priceUsd: 2,
    priceStatus,
    supplyApy: 0.02,
    borrowApy: 0.1,
    indexedAt: 1_000,
    indexedLedger: 10,
    dataStatus: 'ready',
    spokes: spokeIds.map((spokeId) => ({
      spokeId,
      spokeName: `Spoke ${spokeId}`,
      ltvBps: spokeId === 1 ? 7_000 : 5_000,
      supplyCapacity: capacity,
      borrowCapacity: capacity,
      canSupply: true,
      canBorrow: true,
      canBeCollateral: true,
      canOpenAccount: spokeId === 1,
    })),
  }
}

export function reserve(spokeId: number, hubId: number, asset = SAC_A) {
  return {
    spokeId,
    hubId,
    asset,
    assetDecimals: 7,
    supplyApy: 0.02,
    borrowApy: 0.1,
    utilization: 0.25,
    suppliedShort: 999,
    borrowedShort: 998,
    depositsUsd: 1998,
    borrowsUsd: 1996,
    availableLiquidityShort: 70,
    availableLiquidityUsd: 140,
    hubPool: {
      suppliedShort: 100,
      borrowedShort: 25,
      depositsUsd: 200,
      borrowsUsd: 50,
    },
    collateralFactorBps: spokeId === 1 ? 7_000 : 5_000,
    liquidationThresholdBps: spokeId === 1 ? 8_000 : 6_000,
    isCollateralizable: true,
    isBorrowable: asset !== SAC_B,
    useAsCollateral: true,
    paused: false,
    frozen: false,
    noSeize: false,
    irm: { reserveFactorBps: 1_000 },
  }
}

export function contextFixture() {
  const reserves = [
    reserve(1, 1),
    reserve(2, 1),
    reserve(1, 1, SAC_B),
    reserve(1, 2),
  ]
  return {
    assets: [SAC_A, SAC_B].map((asset) => ({
      asset,
      symbol: 'SAME',
      name: asset === SAC_A ? 'Asset A' : 'Asset B',
      decimals: 7,
    })),
    hubs: [
      { hubId: 1, name: 'Hub 1' },
      { hubId: 2, name: 'Hub 2' },
    ],
    spokes: [
      { spokeId: 1, name: 'Spoke 1' },
      { spokeId: 2, name: 'Spoke 2' },
    ],
    reserves: reserves.map(({ spokeId, hubId, asset }) => ({
      spokeId,
      hubId,
      asset,
    })),
    reserveDetailsByKey: Object.fromEntries(
      reserves.map((r) => [`${r.spokeId}:${r.hubId}:${r.asset}`, r])
    ),
  }
}

export function positionAsset(
  overrides: Partial<PositionAsset> = {}
): PositionAsset {
  return {
    sac: SAC_A,
    hubId: 1,
    hubName: 'Hub 1',
    symbol: 'SAME',
    name: 'Asset A',
    decimals: 7,
    logoUrl: 'https://example.com/a.svg',
    amountRaw: '123456789123456789',
    amount: '12345678912.3456789',
    apy: 0.02,
    priceUsd: 2,
    valueUsd: 24_691_357_824.69,
    priceStatus,
    indexRay: '1000000000000000000000000000',
    indexedAt: 1_700_000_000_000,
    indexedLedger: 10,
    ...overrides,
  }
}

export function positionFixture(
  accountId = '9007199254740993',
  overrides: Partial<LendingPosition> = {}
): LendingPosition {
  return {
    accountId,
    nftContract: XOXNO_MAINNET.nft,
    nftImage: `https://example.com/${accountId}.svg`,
    network: 'mainnet',
    spokeId: 1,
    spokeName: 'Spoke 1',
    supplied: [positionAsset()],
    borrow: [
      positionAsset({
        amountRaw: '10000000',
        amount: '1',
        apy: 0.1,
        valueUsd: 2,
      }),
    ],
    hasDebt: true,
    healthFactor: 1.25,
    borrowLimitUsd: 4,
    availableBorrowUsd: 2,
    netApy: 0.01,
    dataStatus: 'ready',
    ...overrides,
  }
}

export const json = (value: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), { status: 200, headers })
