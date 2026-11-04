import {
  type LendingAsset,
  type LendingPosition,
  createStellarLendingReadClient,
} from '@xoxno/sdk-js/stellar-lending/read'
import type { z } from 'zod'

import { XOXNO_MAINNET } from './config'
import {
  assetsSchema,
  contextSchema,
  detailedMarketsSchema,
  graphSchema,
  positionsSchema,
} from './schemas'
import type { XoxnoDeployment } from './types'

export function createXoxnoClient({
  deployment = XOXNO_MAINNET,
  fetch: fetcher = globalThis.fetch,
}: {
  deployment?: XoxnoDeployment
  fetch?: typeof globalThis.fetch
} = {}) {
  const read = createStellarLendingReadClient({
    baseUrl: deployment.apiUrl,
    fetch: fetcher,
  })
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const url = `${deployment.apiUrl.replace(/\/$/, '')}/stellar-lending/${path}`
    const response = await fetcher(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok || response.redirected) {
      throw new Error(`XOXNO ${path}: HTTP ${response.status}`)
    }
    return schema.parse(await response.json())
  }
  return {
    deployment,
    context: () => get('context', contextSchema),
    detailedMarkets: () => get('markets/detailed', detailedMarketsSchema),
    graph: (
      spokeId: number,
      hubId: number,
      asset: string,
      query: URLSearchParams
    ) =>
      get(
        `reserves/${spokeId}/${hubId}/${encodeURIComponent(asset)}/graph?${query}`,
        graphSchema
      ),
    async assets(usage: 'collateral' | 'borrow'): Promise<LendingAsset[]> {
      const rows = assetsSchema.parse(
        await read.assets({
          usage,
          signal: AbortSignal.timeout(30_000),
        })
      )
      if (rows.some((row) => row.network !== deployment.network)) {
        throw new Error('XOXNO asset network does not match deployment')
      }
      return rows
    },
    async positions(owner: string): Promise<LendingPosition[]> {
      const rows = positionsSchema.parse(
        await read.positions(owner, {
          signal: AbortSignal.timeout(30_000),
        })
      )
      if (
        rows.some(
          (row) =>
            row.network !== deployment.network ||
            row.nftContract !== deployment.nft
        )
      )
        throw new Error('XOXNO position deployment mismatch')
      return rows
    },
  }
}

export type XoxnoClient = ReturnType<typeof createXoxnoClient>
export const xoxnoClient = createXoxnoClient()
