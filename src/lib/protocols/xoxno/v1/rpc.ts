import 'server-only'

import {
  Account,
  Address,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'

import { serverRpc } from '@/config/rpc.server'
import { STELLAR_NETWORKS } from '@/config/stellar-network'
import { createPacedQueue } from '@/lib/net/paced-queue'
import { dedupeInFlight } from '@/lib/protocols/core/toolkit/inflight'

import { I128_MAX, RAY, type RawListing, type RawMarket } from './capacity'
import { XOXNO_MAINNET } from './config'
import type { XoxnoMeta, XoxnoSelection } from './types'

const queue = createPacedQueue({ minIntervalMs: 250, maxPending: 64 })
export const VERIFICATION_WINDOW_MS = 30_000
const SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

export interface VerifiedAsset {
  key: string
  hubId: number
  asset: string
  market: RawMarket
  listing: RawListing
}
export interface VerifiedMarket {
  productId: string
  spokeId: number
  debt: VerifiedAsset
  collateral?: VerifiedAsset
}
export interface RpcSnapshot {
  startedAt: number
  observedAt: string
  minLedger: number
  maxLedger: number
  minCollateralUsd: bigint
  markets: VerifiedMarket[]
}
export interface RpcSelection {
  productId: string
  meta: XoxnoMeta
  selection: XoxnoSelection
}

function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('Incomplete RPC response')
  return v as Record<string, unknown>
}
function integer(v: unknown, positive = false): bigint {
  if (
    typeof v !== 'bigint' &&
    !(typeof v === 'number' && Number.isSafeInteger(v)) &&
    !(typeof v === 'string' && /^\d+$/.test(v))
  )
    throw new Error('Invalid RPC integer')
  const n = BigInt(v)
  if (n < 0n || n > I128_MAX || (positive && n === 0n))
    throw new Error('Invalid RPC integer')
  return n
}
function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new Error('Incomplete RPC flags')
  return v
}
function u32(v: unknown): number {
  const n = integer(v)
  if (n > 0xffffffffn) throw new Error('Invalid RPC identifier')
  return Number(n)
}
function hubKey(hubId: number, asset: string) {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('asset'),
      val: new Address(asset).toScVal(),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('hub_id'),
      val: xdr.ScVal.scvU32(hubId),
    }),
  ])
}

function withinWindow(startedAt: number) {
  if (Date.now() - startedAt >= VERIFICATION_WINDOW_MS)
    throw new Error('RPC verification expired; run again')
}

const snapshotOnce = dedupeInFlight<[RpcSelection[], number], RpcSnapshot>(
  (selections: RpcSelection[]) =>
    JSON.stringify(
      selections.map(({ productId, meta, selection }) => [
        meta.network,
        meta.controller,
        meta.pool,
        productId,
        meta.hubId,
        meta.asset,
        selection.spokeId,
        selection.collateralHubId,
        selection.collateralAsset,
      ])
    ),
  readSnapshot
)

/** No caller-supplied RPC URL or contract address reaches this transport. */
export async function readXoxnoSnapshot(
  selections: RpcSelection[],
  startedAt = Date.now()
): Promise<RpcSnapshot> {
  if (selections.length === 0 || selections.length > 6)
    throw new Error('Select between one and six XOXNO markets')
  if (
    selections.some(
      (s) =>
        s.meta.controller !== XOXNO_MAINNET.controller ||
        s.meta.pool !== XOXNO_MAINNET.pool ||
        s.meta.network !== 'mainnet'
    )
  )
    throw new Error('Unsupported XOXNO deployment')
  withinWindow(startedAt)
  const snapshot = await snapshotOnce(selections, startedAt)
  withinWindow(Math.min(startedAt, snapshot.startedAt))
  return snapshot
}

