import { z } from 'zod'

import { serverRpc } from '@/config/rpc.server'
import { type PacedQueue, createPacedQueue } from '@/lib/net/paced-queue'

/** SPL Token program. */
export const SPL_TOKEN_PROGRAM_ID =
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
/** SPL Token-2022 program. */
export const SPL_TOKEN_2022_PROGRAM_ID =
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PQnYqHqVtJ6vXc'

export const LAMPORTS_PER_SOL = 1_000_000_000

/** Longest one JSON-RPC call may take before it fails. */
export const SOLANA_RPC_TIMEOUT_MS = 8_000

/**
 * Minimum gap between two Solana RPC calls. The public mainnet RPC allows
 * 100 requests / 10 s per IP and 40 / 10 s per method: 250 ms (4 req/s) keeps
 * even a burst of one method under the per-method limit. A refused call is
 * not retried here (it has already been spent); it rejects and the caller
 * decides. `SOLANA_RPC_MIN_INTERVAL_MS` overrides it, e.g. lower on a paid
 * endpoint set through `RPC_URL_SOLANA`.
 */
export const SOLANA_RPC_MIN_INTERVAL_MS = Number(
  process.env.SOLANA_RPC_MIN_INTERVAL_MS ?? 250
)

/** Calls waiting on the shared queue before new ones fail fast. */
const SOLANA_RPC_MAX_PENDING = 50

/**
 * Normalized failure of a Solana RPC call. `kind`: `http` (non-2xx, see
 * `status`), `rpc` (JSON-RPC error object, see `code`), `timeout`, `network`
 * (fetch rejected), `invalid-response` (not JSON, or an unexpected shape).
 */
export class SolanaRpcError extends Error {
  readonly kind: 'http' | 'rpc' | 'timeout' | 'network' | 'invalid-response'
  readonly method: string
  readonly status: number | null
  readonly code: number | null

  constructor(
    kind: SolanaRpcError['kind'],
    method: string,
    message: string,
    status: number | null = null,
    code: number | null = null
  ) {
    super(`[solana] ${method}: ${message}`)
    this.name = 'SolanaRpcError'
    this.kind = kind
    this.method = method
    this.status = status
    this.code = code
  }
}

/** One SPL token account of an owner, as the RPC parses it. */
export interface SplTokenAccount {
  pubkey: string
  mint: string
  /** Raw amount in the mint's smallest unit, a base-10 integer string. */
  amount: string
  decimals: number
  uiAmountString: string
}

const envelopeSchema = z.object({
  result: z.unknown().optional(),
  error: z
    .object({ code: z.number().optional(), message: z.string().optional() })
    .optional(),
})

const balanceResultSchema = z.object({ value: z.number().nonnegative() })

const tokenAccountsResultSchema = z.object({ value: z.array(z.unknown()) })

const tokenAccountSchema = z.object({
  pubkey: z.string(),
  account: z.object({
    data: z.object({
      parsed: z.object({
        info: z.object({
          mint: z.string(),
          tokenAmount: z.object({
            amount: z.string().regex(/^\d+$/),
            decimals: z.number().int().nonnegative(),
            uiAmountString: z.string().optional(),
          }),
        }),
      }),
    }),
  }),
})

export interface SolanaRpcDeps {
  /** Endpoint; defaults to the server RPC of `solana`, read at call time. */
  url?: string
  /** Request headers beyond content-type (an override's own auth). */
  headers?: () => Record<string, string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
  queue?: PacedQueue
}

const sharedQueue = createPacedQueue({
  minIntervalMs: SOLANA_RPC_MIN_INTERVAL_MS,
  maxPending: SOLANA_RPC_MAX_PENDING,
})

/**
 * A tiny JSON-RPC 2.0 client over `fetch`. Server-side only: the request
 * carries no `Origin` (the public RPC answers 403 to any) and, with the
 * default endpoint, no key.
 */
export function createSolanaRpc(deps: SolanaRpcDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch
  const queue = deps.queue ?? sharedQueue
  const timeoutMs = deps.timeoutMs ?? SOLANA_RPC_TIMEOUT_MS

  async function call(method: string, params: unknown[]): Promise<unknown> {
    const target = deps.url
      ? { url: deps.url, headers: deps.headers?.() ?? {} }
      : serverRpc('solana')
    if (!target) throw new Error('No Solana RPC configured')

    return queue.run(async () => {
      let res: Response
      try {
        res = await fetchImpl(target.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...target.headers },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (e) {
        const timedOut = e instanceof Error && e.name === 'TimeoutError'
        throw new SolanaRpcError(
          timedOut ? 'timeout' : 'network',
          method,
          timedOut
            ? `no answer within ${timeoutMs} ms`
            : e instanceof Error
              ? e.message
              : String(e)
        )
      }
      if (!res.ok) {
        throw new SolanaRpcError(
          'http',
          method,
          `HTTP ${res.status}`,
          res.status
        )
      }
      let json: unknown
      try {
        json = await res.json()
      } catch {
        throw new SolanaRpcError('invalid-response', method, 'body is not JSON')
      }
      const envelope = envelopeSchema.safeParse(json)
      if (!envelope.success) {
        throw new SolanaRpcError(
          'invalid-response',
          method,
          'not a JSON-RPC reply'
        )
      }
      if (envelope.data.error) {
        const { code, message } = envelope.data.error
        throw new SolanaRpcError(
          'rpc',
          method,
          message ?? 'unknown error',
          null,
          code ?? null
        )
      }
      return envelope.data.result
    })
  }

  return {
    /** SOL balance of an address (lamports / 1e9). */
    async getBalance(address: string): Promise<number> {
      const parsed = balanceResultSchema.safeParse(
        await call('getBalance', [address])
      )
      if (!parsed.success) {
        throw new SolanaRpcError(
          'invalid-response',
          'getBalance',
          'unexpected result shape'
        )
      }
      return parsed.data.value / LAMPORTS_PER_SOL
    },

    /**
     * Parsed token accounts of `owner` under one token program. An item that
     * does not match the expected shape is skipped, the others are returned.
     */
    async getTokenAccountsByOwner(
      owner: string,
      programId: string
    ): Promise<SplTokenAccount[]> {
      const result = tokenAccountsResultSchema.safeParse(
        await call('getTokenAccountsByOwner', [
          owner,
          { programId },
          { encoding: 'jsonParsed' },
        ])
      )
      if (!result.success) {
        throw new SolanaRpcError(
          'invalid-response',
          'getTokenAccountsByOwner',
          'unexpected result shape'
        )
      }
      return result.data.value.flatMap((item): SplTokenAccount[] => {
        const a = tokenAccountSchema.safeParse(item)
        if (!a.success) return []
        const { mint, tokenAmount } = a.data.account.data.parsed.info
        return [
          {
            pubkey: a.data.pubkey,
            mint,
            amount: tokenAmount.amount,
            decimals: tokenAmount.decimals,
            uiAmountString: tokenAmount.uiAmountString ?? tokenAmount.amount,
          },
        ]
      })
    },
  }
}

export type SolanaRpc = ReturnType<typeof createSolanaRpc>
