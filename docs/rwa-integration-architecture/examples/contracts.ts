/** Proposed design contracts only. No database, signing, or application code. */
export type DecimalString = string
export type IsoTime = string
export type TriState = 'yes' | 'no' | 'unknown'
export type Metric =
  | 'LENDING_SUPPLY_APY'
  | 'LENDING_BORROW_APY'
  | 'BOND_YTM'
  | 'CURRENT_YIELD'
  | 'DISTRIBUTION_YIELD'
  | 'MMF_YIELD'
  | 'NAV_TOTAL_RETURN'
  | 'ISSUER_INDICATIVE_RATE'

export type AssetId =
  | {
      family: 'stellar'
      network: 'mainnet' | 'testnet'
      kind: 'classic'
      code: string
      issuer: string
      sac: string | null
    }
  | {
      family: 'stellar'
      network: 'mainnet' | 'testnet'
      kind: 'contract'
      contract: string
    }
  | { family: 'evm'; chainId: number; kind: 'erc20'; contract: string }

export interface Provenance {
  sourceId: string
  sourceUrl: string
  rawHash: string
  adapterVersion: string
  methodVersion: string
  observedAt: IsoTime
  publishedAt: IsoTime | null
  collectedAt: IsoTime
  availableAt: IsoTime
  ledger: number | null
}

export interface Quality {
  origin: 'source_reported' | 'calculated' | 'carried_forward' | 'estimated'
  status: 'valid' | 'missing' | 'stale' | 'quarantined'
  reason: string | null
  nextExpectedAt: IsoTime | null
  staleAfter: IsoTime
}

export interface YieldObservation {
  id: string
  revision: number
  supersedesId: string | null
  subject: { kind: 'rwa_share_class' | 'lending_product'; id: string }
  metric: Metric
  originalValue: DecimalString | null
  originalUnit: 'decimal' | 'percent' | 'basis_points'
  normalizedDecimal: DecimalString | null
  effectiveAnnualRate: DecimalString | null
  currency: string
  direction: 'historical' | 'forward_indicative' | 'spot_variable'
  feeBasis: 'gross' | 'net_identified_fees' | 'unknown'
  rateType: 'fixed' | 'floating' | 'unknown'
  incomeTreatment: 'accrued_in_nav' | 'distributed' | 'mixed' | 'unknown'
  periodStart: IsoTime | null
  periodEnd: IsoTime | null
  dayCount: 'ACT_365F' | 'ACT_360' | 'THIRTY_360' | 'issuer_defined' | 'unknown'
  compounding: 'none' | 'daily' | 'continuous' | 'issuer_defined' | 'unknown'
  calculationMethod: string
  assumptions: string[]
  provenance: Provenance
  quality: Quality
}

export interface NavObservation {
  id: string
  shareClassId: string
  value: DecimalString | null
  currency: string
  priceType: 'issuer_token_price' | 'official_nav' | 'market_price'
  revision: number
  supersedesId: string | null
  provenance: Provenance
  quality: Quality
}

export interface Fee {
  id: string
  kind:
    | 'management'
    | 'subscription'
    | 'redemption'
    | 'fx'
    | 'network'
    | 'performance'
  value: DecimalString | null
  unit:
    | 'fraction_of_nav_per_year'
    | 'fraction_of_transaction'
    | 'currency_amount'
    | 'fraction_of_profit'
  currency: string | null
  includedInNav: TriState
  effectiveFrom: IsoTime
}

export interface RwaProduct {
  id: string
  issuerId: string
  name: string
  legalProductId: string | null
  exposure: {
    assetClass: string
    country: string | null
    currency: string
    weight: DecimalString | null
  }[]
  shareClass: {
    id: string
    currency: string
    assets: AssetId[]
    minimum: DecimalString | null
    maturity: IsoTime | null
    maturityKind: 'fixed' | 'rolling' | 'perpetual' | 'unknown'
    redemptionDelayDays: number | null
    dealingCalendar: string | null
    investorRestrictions: string[]
    eligibility: 'eligible' | 'ineligible' | 'unknown'
    fees: Fee[]
  }
  liquidity: {
    secondaryMarket: TriState
    issuerRedemption: TriState
    termsUrl: string | null
  }
  creditRisk: { rating: string | null; issuerConcentrationGroup: string }
  source: Provenance
}

export interface RwaPosition {
  id: string
  owner: string
  ownership: 'direct' | 'contract_claim' | 'custodial_statement'
  shareClassId: string
  asset: AssetId
  atomicBalance: DecimalString
  decimals: number
  spendableAtomic: DecimalString | null
  ledger: number | null
  authorized: TriState
  authorizedToMaintainLiabilities: TriState
  clawbackEnabled: TriState
  eligibility: 'eligible' | 'ineligible' | 'unknown'
  accruedIncome: DecimalString | null
  distributedIncome: DecimalString | null
  redemptionStatus:
    'none' | 'requested' | 'burned_pending_payout' | 'settled' | 'unknown'
  valuation: {
    value: DecimalString | null
    currency: string
    navObservationId: string | null
    fxObservationId: string | null
    asOf: IsoTime
    liquidatableValue: DecimalString | null
  }
}

