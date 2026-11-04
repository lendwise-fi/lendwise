import { inspect } from 'node:util'
import type { Address } from 'viem'

import { redactRpcSecrets } from '@/lib/evm/redact'
import type { RiskAccount, RiskAccountResult } from '@/lib/risk/types'
import type { BorrowPosition, SupplyPosition, UserPosition } from '@/types'

import { routePortfolioWallets } from './routing'
import {
  EVM_WALLET_SOURCE,
  type EvmWalletHoldings,
  type PortfolioChainFamily,
  type PortfolioPartialFailure,
  type PortfolioWalletInput,
  STELLAR_WALLET_SOURCE,
  type UserPortfolioResult,
  type WalletHolding,
  emptyUserPositions,
  mergeUserPositions,
} from './types'
import { withTimeout } from './with-timeout'

/** What the merge needs from any adapter, EVM or Stellar. */
export interface PositionsSource<A extends string> {
  getUserSupplyPositions(p: { addresses: A[] }): Promise<SupplyPosition[]>
  getUserBorrowPositions(p: { addresses: A[] }): Promise<BorrowPosition[]>
  getRiskAccounts?(p: { addresses: A[] }): Promise<RiskAccount[]>
  getRiskAccountResults?(p: { addresses: A[] }): Promise<RiskAccountResult[]>
}

type Loaders<A extends string> = Record<
  string,
  () => Promise<PositionsSource<A>>
>

export interface PortfolioDeps {
  evmAdapters: Loaders<Address>
  stellarAdapters: Loaders<string>
  evmHoldings(addresses: Address[]): Promise<EvmWalletHoldings>
  stellarHoldings(addresses: string[]): Promise<WalletHolding[]>
  computeRisk(accounts: RiskAccount[]): Promise<RiskAccountResult[]>
  /** Per-source time limit; defaults to `SOURCE_TIMEOUT_MS`. */
  sourceTimeoutMs?: number
}

/** Longest a single source may take before it becomes a partial failure. */
export const SOURCE_TIMEOUT_MS = 12_000

interface FamilyResult {
  positions: UserPosition
  riskAccounts: RiskAccount[]
  riskResults: RiskAccountResult[]
  holdings: WalletHolding[]
  failures: PortfolioPartialFailure[]
}

const emptyFamily = (): FamilyResult => ({
  positions: emptyUserPositions(),
  riskAccounts: [],
  riskResults: [],
  holdings: [],
  failures: [],
})

const GENERIC_FAILURE_MESSAGE = 'Temporarily unavailable'

/** Log-safe text of a failure: an HTTP error object carries the request's URL and headers. */
const loggable = (reason: unknown) =>
  redactRpcSecrets(inspect(reason, { depth: 3 }))

/**
 * Upstream errors can carry RPC URLs with keys or internal hosts: the
 * redacted reason goes to the server logs, the client only gets a generic
 * message.
 */
function failure(
  chainFamily: PortfolioChainFamily,
  source: string,
  reason: unknown
): PortfolioPartialFailure {
  console.error(
    `[portfolio] ${chainFamily}/${source} failed:`,
    loggable(reason)
  )
  return { chainFamily, source, message: GENERIC_FAILURE_MESSAGE }
}

/** Every adapter of a family, each settled on its own. */
async function loadAdapters<A extends string>(
  chainFamily: PortfolioChainFamily,
  addresses: A[],
  adapters: Loaders<A>,
  timeoutMs: number
): Promise<FamilyResult> {
  const result = emptyFamily()
  if (addresses.length === 0) return result

  const entries = Object.entries(adapters)
  const settled = await Promise.allSettled(
    entries.map(async ([, load]) => {
      const deadline = Date.now() + timeoutMs
      let riskRead: Promise<RiskAccount[]> = Promise.resolve([])
      let reportedRead: Promise<RiskAccountResult[]> = Promise.resolve([])
      const positions = async () => {
        const adapter = await load()
        // Catch each read independently; a synchronous risk failure must keep positions.
        riskRead = Promise.resolve().then(
          () => adapter.getRiskAccounts?.({ addresses }) ?? []
        )
        reportedRead = Promise.resolve().then(
          () => adapter.getRiskAccountResults?.({ addresses }) ?? []
        )
        // Attach handlers before waiting for positions to prevent unhandled rejections.
        void riskRead.catch(() => {})
        void reportedRead.catch(() => {})
        const [supply, borrow] = await Promise.all([
          adapter.getUserSupplyPositions({ addresses }),
          adapter.getUserBorrowPositions({ addresses }),
        ])
        return { supply, borrow }
      }
      const { supply, borrow } = await withTimeout(positions(), timeoutMs)
      const [risk, reported] = await Promise.allSettled([
        withTimeout(riskRead, deadline - Date.now()),
        withTimeout(reportedRead, deadline - Date.now()),
      ])
      return { supply, borrow, risk, reported }
    })
  )

  settled.forEach((s, i) => {
    const source = entries[i][0]
    if (s.status === 'fulfilled') {
      result.positions.supply[source] = s.value.supply
      result.positions.borrow[source] = s.value.borrow
      if (s.value.risk.status === 'fulfilled')
        result.riskAccounts.push(...s.value.risk.value)
      if (s.value.reported.status === 'fulfilled')
        result.riskResults.push(...s.value.reported.value)
      const failed = [s.value.risk, s.value.reported].find(
        (r) => r.status === 'rejected'
      )
      if (failed?.status === 'rejected')
        result.failures.push(failure(chainFamily, source, failed.reason))
    } else {
      result.failures.push(failure(chainFamily, source, s.reason))
    }
  })
  return result
}

