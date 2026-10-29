import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RiskAccount } from '@/lib/risk/types'
import type { BorrowPosition, SupplyPosition } from '@/types'

import { type PortfolioDeps, type PositionsSource, loadPortfolio } from './load'
import type { WalletHolding } from './types'

const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const EVM = '0x52908400098527886E0F7030069857D2E4169EE7'
const SOL = 'AKjdwZT5d1S9YA6NPYyBZ5jAUAXYVJaYAVCd38hJiKS4'
const wallets = [
  { address: EVM, chainFamily: 'evm' as const },
  { address: G, chainFamily: 'stellar' as const },
]
const allWallets = [
  ...wallets,
  { address: SOL, chainFamily: 'solana' as const },
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
    solanaAdapters: { kamino_v1: async () => source([supply('kamino')]) },
    stellarHoldings: async () => [],
    solanaHoldings: async () => [],
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

  describe('Solana', () => {
    const solHolding = (code: string): WalletHolding => ({
      chainFamily: 'solana',
      network: 'solana',
      owner: SOL,
      assetType: code === 'SOL' ? 'native' : 'spl',
      code,
      issuer: null,
      balance: 1,
      priceUsd: null,
      valueUsd: null,
    })

    it('loads Kamino positions and Solana balances beside EVM and Stellar', async () => {
      const result = await loadPortfolio(
        allWallets,
        deps({ solanaHoldings: async () => [solHolding('SOL')] })
      )
      expect(result.positions.supply.kamino_v1).toEqual([supply('kamino')])
      expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
      expect(result.positions.supply['blend_v2.1']).toEqual([supply('blend')])
      expect(result.holdings.map((h) => h.code)).toEqual(['SOL'])
      expect(result.failures).toEqual([])
    })

    it('hands Solana sources the base58 addresses only, case kept', async () => {
      const kamino = source<string>([])
      const solanaHoldings = vi.fn(async () => [])
      await loadPortfolio(
        allWallets,
        deps({
          solanaAdapters: { kamino_v1: async () => kamino },
          solanaHoldings,
        })
      )
      expect(kamino.calls).toEqual([[SOL]])
      expect(solanaHoldings).toHaveBeenCalledWith([SOL])
    })

    it('reads nothing on Solana without a Solana wallet', async () => {
      const kamino = source<string>([])
      const solanaHoldings = vi.fn(async () => [])
      await loadPortfolio(
        wallets,
        deps({
          solanaAdapters: { kamino_v1: async () => kamino },
          solanaHoldings,
        })
      )
      expect(kamino.calls).toEqual([])
      expect(solanaHoldings).not.toHaveBeenCalled()
    })

    it('flags Kamino when it is down and keeps EVM, Stellar and the Solana balances', async () => {
      const result = await loadPortfolio(
        allWallets,
        deps({
          solanaAdapters: { kamino_v1: async () => failing('Kamino 503') },
          solanaHoldings: async () => [solHolding('SOL')],
        })
      )
      expect(result.failures).toEqual([
        {
          chainFamily: 'solana',
          source: 'kamino_v1',
          message: 'Temporarily unavailable',
        },
      ])
      expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
      expect(result.positions.supply['blend_v2.1']).toEqual([supply('blend')])
      expect(result.positions.supply.kamino_v1).toBeUndefined()
      expect(result.holdings.map((h) => h.code)).toEqual(['SOL'])
    })

    it('flags the Solana wallet when the RPC is down and keeps Kamino', async () => {
      const result = await loadPortfolio(
        allWallets,
        deps({
          solanaHoldings: async () => {
            throw new Error('[solana] getBalance: HTTP 429')
          },
        })
      )
      expect(result.failures).toEqual([
        {
          chainFamily: 'solana',
          source: 'solana_wallet',
          message: 'Temporarily unavailable',
        },
      ])
      expect(result.positions.supply.kamino_v1).toEqual([supply('kamino')])
      expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
    })

    it('times out a Kamino read that never settles', async () => {
      const result = await loadPortfolio(
        allWallets,
        deps({
          sourceTimeoutMs: 20,
          solanaAdapters: { kamino_v1: () => new Promise(() => {}) },
        })
      )
      expect(result.failures).toEqual([
        {
          chainFamily: 'solana',
          source: 'kamino_v1',
          message: 'Temporarily unavailable',
        },
      ])
      expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
    })

    // Synthetic base58 keys (32 bytes), no real wallet.
    const SOL_WALLETS = [
      SOL,
      'qfW7mP3Qj9ADkju9JkXmqMAEZJDWSCYXHeiwQwXNP1s',
      'HyvV6PHz5MgMaa9BQSgT3FeD4NUFesGx4UmDLvwiLpb',
      'DctTH9Gb8xDVt4LNE7yh3TzKwxgmUshdzvf6TVqs4S3D',
    ]

    it('reads at most maxAddresses wallets and flags the others, never silently', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const kamino = { ...source<string>([supply('kamino')]), maxAddresses: 3 }
      const solanaHoldings = vi.fn(async () => [])
      const result = await loadPortfolio(
        SOL_WALLETS.map((address) => ({
          address,
          chainFamily: 'solana' as const,
        })),
        deps({
          solanaAdapters: { kamino_v1: async () => kamino },
          solanaHoldings,
        })
      )
      expect(kamino.calls).toEqual([SOL_WALLETS.slice(0, 3)])
      // Balances are one cheap RPC read per wallet: all of them.
      expect(solanaHoldings).toHaveBeenCalledWith(SOL_WALLETS)
      expect(result.positions.supply.kamino_v1).toEqual([supply('kamino')])
      expect(result.failures).toEqual([
        {
          chainFamily: 'solana',
          source: 'kamino_v1',
          message: '1 wallet(s) over the limit of 3 not read',
        },
      ])
    })

    it('hands each source a signal that aborts at its deadline', async () => {
      let seen: AbortSignal | undefined
      const result = await loadPortfolio(
        allWallets,
        deps({
          sourceTimeoutMs: 20,
          solanaAdapters: {
            kamino_v1: async () => ({
              getUserSupplyPositions: ({ signal }) => {
                seen = signal
                return new Promise<SupplyPosition[]>(() => {})
              },
              getUserBorrowPositions: () =>
                new Promise<BorrowPosition[]>(() => {}),
            }),
          },
        })
      )
      expect(result.failures).toEqual([
        {
          chainFamily: 'solana',
          source: 'kamino_v1',
          message: 'Temporarily unavailable',
        },
      ])
      // Same deadline as the source limit; let a timer of that tick run.
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(seen?.aborted).toBe(true)
    })

    it('computes risk on the Kamino accounts with the other families', async () => {
      const computeRisk = vi.fn(async () => [])
      await loadPortfolio(
        allWallets,
        deps({
          evmAdapters: {
            morpho_v1: async () => source([], [account('evm-1')]),
          },
          stellarAdapters: {
            'blend_v2.1': async () => source([], [account('xlm-1')]),
          },
          solanaAdapters: {
            kamino_v1: async () => source([], [account('sol-1')]),
          },
          computeRisk,
        })
      )
      expect(computeRisk).toHaveBeenCalledWith([
        account('evm-1'),
        account('xlm-1'),
        account('sol-1'),
      ])
    })
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
