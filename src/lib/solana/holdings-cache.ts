import type { WalletHolding } from '@/lib/portfolio/types'
import { TtlCache } from '@/lib/protocols/core/toolkit/ttl-cache'

/** How long a read of a wallet set is served from memory. */
export const SOLANA_HOLDINGS_TTL_MS = 30_000

/** Wallet sets kept at once; the oldest entry goes first. */
const MAX_ENTRIES = 500

/**
 * A Solana wallet-balance read shared by identical calls, as
 * `cachedEvmHoldings` does for EVM. A page open triggers several portfolio
 * loads in a few seconds, each three RPC calls per wallet: the burst trips the
 * provider's rate limit. Concurrent calls for the same wallet set share one
 * read, and a read that resolves is served from memory for `ttlMs`; a
 * rejection (a failed RPC call) is not kept, so the next load tries again.
 * The key is the sorted addresses with their case: a lowercased base58 string
 * is another key. Balances are public: the cache holds nothing user-private.
 */
export function cachedSolanaHoldings(
  read: (owners: string[]) => Promise<WalletHolding[]>,
  opts: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}
): (owners: string[]) => Promise<WalletHolding[]> {
  const cache = new TtlCache<WalletHolding[]>({
    ttlMs: opts.ttlMs ?? SOLANA_HOLDINGS_TTL_MS,
    maxEntries: opts.maxEntries ?? MAX_ENTRIES,
    now: opts.now,
  })
  return (owners) => cache.get([...owners].sort().join(','), () => read(owners))
}
