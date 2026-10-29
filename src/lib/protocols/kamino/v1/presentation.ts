/**
 * Kamino Lend's presentation overrides — see `core/presentation.ts` for the
 * contract.
 *
 * Registered into `@/config/protocols-presentation`.
 */
import type { ProtocolName } from '@/config/protocols-meta'
import type { ProductRow } from '@/lib/db/schema'
import type { ProtocolPresentation } from '@/lib/protocols/core/presentation'

import type { KaminoSupplyMeta } from './types'

/**
 * "<market name> · <asset>". Kamino runs several markets on Solana and most
 * list the same assets (USDC sits in a dozen), so the asset name alone would
 * render identical rows. `protocol_name` is the constant `KaminoLend`, so the
 * market name comes from `meta`, written at sync time.
 */
export function kaminoPoolName(p: ProductRow): string {
  const marketName = (p.meta as Partial<KaminoSupplyMeta> | null)?.marketName
  return marketName ? `${marketName} · ${p.assetName}` : p.assetName
}

/**
 * The reserve page of Kamino's app (route `/borrow/reserve/:market/:reserve`
 * in its router; app.kamino.finance redirects to kamino.com). One page serves
 * both the supply and the borrow side. Base58 keys, case kept.
 */
export function kaminoReserveUrl(market: string, reserve: string): string {
  return `https://kamino.com/borrow/reserve/${market}/${reserve}`
}

export function kaminoProductLink(p: ProductRow): string {
  const market = (p.meta as Partial<KaminoSupplyMeta> | null)?.market
  if (!market) return ''
  return kaminoReserveUrl(market, p.protocolAddress)
}

export const KAMINO_V1_PRESENTATION = {
  kamino_v1: {
    poolName: kaminoPoolName,
    productLink: kaminoProductLink,
  },
} satisfies Partial<Record<ProtocolName, ProtocolPresentation>>