async function readSnapshot(
  selections: RpcSelection[],
  startedAt: number
): Promise<RpcSnapshot> {
  const config = serverRpc('stellar')
  const url = config?.url ?? STELLAR_NETWORKS.mainnet.publicSorobanRpcUrl
  const headers = config?.headers ?? {}
  let minLedger = Number.MAX_SAFE_INTEGER
  let maxLedger = 0
  let sequence = 0
  const request = async (method: string, params: unknown) =>
    queue.run(async () => {
      withinWindow(startedAt)
      const response = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++sequence,
          method,
          params,
        }),
        signal: AbortSignal.timeout(
          Math.min(5_000, VERIFICATION_WINDOW_MS - (Date.now() - startedAt))
        ),
      })
      if (!response.ok) throw new Error('XOXNO RPC unavailable; run again')
      const body = object(await response.json())
      if (body.error) throw new Error('XOXNO RPC rejected verification')
      const result = object(body.result)
      const ledger = u32(result.latestLedger)
      if (ledger === 0) throw new Error('RPC ledger is missing')
      minLedger = Math.min(minLedger, ledger)
      maxLedger = Math.max(maxLedger, ledger)
      withinWindow(startedAt)
      if (maxLedger - minLedger > 6)
        throw new Error('RPC ledger window is too wide; run again')
      return result
    })
  const read = async (
    contract: string,
    method: string,
    args: xdr.ScVal[] = []
  ) => {
    const tx = new TransactionBuilder(new Account(SOURCE, '0'), {
      fee: '100',
      networkPassphrase: STELLAR_NETWORKS.mainnet.passphrase,
    })
      .addOperation(new Contract(contract).call(method, ...args))
      .setTimeout(30)
      .build()
    const result = await request('simulateTransaction', {
      transaction: tx.toXDR(),
    })
    const results = result.results
    if (result.error || !Array.isArray(results) || results.length !== 1)
      throw new Error(`RPC cannot verify ${method}`)
    const encoded = object(results[0]).xdr
    if (typeof encoded !== 'string') throw new Error(`RPC missing ${method}`)
    return scValToNative(xdr.ScVal.fromXDR(encoded, 'base64')) as unknown
  }
  const hubActive = async (controller: string, hubId: number) => {
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(controller).toScAddress(),
        key: xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol('Hub'),
          xdr.ScVal.scvU32(hubId),
        ]),
        durability: xdr.ContractDataDurability.persistent(),
      })
    )
    const result = await request('getLedgerEntries', {
      keys: [key.toXDR('base64')],
    })
    if (!Array.isArray(result.entries) || result.entries.length !== 1)
      throw new Error('Hub activity could not be verified')
    const entry = object(result.entries[0])
    if (typeof entry.xdr !== 'string')
      throw new Error('Hub activity could not be verified')
    const value = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64')
      .contractData()
      .val()
    if (!bool(object(scValToNative(value)).is_active))
      throw new Error('Selected hub is inactive')
  }
  const controller = XOXNO_MAINNET.controller
  const pool = String(await read(controller, 'get_pool_address'))
  if (
    selections.some(
      (s) =>
        s.meta.controller !== controller ||
        s.meta.pool !== pool ||
        s.meta.network !== 'mainnet'
    )
  )
    throw new Error('XOXNO deployment identity changed')
  const floor = integer(await read(controller, 'get_min_borrow_collateral_usd'))
  // Position limits are persisted protocol configuration, including zero (closed).
  const instanceKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(controller).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  )
  const instanceResult = await request('getLedgerEntries', {
    keys: [instanceKey.toXDR('base64')],
  })
  if (
    !Array.isArray(instanceResult.entries) ||
    instanceResult.entries.length !== 1
  )
    throw new Error('Controller configuration is missing')
  const encodedInstance = object(instanceResult.entries[0]).xdr
  if (typeof encodedInstance !== 'string')
    throw new Error('Controller configuration is missing')
  const instanceStorage = xdr.LedgerEntryData.fromXDR(encodedInstance, 'base64')
    .contractData()
    .val()
    .instance()
    .storage()
  const pausedEntry = instanceStorage?.find((entry) => {
    const key = scValToNative(entry.key()) as unknown
    return Array.isArray(key) && key.length === 1 && key[0] === 'Paused'
  })
  if (pausedEntry && bool(scValToNative(pausedEntry.val())))
    throw new Error('XOXNO controller is paused')
  const limitsEntry = instanceStorage?.find((entry) => {
    const key = scValToNative(entry.key()) as unknown
    return Array.isArray(key) && key.length === 1 && key[0] === 'PositionLimits'
  })
  if (!limitsEntry) throw new Error('Position limits are missing')
  const limits = object(scValToNative(limitsEntry.val()))
  if (
    u32(limits.max_supply_positions) === 0 ||
    (selections.some((s) => s.selection.collateralAsset) &&
      u32(limits.max_borrow_positions) === 0)
  )
    throw new Error('New positions are disabled')
  const assetInputs = new Map<string, { hubId: number; asset: string }>()
  for (const { meta, selection } of selections) {
    assetInputs.set(`${meta.hubId}:${meta.asset}`, {
      hubId: meta.hubId,
      asset: meta.asset,
    })
    if (selection.collateralAsset != null && selection.collateralHubId != null)
      assetInputs.set(
        `${selection.collateralHubId}:${selection.collateralAsset}`,
        { hubId: selection.collateralHubId, asset: selection.collateralAsset }
      )
  }
  const assets = [...assetInputs.values()]
  const indexes = await read(controller, 'get_market_indexes_detailed', [
    xdr.ScVal.scvVec(assets.map((a) => hubKey(a.hubId, a.asset))),
  ])
  if (!Array.isArray(indexes) || indexes.length !== assets.length)
    throw new Error('RPC indexes are incomplete')
  const markets = new Map<string, RawMarket>()
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i]
    await hubActive(controller, a.hubId)
    const index = object(indexes[i])
    if (
      index.asset !== a.asset ||
      !bool(index.valid) ||
      bool(index.stale) ||
      bool(index.deviation) ||
      index.error_code != null
    )
      throw new Error('Oracle price is unavailable or unsafe')
    const data = object(
      await read(pool, 'get_sync_data', [hubKey(a.hubId, a.asset)])
    )
    const params = object(data.params)
    const state = object(data.state)
    if (params.asset_id !== a.asset)
      throw new Error('Pool asset identity mismatch')
    const m: RawMarket = {
      decimals: u32(params.asset_decimals),
      cash: integer(state.cash),
      supplied: integer(state.supplied),
      borrowed: integer(state.borrowed),
      storedSupplyIndex: integer(state.supply_index, true),
      storedBorrowIndex: integer(state.borrow_index, true),
      supplyIndex: integer(index.supply_index, true),
      borrowIndex: integer(index.borrow_index, true),
      maxUtilization: integer(params.max_utilization, true),
      price: integer(index.price_wad, true),
    }
    if (
      m.decimals > 18 ||
      m.maxUtilization > RAY ||
      m.supplyIndex < m.storedSupplyIndex ||
      m.borrowIndex < m.storedBorrowIndex
    )
      throw new Error('RPC market state is inconsistent')
    markets.set(`${a.hubId}:${a.asset}`, m)
  }
  const listingCache = new Map<string, VerifiedAsset>()
  const listing = async (
    spokeId: number,
    hubId: number,
    asset: string
  ): Promise<VerifiedAsset> => {
    const key = `${spokeId}:${hubId}:${asset}`
    const cached = listingCache.get(key)
    if (cached) return cached
    const config = object(
      await read(controller, 'get_spoke_asset', [
        nativeToScVal(spokeId, { type: 'u32' }),
        hubKey(hubId, asset),
      ])
    )
    const usage = object(
      await read(controller, 'get_spoke_usage', [
        nativeToScVal(spokeId, { type: 'u32' }),
        hubKey(hubId, asset),
      ])
    )
    const l: RawListing = {
      supplied: integer(usage.supplied_scaled_ray),
      borrowed: integer(usage.borrowed_scaled_ray),
      supplyCap: integer(config.supply_cap),
      borrowCap: integer(config.borrow_cap),
      ltv: u32(config.loan_to_value),
      threshold: u32(config.liquidation_threshold),
      collateral: bool(config.is_collateralizable),
      borrowable: bool(config.is_borrowable),
      paused: bool(config.paused),
      frozen: bool(config.frozen),
    }
    if (l.ltv > 10_000 || l.threshold > 10_000 || l.paused || l.frozen)
      throw new Error('Selected listing is halted or invalid')
    const market = markets.get(`${hubId}:${asset}`)
    if (!market) throw new Error('RPC market is missing')
    const value = { key, hubId, asset, market, listing: l }
    listingCache.set(key, value)
    return value
  }
  const verified: VerifiedMarket[] = []
  const spokeCache = new Set<number>()
  for (const { productId, meta, selection } of selections) {
    if (!spokeCache.has(selection.spokeId)) {
      const spoke = object(
        await read(controller, 'get_spoke', [
          nativeToScVal(selection.spokeId, { type: 'u32' }),
        ])
      )
      if (bool(spoke.is_deprecated))
        throw new Error('Selected spoke is deprecated')
      spokeCache.add(selection.spokeId)
    }
    verified.push({
      productId,
      spokeId: selection.spokeId,
      debt: await listing(selection.spokeId, meta.hubId, meta.asset),
      collateral:
        selection.collateralHubId != null && selection.collateralAsset != null
          ? await listing(
              selection.spokeId,
              selection.collateralHubId,
              selection.collateralAsset
            )
          : undefined,
    })
  }
  withinWindow(startedAt)
  return {
    startedAt,
    observedAt: new Date(startedAt).toISOString(),
    minLedger,
    maxLedger,
    minCollateralUsd: floor,
    markets: verified,
  }
}
