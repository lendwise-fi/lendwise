import type { z } from 'zod'

import type { xoxnoMetaSchema } from './schemas'

/** Catalogue identity is hub liquidity; execution chooses one compatible spoke. */
export type XoxnoMeta = z.infer<typeof xoxnoMetaSchema>
export type XoxnoSpoke = XoxnoMeta['spokes'][number]
/** Risk fractions remain scoped to this spoke and hub. */
export type XoxnoCollateral = XoxnoSpoke['collaterals'][number]
export type XoxnoNetwork = XoxnoMeta['network']

/** User choice only; server reloads the authoritative catalogue before use. */
export interface XoxnoSelection {
  spokeId: number
  accountId?: string
  collateralHubId?: number
  collateralAsset?: string
}

export interface XoxnoDeployment {
  network: XoxnoNetwork
  apiUrl: string
  controller: string
  pool: string
  nft: string
}
