export const RAY = 10n ** 27n
export const WAD = 10n ** 18n
export const I128_MAX = (1n << 127n) - 1n
export const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b
const min = (...values: bigint[]) => values.reduce((a, b) => (a < b ? a : b))
const positive = (v: bigint) => (v > 0n ? v : 0n)

export interface RawMarket {
  decimals: number
  cash: bigint
  supplied: bigint
  borrowed: bigint
  storedSupplyIndex: bigint
  storedBorrowIndex: bigint
  supplyIndex: bigint
  borrowIndex: bigint
  maxUtilization: bigint
  price: bigint
}
export interface RawListing {
  supplied: bigint
  borrowed: bigint
  supplyCap: bigint
  borrowCap: bigint
  ltv: number
  threshold: number
  collateral: boolean
  borrowable: boolean
  paused: boolean
  frozen: boolean
}

export function assetRay(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error('Unsupported asset precision')
  return 10n ** BigInt(27 - decimals)
}
export function scaled(
  amount: bigint,
  market: RawMarket,
  side: 'supply' | 'borrow'
) {
  if (amount < 0n || amount > I128_MAX / assetRay(market.decimals))
    throw new Error('Amount exceeds contract arithmetic limits')
  const numerator = amount * assetRay(market.decimals) * RAY
  const result =
    side === 'supply'
      ? numerator / market.supplyIndex
      : ceilDiv(numerator, market.borrowIndex)
  if (result > I128_MAX)
    throw new Error('Shares exceed contract arithmetic limits')
  return result
}
export function capShares(
  cap: bigint,
  market: RawMarket,
  side: 'supply' | 'borrow'
) {
  if (cap < 0n || cap > I128_MAX / assetRay(market.decimals))
    throw new Error('Invalid contract cap')
  return min(
    I128_MAX,
    (cap * assetRay(market.decimals) * RAY) /
      (side === 'supply' ? market.supplyIndex : market.borrowIndex)
  )
}
export function suppliedValue(m: RawMarket) {
  return (m.supplied * m.supplyIndex) / RAY
}
export function debtValue(m: RawMarket) {
  return ceilDiv(m.borrowed * m.borrowIndex, RAY)
}

