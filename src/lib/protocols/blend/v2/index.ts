import { defineYieldAdapter } from '@/lib/protocols/core/define'
import { CHAIN_SLUG_MAP } from '@/lib/protocols/core/toolkit/chain-slugs'

import { BLEND_PROVIDER } from '../common/config'
import { BLEND_DEPLOYMENTS } from '../common/deployments'
import { getBlendV2ApyHistory } from './apy-history'
import { fetchBlendV2ApySpot } from './apy-spot'
import { fetchBlendV2Products } from './products'

export const adapter = defineYieldAdapter({
  id: 'blend_v2',
  name: 'Blend v2',
  provider: BLEND_PROVIDER,
  version: 'v2',
  chains: {
    '-1': { slug: CHAIN_SLUG_MAP['-1'] },
  },
  // The Blend factory exposes no pool list — the pipeline seeds `opts.poolIds`
  // from the `products` catalogue. See core/catalogue-opts.ts.
  ownsMarketDiscovery: false,
  getProducts: (opts) => fetchBlendV2Products(BLEND_DEPLOYMENTS.v2, opts),
  getApySpot: (opts) => fetchBlendV2ApySpot(BLEND_DEPLOYMENTS.v2, opts),
  getApyHistory: (params) => getBlendV2ApyHistory(BLEND_DEPLOYMENTS.v2, params),
})
