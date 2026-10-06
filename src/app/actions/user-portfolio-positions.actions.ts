'use server'

import { cache } from 'react'

import { type ProtocolName } from '@/config/protocols-meta'
import { APP_ADAPTERS, STELLAR_APP_ADAPTERS } from '@/config/protocols-server'
import { routePortfolioWallets } from '@/lib/portfolio/routing'
import {
  EMPTY_USER_POSITIONS,
  type PortfolioPartialFailure,
  type PortfolioWalletInput,
  type UserPortfolioPositionsResult,
  mergeUserPositions,
} from '@/lib/portfolio/types'
import type { AppAdapter } from '@/lib/protocols/core/types'
import type { BorrowPosition, SupplyPosition, UserPosition } from '@/types'

interface FamilyPositionsResult {
  positions: UserPosition
  failures: PortfolioPartialFailure[]
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}

function emptyProtocolPositions(
  entries: [ProtocolName, unknown][]
): UserPosition {
  return entries.reduce(
    (acc, [protocolId]) => {
      acc.supply[protocolId] = []
      acc.borrow[protocolId] = []
      return acc
    },
    { supply: {}, borrow: {} } as UserPosition
  )
}

async function loadEvmPositions(
  addresses: ReturnType<typeof routePortfolioWallets>['evmAddresses']
): Promise<FamilyPositionsResult> {
  const entries = Object.entries(APP_ADAPTERS) as [
    ProtocolName,
    () => Promise<AppAdapter>,
  ][]
  const positions = emptyProtocolPositions(entries)

  if (addresses.length === 0) return { positions, failures: [] }

  const results = await Promise.allSettled(
    entries.map(async ([protocolId, load]) => {
      const adapter = await load()
      const [supply, borrow] = await Promise.all([
        adapter.getUserSupplyPositions({ addresses }),
        adapter.getUserBorrowPositions({ addresses }),
      ])
      return [protocolId, supply, borrow] as [
        ProtocolName,
        SupplyPosition[],
        BorrowPosition[],
      ]
    })
  )

  const failures: PortfolioPartialFailure[] = []
  results.forEach((result, index) => {
    const protocolId = entries[index][0]
    if (result.status === 'fulfilled') {
      const [, supply, borrow] = result.value
      positions.supply[protocolId] = supply
      positions.borrow[protocolId] = borrow
      return
    }

    failures.push({
      chainFamily: 'evm',
      protocolId,
      message: errorMessage(result.reason),
    })
  })

  return { positions, failures }
}

async function loadStellarPositions(
  addresses: string[]
): Promise<FamilyPositionsResult> {
  const entries = Object.entries(STELLAR_APP_ADAPTERS) as [
    ProtocolName,
    NonNullable<(typeof STELLAR_APP_ADAPTERS)[ProtocolName]>,
  ][]
  const positions = emptyProtocolPositions(entries)

  if (addresses.length === 0) return { positions, failures: [] }

  const results = await Promise.allSettled(
    entries.map(async ([protocolId, load]) => {
      const adapter = await load()
      const [supply, borrow] = await Promise.all([
        adapter.getUserSupplyPositions({ addresses }),
        adapter.getUserBorrowPositions({ addresses }),
      ])
      return [protocolId, supply, borrow] as [
        ProtocolName,
        SupplyPosition[],
        BorrowPosition[],
      ]
    })
  )

  const failures: PortfolioPartialFailure[] = []
  results.forEach((result, index) => {
    const protocolId = entries[index][0]
    if (result.status === 'fulfilled') {
      const [, supply, borrow] = result.value
      positions.supply[protocolId] = supply
      positions.borrow[protocolId] = borrow
      return
    }

    failures.push({
      chainFamily: 'stellar',
      protocolId,
      message: errorMessage(result.reason),
    })
  })

  return { positions, failures }
}

export const loadUserPortfolioPositions = cache(
  async function loadUserPortfolioPositions(
    wallets: PortfolioWalletInput[]
  ): Promise<UserPortfolioPositionsResult> {
    const routed = routePortfolioWallets(wallets)

    const [evm, stellar] = await Promise.allSettled([
      loadEvmPositions(routed.evmAddresses),
      loadStellarPositions(routed.stellarAddresses),
    ])

    const failures: PortfolioPartialFailure[] = []
    const fulfilled: UserPosition[] = []

    if (evm.status === 'fulfilled') {
      fulfilled.push(evm.value.positions)
      failures.push(...evm.value.failures)
    } else {
      failures.push({ chainFamily: 'evm', message: errorMessage(evm.reason) })
    }

    if (stellar.status === 'fulfilled') {
      fulfilled.push(stellar.value.positions)
      failures.push(...stellar.value.failures)
    } else {
      failures.push({
        chainFamily: 'stellar',
        message: errorMessage(stellar.reason),
      })
    }

    return {
      positions:
        fulfilled.length > 0
          ? mergeUserPositions(...fulfilled)
          : EMPTY_USER_POSITIONS,
      failures,
    }
  }
)
