import { defineYieldAdapter } from '@/lib/protocols/core/define'

import { KAMINO_PROVIDER } from '../common/config'
import { getKaminoApyHistory } from './apy-history'
import { fetchKaminoApySpot } from './apy-spot'
import { KAMINO_V1_CHAINS } from './config'
import { fetchKaminoProducts } from './products'

export const adapter = defineYieldAdapter({
  id: 'kamino_v1',
  name: 'Kamino Lend',
  provider: KAMINO_PROVIDER,
  version: 'v1',
  chains: KAMINO_V1_CHAINS,
  getProducts: fetchKaminoProducts,
  getApySpot: fetchKaminoApySpot,
  getApyHistory: getKaminoApyHistory,
})
