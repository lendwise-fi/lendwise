/**
 * Blend v2.1's presentation overrides — see `core/presentation.ts` for the
 * contract. The naming rule is shared with v1/v2 (`blend/common/presentation.ts`).
 *
 * Registered into `@/config/protocols-presentation`.
 */
import type { ProtocolName } from '@/config/protocols-meta'
import type { ProtocolPresentation } from '@/lib/protocols/core/presentation'

import { blendPoolName, blendProductLink } from '../common/presentation'

export const BLEND_V2_1_PRESENTATION = {
  'blend_v2.1': {
    poolName: blendPoolName,
    productLink: blendProductLink,
  },
} satisfies Partial<Record<ProtocolName, ProtocolPresentation>>
