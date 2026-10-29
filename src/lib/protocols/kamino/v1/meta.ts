// src/lib/protocols/kamino/v1/meta.ts
import { KAMINO_PROVIDER } from '../common/config'

export const KAMINO_V1_META = {
  kamino_v1: {
    displayName: 'Kamino',
    versionName: 'Kamino Lend',
    provider: KAMINO_PROVIDER,
  },
} as const
