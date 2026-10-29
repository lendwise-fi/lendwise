import { CHAIN_SLUG_MAP } from '@/lib/protocols/core/toolkit/chain-slugs'
import { dedupeInFlight } from '@/lib/protocols/core/toolkit/inflight'
import { toBaseUnits } from '@/lib/protocols/core/toolkit/units'
import type { SolanaPositionsAdapter } from '@/lib/protocols/core/types'
import { resolveRiskPrices } from '@/lib/risk/prices'
import {
  type PriceKey,
  type PriceMap,
  type RiskAccount,
  type RiskReserve,
  priceKeyId,
  riskAccountId,
} from '@/lib/risk/types'
import type { BorrowPosition, SupplyPosition } from '@/types'

import {
  type KaminoObligation,
  type KaminoReserveAccount,
  type KaminoReserveStats,
  fetchMarkets,
  fetchObligations,
  fetchReserveAccounts,
  fetchReserveStats,
} from '../common/api'
import {
  KAMINO_OBLIGATIONS_TIMEOUT_MS,
  KAMINO_POSITIONS_CONCURRENCY,
} from '../common/config'
import { SOLANA_CHAIN_ID } from '../listing'
import { assetPriceUsd } from './apy-spot'
import { kaminoReserveUrl } from './presentation'
import { buildProductId } from './utils'

/**
 * Kamino Lend wallet positions and risk accounts.
 *
 * One `/kamino-market/{market}/users/{wallet}/obligations` call per market of
 * `/v2/kamino-market` and per wallet. Each obligation is an isolated account:
 * one RiskAccount, its own supply and borrow rows. The obligation stores raw
 * amounts; the Reserve accounts of its market convert them:
 *
 * - a deposit is in collateral (kToken) lamports: underlying = collateral x
 *   `liquidityPerCToken` / 10^decimals;
 * - a debt is stored at the reserve rate of the obligation's last refresh
 *   (months old for an idle loan): today's debt = `amountSf / 2^60 x
 *   reserveRate / obligationRate` / 10^decimals.
 *
 * Both mirror klend-sdk `KaminoObligation.calculatePositions` (rates at the
 * reserve's last refresh, not projected to the current slot). Weights follow
 * the same SDK: in an elevation group the reserve belongs to, the group's
 * liquidation threshold and a borrow factor of 1; otherwise the reserve's own.
 */

const PROTOCOL = 'kamino_v1' as const
const NETWORK = CHAIN_SLUG_MAP['-2']
const SF_SCALE = 2 ** 60

/** One deposit or debt of an obligation, in whole underlying tokens. */
interface KaminoPositionReading {
  reserve: string
  mint: string
  symbol: string
  decimals: number
  amount: number
  /** Fraction, net of incentives (the spot adapter's `net`). */
  apy: number
  /** Kamino's live price, shown only when the pipeline has none. */
  statsPriceUsd: number | null
}

export interface KaminoDepositReading extends KaminoPositionReading {
  /** Effective for this obligation (eMode applied); null = unknown group. */
  liquidationThreshold: number | null
  maxLtv: number | null
}

export interface KaminoBorrowReading extends KaminoPositionReading {
  /** Effective for this obligation: 1 in eMode. */
  borrowFactor: number
}

export interface KaminoObligationReading {
  obligation: string
  market: string
  marketName: string
  owner: string
  /** 'Vanilla', 'Multiply', 'Leverage', … */
  humanTag: string | null
  elevationGroup: number
  deposits: KaminoDepositReading[]
  borrows: KaminoBorrowReading[]
}

/** What converts and weighs the obligations of one market. */
export interface KaminoMarketContext {
  marketName: string
  reserves: ReadonlyMap<string, KaminoReserveAccount>
  stats: ReadonlyMap<string, KaminoReserveStats>
}

/** The spot pipeline's price of a reserve: its supply product's asset price. */
export function kaminoPriceKey(market: string, reserve: string): PriceKey {
  return { productId: buildProductId(market, reserve, 'supply'), leg: 'asset' }
}