const sourceTimeoutMs = (deps: PortfolioDeps) =>
  deps.sourceTimeoutMs ?? SOURCE_TIMEOUT_MS

async function loadEvm(
  addresses: Address[],
  deps: PortfolioDeps
): Promise<FamilyResult> {
  if (addresses.length === 0) return emptyFamily()
  const [adapters, holdings] = await Promise.allSettled([
    loadAdapters('evm', addresses, deps.evmAdapters, sourceTimeoutMs(deps)),
    withTimeout(
      // A synchronous throw must reject this source, not the whole family.
      Promise.resolve().then(() => deps.evmHoldings(addresses)),
      sourceTimeoutMs(deps)
    ),
  ])
  const result =
    adapters.status === 'fulfilled' ? adapters.value : emptyFamily()
  if (adapters.status === 'rejected') {
    result.failures.push(failure('evm', 'evm', adapters.reason))
  }
  if (holdings.status === 'fulfilled') {
    result.holdings = holdings.value.holdings
    for (const slug of holdings.value.failedNetworks) {
      result.failures.push(
        failure('evm', `${EVM_WALLET_SOURCE}:${slug}`, `${slug} unreadable`)
      )
    }
  } else {
    result.failures.push(failure('evm', EVM_WALLET_SOURCE, holdings.reason))
  }
  return result
}

async function loadStellar(
  addresses: string[],
  deps: PortfolioDeps
): Promise<FamilyResult> {
  if (addresses.length === 0) return emptyFamily()
  const [adapters, holdings] = await Promise.allSettled([
    loadAdapters(
      'stellar',
      addresses,
      deps.stellarAdapters,
      sourceTimeoutMs(deps)
    ),
    withTimeout(
      Promise.resolve().then(() => deps.stellarHoldings(addresses)),
      sourceTimeoutMs(deps)
    ),
  ])
  const result =
    adapters.status === 'fulfilled' ? adapters.value : emptyFamily()
  if (adapters.status === 'rejected') {
    result.failures.push(failure('stellar', 'stellar', adapters.reason))
  }
  if (holdings.status === 'fulfilled') result.holdings = holdings.value
  else {
    result.failures.push(
      failure('stellar', STELLAR_WALLET_SOURCE, holdings.reason)
    )
  }
  return result
}

/**
 * EVM and Stellar positions in one result. Each family — and each source in
 * it — settles on its own: a source that rejects becomes a partial failure and
 * the rest of the portfolio still renders.
 */
export async function loadPortfolio(
  wallets: PortfolioWalletInput[],
  deps: PortfolioDeps
): Promise<UserPortfolioResult> {
  const { evmAddresses, stellarAddresses } = routePortfolioWallets(wallets)

  const families: [PortfolioChainFamily, () => Promise<FamilyResult>][] = [
    ['evm', () => loadEvm(evmAddresses, deps)],
    ['stellar', () => loadStellar(stellarAddresses, deps)],
  ]
  const settled = await Promise.allSettled(families.map(([, run]) => run()))

  const loaded: FamilyResult[] = []
  const failures: PortfolioPartialFailure[] = []
  settled.forEach((s, i) => {
    const chainFamily = families[i][0]
    if (s.status === 'fulfilled') {
      loaded.push(s.value)
      failures.push(...s.value.failures)
    } else {
      failures.push(failure(chainFamily, chainFamily, s.reason))
    }
  })

  const reported = loaded.flatMap((f) => f.riskResults)
  const reportedIds = new Set(reported.map((r) => r.id))
  const accounts = loaded
    .flatMap((f) => f.riskAccounts)
    .filter((a) => !reportedIds.has(a.id))
  let riskAccounts: RiskAccountResult[] = []
  if (accounts.length > 0) {
    try {
      riskAccounts = await deps.computeRisk(accounts)
    } catch (reason) {
      console.error('[portfolio] risk computation failed:', loggable(reason))
    }
  }
  return {
    positions: mergeUserPositions(...loaded.map((f) => f.positions)),
    holdings: loaded.flatMap((f) => f.holdings),
    riskAccounts: [...riskAccounts, ...reported],
    failures,
  }
}
