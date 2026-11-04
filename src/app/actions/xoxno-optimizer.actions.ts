'use server'

import { headers } from 'next/headers'

import { z } from 'zod'

import {
  loadBorrowProducts,
  loadSupplyProducts,
} from '@/app/actions/products.actions'
import { HORIZON_CONFIG } from '@/config/horizon'
import type {
  MarketData,
  OptimizationResponse,
  VaultAllocationResponse,
} from '@/lib/api/optimizer'
import { XOXNO_MAINNET } from '@/lib/protocols/xoxno/v1/config'
import {
  type RpcSelection,
  VERIFICATION_WINDOW_MS,
  readXoxnoSnapshot,
} from '@/lib/protocols/xoxno/v1/rpc'
import { parseXoxnoMeta } from '@/lib/protocols/xoxno/v1/schemas'
import { xoxnoProductId } from '@/lib/protocols/xoxno/v1/utils'
import {
  assertFresh,
  checkBorrowAllocations,
  checkSupplyAllocations,
  liquidityUsd,
  openingLtv,
  qualification,
  requestUsd,
  supplyPreflight,
} from '@/lib/protocols/xoxno/v1/verification'
import { clientIp, optimizerLimiter } from '@/lib/ratelimit'
import type { BorrowProduct, SupplyProduct } from '@/types'

const selectionSchema = z
  .object({
    spokeId: z.number().int().min(0).max(0xffffffff),
    collateralHubId: z.number().int().min(0).max(0xffffffff).optional(),
    collateralAsset: z
      .string()
      .regex(/^C[A-Z2-7]{55}$/)
      .optional(),
  })
  .strict()
const requestSchema = z
  .object({
    kind: z.enum(['supply', 'borrow']),
    markets: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(256),
            selection: selectionSchema.optional(),
            recommendedLtv: z.number().min(0).max(1).optional(),
          })
          .strict()
      )
      .min(1)
      .max(20),
    amount: z
      .string()
      .min(1)
      .max(64)
      .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/),
    horizon: z.enum(['intraday', 'short', 'medium', 'long']),
    mode: z.enum(['collateral_target', 'loan_target']).optional(),
    omega: z.number().min(0).max(1).optional(),
    diversification: z.number().min(0).max(100).optional(),
    collateralSymbol: z.string().min(1).max(32).optional(),
  })
  .strict()
export type XoxnoOptimizerRequest = z.infer<typeof requestSchema>

