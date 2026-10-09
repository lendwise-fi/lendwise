import { Version } from '@blend-capital/blend-sdk'

/**
 * A Blend deployment: one backstop, its pool factory, and the pools it
 * deployed. Blend versions are deployments more than they are protocols — v2.1
 * runs the very same pool contract as v2 (same wasm `a41fc53d…`, same storage
 * layout, same SDK classes) behind a new backstop and factory.
 *
 * `label` is LendWise's name for the deployment: the `products.version` column,
 * the productId segment and the adapter id suffix (`blend_v2.1`). `sdk` is the
 * contract generation, which picks `PoolV1`/`PoolV2`, the reserve storage
 * layout and the history decoder. The two only coincide up to v2.
 */
export interface BlendDeployment {
  label: 'v1' | 'v2' | 'v2.1'
  sdk: Version
  /** Backstop contract — its config names the pool factory and reward zone. */
  backstop: string
}

export const BLEND_DEPLOYMENTS = {
  v1: {
    label: 'v1',
    sdk: Version.V1,
    backstop: process.env.NEXT_PUBLIC_BACKSTOP_V1 || '',
  },
  v2: {
    label: 'v2',
    sdk: Version.V2,
    backstop: process.env.NEXT_PUBLIC_BACKSTOP_V2 || '',
  },
  // Mainnet v2.1 backstop, as configured in blend-ui; the variable (blend-ui's
  // own name for it) only exists to point at another network.
  'v2.1': {
    label: 'v2.1',
    sdk: Version.V2,
    backstop:
      process.env.NEXT_PUBLIC_BACKSTOP_V2_1 ||
      'CCS4AZ5ORM6VLLPJTJUFRNXWBMHOO3L5WHHRPL2ZMILE35ZDMQFHOQMJ',
  },
} as const satisfies Record<string, BlendDeployment>
