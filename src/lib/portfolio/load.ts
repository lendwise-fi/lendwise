import { inspect } from 'node:util'
import type { Address } from 'viem'

import { redactRpcSecrets } from '@/lib/evm/redact'
import type { RiskAccount, RiskAccountResult } from '@/lib/risk/types'
import type { BorrowPosition, SupplyPosition, UserPosition } from '@/types'

import { type RoutedPortfolioWallets, routePortfolioWallets } from './routing'
import {
  EVM_WALLET_SOURCE,
  type EvmWalletHoldings,
  type PortfolioChainFamily,
  type PortfolioPartialFailure,
  type PortfolioWalletInput,
  SOLANA_WALLET_SOURCE,
  STELLAR_WALLET_SOURCE,
  type UserPortfolioResult,
  type WalletHolding,
  emptyUserPositions,
  mergeUserPositions,
} from './types'
import { withTimeout } from './with-timeout'

/**
 * What the merge needs from any adapter, EVM, Stellar or Solana. `signal`
 * aborts at the source's deadline; `maxAddresses` caps the wallets of one
 * call (see `SolanaPositionsAdapter`).
 */
export interface PositionsSource<A extends string> {
  maxAddresses?: number
  getUserSupplyPositions(p: {
    addresses: A[]
    signal?: AbortSignal
  }): Promise<SupplyPosition[]>
  getUserBorrowPositions(p: {
    addresses: A[]
    signal?: AbortSignal
  }): Promise<BorrowPosition[]>
  getRiskAccounts?(p: {
    addresses: A[]
    signal?: AbortSignal
  }): Promise<RiskAccount[]>
}

type Loaders<A extends string> = Record<
  string,
  () => Promise<PositionsSource<A>>
>

export interface PortfolioDeps {
  evmAdapters: Loaders<Address>
  stellarAdapters: Loaders<string>
  solanaAdapters: Loaders<string>
  evmHoldings(addresses: Address[]): Promise<EvmWalletHoldings>
  stellarHoldings(addresses: string[]): Promise<WalletHolding[]>
  solanaHoldings(addresses: string[]): Promise<WalletHolding[]>
  computeRisk(accounts: RiskAccount[]): Promise<RiskAccountResult[]>
  /** Per-source time limit; defaults to `SOURCE_TIMEOUT_MS`. */
  sourceTimeoutMs?: number
}

/** Longest a single source may take before it becomes a partial failure. */
export const SOURCE_TIMEOUT_MS = 12_000

interface FamilyResult {
  positions: UserPosition
  riskAccounts: RiskAccount[]
  holdings: WalletHolding[]
  failures: PortfolioPartialFailure[]
}

