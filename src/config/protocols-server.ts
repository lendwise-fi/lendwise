// src/config/protocols-server.ts — server only: loaders dynamic-import heavy adapter modules
import type { ProtocolName } from '@/config/protocols-meta'
import { stellarNetworkId } from '@/config/stellar-network'
import type {
  AppAdapter,
  SolanaPositionsAdapter,
  StellarPositionsAdapter,
  YieldAdapter,
} from '@/lib/protocols/core/types'
import {
  fixtureAddress,
  isStellarYieldFixtureEnabled,
} from '@/lib/protocols/stellar/fixture/config'

export const YIELD_ADAPTERS: Record<ProtocolName, () => Promise<YieldAdapter>> =
  {
    aave_v3: () => import('@/lib/protocols/aave/v3').then((m) => m.adapter),
    morpho_v1: () => import('@/lib/protocols/morpho/v1').then((m) => m.adapter),
    compound_v3: () =>
      import('@/lib/protocols/compound/v3').then((m) => m.adapter),
    'blend_v2.1': () =>
      import('@/lib/protocols/blend/v2_1').then((m) => m.adapter),
    kamino_v1: () => import('@/lib/protocols/kamino/v1').then((m) => m.adapter),
  }

/**
 * The yield adapters the pipeline walks — catalogue sync, spot collector,
 * reconcile: YIELD_ADAPTERS, plus the Stellar fixture's yield face on a
 * non-production deployment with STELLAR_YIELD_FIXTURE=1. A function read at
 * call time, like `stellarPositionAdapters`: the fixture is decided per
 * environment. The backfill script keeps YIELD_ADAPTERS and never sees it.
 */
export function yieldAdapters(
  env: Record<string, string | undefined> = process.env
): Record<string, () => Promise<YieldAdapter>> {
  const adapters: Record<string, () => Promise<YieldAdapter>> = {
    ...YIELD_ADAPTERS,
  }
  if (isStellarYieldFixtureEnabled(env)) {
    adapters.stellar_fixture = () =>
      import('@/lib/protocols/stellar/fixture/yield').then(
        (m) => m.stellarFixtureYieldAdapter
      )
  }
  return adapters
}

export const APP_ADAPTERS: Partial<
  Record<ProtocolName, () => Promise<AppAdapter>>
> = {
  aave_v3: () => import('@/lib/protocols/aave/v3').then((m) => m.appAdapter),
  morpho_v1: () =>
    import('@/lib/protocols/morpho/v1').then((m) => m.appAdapter),
  compound_v3: () =>
    import('@/lib/protocols/compound/v3').then((m) => m.appAdapter),
}

/**
 * Stellar position sources, read for `G…` addresses only. A function, not a
 * constant: the staging fixture is enabled per environment, at call time.
 */
export function stellarPositionAdapters(
  env: Record<string, string | undefined> = process.env
): Record<string, () => Promise<StellarPositionsAdapter>> {
  // Blend v2.1 pools and the fixture are pubnet: a testnet deployment reads
  // only the wallet's own holdings.
  if (stellarNetworkId(env) === 'testnet') return {}
  const adapters: Record<string, () => Promise<StellarPositionsAdapter>> = {
    'blend_v2.1': () =>
      import('@/lib/protocols/blend/v2_1/positions').then(
        (m) => m.positionsAdapter
      ),
  }
  const fixture = fixtureAddress(env)
  if (fixture) {
    adapters.stellar_fixture = () =>
      import('@/lib/protocols/stellar/fixture').then((m) =>
        m.createStellarFixtureAdapter(fixture)
      )
  }
  return adapters
}

/**
 * Solana position sources, read for base58 addresses only. A function like
 * `stellarPositionAdapters`, but without a network gate: Solana data is
 * mainnet-beta on every deployment, testnet.lendwise.fi included (spec 0008).
 */
export function solanaPositionAdapters(): Record<
  string,
  () => Promise<SolanaPositionsAdapter>
> {
  return {
    kamino_v1: () =>
      import('@/lib/protocols/kamino/v1/positions').then(
        (m) => m.positionsAdapter
      ),
  }
}
