import { Horizon, Networks } from '@stellar/stellar-sdk'

import type { RateParams } from '@/lib/protocols/core/types'
import type {
  BorrowPosition,
  BorrowProduct,
  MarketRate,
  SupplyPosition,
  SupplyProduct,
} from '@/types'

const STELLAR_TESTNET_CHAIN_ID = -1
const XLM_ASSET_ID = 'native'
const TESTNET_USDC_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
export interface StellarBalanceLine {
  balance: string
  asset_type: string
  asset_code?: string
  asset_issuer?: string
}

interface StellarAccountResponse {
  balances?: StellarBalanceLine[]
}

function optionalEnvNumber(name: string) {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function envNumber(name: string, fallback: number) {
  return optionalEnvNumber(name) ?? fallback
}

function configuredFixtureAddress() {
  return process.env.STELLAR_TESTNET_FIXTURE_ADDRESS?.trim()
}

function isFixtureAddress(address: string) {
  const fixtureAddress = configuredFixtureAddress()
  if (!fixtureAddress) return false
  return address.toUpperCase() === fixtureAddress.toUpperCase()
}

function stellarNetworkPassphrase() {
  return process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET
}

function horizonUrl() {
  if (process.env.STELLAR_PORTFOLIO_HORIZON_URL) {
    return process.env.STELLAR_PORTFOLIO_HORIZON_URL
  }
  if (process.env.STELLAR_HORIZON_URL) return process.env.STELLAR_HORIZON_URL
  return stellarNetworkPassphrase() === Networks.PUBLIC
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org'
}

function usdcIssuer() {
  return (
    process.env.STELLAR_TESTNET_USDC_ISSUER ??
    process.env.STELLAR_USDC_ISSUER ??
    TESTNET_USDC_ISSUER
  )
}

function usdcAssetId() {
  return `USDC:${usdcIssuer()}`
}

function positionId(userAddress: string, assetId: string) {
  return `stellar-wallet:${userAddress}:${assetId}`
}

function supplyPosition({
  userAddress,
  assetId,
  symbol,
  name,
  amount,
  priceUsd,
}: {
  userAddress: string
  assetId: string
  symbol: string
  name: string
  amount: number
  priceUsd: number
}): SupplyPosition {
  return {
    id: positionId(userAddress, assetId),
    protocol: 'blend_v1',
    network: 'Stellar Testnet',
    userAddress,
    poolName: 'Wallet balance',
    poolAddress: 'stellar:wallet',
    poolId: 'stellar-wallet',
    poolChainId: STELLAR_TESTNET_CHAIN_ID,
    assetAddress: assetId,
    assetName: name,
    assetSymbol: symbol,
    assetDecimals: 7,
    assetAmount: amount.toString(),
    assetAmountUsd: amount * priceUsd,
    assetLiveAmountUsd: amount * priceUsd,
    apy: 0,
  }
}

function assertFixtureOnline() {
  if (process.env.STELLAR_TESTNET_PORTFOLIO_OFFLINE === 'true') {
    throw new Error('Stellar testnet portfolio fixture is offline')
  }
}

async function loadStellarAccount(
  address: string
): Promise<StellarAccountResponse | null> {
  const server = new Horizon.Server(horizonUrl())
  try {
    return (await server.loadAccount(address)) as StellarAccountResponse
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response
      ?.status
    if (status === 404) return null
    throw error
  }
}

export function positionsFromStellarBalances({
  address,
  balances,
}: {
  address: string
  balances: StellarBalanceLine[]
}): SupplyPosition[] {
  const xlmPrice = envNumber('STELLAR_TESTNET_FIXTURE_XLM_PRICE_USD', 0)
  const usdcPrice = envNumber('STELLAR_TESTNET_FIXTURE_USDC_PRICE_USD', 1)
  const issuer = usdcIssuer()

  return balances.flatMap((balance) => {
    const amount = Number(balance.balance)
    if (!Number.isFinite(amount) || amount <= 0) return []

    if (balance.asset_type === 'native') {
      return [
        supplyPosition({
          userAddress: address,
          assetId: XLM_ASSET_ID,
          symbol: 'XLM',
          name: 'Stellar Lumens',
          amount,
          priceUsd: xlmPrice,
        }),
      ]
    }

    if (
      balance.asset_code === 'USDC' &&
      (!balance.asset_issuer || balance.asset_issuer === issuer)
    ) {
      return [
        supplyPosition({
          userAddress: address,
          assetId: `USDC:${balance.asset_issuer ?? issuer}`,
          symbol: 'USDC',
          name: 'USD Coin',
          amount,
          priceUsd: usdcPrice,
        }),
      ]
    }

    return []
  })
}

function fixtureSupplyPositions(address: string): SupplyPosition[] {
  if (!isFixtureAddress(address)) return []

  const xlmAmount = envNumber('STELLAR_TESTNET_FIXTURE_XLM', 0)
  const xlmPrice = envNumber('STELLAR_TESTNET_FIXTURE_XLM_PRICE_USD', 0)
  const usdcAmount = envNumber('STELLAR_TESTNET_FIXTURE_USDC', 0)
  const usdcPrice = envNumber('STELLAR_TESTNET_FIXTURE_USDC_PRICE_USD', 1)
  const positions: SupplyPosition[] = []

  if (xlmAmount > 0) {
    positions.push(
      supplyPosition({
        userAddress: address,
        assetId: XLM_ASSET_ID,
        symbol: 'XLM',
        name: 'Stellar Lumens',
        amount: xlmAmount,
        priceUsd: xlmPrice,
      })
    )
  }
  if (usdcAmount > 0) {
    positions.push(
      supplyPosition({
        userAddress: address,
        assetId: usdcAssetId(),
        symbol: 'USDC',
        name: 'USD Coin',
        amount: usdcAmount,
        priceUsd: usdcPrice,
      })
    )
  }

  return positions
}

export async function getUserSupplyPositions({
  addresses,
}: {
  addresses: string[]
}): Promise<SupplyPosition[]> {
  assertFixtureOnline()

  const positions = await Promise.all(
    addresses.map(async (address) => {
      const fixturePositions = fixtureSupplyPositions(address)
      try {
        const account = await loadStellarAccount(address)
        if (!account) return fixturePositions

        const livePositions = positionsFromStellarBalances({
          address,
          balances: account.balances ?? [],
        })
        return livePositions.length > 0 ? livePositions : fixturePositions
      } catch (error) {
        if (fixturePositions.length > 0) return fixturePositions
        throw error
      }
    })
  )

  return positions.flat()
}

export async function getUserBorrowPositions({
  addresses,
}: {
  addresses: string[]
}): Promise<BorrowPosition[]> {
  assertFixtureOnline()

  const borrowedUsdc = envNumber('STELLAR_TESTNET_FIXTURE_BORROW_USDC', 0)
  const collateralXlm = envNumber('STELLAR_TESTNET_FIXTURE_COLLATERAL_XLM', 0)
  if (borrowedUsdc <= 0 || collateralXlm <= 0) return []

  const usdcPrice = optionalEnvNumber('STELLAR_TESTNET_FIXTURE_USDC_PRICE_USD')
  const xlmPrice = optionalEnvNumber('STELLAR_TESTNET_FIXTURE_XLM_PRICE_USD')
  const collateralWeight = envNumber(
    'STELLAR_TESTNET_FIXTURE_COLLATERAL_WEIGHT',
    0.5
  )

  return addresses.flatMap((address) => {
    if (!isFixtureAddress(address)) return []

    const loanAmountUsd = usdcPrice == null ? 0 : borrowedUsdc * usdcPrice
    const collateralAmountUsd = xlmPrice == null ? 0 : collateralXlm * xlmPrice

    const positions: BorrowPosition[] = [
      {
        id: `stellar-testnet-borrow:${address}:USDC`,
        protocol: 'blend_v1',
        network: 'Stellar Testnet',
        healthFactor: 0,
        userAddress: address,
        poolId: 'stellar-testnet-fixture-pool',
        poolName: 'Fixture Blend pool',
        poolAddress: 'stellar:testnet:fixture-pool',
        poolChainId: STELLAR_TESTNET_CHAIN_ID,
        loanAssetAddress: usdcAssetId(),
        loanAssetName: 'USD Coin',
        loanAssetSymbol: 'USDC',
        loanAssetDecimals: 7,
        loanAssetAmount: borrowedUsdc,
        loanAssetPriceUsd: usdcPrice ?? null,
        loanLiabilityWeight: 1,
        loanAssetAmountUsd: loanAmountUsd,
        loanLiveAssetAmountUsd: loanAmountUsd,
        loanTimestamp: Math.floor(Date.now() / 1000),
        collaterals: [
          {
            address: XLM_ASSET_ID,
            symbol: 'XLM',
            name: 'Stellar Lumens',
            decimals: 7,
            lltv: collateralWeight,
            amount: collateralXlm,
            priceUsd: xlmPrice ?? null,
            amountUsd: collateralAmountUsd,
          },
        ],
        apy: 0,
      },
    ]
    return positions
  })
}

async function emptyRates(_p: RateParams): Promise<MarketRate[]> {
  return []
}

async function emptySupplyProducts(): Promise<SupplyProduct[]> {
  return []
}

async function emptyBorrowProducts(): Promise<BorrowProduct[]> {
  return []
}

export const stellarTestnetPortfolioAdapter = {
  getUserSupplyPositions,
  getUserBorrowPositions,
  getMarketSupplyHistoryRates: emptyRates,
  getMarketBorrowHistoryRates: emptyRates,
  getSupplyProducts: emptySupplyProducts,
  getBorrowProducts: emptyBorrowProducts,
}