const emptyFamily = (): FamilyResult => ({
  positions: emptyUserPositions(),
  riskAccounts: [],
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

/**
 * A source that read only `maxAddresses` of the wallets: the rest are flagged
 * like a failure (the banner names the source), not silently dropped.
 */
function walletLimitFailure(
  chainFamily: PortfolioChainFamily,
  source: string,
  skipped: number,
  limit: number
): PortfolioPartialFailure {
  console.warn(
    `[portfolio] ${chainFamily}/${source}: ${skipped} wallet(s) over the limit of ${limit} not read`
  )
  return {
    chainFamily,
    source,
    message: `${skipped} wallet(s) over the limit of ${limit} not read`,
  }
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
      // Aborts with the deadline: an adapter that fans out stops issuing
      // calls instead of running on after the source has been given up.
      const signal = AbortSignal.timeout(Math.max(0, timeoutMs))
      let read = addresses
      let riskRead:
        | Promise<
            { ok: true; value: RiskAccount[] } | { ok: false; reason: unknown }
          >
        | undefined
      const positions = async () => {
        const adapter = await load()
        if (adapter.maxAddresses != null) {
          read = addresses.slice(0, Math.max(0, adapter.maxAddresses))
        }
        const query = { addresses: read, signal }
        // Concurrent on purpose: adapters dedupe the shared upstream read.
        // Risk settles apart: its failure must not discard good positions.
        riskRead = Promise.resolve(
          adapter.getRiskAccounts
            ? adapter.getRiskAccounts(query)
            : ([] as RiskAccount[])
        ).then(
          (value) => ({ ok: true as const, value }),
          (reason: unknown) => ({ ok: false as const, reason })
        )
        const [supply, borrow] = await Promise.all([
          adapter.getUserSupplyPositions(query),
          adapter.getUserBorrowPositions(query),
        ])
        return { supply, borrow, limit: adapter.maxAddresses }
      }
      const { supply, borrow, limit } = await withTimeout(
        positions(),
        timeoutMs
      )
      const risk = await withTimeout(
        riskRead as NonNullable<typeof riskRead>,
        deadline - Date.now()
      ).catch((reason: unknown) => ({ ok: false as const, reason }))
      return {
        supply,
        borrow,
        risk,
        skipped: addresses.length - read.length,
        limit,
      }
    })
  )

  settled.forEach((s, i) => {
    const source = entries[i][0]
    if (s.status === 'fulfilled') {
      result.positions.supply[source] = s.value.supply
      result.positions.borrow[source] = s.value.borrow
      if (s.value.risk.ok) result.riskAccounts.push(...s.value.risk.value)
      else
        result.failures.push(failure(chainFamily, source, s.value.risk.reason))
      if (s.value.skipped > 0) {
        result.failures.push(
          walletLimitFailure(
            chainFamily,
            source,
            s.value.skipped,
            s.value.limit ?? 0
          )
        )
      }
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

/**
 * A family whose wallets are plain strings (Stellar `G…`, Solana base58): its
 * position adapters and one holdings read, each settled on its own.
 */
async function loadStringFamily(
  chainFamily: Exclude<PortfolioChainFamily, 'evm'>,
  addresses: string[],
  sources: {
    adapters: Loaders<string>
    holdings(addresses: string[]): Promise<WalletHolding[]>
    walletSource: string
  },
  timeoutMs: number
): Promise<FamilyResult> {
  if (addresses.length === 0) return emptyFamily()
  const [adapters, holdings] = await Promise.allSettled([
    loadAdapters(chainFamily, addresses, sources.adapters, timeoutMs),
    withTimeout(
      Promise.resolve().then(() => sources.holdings(addresses)),
      timeoutMs
    ),
  ])
  const result =
    adapters.status === 'fulfilled' ? adapters.value : emptyFamily()
  if (adapters.status === 'rejected') {
    result.failures.push(failure(chainFamily, chainFamily, adapters.reason))
  }
  if (holdings.status === 'fulfilled') result.holdings = holdings.value
  else {
    result.failures.push(
      failure(chainFamily, sources.walletSource, holdings.reason)
    )
  }
  return result
}

/**
 * One loader per chain family, each reading its routed addresses and its own
 * deps. Typed over every `ChainFamily`: a new family does not compile until it
 * has a loader here and its sources in `PortfolioDeps`.
 */
const FAMILY_LOADERS: {
  [F in PortfolioChainFamily]: (
    addresses: RoutedPortfolioWallets[F],
    deps: PortfolioDeps
  ) => Promise<FamilyResult>
} = {
  evm: (addresses, deps) => loadEvm(addresses, deps),
  stellar: (addresses, deps) =>
    loadStringFamily(
      'stellar',
      addresses,
      {
        adapters: deps.stellarAdapters,
        holdings: deps.stellarHoldings,
        walletSource: STELLAR_WALLET_SOURCE,
      },
      sourceTimeoutMs(deps)
    ),
  solana: (addresses, deps) =>
    loadStringFamily(
      'solana',
      addresses,
      {
        adapters: deps.solanaAdapters,
        holdings: deps.solanaHoldings,
        walletSource: SOLANA_WALLET_SOURCE,
      },
      sourceTimeoutMs(deps)
    ),
}

function loadFamily<F extends PortfolioChainFamily>(
  family: F,
  routed: RoutedPortfolioWallets,
  deps: PortfolioDeps
): Promise<FamilyResult> {
  return FAMILY_LOADERS[family](routed[family], deps)
}

/**
 * EVM, Stellar and Solana positions in one result. Each family — and each
 * source in it — settles on its own: a source that rejects becomes a partial
 * failure and the rest of the portfolio still renders.
 */
export async function loadPortfolio(
  wallets: PortfolioWalletInput[],
  deps: PortfolioDeps
): Promise<UserPortfolioResult> {
  const routed = routePortfolioWallets(wallets)

  const families = Object.keys(FAMILY_LOADERS) as PortfolioChainFamily[]
  const settled = await Promise.allSettled(
    families.map((family) => loadFamily(family, routed, deps))
  )

  const loaded: FamilyResult[] = []
  const failures: PortfolioPartialFailure[] = []
  settled.forEach((s, i) => {
    const chainFamily = families[i]
    if (s.status === 'fulfilled') {
      loaded.push(s.value)
      failures.push(...s.value.failures)
    } else {
      failures.push(failure(chainFamily, chainFamily, s.reason))
    }
  })

  const accounts = loaded.flatMap((f) => f.riskAccounts)
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
    riskAccounts,
    failures,
  }
}
