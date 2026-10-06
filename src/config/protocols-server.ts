// src/config/protocols-server.ts — server only: loaders dynamic-import heavy adapter modules
import type { ProtocolName } from '@/config/protocols-meta'
import type { AppAdapter, YieldAdapter } from '@/lib/protocols/core/types'
import type { BorrowPosition, SupplyPosition } from '@/types'

export const YIELD_ADAPTERS: Record<ProtocolName, () => Promise<YieldAdapter>> =
  {
    aave_v3: () => import('@/lib/protocols/aave/v3').then((m) => m.adapter),
    morpho_v1: () => import('@/lib/protocols/morpho/v1').then((m) => m.adapter),
    compound_v3: () =>
      import('@/lib/protocols/compound/v3').then((m) => m.adapter),
    blend_v1: () => import('@/lib/protocols/blend/v1').then((m) => m.adapter),
    blend_v2: () => import('@/lib/protocols/blend/v2').then((m) => m.adapter),
  }

export interface StellarAppAdapter {
  getUserSupplyPositions(p: { addresses: string[] }): Promise<SupplyPosition[]>
  getUserBorrowPositions(p: { addresses: string[] }): Promise<BorrowPosition[]>
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

export const STELLAR_APP_ADAPTERS: Partial<
  Record<ProtocolName, () => Promise<StellarAppAdapter>>
> = {
  blend_v1: () =>
    import('@/lib/protocols/stellar/testnet/portfolio').then(
      (m) => m.stellarTestnetPortfolioAdapter
    ),
  blend_v2: () =>
    import('@/lib/protocols/stellar/testnet/blend-v2-1-pool').then(
      (m) => m.blendV21TestnetAdapter
    ),
}
