import { describe, expect, it } from 'vitest'

import type { WalletHolding } from '@/lib/portfolio/types'
import type { RiskAccountResult } from '@/lib/risk/types'
import type { BorrowPosition } from '@/types'

import {
  type WalletBalanceRow,
  attachRisk,
  failureLabel,
  networkName,
  orphanRiskRows,
  positionValueSummary,
  productHistoryRates,
  reportedHealthFactors,
  sortableHealth,
  topWalletSlices,
  walletBalanceBreakdown,
  walletBalanceRows,
} from './view'

const row = (p: Partial<BorrowPosition>) =>
  ({ healthFactor: 0, ...p }) as BorrowPosition
const ok = (id: string, hf: number): RiskAccountResult => ({
  id,
  protocol: 'p',
  poolId: 'x',
  user: 'u',
  result: {
    status: 'ok',
    healthFactor: hf,
    weightedCollateralUsd: hf,
    weightedLiabilityUsd: 1,
  },
})

describe('portfolio view helpers', () => {
  it('attaches the module result by risk account id', () => {
    const rows = attachRisk(
      [row({ riskAccountId: 'a' }), row({ healthFactor: 1.4 })],
      [ok('a', 2)]
    )
    expect(rows[0].risk).toMatchObject({ status: 'ok', healthFactor: 2 })
    expect(rows[1].risk).toBeUndefined()
  })

  it('marks a row with a risk account id but no result as unknown, never the placeholder', () => {
    const rows = attachRisk([row({ riskAccountId: 'b' })], [ok('a', 2)])
    expect(rows[0].risk).toEqual({
      status: 'unknown',
      reason: 'missing-price',
      symbols: [],
    })
    expect(attachRisk([row({ riskAccountId: 'b' })], [])[0].risk?.status).toBe(
      'unknown'
    )
  })

  it('collects protocol-reported values only for rows without a risk account id', () => {
    const rows = attachRisk(
      [
        row({ riskAccountId: 'a', healthFactor: 9 }),
        row({ riskAccountId: 'missing', healthFactor: 0 }),
        row({ healthFactor: 1.4 }),
      ],
      [ok('a', 2)]
    )
    expect(reportedHealthFactors(rows)).toEqual([1.4])
  })

  it('sorts unknown first and no-liability last', () => {
    expect(
      sortableHealth({
        ...row({}),
        risk: { status: 'unknown', reason: 'missing-price', symbols: [] },
      })
    ).toBe(-1)
    expect(
      sortableHealth({ ...row({}), risk: { status: 'no-liability' } })
    ).toBe(Number.POSITIVE_INFINITY)
    expect(sortableHealth(row({ healthFactor: 1.2 }))).toBe(1.2)
  })

  it('labels failures for the banner', () => {
    expect(
      failureLabel({
        chainFamily: 'stellar',
        source: 'stellar_wallet',
        message: '',
      })
    ).toBe('Stellar wallet')
    expect(
      failureLabel({
        chainFamily: 'stellar',
        source: 'blend_v2.1',
        message: '',
      })
    ).toBe('Stellar · Blend v2.1')
    expect(
      failureLabel({ chainFamily: 'evm', source: 'evm', message: '' })
    ).toBe('EVM')
    expect(
      failureLabel({ chainFamily: 'evm', source: 'evm_wallet', message: '' })
    ).toBe('EVM wallet')
    expect(
      failureLabel({
        chainFamily: 'evm',
        source: 'evm_wallet:linea',
        message: '',
      })
    ).toBe('EVM wallet · Linea')
    expect(
      failureLabel({
        chainFamily: 'evm',
        source: 'evm_wallet:unknown-net',
        message: '',
      })
    ).toBe('EVM wallet · Unknown-net')
  })

  it('counts distinct risk accounts that have no result', () => {
    const rows = [
      row({ riskAccountId: 'a' }),
      row({ riskAccountId: 'a' }),
      row({ riskAccountId: 'b' }),
      row({ riskAccountId: 'c' }),
      row({}),
    ]
    expect(orphanRiskRows(rows, [ok('c', 2)])).toBe(2)
    expect(orphanRiskRows(rows, [ok('a', 2), ok('b', 2), ok('c', 2)])).toBe(0)
  })
})

