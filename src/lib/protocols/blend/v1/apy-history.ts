import { Version } from '@blend-capital/blend-sdk'

import type { HistoryParams, HistoryResult } from '@/lib/protocols/core/types'

import { getBlendApyHistory } from '../common/apy-history'

export function getBlendV1ApyHistory(
  params: HistoryParams
): Promise<HistoryResult> {
  return getBlendApyHistory(params, { version: Version.V1 })
}
