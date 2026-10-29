import type { ChainFamily } from '@/lib/protocols/core/toolkit/chain-slugs'
import type { RiskAccountResult } from '@/lib/risk/types'
import type { UserPosition } from '@/types'

export type PortfolioChainFamily = ChainFamily

/** Bounds the RPC work one call of the public server action can trigger. */
export const MAX_PORTFOLIO_WALLETS = 10

/** Failure `source` of the Horizon wallet-holdings read. */
export const STELLAR_WALLET_SOURCE = 'stellar_wallet'

/**
 * Failure `source` of the EVM wallet-balances read. One chain that could not
 * be read is `evm_wallet:<slug>`.
 */
export const EVM_WALLET_SOURCE = 'evm_wallet'

export interface PortfolioWalletInput {
  address: string
  chainFamily: PortfolioChainFamily
}

/** One source that could not be read; every other source is still shown. */
export interface PortfolioPartialFailure {
  chainFamily: PortfolioChainFamily
  /** Adapter id, STELLAR_WALLET_SOURCE, EVM_WALLET_SOURCE[:slug], or the family itself. */
  source: string
  message: string
}

/** A balance of a wallet itself — not a lending position. */
export interface WalletHolding {
  chainFamily: PortfolioChainFamily
  /** Chain slug of the registry: 'stellar', 'linea', 'base', … */
  network: string
  owner: string
  /** 'credit' = Stellar trustline, 'erc20' = EVM token contract. */
  assetType: 'native' | 'credit' | 'erc20'
  code: string
  /** Stellar issuer or ERC-20 contract; null for the native asset. */
  issuer: string | null
  balance: number
  priceUsd: number | null
  valueUsd: number | null
}

/** What the EVM wallet-balances read returns: what it read, and what it could not. */
export interface EvmWalletHoldings {
  holdings: WalletHolding[]
  /** Slugs of the chains that could not be read. */
  failedNetworks: string[]
}

export interface UserPortfolioResult {
  positions: UserPosition
  holdings: WalletHolding[]
  riskAccounts: RiskAccountResult[]
  failures: PortfolioPartialFailure[]
}

export function emptyUserPositions(): UserPosition {
  return { supply: {}, borrow: {} }
}

export function emptyPortfolio(): UserPortfolioResult {
  return {
    positions: emptyUserPositions(),
    holdings: [],
    riskAccounts: [],
    failures: [],
  }
}

export function mergeUserPositions(...positions: UserPosition[]): UserPosition {
  const merged = emptyUserPositions()
  for (const p of positions) {
    for (const [protocol, rows] of Object.entries(p.supply)) {
      merged.supply[protocol] = [...(merged.supply[protocol] ?? []), ...rows]
    }
    for (const [protocol, rows] of Object.entries(p.borrow)) {
      merged.borrow[protocol] = [...(merged.borrow[protocol] ?? []), ...rows]
    }
  }
  return merged
}
