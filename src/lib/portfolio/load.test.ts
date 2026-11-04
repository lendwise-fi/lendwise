import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RiskAccount, RiskAccountResult } from '@/lib/risk/types'
import type { BorrowPosition, SupplyPosition } from '@/types'

import { type PortfolioDeps, type PositionsSource, loadPortfolio } from './load'
import type { WalletHolding } from './types'

const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const EVM = '0x52908400098527886E0F7030069857D2E4169EE7'
const wallets = [
  { address: EVM, chainFamily: 'evm' as const },
  { address: G, chainFamily: 'stellar' as const },
]

const supply = (id: string) => ({ id }) as SupplyPosition
const account = (id: string) => ({ id, reserves: [] }) as unknown as RiskAccount

function source<A extends string>(
  rows: SupplyPosition[],
  risk: RiskAccount[] = []
): PositionsSource<A> & { calls: A[][] } {
  const calls: A[][] = []
  return {
    calls,
    getUserSupplyPositions: async ({ addresses }) => {
      calls.push(addresses)
      return rows
    },
    getUserBorrowPositions: async () => [] as BorrowPosition[],
    getRiskAccounts: async () => risk,
  }
}

const failing = (message: string): PositionsSource<string> => ({
  getUserSupplyPositions: async () => {
    throw new Error(message)
  },
  getUserBorrowPositions: async () => {
    throw new Error(message)
  },
})

function deps(overrides: Partial<PortfolioDeps> = {}): PortfolioDeps {
  return {
    evmAdapters: { aave_v3: async () => source([supply('aave')]) },
    stellarAdapters: { 'blend_v2.1': async () => source([supply('blend')]) },
    stellarHoldings: async () => [],
    evmHoldings: async () => ({ holdings: [], failedNetworks: [] }),
    computeRisk: async (accounts) =>
      accounts.map((a) => ({
        id: a.id,
        protocol: 'p',
        poolId: 'x',
        user: 'u',
        result: { status: 'no-liability' },
      })),
    ...overrides,
  }
}

