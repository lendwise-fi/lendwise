import { describe, expect, it, vi } from 'vitest'

import { createPacedQueue } from '@/lib/net/paced-queue'

import {
  SPL_TOKEN_2022_PROGRAM_ID,
  SPL_TOKEN_PROGRAM_ID,
  SolanaRpcError,
  createSolanaRpc,
} from './rpc'

const OWNER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const queue = () => createPacedQueue({ minIntervalMs: 0 })

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function account(mint: string, amount: string, decimals: number) {
  return {
    pubkey: `acct-${mint}-${amount}`,
    account: {
      data: {
        program: 'spl-token',
        parsed: {
          type: 'account',
          info: {
            mint,
            owner: OWNER,
            tokenAmount: {
              amount,
              decimals,
              uiAmount: Number(amount) / 10 ** decimals,
              uiAmountString: String(Number(amount) / 10 ** decimals),
            },
          },
        },
        space: 165,
      },
      lamports: 2039280,
      owner: SPL_TOKEN_PROGRAM_ID,
    },
  }
}

function rpcWith(fetchImpl: typeof fetch, extra = {}) {
  return createSolanaRpc({
    url: 'https://rpc.test',
    fetchImpl,
    queue: queue(),
    ...extra,
  })
}

describe('program ids', () => {
  it('are the Token and Token-2022 programs', () => {
    expect(SPL_TOKEN_PROGRAM_ID).toBe(
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    )
    expect(SPL_TOKEN_2022_PROGRAM_ID).toBe(
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PQnYqHqVtJ6vXc'
    )
  })
})

describe('getBalance', () => {
  it('converts lamports to SOL', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { context: { slot: 1 }, value: 1_500_000_000 },
      })
    )
    const sol = await rpcWith(fetchImpl as unknown as typeof fetch).getBalance(
      OWNER
    )
    expect(sol).toBe(1.5)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://rpc.test')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toMatchObject({
      jsonrpc: '2.0',
      method: 'getBalance',
      params: [OWNER],
    })
  })

  it('sends no Origin header (the public RPC answers 403 to any)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 1, result: { value: 0 } })
    )
    await rpcWith(fetchImpl as unknown as typeof fetch).getBalance(OWNER)
    const init = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1]
    const names = Object.keys(init.headers ?? {}).map((h) => h.toLowerCase())
    expect(names).toContain('content-type')
    expect(names).not.toContain('origin')
  })

  it('adds the configured auth headers', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 1, result: { value: 0 } })
    )
    await rpcWith(fetchImpl as unknown as typeof fetch, {
      headers: () => ({ Authorization: 'Basic abc' }),
    }).getBalance(OWNER)
    const init = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1]
    expect(init.headers).toMatchObject({ Authorization: 'Basic abc' })
  })
})

describe('getTokenAccountsByOwner', () => {
  it('asks for jsonParsed accounts of one program', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { context: { slot: 1 }, value: [account(USDC, '1500000', 6)] },
      })
    )
    const accounts = await rpcWith(
      fetchImpl as unknown as typeof fetch
    ).getTokenAccountsByOwner(OWNER, SPL_TOKEN_PROGRAM_ID)
    const init = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1]
    expect(JSON.parse(init.body as string)).toMatchObject({
      method: 'getTokenAccountsByOwner',
      params: [
        OWNER,
        { programId: SPL_TOKEN_PROGRAM_ID },
        { encoding: 'jsonParsed' },
      ],
    })
    expect(accounts).toEqual([
      {
        pubkey: `acct-${USDC}-1500000`,
        mint: USDC,
        amount: '1500000',
        decimals: 6,
        uiAmountString: '1.5',
      },
    ])
  })

  it('skips an item that does not match, keeps the others', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          value: [
            { pubkey: 'x', account: { data: { program: 'weird' } } },
            account(USDC, '2000000', 6),
          ],
        },
      })
    )
    const accounts = await rpcWith(
      fetchImpl as unknown as typeof fetch
    ).getTokenAccountsByOwner(OWNER, SPL_TOKEN_PROGRAM_ID)
    expect(accounts.map((a) => a.amount)).toEqual(['2000000'])
  })
})

describe('errors', () => {
  it('turns a JSON-RPC error into a named SolanaRpcError', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'Invalid param: not base58' },
      })
    )
    const p = rpcWith(fetchImpl as unknown as typeof fetch).getBalance('bad')
    await expect(p).rejects.toBeInstanceOf(SolanaRpcError)
    await expect(p).rejects.toMatchObject({
      name: 'SolanaRpcError',
      kind: 'rpc',
      method: 'getBalance',
      code: -32602,
    })
    await expect(p).rejects.toThrow(/Invalid param/)
  })

  it('turns an HTTP error into a SolanaRpcError with its status', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('forbidden', { status: 403 })
    )
    await expect(
      rpcWith(fetchImpl as unknown as typeof fetch).getBalance(OWNER)
    ).rejects.toMatchObject({ kind: 'http', status: 403 })
  })

  it('names a rejected fetch and an unreadable body', async () => {
    await expect(
      rpcWith((async () => {
        throw new Error('ECONNRESET')
      }) as unknown as typeof fetch).getBalance(OWNER)
    ).rejects.toMatchObject({ kind: 'network' })
    await expect(
      rpcWith(
        (async () =>
          new Response('<html>', { status: 200 })) as unknown as typeof fetch
      ).getBalance(OWNER)
    ).rejects.toMatchObject({ kind: 'invalid-response' })
    await expect(
      rpcWith((async () =>
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: { value: 'x' },
        })) as unknown as typeof fetch).getBalance(OWNER)
    ).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('reports a timeout', async () => {
    const fetchImpl = ((_: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'TimeoutError'))
        )
      })) as unknown as typeof fetch
    await expect(
      rpcWith(fetchImpl, { timeoutMs: 10 }).getBalance(OWNER)
    ).rejects.toMatchObject({ kind: 'timeout' })
  })
})