describe('walletBalanceRows', () => {
  const holding = (h: Partial<WalletHolding>): WalletHolding => ({
    chainFamily: 'stellar',
    network: 'stellar',
    owner: 'GOWNER',
    assetType: 'credit',
    code: 'USDC',
    issuer: 'GISSUER',
    balance: 1,
    priceUsd: 1,
    valueUsd: 1,
    ...h,
  })

  it('maps holdings to stellar rows', () => {
    const rows = walletBalanceRows([
      holding({
        code: 'USDC',
        issuer: 'GISSUER',
        balance: 12.5,
        valueUsd: 12.5,
      }),
    ])
    expect(rows).toEqual([
      {
        id: 'stellar:GOWNER:USDC:GISSUER',
        network: 'stellar',
        userAddress: 'GOWNER',
        assetCode: 'USDC',
        issuer: 'GISSUER',
        balance: 12.5,
        valueUsd: 12.5,
      },
    ])
  })

  it('uses a native id and null issuer for XLM', () => {
    const [r] = walletBalanceRows([
      holding({ assetType: 'native', code: 'XLM', issuer: null }),
    ])
    expect(r.id).toBe('stellar:GOWNER:XLM:native')
    expect(r.issuer).toBeNull()
  })

  it('sorts by value desc, unpriced last, then by code', () => {
    const rows = walletBalanceRows([
      holding({ code: 'ZZZ', issuer: 'A', valueUsd: null, priceUsd: null }),
      holding({ code: 'AAA', issuer: 'B', valueUsd: null, priceUsd: null }),
      holding({ code: 'LOW', issuer: 'C', valueUsd: 1 }),
      holding({ code: 'HIGH', issuer: 'D', valueUsd: 50 }),
    ])
    expect(rows.map((r) => r.assetCode)).toEqual(['HIGH', 'LOW', 'AAA', 'ZZZ'])
  })

  it('takes the network of the holding', () => {
    const [r] = walletBalanceRows([
      holding({
        chainFamily: 'evm',
        network: 'linea',
        owner: '0xabc',
        assetType: 'erc20',
        code: 'USDC',
        issuer: '0x176211869ca2b568f2a7d4ee941e073a821ee1ff',
      }),
    ])
    expect(r.network).toBe('linea')
    expect(r.id).toBe(
      'linea:0xabc:USDC:0x176211869ca2b568f2a7d4ee941e073a821ee1ff'
    )
    expect(r.issuer).toBe('0x176211869ca2b568f2a7d4ee941e073a821ee1ff')
  })

  it('keeps the same native asset on two chains as two rows', () => {
    const native = {
      chainFamily: 'evm' as const,
      owner: '0xabc',
      assetType: 'native' as const,
      code: 'ETH',
      issuer: null,
    }
    const rows = walletBalanceRows([
      holding({ ...native, network: 'ethereum' }),
      holding({ ...native, network: 'base' }),
    ])
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
  })

  it('keeps ids unique for the same code with different issuers', () => {
    const rows = walletBalanceRows([
      holding({ issuer: 'G1' }),
      holding({ issuer: 'G2' }),
    ])
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
  })
})

describe('networkName', () => {
  it('uses the registry name, else the capitalized slug', () => {
    expect(networkName('linea')).toBe('Linea')
    expect(networkName('stellar')).toBe('Stellar')
    expect(networkName('somechain')).toBe('Somechain')
  })
})