export interface ReadContext {
  signal?: AbortSignal
  collectedAt: IsoTime
}
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}
export interface ObservationBatch {
  nav: NavObservation[]
  yields: YieldObservation[]
  failures: AdapterError[]
}
export interface AdapterError {
  code:
    | 'INVALID_SOURCE'
    | 'SOURCE_UNAVAILABLE'
    | 'STALE_DATA'
    | 'ASSET_MISMATCH'
    | 'NOT_COMPARABLE'
    | 'UNSUPPORTED_CAPABILITY'
    | 'RATE_LIMITED'
  productId: string | null
  retryable: boolean
  message: string
}
export interface RwaAdapter {
  id: string
  version: string
  discovery: {
    list(cursor: string | null, ctx: ReadContext): Promise<Page<RwaProduct>>
  }
  observations: {
    fetch(ids: string[], ctx: ReadContext): Promise<ObservationBatch>
  }
  history?: {
    fetch(
      ids: string[],
      from: IsoTime,
      to: IsoTime,
      cursor: string | null,
      ctx: ReadContext
    ): Promise<Page<NavObservation | YieldObservation>>
  }
  positions?: {
    read(owners: string[], ctx: ReadContext): Promise<RwaPosition[]>
  }
  eligibility?: {
    check(
      owner: string,
      productId: string,
      ctx: ReadContext
    ): Promise<'eligible' | 'ineligible' | 'unknown'>
  }
  handoff?: { getUrl(productId: string): string }
}

/** A separate, conditional service, never part of the public read SDK. */
export interface IssuerExecution {
  quote(input: {
    owner: string
    productId: string
    amount: DecimalString
  }): Promise<{ quoteId: string; expiresAt: IsoTime; termsUrl: string }>
  prepare(input: {
    owner: string
    quoteId: string
    idempotencyKey: string
  }): Promise<{
    orderId: string
    unsignedXdr: string | null
    redirectUrl: string | null
  }>
}

export interface RateSnapshot {
  observation: YieldObservation
  poolId: string
  asset: AssetId
  availableLiquidity: DecimalString | null
  poolStatus: string
}
export interface LendWiseSdk {
  products: {
    list(input: {
      issuer?: string
      cursor?: string
      first?: number
    }): Promise<Page<RwaProduct>>
  }
  observations: { latest(shareClassIds: string[]): Promise<ObservationBatch> }
  history: {
    list(input: {
      shareClassId: string
      from: IsoTime
      to: IsoTime
      cursor?: string
    }): Promise<Page<NavObservation | YieldObservation>>
  }
  lending: {
    blendRates(input: {
      poolId: string
      asset: AssetId
      maxAgeSeconds: number
    }): Promise<RateSnapshot[]>
  }
}

export type SigningProvider = {
  address(): Promise<string>
  signTransaction(xdr: string, address: string): Promise<string>
}

/** Working-style generic consumer. It never calculates strategy profit. */
export async function loadStrategyInputs(
  sdk: LendWiseSdk,
  shareClassId: string,
  poolId: string,
  asset: AssetId,
  nowMs = Date.now()
) {
  const [rwa, rates] = await Promise.all([
    sdk.observations.latest([shareClassId]),
    sdk.lending.blendRates({ poolId, asset, maxAgeSeconds: 30 }),
  ])
  const fresh = (o: YieldObservation) => {
    const observed = Date.parse(o.provenance.observedAt)
    return (
      o.quality.status === 'valid' &&
      o.normalizedDecimal !== null &&
      Number.isFinite(observed) &&
      observed <= nowMs &&
      Date.parse(o.quality.staleAfter) > nowMs
    )
  }
  const sameAsset = (left: AssetId, right: AssetId): boolean => {
    if (left.family === 'evm' && right.family === 'evm') {
      return (
        left.chainId === right.chainId &&
        left.contract.toLowerCase() === right.contract.toLowerCase()
      )
    }
    if (
      left.family !== 'stellar' ||
      right.family !== 'stellar' ||
      left.network !== right.network
    )
      return false
    if (left.kind === 'classic' && right.kind === 'classic')
      return left.code === right.code && left.issuer === right.issuer
    return (
      left.kind === 'contract' &&
      right.kind === 'contract' &&
      left.contract === right.contract
    )
  }
  const borrow = rates.filter(
    (r) => r.observation.metric === 'LENDING_BORROW_APY'
  )
  if (
    rwa.failures.length > 0 ||
    rwa.yields.length === 0 ||
    borrow.length === 0 ||
    rwa.yields.some(
      (o) =>
        !fresh(o) ||
        o.subject.kind !== 'rwa_share_class' ||
        o.subject.id !== shareClassId
    ) ||
    borrow.some(
      (r) =>
        !fresh(r.observation) ||
        r.poolId !== poolId ||
        !sameAsset(r.asset, asset) ||
        r.observation.subject.kind !== 'lending_product' ||
        !r.observation.subject.id ||
        nowMs - Date.parse(r.observation.provenance.observedAt) > 30000
    )
  ) {
    return { status: 'informational_only' as const, rwa, rates }
  }
  // A caller still needs strategy terms, eligibility, liquidity and live chain simulation.
  return { status: 'inputs_available' as const, rwa, rates }
}