/**
 * klend-sdk `getLtvForReserve` / `getBorrowFactorForReserve`: the group's
 * weights apply only when the obligation is in a group AND the reserve is in
 * that group. A group the market does not list leaves the threshold unknown,
 * so the health factor fails closed.
 */
function weightsFor(o: KaminoObligation, reserve: KaminoReserveAccount) {
  const inGroup =
    o.elevationGroup !== 0 && reserve.elevationGroups.includes(o.elevationGroup)
  if (!inGroup) {
    return {
      liquidationThreshold: reserve.liquidationThreshold,
      maxLtv: reserve.maxLtv,
      borrowFactor: reserve.borrowFactor,
    }
  }
  const group = o.elevationGroups.find((g) => g.id === o.elevationGroup)
  return {
    liquidationThreshold: group?.liquidationThreshold ?? null,
    maxLtv: group?.ltv ?? null,
    borrowFactor: 1,
  }
}

const rawToNumber = (raw: string) => Number(BigInt(raw))

/**
 * Amounts and weights of one obligation. Throws when a reserve it holds has no
 * decoded account: its amount cannot be converted, and dropping it would hide
 * part of the loan.
 */
export function readingFromObligation(
  o: KaminoObligation,
  ctx: KaminoMarketContext
): KaminoObligationReading {
  const reserveOf = (address: string) => {
    const reserve = ctx.reserves.get(address)
    if (!reserve) {
      throw new Error(
        `[kamino] obligation ${o.address}: no account data for reserve ${address}`
      )
    }
    return reserve
  }
  const base = (reserve: KaminoReserveAccount) => ({
    reserve: reserve.reserve,
    mint: reserve.mint,
    symbol: reserve.symbol,
    decimals: reserve.decimals,
    statsPriceUsd: statsOf(ctx, reserve.reserve, assetPriceUsd),
  })

  return {
    obligation: o.address,
    market: o.market,
    marketName: ctx.marketName,
    owner: o.owner,
    humanTag: o.humanTag,
    elevationGroup: o.elevationGroup,
    deposits: o.deposits.map((d) => {
      const reserve = reserveOf(d.reserve)
      const { liquidationThreshold, maxLtv } = weightsFor(o, reserve)
      return {
        ...base(reserve),
        amount:
          (rawToNumber(d.amount) * (reserve.liquidityPerCToken ?? Number.NaN)) /
          10 ** reserve.decimals,
        apy:
          statsOf(
            ctx,
            reserve.reserve,
            (s) =>
              s.supplyApyBreakdown.lending + s.supplyApyBreakdown.incentives
          ) ?? 0,
        liquidationThreshold,
        maxLtv,
      }
    }),
    borrows: o.borrows.map((b) => {
      const reserve = reserveOf(b.reserve)
      return {
        ...base(reserve),
        amount:
          ((rawToNumber(b.amountSf) / SF_SCALE) *
            (reserve.cumulativeBorrowRate / b.cumulativeBorrowRate)) /
          10 ** reserve.decimals,
        apy:
          statsOf(
            ctx,
            reserve.reserve,
            (s) => s.borrowApyBreakdown.borrow - s.borrowApyBreakdown.incentives
          ) ?? 0,
        borrowFactor: weightsFor(o, reserve).borrowFactor,
      }
    }),
  }
}

function statsOf<T>(
  ctx: KaminoMarketContext,
  reserve: string,
  pick: (s: KaminoReserveStats) => T
): T | null {
  const stats = ctx.stats.get(reserve)
  return stats ? pick(stats) : null
}

const accountId = (r: KaminoObligationReading) =>
  riskAccountId({
    protocol: PROTOCOL,
    chainId: SOLANA_CHAIN_ID,
    poolId: r.obligation,
    user: r.owner,
  })

/**
 * One isolated account per obligation with debt. A reserve both deposited and
 * borrowed in the same obligation is one RiskReserve with both sides.
 */
