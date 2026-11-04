import type {
  OptimizationResponse,
  VaultAllocationResponse,
} from '@/lib/api/optimizer'

import {
  I128_MAX,
  WAD,
  accruedSupplyUpper,
  borrowCapacity,
  capShares,
  checkSupply,
  collateralUsd,
  debtUsd,
  fractionNative,
  parseAmount,
  scaled,
  usdFloor,
  usdToNative,
} from './capacity'
import type { RpcSnapshot, VerifiedAsset, VerifiedMarket } from './rpc'

export interface Qualification {
  observedAt: string
  minLedger: number
  maxLedger: number
  expiresAt: string
  note: string
}
export function qualification(snapshot: RpcSnapshot): Qualification {
  return {
    observedAt: snapshot.observedAt,
    minLedger: snapshot.minLedger,
    maxLedger: snapshot.maxLedger,
    expiresAt: new Date(snapshot.startedAt + 30_000).toISOString(),
    note: 'XOXNO RPC checks span several reads. Conditions may change before execution; each allocation assumes a new account.',
  }
}
export function assertFresh(snapshot: RpcSnapshot, now = Date.now()) {
  if (
    now - snapshot.startedAt >= 30_000 ||
    snapshot.maxLedger - snapshot.minLedger > 6
  )
    throw new Error('RPC verification expired; run again')
}
export function openingLtv(market: VerifiedMarket, requested: number) {
  const collateral = market.collateral
  if (
    !collateral ||
    collateral.market.decimals < 3 ||
    !collateral.listing.collateral
  )
    throw new Error('Choose a supported collateral and spoke')
  if (!market.debt.listing.borrowable || market.debt.market.decimals < 3)
    throw new Error('Borrow listing is disabled')
  if (market.debt.asset === collateral.asset)
    throw new Error('Same-asset collateral and debt are not supported')
  const max =
    Math.min(collateral.listing.ltv, collateral.listing.threshold) / 10_000
  const ltv = Math.min(max, requested)
  if (!Number.isFinite(ltv) || ltv <= 0 || ltv > 1)
    throw new Error('Opening LTV is unavailable')
  return ltv
}
export function supplyPreflight(market: VerifiedMarket, amount: string) {
  checkSupply(
    market.debt.market,
    market.debt.listing,
    parseAmount(amount, market.debt.market.decimals)
  )
}

function add(map: Map<string, bigint>, key: string, value: bigint) {
  const total = (map.get(key) ?? 0n) + value
  if (total > I128_MAX)
    throw new Error('Aggregate allocation exceeds contract limits')
  map.set(key, total)
}
function checkAggregates(
  assets: Map<string, VerifiedAsset>,
  supplied: Map<string, bigint>,
  borrowed: Map<string, bigint>,
  draws: Map<string, bigint>
) {
  const marketSupply = new Map<string, bigint>()
  const marketDebt = new Map<string, bigint>()
  for (const [key, asset] of assets) {
    const supply = supplied.get(key) ?? 0n
    const debt = borrowed.get(key) ?? 0n
    if (
      supply > 0n &&
      asset.listing.supplied + supply >
        capShares(asset.listing.supplyCap, asset.market, 'supply')
    )
      throw new Error('Combined allocation exceeds spoke supply cap')
    if (
      debt > 0n &&
      asset.listing.borrowed + debt >
        capShares(asset.listing.borrowCap, asset.market, 'borrow')
    )
      throw new Error('Combined allocation exceeds spoke borrow cap')
    const marketKey = `${asset.hubId}:${asset.asset}`
    add(marketSupply, marketKey, supply)
    add(marketDebt, marketKey, debt)
    if (
      accruedSupplyUpper(asset.market) + marketSupply.get(marketKey)! >
        I128_MAX ||
      asset.market.borrowed + marketDebt.get(marketKey)! > I128_MAX
    )
      throw new Error('Combined allocation exceeds pool share limits')
    // Ignore fresh deposits when checking draws: allocation ordering cannot create liquidity.
    if (
      draws.has(marketKey) &&
      draws.get(marketKey)! >
        borrowCapacity(asset.market, {
          ...asset.listing,
          borrowed: 0n,
          borrowCap: I128_MAX / 10n ** BigInt(27 - asset.market.decimals),
        })
    )
      throw new Error('Combined allocation exceeds shared hub liquidity')
  }
}

