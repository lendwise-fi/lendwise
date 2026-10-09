import type { HistoryParams, HistoryResult } from '@/lib/protocols/core/types'

import { getBlendApyHistory } from '../common/apy-history'
import { BLEND_DEPLOYMENTS } from '../common/deployments'

export function getBlendV1ApyHistory(
  params: HistoryParams
): Promise<HistoryResult> {
  return getBlendApyHistory(params, { deployment: BLEND_DEPLOYMENTS.v1 })
}
