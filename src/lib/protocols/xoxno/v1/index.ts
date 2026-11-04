import { defineYieldAdapter } from '@/lib/protocols/core/define'

import { XOXNO_CHAIN_ID, XOXNO_PROTOCOL } from './config'
import { fetchXoxnoApyHistory } from './history'
import { fetchXoxnoApySpot, fetchXoxnoProducts } from './products'

export { xoxnoProductId } from './utils'

export const adapter = defineYieldAdapter({
  id: XOXNO_PROTOCOL,
  name: 'XOXNO',
  provider: 'xoxno',
  version: 'v1',
  chains: { [XOXNO_CHAIN_ID]: { slug: 'stellar' } },
  getProducts: fetchXoxnoProducts,
  getApySpot: fetchXoxnoApySpot,
  getApyHistory: fetchXoxnoApyHistory,
})