export function checkSupplyAllocations(
  response: VaultAllocationResponse,
  snapshot: RpcSnapshot,
  byIndex: Map<number, VerifiedMarket>,
  amount: string,
  marketCount: number
) {
  if (!Number.isFinite(response.resulting_diversification))
    throw new Error('Invalid solver diversification')
  if (
    !response.success ||
    !Array.isArray(response.allocations) ||
    response.allocations.length > marketCount
  )
    throw new Error('Invalid solver response')
  const seen = new Set<number>()
  let total = 0
  const assets = new Map<string, VerifiedAsset>()
  const supply = new Map<string, bigint>()
  const anchor = snapshot.markets[0].debt.market
  const exactTarget =
    parseAmount(amount, anchor.decimals) * 10n ** BigInt(18 - anchor.decimals)
  let exactSpent = 0n
  for (const a of response.allocations) {
    if (
      !Number.isInteger(a.vault_index) ||
      a.vault_index < 0 ||
      a.vault_index >= marketCount ||
      seen.has(a.vault_index) ||
      !Number.isFinite(a.allocation) ||
      a.allocation < 0 ||
      a.allocation > 1 ||
      !Number.isFinite(a.allocation_percent) ||
      Math.abs(a.allocation_percent - a.allocation * 100) > 1e-6
    )
      throw new Error('Invalid solver allocation')
    seen.add(a.vault_index)
    total += a.allocation
    const v = byIndex.get(a.vault_index)
    if (v && a.allocation > 0) {
      const native = parseAmount(amount, v.debt.market.decimals)
      const allocated = fractionNative(native, a.allocation)
      if (allocated === 0n)
        throw new Error('Allocation rounds to zero native units')
      exactSpent += allocated * 10n ** BigInt(18 - v.debt.market.decimals)
      const shares = checkSupply(v.debt.market, v.debt.listing, allocated)
      assets.set(v.debt.key, v.debt)
      add(supply, v.debt.key, shares)
    } else if (a.allocation > 0) {
      exactSpent +=
        fractionNative(parseAmount(amount, anchor.decimals), a.allocation) *
        10n ** BigInt(18 - anchor.decimals)
    }
  }
  if (exactSpent <= 0n || exactSpent > exactTarget)
    throw new Error('Supply allocation exceeds the exact capital budget')
  if (Math.abs(total - 1) > 1e-6)
    throw new Error('Solver did not allocate the full capital')
  checkAggregates(assets, supply, new Map(), new Map())
  assertFresh(snapshot)
}

