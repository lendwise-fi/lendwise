import { defineYieldAdapter } from '@/lib/protocols/core/define'
import { CHAIN_SLUG_MAP } from '@/lib/protocols/core/toolkit/chain-slugs'

import { BLEND_PROVIDER } from '../common/config'
import { BLEND_DEPLOYMENTS } from '../common/deployments'
import { getBlendV2ApyHistory } from '../v2/apy-history'
import { fetchBlendV2ApySpot } from '../v2/apy-spot'
import { fetchBlendV2Products } from '../v2/products'

/**
 * Blend v2.1 — the v2 pool contract behind a new backstop and factory (see
 * `../common/deployments`). Same code path as `blend_v2`, its own catalogue:
 * products, productIds and history are keyed `v2.1`.
 *
 * The id carries the dot because `adapterId(row)` is `${provider}_${version}`
 * (src/lib/products/from-catalogue.ts) and the version column reads `v2.1`.
 */
const deployment = BLEND_DEPLOYMENTS['v2.1']

export const adapter = defineYieldAdapter({
  id: 'blend_v2.1',
  name: 'Blend v2.1',
  provider: BLEND_PROVIDER,
  version: 'v2.1',
  chains: {
    '-1': { slug: CHAIN_SLUG_MAP['-1'] },
  },
  // The Blend factory exposes no pool list — the pipeline seeds `opts.poolIds`
  // from the `products` catalogue, and the listing adds the backstop's reward
  // zone. See core/catalogue-opts.ts and ../listing.ts.
  ownsMarketDiscovery: false,
  getProducts: (opts) => fetchBlendV2Products(deployment, opts),
  getApySpot: (opts) => fetchBlendV2ApySpot(deployment, opts),
  getApyHistory: (params) => getBlendV2ApyHistory(deployment, params),
})
