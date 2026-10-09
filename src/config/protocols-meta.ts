import { AAVE_V3_META } from '@/lib/protocols/aave/v3/meta'
import { BLEND_PROVIDER } from '@/lib/protocols/blend/common/config'
import { BLEND_V2_1_META } from '@/lib/protocols/blend/v2_1/meta'
import { COMPOUND_V3_META } from '@/lib/protocols/compound/v3/meta'
import { MORPHO_V1_META } from '@/lib/protocols/morpho/v1/meta'

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

function metaFor(id: string) {
  return id in PROTOCOLS_META
    ? PROTOCOLS_META[id as ProtocolName]
    : RETIRED_PROTOCOLS_META[id]
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
