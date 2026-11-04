import { describe, expect, it, vi } from 'vitest'

import { createXoxnoClient } from '../client'
import { XOXNO_MAINNET } from '../config'
import {
  createXoxnoPositionsAdapter,
  xoxnoBorrowPositions,
  xoxnoRiskResult,
  xoxnoSupplyPositions,
} from '../positions'
import { OWNER, json, positionAsset, positionFixture } from './fixtures'

describe('XOXNO positions', () => {
  it('preserves NFT/account/hub leg identity, raw precision, APY percent boundary', () => {
    const first = positionFixture()
    first.supplied.push(positionAsset({ hubId: 2, hubName: 'Hub 2' }))
    const second = positionFixture('9007199254740994')
    const supplies = [
      ...xoxnoSupplyPositions(OWNER, first, XOXNO_MAINNET.controller),
      ...xoxnoSupplyPositions(OWNER, second, XOXNO_MAINNET.controller),
    ]
    expect(new Set(supplies.map((p) => p.id)).size).toBe(3)
    expect(supplies[0].assetAmount).toBe('123456789123456789')
    expect(supplies[0].apy).toBe(2)
    expect(supplies[0].riskAccountId).toBe(supplies[1].riskAccountId)
    expect(supplies[0].riskAccountId).not.toBe(supplies[2].riskAccountId)
    expect(
      xoxnoBorrowPositions(OWNER, first, XOXNO_MAINNET.controller)[0]
    ).toMatchObject({
      loanAssetAmountRaw: '10000000',
      loanAssetAmount: 1,
      healthFactor: 0,
      apy: 10,
    })
  })

  it('retains missing balances and rates without inventing zero; price status suppresses USD', () => {
    const position = positionFixture('1', {
      supplied: [
        positionAsset({
          amountRaw: null,
          amount: null,
          decimals: null,
          apy: null,
          valueUsd: null,
        }),
      ],
      borrow: [
        positionAsset({
          priceStatus: {
            valid: false,
            stale: true,
            deviation: false,
            timestamp: null,
          },
        }),
      ],
      hasDebt: null,
      healthFactor: null,
    })
    expect(
      xoxnoSupplyPositions(OWNER, position, XOXNO_MAINNET.controller)[0]
    ).toMatchObject({
      assetAmount: null,
      assetDecimals: null,
      assetAmountUsd: null,
      apy: null,
    })
    expect(
      xoxnoBorrowPositions(OWNER, position, XOXNO_MAINNET.controller)[0]
    ).toMatchObject({ loanAssetAmountUsd: null, healthFactor: 0 })
    expect(
      xoxnoRiskResult(OWNER, position, XOXNO_MAINNET.controller).result
    ).toMatchObject({ status: 'unknown', reason: 'missing-risk-data' })
    expect(
      xoxnoRiskResult(
        OWNER,
        { ...position, hasDebt: false },
        XOXNO_MAINNET.controller
      ).result.status
    ).toBe('no-liability')
  })

  it('keeps protocol HF as indexed estimate, and uses oldest known leg timestamp', () => {
    const position = positionFixture()
    position.borrow[0].indexedAt += 10_000
    const result = xoxnoRiskResult(OWNER, position, XOXNO_MAINNET.controller)
    expect(result.result).toEqual({
      status: 'ok',
      healthFactor: 1.25,
      sourceLabel: 'XOXNO indexed estimate',
      observedAt: new Date(position.supplied[0].indexedAt).toISOString(),
    })
    expect(result.result).not.toHaveProperty('weightedCollateralUsd')
  })

  it('uses SDK pagination through an empty page and shares the in-flight read', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (!url.search) return json([], { Link: '<?cursor=next>; rel="next"' })
      return json([positionFixture(), positionFixture('2')])
    }) as unknown as typeof fetch
    const adapter = createXoxnoPositionsAdapter(
      createXoxnoClient({ fetch: fetcher })
    )
    const [supply, borrow, risk] = await Promise.all([
      adapter.getUserSupplyPositions({ addresses: [OWNER] }),
      adapter.getUserBorrowPositions({ addresses: [OWNER] }),
      adapter.getRiskAccountResults!({ addresses: [OWNER] }),
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect([supply.length, borrow.length, risk.length]).toEqual([2, 2, 2])
  })

  it('rejects wrong deployment and malformed positions, preserving upstream errors', async () => {
    const malformed = { ...positionFixture(), accountId: 1 }
    await expect(
      createXoxnoClient({
        fetch: (async () => json([malformed])) as typeof fetch,
      }).positions(OWNER)
    ).rejects.toThrow()
    const wrong = { ...positionFixture(), network: 'testnet' }
    await expect(
      createXoxnoClient({
        fetch: (async () => json([wrong])) as typeof fetch,
      }).positions(OWNER)
    ).rejects.toThrow('deployment mismatch')
    await expect(
      createXoxnoClient({
        fetch: (async () =>
          new Response('failure', { status: 503 })) as typeof fetch,
      }).positions(OWNER)
    ).rejects.toThrow('HTTP 503')
  })
})