export function riskAccountFromReading(
  r: KaminoObligationReading
): RiskAccount | null {
  if (!r.borrows.some((b) => b.amount > 0)) return null
  const byReserve = new Map<string, RiskReserve>()
  const entry = (p: KaminoPositionReading) => {
    const existing = byReserve.get(p.reserve)
    if (existing) return existing
    const created: RiskReserve = {
      priceKey: kaminoPriceKey(r.market, p.reserve),
      symbol: p.symbol,
      collateral: 0,
      liability: 0,
      collateralWeight: null,
      liabilityWeight: null,
    }
    byReserve.set(p.reserve, created)
    return created
  }
  for (const d of r.deposits) {
    const x = entry(d)
    x.collateral += d.amount
    x.collateralWeight = d.liquidationThreshold
  }
  for (const b of r.borrows) {
    const x = entry(b)
    x.liability += b.amount
    // The health factor divides by liabilityWeight: 1 / borrowFactor turns
    // that into Kamino's borrow-factor-adjusted debt.
    x.liabilityWeight = b.borrowFactor > 0 ? 1 / b.borrowFactor : null
  }
  return {
    id: accountId(r),
    protocol: PROTOCOL,
    chainFamily: 'solana',
    chainId: SOLANA_CHAIN_ID,
    poolId: r.obligation,
    user: r.owner,
    reserves: [...byReserve.values()],
  }
}

/** USD at the pipeline price, else Kamino's live price, else 0 (like Blend). */
function usd(
  r: KaminoObligationReading,
  p: KaminoPositionReading,
  prices: PriceMap
): number {
  const price =
    prices.get(priceKeyId(kaminoPriceKey(r.market, p.reserve))) ??
    p.statsPriceUsd ??
    0
  return p.amount * price
}

/** "<market>" for a plain loan, "<market> · Multiply" for a strategy one. */
const poolName = (r: KaminoObligationReading) =>
  r.humanTag && r.humanTag !== 'Vanilla'
    ? `${r.marketName} · ${r.humanTag}`
    : r.marketName

// poolId is the obligation: one wallet can hold several in a market, and the
// tables key their rows by protocol, chain, poolId and asset.
const rowBase = (r: KaminoObligationReading) => ({
  protocol: PROTOCOL,
  network: NETWORK,
  userAddress: r.owner,
  poolName: poolName(r),
  poolAddress: r.market,
  poolId: r.obligation,
  poolChainId: SOLANA_CHAIN_ID,
})

export function supplyPositionsFromReading(
  r: KaminoObligationReading,
  prices: PriceMap
): SupplyPosition[] {
  return r.deposits.flatMap((d): SupplyPosition[] => {
    if (!(d.amount > 0)) return []
    const amountUsd = usd(r, d, prices)
    return [
      {
        ...rowBase(r),
        id: `${PROTOCOL}:${r.obligation}:${r.owner}:${d.reserve}:supply`,
        assetAddress: d.mint,
        assetName: d.symbol,
        assetSymbol: d.symbol,
        assetDecimals: d.decimals,
        assetAmount: toBaseUnits(d.amount, d.decimals),
        assetAmountUsd: amountUsd,
        assetLiveAmountUsd: amountUsd,
        apy: d.apy * 100,
        link: kaminoReserveUrl(r.market, d.reserve),
      },
    ]
  })
}

