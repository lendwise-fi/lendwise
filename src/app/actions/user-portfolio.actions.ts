'use server'

import {
  APP_ADAPTERS,
  solanaPositionAdapters,
  stellarPositionAdapters,
} from '@/config/protocols-server'
import { cachedEvmHoldings } from '@/lib/evm/holdings-cache'
import {
  loadCatalogTokens,
  loadHoldingPrices,
} from '@/lib/evm/holdings-catalog'
import { holdingsChains } from '@/lib/evm/holdings-chains'
import { getEvmWalletHoldings } from '@/lib/evm/wallet-holdings'
import { loadPortfolio } from '@/lib/portfolio/load'
import { sanitizeWalletInputs } from '@/lib/portfolio/routing'
import type {
  PortfolioWalletInput,
  UserPortfolioResult,
} from '@/lib/portfolio/types'
import type { AppAdapter } from '@/lib/protocols/core/types'
import { computeRiskAccounts } from '@/lib/risk/compute'
import { getSolanaWalletHoldings } from '@/lib/solana/wallet-holdings'
import { getStellarWalletHoldings } from '@/lib/stellar/wallet-holdings'

const evmAdapters: Record<string, () => Promise<AppAdapter>> =
  Object.fromEntries(
    Object.entries(APP_ADAPTERS).filter(
      (e): e is [string, () => Promise<AppAdapter>] => e[1] != null
    )
  )

// One read per wallet set at a time, a complete one kept 30 s: a page open
// loads the portfolio several times and would trip the RPC rate limit.
const evmHoldings = cachedEvmHoldings((addresses) =>
  getEvmWalletHoldings(addresses, {
    chains: holdingsChains(),
    tokens: loadCatalogTokens,
    prices: loadHoldingPrices,
  })
)

export async function loadUserPortfolio(
  wallets: PortfolioWalletInput[]
): Promise<UserPortfolioResult> {
  return loadPortfolio(sanitizeWalletInputs(wallets), {
    evmAdapters,
    stellarAdapters: stellarPositionAdapters(),
    solanaAdapters: solanaPositionAdapters(),
    stellarHoldings: (addresses) => getStellarWalletHoldings(addresses),
    solanaHoldings: (addresses) => getSolanaWalletHoldings(addresses),
    evmHoldings,
    computeRisk: (accounts) => computeRiskAccounts(accounts),
  })
}
