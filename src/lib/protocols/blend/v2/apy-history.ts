import type { HistoryParams, HistoryResult } from '@/lib/protocols/core/types'

import { getBlendApyHistory } from '../common/apy-history'
import type { BlendDeployment } from '../common/deployments'

export function getBlendV2ApyHistory(
  deployment: BlendDeployment,
  params: HistoryParams
): Promise<HistoryResult> {
  return getBlendApyHistory(params, { deployment })
}
