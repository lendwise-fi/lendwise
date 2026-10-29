import { describe, expect, it, vi } from 'vitest'

import {
  SPL_TOKEN_2022_PROGRAM_ID,
  SPL_TOKEN_PROGRAM_ID,
  SolanaRpcError,
  type SplTokenAccount,
} from './rpc'
import {
  type SolanaHoldingsRpc,
  getSolanaWalletHoldings,
  mergeTokenAccounts,
} from './wallet-holdings'

vi.mock('@/lib/db/repositories/price', () => ({ latestPrice: vi.fn() }))
vi.mock('@/lib/db/postgres', () => ({ db: {} }))

const A = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const B = 'GrDMoeqMLFjeXQ24H56S1RLgT4R76jsuWCd6SvXyGPQ5'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const JITOSOL = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'
const UNKNOWN = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'

function acct(
  mint: string,
  amount: string,
  decimals: number,
  pubkey = `${mint}-${amount}`
): SplTokenAccount {
  return {
    pubkey,
    mint,
    amount,
    decimals,
    uiAmountString: (Number(amount) / 10 ** decimals).toString(),
  }
}

function fakeRpc(opts: {
  sol?: number
  token?: SplTokenAccount[]
  token2022?: SplTokenAccount[]
}): SolanaHoldingsRpc {
  return {
    getBalance: vi.fn(async () => opts.sol ?? 0),
    getTokenAccountsByOwner: vi.fn(async (_o: string, program: string) =>
      program === SPL_TOKEN_PROGRAM_ID
        ? (opts.token ?? [])
        : program === SPL_TOKEN_2022_PROGRAM_ID
          ? (opts.token2022 ?? [])
          : []
    ),
  }
}

const noSymbols = async () => new Map<string, string>()

describe('mergeTokenAccounts', () => {
  it('sums accounts of one mint without float drift and drops zeros', () => {
    const merged = mergeTokenAccounts([
      acct(USDC, '1100000', 6, 'a'),
      acct(USDC, '2200000', 6, 'b'),
      acct(JITOSOL, '0', 9),
    ])
    expect(merged).toEqual([{ mint: USDC, decimals: 6, balance: 3.3 }])
  })

  it('keeps 0.1 + 0.2 exact', () => {
    const merged = mergeTokenAccounts([
      acct(USDC, '100000', 6, 'a'),
      acct(USDC, '200000', 6, 'b'),
    ])
    expect(merged[0].balance).toBe(0.3)
  })
})

describe('getSolanaWalletHoldings', () => {
  it('returns SOL plus merged Token and Token-2022 balances, priced', async () => {
    const rpc = fakeRpc({
      sol: 2.5,
      token: [acct(USDC, '1000000', 6, 'a'), acct(JITOSOL, '0', 9)],
      token2022: [acct(USDC, '4000000', 6, 'b')],
    })
    const price = vi.fn(async (s: string) =>
      s === 'SOL' ? 200 : s === 'USDC' ? 1 : null
    )
    const holdings = await getSolanaWalletHoldings([A], {
      rpc,
      price,
      symbolsByMint: noSymbols,
    })
    expect(holdings).toEqual([
      {
        chainFamily: 'solana',
        network: 'solana',
        owner: A,
        assetType: 'native',
        code: 'SOL',
        issuer: null,
        balance: 2.5,
        priceUsd: 200,
        valueUsd: 500,
      },
      {
        chainFamily: 'solana',
        network: 'solana',
        owner: A,
        assetType: 'spl',
        code: 'USDC',
        issuer: USDC,
        balance: 5,
        priceUsd: 1,
        valueUsd: 5,
      },
    ])
    expect(rpc.getTokenAccountsByOwner).toHaveBeenCalledWith(
      A,
      SPL_TOKEN_PROGRAM_ID
    )
    expect(rpc.getTokenAccountsByOwner).toHaveBeenCalledWith(
      A,
      SPL_TOKEN_2022_PROGRAM_ID
    )
  })

  it('omits a zero SOL balance', async () => {
    const holdings = await getSolanaWalletHoldings([A], {
      rpc: fakeRpc({ sol: 0 }),
      price: async () => null,
      symbolsByMint: noSymbols,
    })
    expect(holdings).toEqual([])
  })

  it('names an unknown mint by its shortened address, unpriced', async () => {
    const holdings = await getSolanaWalletHoldings([A], {
      rpc: fakeRpc({ token: [acct(UNKNOWN, '5000000000', 9)] }),
      price: async () => 1,
      symbolsByMint: noSymbols,
    })
    expect(holdings).toHaveLength(1)
    expect(holdings[0]).toMatchObject({
      assetType: 'spl',
      code: '7xKX…gAsU',
      issuer: UNKNOWN,
      balance: 5,
      priceUsd: null,
      valueUsd: null,
    })
  })

  it('takes symbols from the catalogue for mints the static map lacks', async () => {
    const holdings = await getSolanaWalletHoldings([A], {
      rpc: fakeRpc({ token: [acct(UNKNOWN, '1000000', 6)] }),
      price: async (s) => (s === 'FOO' ? 3 : null),
      symbolsByMint: async () => new Map([[UNKNOWN, 'FOO']]),
    })
    expect(holdings[0]).toMatchObject({ code: 'FOO', priceUsd: 3, valueUsd: 3 })
  })

  it('prefers the catalogue symbol over the static one for the price lookup', async () => {
    const price = vi.fn(async (s: string) => (s === 'jitoSOL' ? 250 : null))
    const symbolsByMint = vi.fn(async () => new Map([[JITOSOL, 'jitoSOL']]))
    const holdings = await getSolanaWalletHoldings([A], {
      rpc: fakeRpc({ token: [acct(JITOSOL, '2000000000', 9)] }),
      price,
      symbolsByMint,
    })
    expect(symbolsByMint).toHaveBeenCalledWith([JITOSOL])
    expect(price).toHaveBeenCalledWith('jitoSOL')
    expect(price).not.toHaveBeenCalledWith('JitoSOL')
    expect(holdings[0]).toMatchObject({
      code: 'jitoSOL',
      priceUsd: 250,
      valueUsd: 500,
    })
  })

  it('shows a holding unpriced when the price lookup fails', async () => {
    const holdings = await getSolanaWalletHoldings([A], {
      rpc: fakeRpc({ sol: 1 }),
      price: async () => {
        throw new Error('db down')
      },
      symbolsByMint: noSymbols,
    })
    expect(holdings[0]).toMatchObject({
      code: 'SOL',
      priceUsd: null,
      valueUsd: null,
    })
  })

  it('reads every address; an RPC failure rejects with the named error', async () => {
    const rpc = fakeRpc({ sol: 1 })
    const out = await getSolanaWalletHoldings([A, B], {
      rpc,
      price: async () => null,
      symbolsByMint: noSymbols,
    })
    expect(out.map((h) => h.owner)).toEqual([A, B])

    const failing: SolanaHoldingsRpc = {
      getBalance: async () => {
        throw new SolanaRpcError('http', 'getBalance', 'HTTP 429', 429)
      },
      getTokenAccountsByOwner: async () => [],
    }
    await expect(
      getSolanaWalletHoldings([A], {
        rpc: failing,
        price: async () => null,
        symbolsByMint: noSymbols,
      })
    ).rejects.toBeInstanceOf(SolanaRpcError)
  })
})
