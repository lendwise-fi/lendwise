import { PGlite } from '@electric-sql/pglite'
import { PgDialect } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/pglite'
import { readFile } from 'node:fs/promises'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import * as schema from '@/lib/db/schema'
import type { SpotPayload } from '@/lib/db/types'

const state = vi.hoisted(() => ({ db: undefined as unknown }))
vi.mock('@/lib/db/postgres', () => ({
  db: new Proxy({}, { get: (_, key) => Reflect.get(state.db as object, key) }),
}))

const {
  aggregateDaily,
  backfillDailyRows,
  latestForTable,
  queryApy,
  upsertHourlySlots,
} = await import('@/lib/db/repositories/apy')
const { writeHealed } = await import('@/lib/db/repositories/gaps')

let pg: PGlite
const day = new Date('2026-10-01T00:00:00Z')
const hour = new Date('2026-10-01T12:00:00Z')
const page = { first: 100, skip: 0, orderBy: 'time', orderDir: 'asc' } as const
const product = (id: string) => ({
  id,
  kind: 'supply',
  provider: 'xoxno',
  productType: 'pool',
  version: 'v1',
  protocolName: 'XOXNO',
  chainId: -1,
  chainName: 'stellar',
  assetSymbol: 'USDC',
  assetName: 'USD Coin',
  assetAddress: 'CUSD',
  assetDecimals: 7,
  protocolAddress: 'CPOOL',
  meta: {},
  createdAt: day,
  updatedAt: day,
})
const payload = (
  cash: number | null,
  base: number | null = null
): SpotPayload => ({
  productId: 'p',
  kind: 'supply',
  protocol: 'xoxno',
  chainId: -1,
  asset: 'USDC',
  apy: {
    base,
    fees: base === null ? null : 0,
    rewards: 0,
    net: 0.05,
    rewardItems: [],
  },
  market: {
    supplyAssets: 1000,
    supplyAssetsUsd: 1000,
    utilizationRate: 0.9,
    assetPriceUsd: 1,
    availableLiquidity: cash,
    availableLiquidityUsd: cash,
  },
})

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(await readFile('drizzle/0000_lowly_mindworm.sql', 'utf8'))
  await pg.exec(await readFile('drizzle/0003_bright_lifeguard.sql', 'utf8'))
  await pg.exec(`INSERT INTO apy_hourly
    (product_id,hour,apy_base,apy_rewards,apy_fees,apy_net,quality_count,quality_first_slot,quality_last_slot,quality_status,
     supply_assets,supply_assets_usd,utilization_rate,last_supply_assets,last_supply_assets_usd,last_utilization_rate)
    VALUES ('legacy',now(),0,0,0,0,1,now(),now(),'building',1000,2000,0.8,2000,4000,0.5)`)
  await pg.exec(
    await readFile('drizzle/0006_explicit_available_liquidity.sql', 'utf8')
  )
  const legacy = (
    await pg.query(
      'SELECT available_liquidity,available_liquidity_usd,last_available_liquidity,last_available_liquidity_usd FROM apy_hourly'
    )
  ).rows[0]
  expect(legacy).toEqual({
    available_liquidity: 200,
    available_liquidity_usd: 400,
    last_available_liquidity: 1000,
    last_available_liquidity_usd: 2000,
  })
  const client = drizzle(pg, { schema })
  const dialect = new PgDialect()
  state.db = new Proxy(client, {
    get: (target, key) =>
      key === 'execute'
        ? async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
            const { sql, params } = dialect.sqlToQuery(query)
            const result = await pg.query(sql, params)
            return { rows: result.rows, rowCount: result.affectedRows }
          }
        : typeof Reflect.get(target, key) === 'function'
          ? Reflect.get(target, key).bind(target)
          : Reflect.get(target, key),
  })
}, 30_000)

beforeEach(async () => {
  await pg.exec('TRUNCATE apy_hourly, apy_daily, products')
  await drizzle(pg).insert(schema.products).values(product('p'))
})
afterAll(async () => {
  await pg?.close()
})

describe('persisted explicit cash and incomplete APY', () => {
  it('keeps actual cash, overwrites last cash with unknown, and preserves unknown component aggregates', async () => {
    await upsertHourlySlots([payload(750, 0.05)], hour, hour)
    await upsertHourlySlots([payload(null)], hour, new Date(+hour + 600_000))
    const row = (await pg.query('SELECT * FROM apy_hourly')).rows[0]
    expect(row).toMatchObject({
      apy_base: null,
      apy_fees: null,
      apy_net: 0.05,
      available_liquidity: null,
      available_liquidity_usd: null,
      last_available_liquidity: null,
      last_available_liquidity_usd: null,
    })
    await upsertHourlySlots(
      [payload(500, 0.05)],
      new Date(+hour + 3600_000),
      new Date(+hour + 3600_000)
    )
    await aggregateDaily(day, new Date(+day + 86400_000), day)
    expect((await pg.query('SELECT * FROM apy_daily')).rows[0]).toMatchObject({
      apy_base: null,
      apy_fees: null,
      apy_net: 0.05,
      available_liquidity_usd: null,
    })
    const result = await queryApy('hourly', { kind: 'supply', from: day }, page)
    expect(result.rows).toHaveLength(2)
  })

  it('reads stored last cash and retains active catalogue products without observations', async () => {
    const now = new Date()
    await upsertHourlySlots([payload(750)], now, now)
    await drizzle(pg)
      .insert(schema.products)
      .values([
        product('never-observed'),
        { ...product('inactive'), active: false },
      ])
    const rows = await latestForTable('supply')
    expect(rows.map((r) => r.product.id).sort()).toEqual([
      'never-observed',
      'p',
    ])
    expect(rows.find((r) => r.product.id === 'p')).toMatchObject({
      apyNet: 0.05,
      availableLiquidityUsd: 750,
    })
    expect(rows.find((r) => r.product.id === 'never-observed')).toMatchObject({
      hour: null,
      apyNet: null,
      apyRewards: null,
      availableLiquidityUsd: null,
    })
  })

  it('threads daily backfill and healed rows without deriving explicit null cash', async () => {
    await backfillDailyRows(
      [
        {
          productId: 'p',
          date: day,
          apy: payload(null).apy,
          market: payload(null).market,
        },
      ],
      day
    )
    expect(
      (await pg.query('SELECT available_liquidity_usd FROM apy_daily')).rows[0]
    ).toEqual({ available_liquidity_usd: null })
    await writeHealed([
      {
        productId: 'p',
        hour,
        apy: payload(750).apy,
        market: {
          supplyAssets: 1000,
          supplyAssetsUsd: 1000,
          utilizationRate: 0.9,
          availableLiquidity: 750,
          availableLiquidityUsd: 750,
        },
        source: 'refetch',
        healedFrom: 'source',
        gapKind: 'missing',
      },
    ])
    expect(
      (
        await pg.query(
          'SELECT available_liquidity_usd,last_available_liquidity_usd FROM apy_hourly'
        )
      ).rows[0]
    ).toEqual({
      available_liquidity_usd: 750,
      last_available_liquidity_usd: 750,
    })
  })
})
