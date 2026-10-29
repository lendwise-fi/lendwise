'use server'

import { headers } from 'next/headers'

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
import { limitPortfolioLoad } from '@/lib/portfolio/rate-limit'
import { sanitizeWalletInputs } from '@/lib/portfolio/routing'
import type {
  LoadUserPortfolioResult,
  PortfolioWalletInput,
} from '@/lib/portfolio/types'
import type { AppAdapter } from '@/lib/protocols/core/types'
import { clientIp, portfolioLimiter } from '@/lib/ratelimit'
import { computeRiskAccounts } from '@/lib/risk/compute'
import { cachedSolanaHoldings } from '@/lib/solana/holdings-cache'
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

// Same for Solana: three RPC calls per wallet on every load otherwise.
const solanaHoldings = cachedSolanaHoldings((addresses) =>
  getSolanaWalletHoldings(addresses)
)

/**
 * The portfolio of `wallets`, or the rate-limit shape once the caller's IP is
 * over `PORTFOLIO_LOADS_PER_MINUTE`: every load fans out to RPC and API reads.
 */
export async function loadUserPortfolio(
  wallets: PortfolioWalletInput[]
): Promise<LoadUserPortfolioResult> {
  return limitPortfolioLoad({
    ip: async () => clientIp(await headers()),
    limit: (ip) => portfolioLimiter.limit(ip),
    load: () =>
      loadPortfolio(sanitizeWalletInputs(wallets), {
        evmAdapters,
        stellarAdapters: stellarPositionAdapters(),
        solanaAdapters: solanaPositionAdapters(),
        stellarHoldings: (addresses) => getStellarWalletHoldings(addresses),
        solanaHoldings,
        evmHoldings,
        computeRisk: (accounts) => computeRiskAccounts(accounts),
      }),
  })
}