async function solve<T>(
  endpoint: string,
  data: unknown,
  startedAt: number
): Promise<T> {
  const url = process.env.OPTIMIZER_API_URL
  if (!url) throw new Error('Optimizer service is not configured')
  const remaining = VERIFICATION_WINDOW_MS - (Date.now() - startedAt)
  if (remaining <= 0) throw new Error('RPC verification expired; run again')
  const response = await fetch(`${url.replace(/\/$/, '')}${endpoint}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(Math.min(10_000, remaining)),
  })
  if (!response.ok)
    throw new Error('Optimizer service rejected this configuration')
  return (await response.json()) as T
}

/** RPC qualification and solver run are one server operation, bound to this exact selection. */
async function runWithXoxno(raw: XoxnoOptimizerRequest) {
  const startedAt = Date.now()
  try {
    const request = requestSchema.parse(raw)
    const rateLimit = await optimizerLimiter.limit(clientIp(await headers()))
    if (!rateLimit.success)
      throw new Error('Rate limit exceeded; retry shortly')
    if (
      new Set(request.markets.map((m) => m.productId)).size !==
      request.markets.length
    )
      throw new Error('Duplicate markets are not supported')
    const catalog: (SupplyProduct | BorrowProduct)[] =
      request.kind === 'supply'
        ? await loadSupplyProducts()
        : await loadBorrowProducts()
    const rows = request.markets.map((m) => {
      const product = catalog.find((p) => p.productId === m.productId)
      if (!product)
        throw new Error('A selected market is no longer in the catalogue')
      return product
    })
    if (new Set(rows.map((p) => p.assetSymbol)).size !== 1)
      throw new Error('Select markets for one asset')
    if (request.kind === 'borrow' && !request.collateralSymbol)
      throw new Error('Choose a collateral asset')
    const apyKey = HORIZON_CONFIG[request.horizon].apyKey
    const exclusions: string[] = []
    const rates = rows.map((row) => {
      const rate = row[apyKey]
      if (typeof rate !== 'number' || !Number.isFinite(rate)) {
        exclusions.push(`${row.poolName}: Selected horizon rate is unavailable`)
        return null
      }
      return rate
    })
    const selected: RpcSelection[] = []
    const shared = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.xoxno && row.protocol !== 'xoxno_v1') continue
      const meta = parseXoxnoMeta(row.xoxno)
      const selection = request.markets[i].selection
      if (
        !meta ||
        !selection ||
        meta.network !== 'mainnet' ||
        meta.controller !== XOXNO_MAINNET.controller ||
        meta.pool !== XOXNO_MAINNET.pool ||
        meta.asset !== row.assetAddress ||
        request.markets[i].productId !==
          xoxnoProductId({ ...meta, kind: request.kind })
      )
        throw new Error('Choose an explicit XOXNO spoke')
      const spoke = meta.spokes.find((s) => s.spokeId === selection.spokeId)
      if (!spoke) throw new Error('Selected XOXNO spoke is not listed')
      if (request.kind === 'borrow') {
        const collateral = spoke.collaterals.find(
          (c) =>
            c.hubId === selection.collateralHubId &&
            c.asset === selection.collateralAsset
        )
        if (
          !collateral ||
          (request.collateralSymbol &&
            collateral.symbol !== request.collateralSymbol)
        )
          throw new Error('Choose the exact collateral for each XOXNO market')
      } else if (
        selection.collateralAsset != null ||
        selection.collateralHubId != null
      )
        throw new Error('Supply selection cannot contain collateral')
      const sharedKey = `${meta.controller}:${meta.hubId}:${meta.asset}`
      if (shared.has(sharedKey))
        throw new Error('Select one spoke variant per shared hub')
      shared.add(sharedKey)
      if (rates[i] !== null)
        selected.push({
          productId: request.markets[i].productId,
          meta,
          selection,
        })
    }
    if (
      new Set(selected.map((s) => s.meta.asset)).size > 1 ||
      (request.kind === 'borrow' &&
        new Set(selected.map((s) => s.selection.collateralAsset)).size > 1)
    )
      throw new Error(
        'XOXNO markets must use the same exact loan and collateral assets'
      )
    if (selected.length === 0)
      throw new Error(exclusions.join('; ') || 'No XOXNO market selected')
    const snapshot = await readXoxnoSnapshot(selected, startedAt)
    const eligible: {
      row: SupplyProduct | BorrowProduct
      original: number
      rate: number
      verified?: (typeof snapshot.markets)[number]
      ltv?: number
      liquidity?: number
    }[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rate = rates[i]
      if (rate === null) continue
      const verified = snapshot.markets.find(
        (v) => v.productId === row.productId
      )
      try {
        if (!verified && (row.xoxno || row.protocol === 'xoxno_v1'))
          throw new Error('XOXNO market was not RPC-qualified')
        if (request.kind === 'supply') {
          if (verified) supplyPreflight(verified, request.amount)
          eligible.push({ row, original: i, rate, verified })
        } else {
          const requested = request.markets[i].recommendedLtv
          if (requested == null) throw new Error('Recommended LTV is missing')
          const collaterals = (row as BorrowProduct).collaterals.filter(
            (c) => c.symbol === request.collateralSymbol
          )
          if (!verified && collaterals.length === 0)
            throw new Error('Selected collateral is unavailable')
          const ltv = verified
            ? openingLtv(verified, requested)
            : Math.min(
                requested,
                ...collaterals.map((c) =>
                  Math.min(c.ltv ?? c.lltv ?? 0, c.lltv ?? c.ltv ?? 0)
                )
              )
          if (!Number.isFinite(ltv) || ltv <= 0 || ltv > 1)
            throw new Error('Opening LTV is unavailable')
          const liquidity = verified
            ? liquidityUsd(verified)
            : row.liquidityAmountUsd
          if (
            liquidity == null ||
            !Number.isFinite(liquidity) ||
            liquidity <= 0
          )
            throw new Error('Borrow capacity is unavailable')
          eligible.push({ row, original: i, rate, verified, ltv, liquidity })
        }
      } catch (error) {
        exclusions.push(
          `${row.poolName}: ${error instanceof Error ? error.message : 'Market unavailable'}`
        )
      }
    }
    if (eligible.length === 0)
      throw new Error(exclusions.join('; ') || 'No eligible markets')
    if (!eligible.some((e) => e.verified))
      throw new Error(
        exclusions.join('; ') || 'No RPC-qualified XOXNO markets remain'
      )
    assertFresh(snapshot)
    const byIndex = new Map(
      eligible.flatMap((e, i) => (e.verified ? [[i, e.verified] as const] : []))
    )
    const info = qualification(snapshot)
    if (request.kind === 'supply') {
      const response = await solve<VaultAllocationResponse>(
        '/optimize/vaults',
        {
          apy: eligible.map((e) => e.rate),
          diversification: request.diversification ?? 60,
        },
        startedAt
      )
      checkSupplyAllocations(
        response,
        snapshot,
        byIndex,
        request.amount,
        eligible.length
      )
      return {
        success: true as const,
        kind: 'supply' as const,
        response: {
          ...response,
          allocations: response.allocations.map((a) => ({
            ...a,
            vault_index: eligible[a.vault_index].original,
          })),
        },
        qualification: info,
        exclusions,
      }
    }
    const mode = request.mode ?? 'collateral_target'
    const usdAmount = requestUsd(snapshot, request.amount, mode)
    const maxLtvs = eligible.map((e) => e.ltv!)
    // Leave room for directed token/share rounding; exact checks still run after the solver.
    const marketData: MarketData = {
      max_ltv: maxLtvs.map((v) => v * (1 - 1e-8)),
      rates: eligible.map((e) => e.rate),
      liquidity: eligible.map((e) => e.liquidity!),
      price: 1,
    }
    const response = await solve<OptimizationResponse>(
      mode === 'collateral_target'
        ? '/optimize/borrow'
        : '/optimize/collateral',
      {
        [mode === 'collateral_target' ? 'collateral_amount' : 'borrow_amount']:
          usdAmount,
        omega: request.omega ?? 0,
        markets: marketData,
      },
      startedAt
    )
    checkBorrowAllocations(
      response,
      snapshot,
      byIndex,
      maxLtvs,
      eligible.length,
      usdAmount,
      mode,
      request.amount
    )
    return {
      success: true as const,
      kind: 'borrow' as const,
      response: {
        ...response,
        allocations: response.allocations.map((a) => ({
          ...a,
          market_index: eligible[a.market_index].original,
        })),
      },
      qualification: info,
      exclusions,
    }
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof z.ZodError
          ? 'Invalid optimizer request'
          : error instanceof Error
            ? error.message
            : 'XOXNO verification failed',
    }
  }
}

export async function optimizeWithXoxno(raw: XoxnoOptimizerRequest) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      runWithXoxno(raw),
      new Promise<{ success: false; error: string }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              success: false,
              error: 'RPC verification timed out; run again',
            }),
          VERIFICATION_WINDOW_MS
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