describe('walletBalanceBreakdown', () => {
  const r = (
    network: string,
    valueUsd: number | null,
    id = `${network}:${valueUsd}`
  ): WalletBalanceRow => ({
    id,
    network,
    userAddress: 'GOWNER',
    assetCode: 'X',
    issuer: null,
    balance: 1,
    valueUsd,
  })

  it('groups priced rows by network with shares summing to 100', () => {
    const b = walletBalanceBreakdown([
      r('stellar', 30, 'a'),
      r('base', 60, 'b'),
      r('stellar', 10, 'c'),
    ])
    expect(b.totalUsd).toBe(100)
    expect(b.slices).toEqual([
      { network: 'base', valueUsd: 60, share: 60 },
      { network: 'stellar', valueUsd: 40, share: 40 },
    ])
    expect(b.slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(100)
  })

  it('excludes unpriced rows from shares but counts them', () => {
    const b = walletBalanceBreakdown([
      r('stellar', 50, 'a'),
      r('base', null, 'b'),
      r('stellar', null, 'c'),
    ])
    expect(b.priced).toBe(1)
    expect(b.unpriced).toBe(2)
    expect(b.totalUsd).toBe(50)
    expect(b.slices).toEqual([{ network: 'stellar', valueUsd: 50, share: 100 }])
  })

  it('has a null total and no slices when nothing is priced', () => {
    expect(
      walletBalanceBreakdown([r('stellar', null, 'a'), r('base', null, 'b')])
    ).toEqual({ totalUsd: null, priced: 0, unpriced: 2, slices: [] })
  })

  it('handles empty input', () => {
    expect(walletBalanceBreakdown([])).toEqual({
      totalUsd: null,
      priced: 0,
      unpriced: 0,
      slices: [],
    })
  })
})

describe('topWalletSlices', () => {
  const slice = (n: number) => ({
    network: `n${n}`,
    valueUsd: 100 - n,
    share: 10 - n,
  })

  it('folds the tail into one other slice', () => {
    const slices = [1, 2, 3, 4, 5, 6, 7, 8].map(slice)
    const top = topWalletSlices(slices)
    expect(top).toHaveLength(6)
    expect(top.slice(0, 5)).toEqual(slices.slice(0, 5))
    expect(top[5]).toEqual({
      network: 'other',
      valueUsd: slices.slice(5).reduce((a, s) => a + s.valueUsd, 0),
      share: slices.slice(5).reduce((a, s) => a + s.share, 0),
    })
  })

  it('leaves max or fewer slices unchanged', () => {
    const three = [1, 2, 3].map(slice)
    expect(topWalletSlices(three)).toEqual(three)
    const six = [1, 2, 3, 4, 5, 6].map(slice)
    expect(topWalletSlices(six)).toEqual(six)
  })
})

describe('positionValueSummary', () => {
  it('sums known values and counts unknown valuations', () => {
    expect(positionValueSummary([15, null, 0])).toEqual({
      value: 15,
      positions: 3,
      unpriced: 1,
    })
    expect(positionValueSummary([null, null])).toEqual({
      value: null,
      positions: 2,
      unpriced: 2,
    })
    expect(positionValueSummary([0])).toEqual({
      value: 0,
      positions: 1,
      unpriced: 0,
    })
    expect(positionValueSummary([])).toEqual({
      value: 0,
      positions: 0,
      unpriced: 0,
    })
  })
  it('does not price non-finite values', () => {
    expect(positionValueSummary([Infinity, NaN])).toEqual({
      value: null,
      positions: 2,
      unpriced: 2,
    })
  })
})

describe('productHistoryRates', () => {
  it('keeps fractional rates and drops missing observations', () => {
    expect(
      productHistoryRates([
        { timestamp: 1, net: 0.04 },
        { timestamp: 2, net: null },
        { timestamp: 3, net: 0 },
        { timestamp: 4, net: NaN },
      ])
    ).toEqual([
      { timestamp: 1, rate: 0.04 },
      { timestamp: 3, rate: 0 },
    ])
  })
})
