import { and, eq, inArray } from 'drizzle-orm'
import { formatUnits } from 'viem'

import { db } from '@/lib/db/postgres'
import { latestPrice } from '@/lib/db/repositories/price'
import { products } from '@/lib/db/schema'
import type { WalletHolding } from '@/lib/portfolio/types'

import {
  SPL_TOKEN_2022_PROGRAM_ID,
  SPL_TOKEN_PROGRAM_ID,
  type SolanaRpc,
  type SplTokenAccount,
  createSolanaRpc,
} from './rpc'

/** Chain id of Solana in the registry. */
const SOLANA_CHAIN_ID = -2

/**
 * Mint -> symbol for the tokens a Solana wallet most often holds. A token
 * account carries no symbol: the Kamino catalogue (`products`) names a mint
 * first, this map only the mints the catalogue lacks; any other mint shows
 * by its shortened address.
 * Mints checked against Kamino reserve data on 2026-10-29.
 */
export const SOLANA_KNOWN_MINTS: Readonly<Record<string, string>> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: 'JitoSOL',
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: 'mSOL',
  jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v: 'JupSOL',
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4': 'JLP',
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 'BONK',
  So11111111111111111111111111111111111111112: 'SOL',
}

/** The slice of the RPC client the holdings read needs. */
export type SolanaHoldingsRpc = Pick<
  SolanaRpc,
  'getBalance' | 'getTokenAccountsByOwner'
>

export interface SolanaHoldingsDeps {
  rpc?: SolanaHoldingsRpc
  /** USD price of a symbol; defaults to the freshest `apy_hourly` price. */
  price?: (symbol: string) => Promise<number | null>
  /** Symbols of mints from the Kamino catalogue; defaults to `products`. */
  symbolsByMint?: (mints: string[]) => Promise<Map<string, string>>
}

export interface MergedTokenBalance {
  mint: string
  decimals: number
  balance: number
}

/**
 * One balance per mint: raw amounts are summed as integers (no float drift)
 * and scaled by the mint's decimals once; a zero total is dropped.
 */
export function mergeTokenAccounts(
  accounts: SplTokenAccount[]
): MergedTokenBalance[] {
  const byMint = new Map<string, { raw: bigint; decimals: number }>()
  for (const a of accounts) {
    const entry = byMint.get(a.mint) ?? { raw: 0n, decimals: a.decimals }
    entry.raw += BigInt(a.amount)
    byMint.set(a.mint, entry)
  }
  return [...byMint]
    .filter(([, { raw }]) => raw > 0n)
    .map(([mint, { raw, decimals }]) => ({
      mint,
      decimals,
      balance: Number(formatUnits(raw, decimals)),
    }))
}

async function catalogueSymbols(mints: string[]): Promise<Map<string, string>> {
  if (mints.length === 0) return new Map()
  const rows = await db
    .select({ address: products.assetAddress, symbol: products.assetSymbol })
    .from(products)
    .where(
      and(
        eq(products.chainId, SOLANA_CHAIN_ID),
        inArray(products.assetAddress, mints)
      )
    )
  return new Map(rows.map((r) => [r.address, r.symbol]))
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`
}

/**
 * Native SOL and the non-zero SPL balances (Token and Token-2022 programs) of
 * each address, USD-valued where the symbol has a known price. A failing RPC
 * call rejects with a `SolanaRpcError`; a failing price read only leaves the
 * holdings unpriced.
 */
export async function getSolanaWalletHoldings(
  addresses: string[],
  deps: SolanaHoldingsDeps = {}
): Promise<WalletHolding[]> {
  const rpc = deps.rpc ?? createSolanaRpc()
  const price = deps.price ?? latestPrice
  const symbolsByMint = deps.symbolsByMint ?? catalogueSymbols

  const perOwner = await Promise.all(
    addresses.map(async (owner) => {
      const [sol, tokens, tokens2022] = await Promise.all([
        rpc.getBalance(owner),
        rpc.getTokenAccountsByOwner(owner, SPL_TOKEN_PROGRAM_ID),
        rpc.getTokenAccountsByOwner(owner, SPL_TOKEN_2022_PROGRAM_ID),
      ])
      return { owner, sol, spl: mergeTokenAccounts([...tokens, ...tokens2022]) }
    })
  )

  // The catalogue names a mint as `latestPrice` matches it (`asset_symbol`
  // exactly), so it wins; the static map covers mints the catalogue lacks.
  const mints = [...new Set(perOwner.flatMap((o) => o.spl.map((t) => t.mint)))]
  const catalogue = await symbolsByMint(mints).catch(
    () => new Map<string, string>()
  )
  const symbolOf = (mint: string): string | null =>
    catalogue.get(mint) ?? SOLANA_KNOWN_MINTS[mint] ?? null

  const base = { chainFamily: 'solana' as const, network: 'solana' }
  const pending = perOwner.flatMap(({ owner, sol, spl }) => [
    ...(sol > 0
      ? [
          {
            symbol: 'SOL' as string | null,
            holding: {
              ...base,
              owner,
              assetType: 'native' as const,
              code: 'SOL',
              issuer: null,
              balance: sol,
            },
          },
        ]
      : []),
    ...spl.map((t) => {
      const symbol = symbolOf(t.mint)
      return {
        symbol,
        holding: {
          ...base,
          owner,
          assetType: 'spl' as const,
          code: symbol ?? shortMint(t.mint),
          issuer: t.mint,
          balance: t.balance,
        },
      }
    }),
  ])

  const prices = new Map<string, number | null>()
  await Promise.all(
    [...new Set(pending.flatMap((p) => (p.symbol ? [p.symbol] : [])))].map(
      async (s) => {
        prices.set(s, await price(s).catch(() => null))
      }
    )
  )

  return pending.map(({ symbol, holding }) => {
    const p = symbol ? (prices.get(symbol) ?? null) : null
    return {
      ...holding,
      priceUsd: p,
      valueUsd: p == null ? null : holding.balance * p,
    }
  })
}
