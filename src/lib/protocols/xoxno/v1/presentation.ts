import type { ProtocolName } from '@/config/protocols-meta'
import type { ProtocolPresentation } from '@/lib/protocols/core/presentation'

import type { XoxnoMeta } from './types'
import { xoxnoMarketLink } from './utils'

export const XOXNO_V1_PRESENTATION = {
  xoxno_v1: {
    poolName: (p) =>
      `${p.assetSymbol} · ${(p.meta as unknown as XoxnoMeta).hubName || p.protocolName}`,
    poolIdentity: (p) => ({
      poolId: `${p.protocolAddress}:${(p.meta as unknown as XoxnoMeta).hubId}`,
      poolAddress: p.protocolAddress,
    }),
    productLink: (p) => xoxnoMarketLink((p.meta as unknown as XoxnoMeta).hubId),
    productDetails: (p) => {
      const meta = p.meta as unknown as XoxnoMeta
      return { xoxno: meta, ...(meta.logoUrl ? { logoURI: meta.logoUrl } : {}) }
    },
  },
} satisfies Partial<Record<ProtocolName, ProtocolPresentation>>
