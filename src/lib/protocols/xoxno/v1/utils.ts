import type { Kind } from '@/lib/db/types'

import type { XoxnoNetwork } from './types'

export function xoxnoProductId(p: {
  network: XoxnoNetwork
  controller: string
  hubId: number
  asset: string
  kind: Kind
}): string {
  return `xoxno-v1-${p.network}-${p.controller.toLowerCase()}-${p.hubId}-${p.asset.toLowerCase()}-${p.kind}`
}

export function xoxnoMarketLink(hubId: number): string {
  return `https://xoxno.com/defi/lending/hub/${hubId}`
}