export function checkBorrowAllocations(
  response: OptimizationResponse,
  snapshot: RpcSnapshot,
  byIndex: Map<number, VerifiedMarket>,
  ltvs: number[],
  marketCount: number,
  targetUsd: number,
  mode: 'collateral_target' | 'loan_target',
  amount: string
) {
  if (
    !Number.isFinite(response.optimal_rate) ||
    !Number.isFinite(response.optimal_rate_percent)
  )
    throw new Error('Invalid solver rate')
  if (
    !response.success ||
    !Array.isArray(response.allocations) ||
    response.allocations.length > marketCount
  )
    throw new Error('Invalid solver response')
  const seen = new Set<number>()
  const assets = new Map<string, VerifiedAsset>()
  const supply = new Map<string, bigint>()
  const debt = new Map<string, bigint>()
  const draws = new Map<string, bigint>()
  let totalBorrow = 0
  let totalCollateral = 0
  const anchor =
    mode === 'collateral_target'
      ? snapshot.markets[0].collateral
      : snapshot.markets[0].debt
  if (!anchor) throw new Error('Collateral selection is missing')
  const exactTarget =
    parseAmount(amount, anchor.market.decimals) *
    10n ** BigInt(18 - anchor.market.decimals)
  let nativeBudget = 0n
  let borrowRounding = 0n
  for (const a of response.allocations) {
    if (
      !Number.isInteger(a.market_index) ||
      a.market_index < 0 ||
      a.market_index >= marketCount ||
      seen.has(a.market_index) ||
      !Number.isFinite(a.borrow) ||
      !Number.isFinite(a.collateral) ||
      a.borrow < 0 ||
      a.collateral < 0 ||
      a.borrow > 1e15 ||
      a.collateral > 1e15
    )
      throw new Error('Invalid solver allocation')
    seen.add(a.market_index)
    totalBorrow += a.borrow
    totalCollateral += a.collateral
    if (a.borrow === 0 && a.collateral === 0) continue
    if (a.borrow === 0 || a.collateral === 0)
      throw new Error('Incomplete solver position')
    const verified = byIndex.get(a.market_index)
    if (!verified) {
      const used = usdToNative(
        mode === 'collateral_target' ? a.collateral : a.borrow,
        anchor.market,
        'ceil'
      )
      nativeBudget += used * 10n ** BigInt(18 - anchor.market.decimals)
      borrowRounding += 10n ** BigInt(18 - anchor.market.decimals)
      continue
    }
    const c = verified.collateral
    if (!c) throw new Error('Collateral selection is missing')
    const collateralNative = usdToNative(a.collateral, c.market, 'floor')
    const borrowNative = usdToNative(a.borrow, verified.debt.market, 'ceil')
    const supplyShares = checkSupply(c.market, c.listing, collateralNative)
    const debtShares = scaled(borrowNative, verified.debt.market, 'borrow')
    const usedAsset = mode === 'collateral_target' ? c : verified.debt
    const usedNative =
      mode === 'collateral_target' ? collateralNative : borrowNative
    nativeBudget += usedNative * 10n ** BigInt(18 - usedAsset.market.decimals)
    borrowRounding += 10n ** BigInt(18 - usedAsset.market.decimals)
    if (
      borrowNative <= 0n ||
      borrowNative > borrowCapacity(verified.debt.market, verified.debt.listing)
    )
      throw new Error('Allocation exceeds current borrow capacity')
    const collateralValue = collateralUsd(supplyShares, c.market)
    const debtValue = debtUsd(debtShares, verified.debt.market)
    const effectiveBps = BigInt(Math.min(c.listing.ltv, c.listing.threshold))
    const weightedCollateral = (collateralValue * effectiveBps) / 10_000n
    const requestedLtv = BigInt(Math.floor(ltvs[a.market_index] * 1e12))
    if (
      debtValue > weightedCollateral ||
      debtValue > (collateralValue * requestedLtv) / 10n ** 12n
    )
      throw new Error('Rounded allocation exceeds opening LTV')
    if (weightedCollateral < snapshot.minCollateralUsd)
      throw new Error('Allocation is below the minimum LTV-weighted collateral')
    if (collateralValue > I128_MAX || debtValue > I128_MAX)
      throw new Error('Allocation exceeds contract valuation limits')
    assets.set(c.key, c)
    assets.set(verified.debt.key, verified.debt)
    add(supply, c.key, supplyShares)
    add(debt, verified.debt.key, debtShares)
    add(draws, `${verified.debt.hubId}:${verified.debt.asset}`, borrowNative)
  }
  if (
    totalBorrow <= 0 ||
    totalCollateral <= 0 ||
    !Number.isFinite(totalBorrow) ||
    !Number.isFinite(totalCollateral)
  )
    throw new Error('Solver returned no usable allocation')
  if (
    mode === 'collateral_target' &&
    totalCollateral > targetUsd + Math.max(1e-8, targetUsd * 1e-9)
  )
    throw new Error('Solver exceeded the collateral budget')
  if (
    mode === 'loan_target' &&
    Math.abs(totalBorrow - targetUsd) > Math.max(1e-8, targetUsd * 1e-9)
  )
    throw new Error('Solver did not meet the requested loan')
  if (mode === 'collateral_target' && nativeBudget > exactTarget)
    throw new Error('Rounded allocation exceeds the exact collateral budget')
  if (
    mode === 'loan_target' &&
    (nativeBudget < exactTarget || nativeBudget > exactTarget + borrowRounding)
  )
    throw new Error('Rounded allocation does not meet the exact loan target')
  checkAggregates(assets, supply, debt, draws)
  response.total_borrow = totalBorrow
  response.total_collateral = totalCollateral
  assertFresh(snapshot)
}

export function requestUsd(
  snapshot: RpcSnapshot,
  amount: string,
  mode: 'collateral_target' | 'loan_target'
) {
  const first = snapshot.markets[0]
  const asset = mode === 'collateral_target' ? first.collateral : first.debt
  if (!asset) throw new Error('Collateral selection is missing')
  const value = usdFloor(
    parseAmount(amount, asset.market.decimals),
    asset.market
  )
  const numeric = Number(value) / Number(WAD)
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1e15)
    throw new Error('Amount is outside the optimizer range')
  return numeric
}
export function liquidityUsd(market: VerifiedMarket) {
  return (
    Number(
      usdFloor(
        borrowCapacity(market.debt.market, market.debt.listing),
        market.debt.market
      )
    ) / Number(WAD)
  )
}
