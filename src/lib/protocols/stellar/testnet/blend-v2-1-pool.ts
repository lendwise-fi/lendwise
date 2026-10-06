// Example connector for one Blend v2.1 testnet pool, implemented against the
// general StellarAppAdapter contract. The pool ID is configuration, so another
// Blend pool can be connected by changing the env var without code changes.
import {
  PoolOracle,
  PoolUser,
  PoolV2,
  PositionsEstimate,
} from '@blend-capital/blend-sdk'

import type { StellarAppAdapter } from '@/config/protocols-server'
import type { BorrowPosition, SupplyPosition } from '@/types'

// Testnet pool discovered from the v2.1 backstop's reward zone
// (CBGSFY6NR5TSCQJH5EGVMCFTHLZBCAO7YPIW426WSD46V3TESPA3U6DI, from blend-ui
// .env.testnet). Same oracle and reserves as TestnetV2.
export const BLEND_V2_1_TESTNET_POOL_ID =
  'CB3447A446DY3USGWPIDXTNQHF5EX24XDQA2EN6TAZP62JTPBTNOA52Q'

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'
const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org'

// Symbols for display only. Decimals and prices come from the chain.
const ASSET_LABELS: Record<string, { symbol: string; name: string }> = {
  CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC: {
    symbol: 'XLM',
    name: 'Stellar Lumens',
  },
  CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU: {
    symbol: 'USDC',
    name: 'USD Coin',
  },
  CAZAQB3D7KSLSNOSQKYD2V4JP5V2Y3B4RDJZRLBFCCIXDCTE3WHSY3UE: {
    symbol: 'wETH',
    name: 'Wrapped Ether',
  },
  CAP5AMC2OHNVREO66DFIN6DHJMPOBAJ2KCDDIMFBR7WWJH5RZBFM3UEI: {
    symbol: 'wBTC',
    name: 'Wrapped Bitcoin',
  },
}

export function blendV21PoolId() {
  return (
    process.env.STELLAR_BLEND_V2_1_TESTNET_POOL_ID?.trim() ||
    BLEND_V2_1_TESTNET_POOL_ID
  )
}

function network() {
  return {
    rpc: process.env.STELLAR_RPC_URL?.trim() || DEFAULT_RPC_URL,
    passphrase: process.env.STELLAR_NETWORK_PASSPHRASE || TESTNET_PASSPHRASE,
    opts: { allowHttp: false },
  }
}

export interface ReserveReading {
  assetId: string
  decimals: number
  apy: number
  priceUsd: number
  supplied: number
  collateral: number
  borrowed: number
}

// Pure mapping from SDK readings to app rows. Kept separate from the RPC calls
// so it can be unit tested without the network.
export function supplyPositionsFromReadings({
  poolId,
  userAddress,
  readings,
}: {
  poolId: string
  userAddress: string
  readings: ReserveReading[]
}): SupplyPosition[] {
  return readings.flatMap((r) => {
    const amount = r.supplied + r.collateral
    if (!(amount > 0)) return []
    const label = ASSET_LABELS[r.assetId] ?? {
      symbol: r.assetId.slice(0, 6),
      name: r.assetId,
    }
    return [
      {
        id: `blend-v2.1-testnet:${poolId}:${userAddress}:${r.assetId}:supply`,
        protocol: 'blend_v2',
        network: 'Stellar Testnet',
        userAddress,
        poolName: 'Blend v2.1 testnet pool',
        poolAddress: poolId,
        poolId,
        poolChainId: -1,
        assetAddress: r.assetId,
        assetName: label.name,
        assetSymbol: label.symbol,
        assetDecimals: r.decimals,
        assetAmount: amount.toString(),
        assetAmountUsd: amount * r.priceUsd,
        assetLiveAmountUsd: amount * r.priceUsd,
        apy: r.apy,
      },
    ]
  })
}

export function borrowPositionsFromReadings({
  poolId,
  userAddress,
  readings,
  healthFactor,
}: {
  poolId: string
  userAddress: string
  readings: ReserveReading[]
  healthFactor: number
}): BorrowPosition[] {
  return readings.flatMap((r) => {
    if (!(r.borrowed > 0)) return []
    const label = ASSET_LABELS[r.assetId] ?? {
      symbol: r.assetId.slice(0, 6),
      name: r.assetId,
    }
    const loanUsd = r.borrowed * r.priceUsd
    return [
      {
        id: `blend-v2.1-testnet:${poolId}:${userAddress}:${r.assetId}:borrow`,
        protocol: 'blend_v2',
        network: 'Stellar Testnet',
        healthFactor,
        userAddress,
        poolId,
        poolName: 'Blend v2.1 testnet pool',
        poolAddress: poolId,
        poolChainId: -1,
        loanAssetAddress: r.assetId,
        loanAssetName: label.name,
        loanAssetSymbol: label.symbol,
        loanAssetDecimals: r.decimals,
        loanAssetAmount: r.borrowed,
        loanAssetPriceUsd: r.priceUsd,
        loanLiabilityWeight: null,
        loanAssetAmountUsd: loanUsd,
        loanLiveAssetAmountUsd: loanUsd,
        loanTimestamp: Math.floor(Date.now() / 1000),
        collaterals: [],
        apy: r.apy,
      },
    ]
  })
}

async function loadReadings(addresses: string[]) {
  const net = network()
  const poolId = blendV21PoolId()
  const pool = await PoolV2.load(net, poolId)
  const reserveList = pool.metadata.reserveList
  const oracle = await PoolOracle.load(net, pool.metadata.oracle, reserveList)
  return { net, poolId, pool, oracle, reserves: [...pool.reserves.values()] }
}

async function readUser(
  ctx: Awaited<ReturnType<typeof loadReadings>>,
  userAddress: string
) {
  const user = await PoolUser.load(ctx.net, ctx.poolId, ctx.pool, userAddress)
  const estimate = PositionsEstimate.build(ctx.pool, ctx.oracle, user.positions)
  const readings: ReserveReading[] = ctx.reserves.map((reserve) => ({
    assetId: reserve.assetId,
    decimals: reserve.config.decimals,
    apy: reserve.estSupplyApy,
    priceUsd: ctx.oracle.getPriceFloat(reserve.assetId) ?? 0,
    supplied: user.getSupplyFloat(reserve),
    collateral: user.getCollateralFloat(reserve),
    borrowed: user.getLiabilitiesFloat(reserve),
  }))
  const healthFactor =
    estimate.totalEffectiveLiabilities > 0
      ? estimate.totalEffectiveCollateral / estimate.totalEffectiveLiabilities
      : 0
  return { readings, healthFactor }
}

export const blendV21TestnetAdapter: StellarAppAdapter = {
  async getUserSupplyPositions({ addresses }) {
    if (addresses.length === 0) return []
    const ctx = await loadReadings(addresses)
    const perUser = await Promise.all(
      addresses.map(async (userAddress) => {
        const { readings } = await readUser(ctx, userAddress)
        return supplyPositionsFromReadings({
          poolId: ctx.poolId,
          userAddress,
          readings,
        })
      })
    )
    return perUser.flat()
  },

  async getUserBorrowPositions({ addresses }) {
    if (addresses.length === 0) return []
    const ctx = await loadReadings(addresses)
    const perUser = await Promise.all(
      addresses.map(async (userAddress) => {
        const { readings, healthFactor } = await readUser(ctx, userAddress)
        return borrowPositionsFromReadings({
          poolId: ctx.poolId,
          userAddress,
          readings,
          healthFactor,
        })
      })
    )
    return perUser.flat()
  },
}
