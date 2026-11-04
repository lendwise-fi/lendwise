import type {
  LendingPosition,
  PositionAsset,
} from '@xoxno/sdk-js/stellar-lending/read'

import { processBatches } from '@/lib/protocols/core/toolkit/batch'
import { dedupeInFlight } from '@/lib/protocols/core/toolkit/inflight'
import type { StellarPositionsAdapter } from '@/lib/protocols/core/types'
import { type RiskAccountResult, riskAccountId } from '@/lib/risk/types'
import type { BorrowPosition, SupplyPosition } from '@/types'

import { type XoxnoClient, xoxnoClient } from './client'
import { XOXNO_CHAIN_ID, XOXNO_PROTOCOL } from './config'
import { xoxnoMarketLink, xoxnoProductId } from './utils'

const displayAmount = (raw: string | null) => {
  if (raw === null) return null
  const amount = Number(raw)
  return Number.isFinite(amount) ? amount : null
}
const usableUsd = (leg: PositionAsset) =>
  leg.priceStatus.valid &&
  !leg.priceStatus.stale &&
  !leg.priceStatus.deviation &&
  leg.priceUsd !== null &&
  leg.priceUsd > 0
    ? leg.valueUsd
    : null

export function xoxnoRiskAccountId(
  owner: string,
  position: LendingPosition,
  controller: string
): string {
  return riskAccountId({
    protocol: XOXNO_PROTOCOL,
    chainId: XOXNO_CHAIN_ID,
    poolId: `${position.network}:${controller}:${position.nftContract}:${position.accountId}`,
    user: owner,
  })
}

export function xoxnoRiskResult(
  owner: string,
  position: LendingPosition,
  controller: string
): RiskAccountResult {
  const times = [...position.supplied, ...position.borrow]
    .map((x) => x.indexedAt)
    .filter((x) => x > 0)
  const source = {
    sourceLabel: 'XOXNO indexed estimate',
    ...(times.length
      ? { observedAt: new Date(Math.min(...times)).toISOString() }
      : {}),
  }
  return {
    id: xoxnoRiskAccountId(owner, position, controller),
    protocol: XOXNO_PROTOCOL,
    poolId: `${controller}:${position.nftContract}:${position.accountId}`,
    user: owner,
    result:
      position.hasDebt === false
        ? { status: 'no-liability', ...source }
        : position.healthFactor !== null
          ? { status: 'ok', healthFactor: position.healthFactor, ...source }
          : {
              status: 'unknown',
              reason: 'missing-risk-data',
              symbols: position.borrow.map((x) => x.symbol),
              ...source,
            },
  }
}

export function xoxnoSupplyPositions(
  owner: string,
  position: LendingPosition,
  controller: string
): SupplyPosition[] {
  return position.supplied.map((leg) => ({
    id: `${XOXNO_PROTOCOL}:${position.network}:${position.nftContract}:${position.accountId}:${leg.hubId}:${leg.sac}:supply`,
    protocol: XOXNO_PROTOCOL,
    network: 'stellar',
    userAddress: owner,
    poolName: `${position.spokeName ?? 'Spoke unavailable'} · #${position.accountId} · ${leg.hubName}`,
    poolAddress: controller,
    poolId: `${controller}:${leg.hubId}`,
    poolChainId: XOXNO_CHAIN_ID,
    assetAddress: leg.sac,
    assetName: leg.name,
    assetSymbol: leg.symbol,
    assetDecimals: leg.decimals,
    assetAmount: leg.amountRaw,
    assetAmountUsd: usableUsd(leg),
    assetLiveAmountUsd: usableUsd(leg),
    apy: leg.apy === null ? null : leg.apy * 100,
    ...(leg.logoUrl ? { logoURI: leg.logoUrl } : {}),
    productId: xoxnoProductId({
      network: position.network,
      controller,
      hubId: leg.hubId,
      asset: leg.sac,
      kind: 'supply',
    }),
    link: xoxnoMarketLink(leg.hubId),
    riskAccountId: xoxnoRiskAccountId(owner, position, controller),
  }))
}

export function xoxnoBorrowPositions(
  owner: string,
  position: LendingPosition,
  controller: string
): BorrowPosition[] {
  const collaterals = position.supplied.map((leg) => ({
    address: leg.sac,
    name: leg.name,
    symbol: leg.symbol,
    decimals: leg.decimals,
    ltv: null,
    lltv: null,
    amount: displayAmount(leg.amount),
    amountRaw: leg.amountRaw,
    amountUsd: usableUsd(leg),
    ...(leg.logoUrl ? { logoURI: leg.logoUrl } : {}),
  }))
  return position.borrow.map((leg) => ({
    id: `${XOXNO_PROTOCOL}:${position.network}:${position.nftContract}:${position.accountId}:${leg.hubId}:${leg.sac}:borrow`,
    protocol: XOXNO_PROTOCOL,
    network: 'stellar',
    // Shown from the risk account (riskAccountId), not from this field.
    healthFactor: 0,
    userAddress: owner,
    poolId: `${controller}:${leg.hubId}`,
    poolName: `${position.spokeName ?? 'Spoke unavailable'} · #${position.accountId} · ${leg.hubName}`,
    poolAddress: controller,
    poolChainId: XOXNO_CHAIN_ID,
    loanAssetAddress: leg.sac,
    loanAssetName: leg.name,
    loanAssetSymbol: leg.symbol,
    loanAssetDecimals: leg.decimals,
    loanAssetAmount: displayAmount(leg.amount),
    loanAssetAmountRaw: leg.amountRaw,
    loanAssetAmountUsd: usableUsd(leg),
    loanLiveAssetAmountUsd: usableUsd(leg),
    loanTimestamp: 0,
    collaterals,
    apy: leg.apy === null ? null : leg.apy * 100,
    ...(leg.logoUrl ? { logoURI: leg.logoUrl } : {}),
    productId: xoxnoProductId({
      network: position.network,
      controller,
      hubId: leg.hubId,
      asset: leg.sac,
      kind: 'borrow',
    }),
    link: xoxnoMarketLink(leg.hubId),
    riskAccountId: xoxnoRiskAccountId(owner, position, controller),
  }))
}

export function createXoxnoPositionsAdapter(
  client: XoxnoClient = xoxnoClient
): StellarPositionsAdapter {
  const load = dedupeInFlight(
    (addresses: string[]) => [...new Set(addresses)].sort().join(','),
    async (addresses: string[]) =>
      processBatches(
        [...new Set(addresses)],
        async (owner) => ({
          owner,
          positions: await client.positions(owner),
        }),
        4
      )
  )
  return {
    async getUserSupplyPositions({ addresses }) {
      return (await load(addresses)).flatMap(({ owner, positions }) =>
        positions.flatMap((p) =>
          xoxnoSupplyPositions(owner, p, client.deployment.controller)
        )
      )
    },
    async getUserBorrowPositions({ addresses }) {
      return (await load(addresses)).flatMap(({ owner, positions }) =>
        positions.flatMap((p) =>
          xoxnoBorrowPositions(owner, p, client.deployment.controller)
        )
      )
    },
    async getRiskAccountResults({ addresses }) {
      return (await load(addresses)).flatMap(({ owner, positions }) =>
        positions.map((p) =>
          xoxnoRiskResult(owner, p, client.deployment.controller)
        )
      )
    },
  }
}

export const positionsAdapter = createXoxnoPositionsAdapter()
