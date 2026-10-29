import { AAVE_V3_META } from '@/lib/protocols/aave/v3/meta'
import { BLEND_PROVIDER } from '@/lib/protocols/blend/common/config'
import { BLEND_V2_1_META } from '@/lib/protocols/blend/v2_1/meta'
import { COMPOUND_V3_META } from '@/lib/protocols/compound/v3/meta'
import { KAMINO_V1_META } from '@/lib/protocols/kamino/v1/meta'
import { MORPHO_V1_META } from '@/lib/protocols/morpho/v1/meta'
import { isStellarYieldFixtureEnabled } from '@/lib/protocols/stellar/fixture/config'

/**
 * Each entry is owned by its adapter (`{protocol}/{version}/meta.ts`) and
 * spread in here — this file stays the one explicit registration point (no
 * filesystem discovery, see `src/lib/protocols/README.md`), but never
 * hand-declares a protocol's identity itself.
 */
export const PROTOCOLS_META = {
  ...AAVE_V3_META,
  ...MORPHO_V1_META,
  ...COMPOUND_V3_META,
  // Blend v1 and v2 are retired — every pool of both is frozen or on ice — and
  // unregistered here, in protocols-server and in protocols-presentation
  // together: reconcile walks this map and loads each adapter. Their code
  // stays (v2.1 runs v2's), their rows and history stay in the database, and
  // `scripts/retire-products.ts` closed their availability periods.
  ...BLEND_V2_1_META,
  ...KAMINO_V1_META,
} as const

export type ProtocolName = keyof typeof PROTOCOLS_META

/**
 * Display identity of retired adapters. They are no longer collected, but
 * their rows and history stay in the database — a position in a frozen pool, a
 * past chart — and still need a name rather than `n/a`. Kept out of
 * PROTOCOLS_META on purpose: reconcile and the registries walk that map, and
 * must never load these.
 */
const RETIRED_PROTOCOLS_META: Record<
  string,
  { displayName: string; versionName: string; provider: string }
> = {
  blend_v1: {
    displayName: 'Blend',
    versionName: 'Blend v1',
    provider: BLEND_PROVIDER,
  },
  blend_v2: {
    displayName: 'Blend',
    versionName: 'Blend v2',
    provider: BLEND_PROVIDER,
  },
}

/**
 * Display identity of position sources that are not yield adapters: the
 * staging fixture. Kept out of PROTOCOLS_META for the same reason as the
 * retired ones — reconcile and the registries walk that map.
 */
export const POSITION_ONLY_PROTOCOLS_META = {
  stellar_fixture: {
    displayName: 'Stellar fixture',
    versionName: 'Stellar fixture',
    // The provider its catalogue rows carry: the yield face
    // (stellar/fixture/yield.ts) writes provider 'stellar', version
    // 'fixture', so `${provider}_${version}` is this key.
    provider: 'stellar',
  },
} as const

export type PositionOnlyProtocol = keyof typeof POSITION_ONLY_PROTOCOLS_META

export function isProtocolName(id: string): id is ProtocolName {
  return id in PROTOCOLS_META
}

function metaFor(id: string) {
  if (id in PROTOCOLS_META) return PROTOCOLS_META[id as ProtocolName]
  if (id in POSITION_ONLY_PROTOCOLS_META) {
    return POSITION_ONLY_PROTOCOLS_META[id as PositionOnlyProtocol]
  }
  return RETIRED_PROTOCOLS_META[id]
}

/** 'aave_v3' → 'Aave v3'. Version-qualified display name, looked up (not parsed). */
export function protocolVersionName(id: string): string {
  return metaFor(id)?.versionName ?? 'n/a'
}

/** 'aave_v3' → 'Aave'. Provider display name, looked up (not parsed). */
export function protocolDisplayName(id: string): string {
  return metaFor(id)?.displayName ?? 'n/a'
}

/** DB provider column value → adapter ids. Used by heal to map gaps to adapters. */
export function adapterIdsForProvider(provider: string): ProtocolName[] {
  return (Object.keys(PROTOCOLS_META) as ProtocolName[]).filter(
    (id) => PROTOCOLS_META[id].provider === provider
  )
}

/** A yield adapter id: a registered protocol, or the staging fixture when enabled. */
export type YieldAdapterId = ProtocolName | PositionOnlyProtocol

interface YieldProtocolMeta {
  displayName: string
  versionName: string
  provider: string
}

/**
 * PROTOCOLS_META, plus the Stellar fixture when `STELLAR_YIELD_FIXTURE=1`
 * outside production — what the catalogue sync, the spot collector and
 * reconcile walk. PROTOCOLS_META itself never holds the fixture: the client
 * registries, the GraphQL enum and the ticker read it and must never see it.
 */
export function yieldProtocolsMeta(
  env: Record<string, string | undefined> = process.env
): Record<string, YieldProtocolMeta> {
  if (!isStellarYieldFixtureEnabled(env)) return PROTOCOLS_META
  return {
    ...PROTOCOLS_META,
    stellar_fixture: POSITION_ONLY_PROTOCOLS_META.stellar_fixture,
  }
}

/** `adapterIdsForProvider` over `yieldProtocolsMeta(env)`: the fixture included when enabled. */
export function adapterIdsForProviderIn(
  provider: string,
  env: Record<string, string | undefined> = process.env
): YieldAdapterId[] {
  const meta = yieldProtocolsMeta(env)
  return (Object.keys(meta) as YieldAdapterId[]).filter(
    (id) => meta[id].provider === provider
  )
}