/** Stored claims omit pending revenue shares. Cash + ceiled debt bounds accrued claims. */
export function requireBacked(m: RawMarket) {
  const unit = assetRay(m.decimals)
  if (
    m.supplyIndex < m.storedSupplyIndex ||
    m.borrowIndex < m.storedBorrowIndex
  )
    throw new Error('RPC indexes moved backwards')
  if (suppliedValue(m) > I128_MAX || debtValue(m) > I128_MAX)
    throw new Error('Market exceeds contract arithmetic limits')
  const oldClaims = (m.supplied * m.storedSupplyIndex) / RAY
  const oldDebt = ceilDiv(m.borrowed * m.storedBorrowIndex, RAY)
  if (
    (oldClaims > oldDebt ? (oldClaims - oldDebt) / unit : 0n) > m.cash ||
    (m.supplied === 0n && m.borrowed !== 0n)
  )
    throw new Error('Market is not backed')
  const debt = debtValue(m)
  if (
    (suppliedValue(m) > debt ? (suppliedValue(m) - debt) / unit : 0n) > m.cash
  )
    throw new Error('Market is not backed')
}
export function borrowCapacity(m: RawMarket, listing: RawListing): bigint {
  requireBacked(m)
  const unit = assetRay(m.decimals)
  const debt = debtValue(m)
  const debtNative = ceilDiv(debt, unit)
  const reserve = ceilDiv((m.cash + debtNative) * 200n, 10_000n)
  const capRoom = positive(
    capShares(listing.borrowCap, m, 'borrow') - listing.borrowed
  )
  const utilizationDebt = (suppliedValue(m) * m.maxUtilization) / RAY
  const utilShares = positive(
    (utilizationDebt * RAY) / m.borrowIndex - m.borrowed
  )
  const utilRoom =
    m.maxUtilization >= RAY
      ? I128_MAX
      : (utilShares * m.borrowIndex) / (RAY * unit)
  return min(
    positive(m.cash - reserve),
    (capRoom * m.borrowIndex) / (RAY * unit),
    utilRoom,
    I128_MAX / unit,
    (positive(I128_MAX - m.borrowed) * m.borrowIndex) / (RAY * unit)
  )
}
/** Solvent backing also bounds pending revenue shares missing from the index view. */
export function accruedSupplyUpper(m: RawMarket) {
  const unit = assetRay(m.decimals)
  return min(
    I128_MAX,
    ceilDiv(
      (m.cash + ceilDiv(debtValue(m), unit) + 1n) * unit * RAY,
      m.supplyIndex
    )
  )
}
export function checkSupply(m: RawMarket, l: RawListing, amount: bigint) {
  requireBacked(m)
  if (!l.collateral || l.paused || l.frozen)
    throw new Error('Supply listing is disabled')
  const shares = scaled(amount, m, 'supply')
  if (amount <= 0n || shares === 0n)
    throw new Error('Supply rounds to zero shares')
  if (l.supplied + shares > capShares(l.supplyCap, m, 'supply'))
    throw new Error('Selected spoke supply cap is insufficient')
  if (accruedSupplyUpper(m) + shares > I128_MAX || m.cash + amount > I128_MAX)
    throw new Error('Supply exceeds contract arithmetic limits')
  return shares
}
export function usdFloor(amount: bigint, m: RawMarket) {
  return (amount * m.price) / 10n ** BigInt(m.decimals)
}
function checkedValue(value: bigint) {
  if (value < 0n || value > I128_MAX)
    throw new Error('Valuation exceeds contract arithmetic limits')
  return value
}
export function collateralUsd(shares: bigint, m: RawMarket) {
  const actualRay = checkedValue((shares * m.supplyIndex) / RAY)
  return checkedValue(((actualRay / 10n ** 9n) * m.price) / WAD)
}
export function debtUsd(shares: bigint, m: RawMarket) {
  const actualRay = checkedValue(ceilDiv(shares * m.borrowIndex, RAY))
  return checkedValue(ceilDiv(ceilDiv(actualRay, 10n ** 9n) * m.price, WAD))
}

export function parseAmount(value: string, decimals: number): bigint {
  if (value.length > 64 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new Error('Enter a valid decimal amount')
  const [whole, fraction = ''] = value.split('.')
  if (fraction.length > decimals)
    throw new Error('Amount exceeds asset precision')
  const amount =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0')
  if (amount <= 0n || amount > I128_MAX / assetRay(decimals))
    throw new Error('Amount exceeds contract arithmetic limits')
  return amount
}

function numberRatio(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1e15)
    throw new Error('Invalid solver allocation')
  const [mantissa, exponent = '0'] = value.toString().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const digits = BigInt(whole + fraction)
  const power = Number(exponent) - fraction.length
  return {
    numerator: digits * (power >= 0 ? 10n ** BigInt(power) : 1n),
    denominator: power < 0 ? 10n ** BigInt(-power) : 1n,
  }
}
export function fractionNative(amount: bigint, fraction: number) {
  const { numerator, denominator } = numberRatio(fraction)
  return (amount * numerator) / denominator
}

/** Solver numbers are only a proposal; convert conservatively before checking contract units. */
export function usdToNative(
  value: number,
  m: RawMarket,
  rounding: 'floor' | 'ceil'
) {
  const ratio = numberRatio(value)
  const numerator = ratio.numerator * WAD * 10n ** BigInt(m.decimals)
  const denominator = m.price * ratio.denominator
  return rounding === 'floor'
    ? numerator / denominator
    : ceilDiv(numerator, denominator)
}