describe('loadPortfolio', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const held = (network: string, code: string): WalletHolding => ({
    chainFamily: network === 'stellar' ? 'stellar' : 'evm',
    network,
    owner: network === 'stellar' ? G : EVM,
    assetType: 'native',
    code,
    issuer: null,
    balance: 1,
    priceUsd: null,
    valueUsd: null,
  })

  it('merges EVM and Stellar wallet holdings', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        evmHoldings: async () => ({
          holdings: [held('linea', 'ETH')],
          failedNetworks: [],
        }),
        stellarHoldings: async () => [held('stellar', 'XLM')],
      })
    )
    expect(result.holdings.map((h) => h.code)).toEqual(['ETH', 'XLM'])
    expect(result.failures).toEqual([])
  })

  it('keeps EVM positions when the EVM wallet read fails', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        evmHoldings: async () => {
          throw new Error('catalogue down')
        },
      })
    )
    expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'evm',
        source: 'evm_wallet',
        message: 'Temporarily unavailable',
      },
    ])
  })

  it('reports each EVM chain that could not be read', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        evmHoldings: async () => ({
          holdings: [held('base', 'ETH')],
          failedNetworks: ['linea', 'monad'],
        }),
      })
    )
    expect(result.holdings.map((h) => h.network)).toEqual(['base'])
    expect(result.failures).toEqual([
      {
        chainFamily: 'evm',
        source: 'evm_wallet:linea',
        message: 'Temporarily unavailable',
      },
      {
        chainFamily: 'evm',
        source: 'evm_wallet:monad',
        message: 'Temporarily unavailable',
      },
    ])
  })

  it('times out a slow EVM wallet read without losing the positions', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        sourceTimeoutMs: 20,
        evmHoldings: () => new Promise(() => {}),
      })
    )
    expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'evm',
        source: 'evm_wallet',
        message: 'Temporarily unavailable',
      },
    ])
  })

  it('does not read EVM wallets without an EVM address', async () => {
    const evmHoldings = vi.fn(async () => ({
      holdings: [],
      failedNetworks: [],
    }))
    await loadPortfolio(
      [{ address: G, chainFamily: 'stellar' }],
      deps({ evmHoldings })
    )
    expect(evmHoldings).not.toHaveBeenCalled()
  })

  it('hands the routed EVM addresses to the EVM wallet read', async () => {
    const evmHoldings = vi.fn(async () => ({
      holdings: [],
      failedNetworks: [],
    }))
    await loadPortfolio(wallets, deps({ evmHoldings }))
    expect(evmHoldings).toHaveBeenCalledWith([EVM])
  })

  it('keeps EVM positions when the EVM wallet read throws synchronously', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        evmHoldings: () => {
          throw new Error('sync boom')
        },
      })
    )
    expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'evm',
        source: 'evm_wallet',
        message: 'Temporarily unavailable',
      },
    ])
  })

  it('keeps Stellar positions when the Stellar wallet read throws synchronously', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        stellarHoldings: () => {
          throw new Error('sync boom')
        },
      })
    )
    expect(result.positions.supply['blend_v2.1']).toEqual([supply('blend')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'stellar',
        source: 'stellar_wallet',
        message: 'Temporarily unavailable',
      },
    ])
  })

  it('reports both the EVM adapter and the EVM wallet read when both reject', async () => {
    const stellarHolding = { assetCode: 'XLM' } as unknown as WalletHolding
    const result = await loadPortfolio(
      wallets,
      deps({
        evmAdapters: { aave_v3: async () => failing('rpc down') },
        evmHoldings: async () => {
          throw new Error('catalogue down')
        },
        stellarHoldings: async () => [stellarHolding],
      })
    )
    expect(result.failures).toEqual([
      {
        chainFamily: 'evm',
        source: 'aave_v3',
        message: 'Temporarily unavailable',
      },
      {
        chainFamily: 'evm',
        source: 'evm_wallet',
        message: 'Temporarily unavailable',
      },
    ])
    expect(result.positions.supply['blend_v2.1']).toEqual([supply('blend')])
    expect(result.holdings).toEqual([stellarHolding])
  })

  it('keeps the EVM side and reports the Stellar adapter that failed', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        stellarAdapters: {
          'blend_v2.1': async () => failing('RPC unreachable'),
        },
      })
    )
    expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'stellar',
        source: 'blend_v2.1',
        message: 'Temporarily unavailable',
      },
    ])
  })

  it('reports Horizon failures under the wallet source', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        stellarHoldings: async () => {
          throw new Error('Horizon 503')
        },
      })
    )
    expect(result.positions.supply['blend_v2.1']).toEqual([supply('blend')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'stellar',
        source: 'stellar_wallet',
        message: 'Temporarily unavailable',
      },
    ])
  })

  it('hands each family only its own addresses', async () => {
    const evm = source<`0x${string}`>([])
    const stellar = source<string>([])
    await loadPortfolio(
      wallets,
      deps({
        evmAdapters: { aave_v3: async () => evm },
        stellarAdapters: { 'blend_v2.1': async () => stellar },
      })
    )
    expect(evm.calls).toEqual([[EVM]])
    expect(stellar.calls).toEqual([[G]])
  })

  it('computes risk on the accounts of both families', async () => {
    const computeRisk = vi.fn(async () => [])
    await loadPortfolio(
      wallets,
      deps({
        evmAdapters: { morpho_v1: async () => source([], [account('evm-1')]) },
        stellarAdapters: {
          'blend_v2.1': async () => source([], [account('xlm-1')]),
        },
        computeRisk,
      })
    )
    expect(computeRisk).toHaveBeenCalledWith([
      account('evm-1'),
      account('xlm-1'),
    ])
  })

  it('keeps reported isolated risk and never reprices the same account', async () => {
    const reported: RiskAccountResult[] = [1, 2].map((id) => ({
      id: `nft-${id}`,
      protocol: 'xoxno_v1',
      poolId: 'spoke',
      user: G,
      result: {
        status: 'ok',
        healthFactor: id,
        sourceLabel: 'XOXNO indexed estimate',
      },
    }))
    const computeRisk = vi.fn(async () => [])
    const result = await loadPortfolio(
      wallets,
      deps({
        stellarAdapters: {
          xoxno_v1: async () => ({
            ...source(
              [supply('xoxno')],
              [account('nft-1'), account('generic')]
            ),
            getRiskAccountResults: async () => reported,
          }),
        },
        computeRisk,
      })
    )
    expect(computeRisk).toHaveBeenCalledWith([account('generic')])
    expect(result.riskAccounts).toEqual(reported)
    expect(result.failures).toEqual([])
  })

  it('keeps positions and computed risk when the reported-risk read throws synchronously', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        stellarAdapters: {
          xoxno_v1: async () => ({
            ...source([supply('xoxno')], [account('generic')]),
            getRiskAccountResults: () => {
              throw new Error('unavailable')
            },
          }),
        },
      })
    )
    expect(result.positions.supply.xoxno_v1).toEqual([supply('xoxno')])
    expect(result.riskAccounts).toMatchObject([{ id: 'generic' }])
    expect(result.failures).toEqual([
      {
        chainFamily: 'stellar',
        source: 'xoxno_v1',
        message: 'Temporarily unavailable',
      },
    ])
  })

  it('keeps reported risk when generic risk computation fails', async () => {
    const reported: RiskAccountResult = {
      id: 'nft-1',
      protocol: 'xoxno_v1',
      poolId: 'spoke',
      user: G,
      result: { status: 'unknown', reason: 'missing-risk-data', symbols: [] },
    }
    const result = await loadPortfolio(
      wallets,
      deps({
        evmAdapters: { aave_v3: async () => source([], [account('generic')]) },
        stellarAdapters: {
          xoxno_v1: async () => ({
            ...source([supply('xoxno')]),
            getRiskAccountResults: async () => [reported],
          }),
        },
        computeRisk: async () => {
          throw new Error('prices unavailable')
        },
      })
    )
    expect(result.riskAccounts).toEqual([reported])
  })

  it('times out reported risk without dropping good positions', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        sourceTimeoutMs: 20,
        stellarAdapters: {
          xoxno_v1: async () => ({
            ...source([supply('xoxno')]),
            getRiskAccountResults: () =>
              new Promise<RiskAccountResult[]>(() => {}),
          }),
        },
      })
    )
    expect(result.positions.supply.xoxno_v1).toEqual([supply('xoxno')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'stellar',
        source: 'xoxno_v1',
        message: 'Temporarily unavailable',
      },
    ])
  })

  it('calls nothing without wallets', async () => {
    const stellarHoldings = vi.fn()
    const result = await loadPortfolio([], deps({ stellarHoldings }))
    expect(result).toEqual({
      positions: { supply: {}, borrow: {} },
      holdings: [],
      riskAccounts: [],
      failures: [],
    })
    expect(stellarHoldings).not.toHaveBeenCalled()
  })

  it('keeps positions when only the risk read fails', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        evmAdapters: {
          aave_v3: async () => ({
            ...source([supply('aave')]),
            getRiskAccounts: async () => {
              throw new Error('https://rpc.example/?key=secret')
            },
          }),
        },
      })
    )
    expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'evm',
        source: 'aave_v3',
        message: 'Temporarily unavailable',
      },
    ])
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('returns the portfolio without risk when computeRisk throws', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        evmAdapters: {
          aave_v3: async () => source([supply('aave')], [account('e')]),
        },
        computeRisk: async () => {
          throw new Error('boom')
        },
      })
    )
    expect(result.riskAccounts).toEqual([])
    expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
  })

  it('keeps the other EVM adapter when one rejects', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        evmAdapters: {
          aave_v3: async () => source([supply('aave')]),
          morpho_v1: async () => failing('boom'),
        },
      })
    )
    expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'evm',
        source: 'morpho_v1',
        message: 'Temporarily unavailable',
      },
    ])
  })

  describe('source time limit', () => {
    const never = () => new Promise<never>(() => {})

    it('fails a Stellar adapter that never resolves and keeps the rest', async () => {
      const result = await loadPortfolio(
        wallets,
        deps({
          sourceTimeoutMs: 20,
          stellarAdapters: { 'blend_v2.1': never },
        })
      )
      expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
      expect(result.failures).toEqual([
        {
          chainFamily: 'stellar',
          source: 'blend_v2.1',
          message: 'Temporarily unavailable',
        },
      ])
    })

    it('fails Stellar holdings that never resolve under the wallet source', async () => {
      const result = await loadPortfolio(
        wallets,
        deps({ sourceTimeoutMs: 20, stellarHoldings: never })
      )
      expect(result.positions.supply['blend_v2.1']).toEqual([supply('blend')])
      expect(result.failures).toEqual([
        {
          chainFamily: 'stellar',
          source: 'stellar_wallet',
          message: 'Temporarily unavailable',
        },
      ])
    })

    it('keeps positions when only the risk read is still pending', async () => {
      const result = await loadPortfolio(
        wallets,
        deps({
          sourceTimeoutMs: 20,
          evmAdapters: {
            aave_v3: async () => ({
              ...source([supply('aave')]),
              getRiskAccounts: never,
            }),
          },
        })
      )
      expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
      expect(result.failures).toEqual([
        {
          chainFamily: 'evm',
          source: 'aave_v3',
          message: 'Temporarily unavailable',
        },
      ])
    })
  })

  it('keeps RPC secrets out of the logs', async () => {
    vi.stubEnv('RPC_API_KEY', 'serverkey123')
    vi.stubEnv('RPC_API_KEY_SECRET', 'serversecret')
    const basic = Buffer.from(':serversecret').toString('base64')
    const httpError = Object.assign(new Error('Request failed'), {
      config: {
        url: 'https://stellar-mainnet.infura.io/v3/serverkey123',
        headers: { authorization: `Basic ${basic}` },
      },
    })
    await loadPortfolio(
      wallets,
      deps({
        stellarAdapters: {
          'blend_v2.1': async () => {
            throw httpError
          },
        },
        computeRisk: async () => {
          throw httpError
        },
        evmAdapters: { aave_v3: async () => source([], [account('a')]) },
      })
    )
    const logged = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((a) => inspect(a, { depth: 5 }))
      .join('\n')
    expect(logged).toContain('[portfolio]')
    expect(logged).not.toContain('serverkey123')
    expect(logged).not.toContain('serversecret')
    expect(logged).not.toContain(basic)
  })
})