export function borrowPositionsFromReading(
  r: KaminoObligationReading,
  prices: PriceMap
): BorrowPosition[] {
  const collaterals = r.deposits
    .filter((d) => d.amount > 0)
    .map((d) => ({
      address: d.mint,
      name: d.symbol,
      symbol: d.symbol,
      decimals: d.decimals,
      ltv: d.maxLtv,
      lltv: d.liquidationThreshold,
      amount: d.amount,
      amountUsd: usd(r, d, prices),
    }))
  return r.borrows.flatMap((b): BorrowPosition[] => {
    if (!(b.amount > 0)) return []
    const loanUsd = usd(r, b, prices)
    return [
      {
        ...rowBase(r),
        id: `${PROTOCOL}:${r.obligation}:${r.owner}:${b.reserve}:borrow`,
        // Shown from the risk account (riskAccountId), not from this field.
        healthFactor: 0,
        loanAssetAddress: b.mint,
        loanAssetName: b.symbol,
        loanAssetSymbol: b.symbol,
        loanAssetDecimals: b.decimals,
        loanAssetAmount: b.amount,
        loanAssetAmountUsd: loanUsd,
        loanLiveAssetAmountUsd: loanUsd,
        loanTimestamp: 0,
        collaterals,
        apy: b.apy * 100,
        link: kaminoReserveUrl(r.market, b.reserve),
        riskAccountId: accountId(r),
      },
    ]
  })
}

/**
 * `fn` over `items`, at most `limit` at a time, results in order. The first
 * rejection rejects the whole call and stops scheduling new items.
 */
async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++
      try {
        results[i] = await fn(items[i])
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  )
  return results
}

/**
 * Every obligation of `addresses` across Kamino's markets, converted. Any
 * failed read rejects: a partial answer would show a loan as absent.
 */
export async function loadKaminoReadings(
  addresses: string[]
): Promise<KaminoObligationReading[]> {
  if (addresses.length === 0) return []
  const markets = await fetchMarkets()
  const pairs = markets.flatMap((m) =>
    addresses.map((wallet) => ({ market: m.address, wallet }))
  )
  const obligations = (
    await mapBounded(pairs, KAMINO_POSITIONS_CONCURRENCY, (p) =>
      fetchObligations(p.market, p.wallet, {
        strict: true,
        timeoutMs: KAMINO_OBLIGATIONS_TIMEOUT_MS,
      })
    )
  ).flat()
  if (obligations.length === 0) return []

  // Reserve accounts (~11 KB each) and stats only where there is a loan.
  const used = [...new Set(obligations.map((o) => o.market))]
  const [accounts, stats] = await Promise.all([
    fetchReserveAccounts(used),
    fetchReserveStats(used),
  ])
  const names = new Map(markets.map((m) => [m.address, m.name]))
  const contexts = new Map<string, KaminoMarketContext>(
    used.map((market) => [
      market,
      {
        marketName: names.get(market) ?? market,
        reserves: new Map(
          accounts.filter((a) => a.market === market).map((a) => [a.reserve, a])
        ),
        stats: new Map(
          stats.filter((s) => s.market === market).map((s) => [s.reserve, s])
        ),
      },
    ])
  )
  return obligations.map((o) =>
    readingFromObligation(o, contexts.get(o.market) as KaminoMarketContext)
  )
}

const byAddresses = (addresses: string[]) => [...addresses].sort().join(',')
const readingsOnce = dedupeInFlight(byAddresses, loadKaminoReadings)
const pricedOnce = dedupeInFlight(byAddresses, async (addresses: string[]) => {
  const readings = await readingsOnce(addresses)
  const prices = await resolveRiskPrices(
    readings.flatMap((r) =>
      [...r.deposits, ...r.borrows].map((p) =>
        kaminoPriceKey(r.market, p.reserve)
      )
    )
  )
  return { readings, prices }
})

export const positionsAdapter: SolanaPositionsAdapter = {
  async getUserSupplyPositions({ addresses }) {
    if (addresses.length === 0) return []
    const { readings, prices } = await pricedOnce(addresses)
    return readings.flatMap((r) => supplyPositionsFromReading(r, prices))
  },
  async getUserBorrowPositions({ addresses }) {
    if (addresses.length === 0) return []
    const { readings, prices } = await pricedOnce(addresses)
    return readings.flatMap((r) => borrowPositionsFromReading(r, prices))
  },
  async getRiskAccounts({ addresses }) {
    if (addresses.length === 0) return []
    const readings = await readingsOnce(addresses)
    return readings.flatMap((r) => riskAccountFromReading(r) ?? [])
  },
}
