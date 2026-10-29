/**
 * Reads shared by key, kept for a short time — the pattern of
 * `cachedEvmHoldings` (src/lib/evm/holdings-cache.ts), for any value.
 *
 * Concurrent reads of one key share one call; a read that resolves is served
 * from memory for `ttlMs`; a rejection is not kept, so the next read tries
 * again. At most `maxEntries` values are kept, the oldest goes first.
 */
export class TtlCache<V> {
  private readonly done = new Map<string, { at: number; value: V }>()
  private readonly pending = new Map<string, Promise<V>>()
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(opts: { ttlMs: number; maxEntries: number; now?: () => number }) {
    this.ttlMs = opts.ttlMs
    this.maxEntries = opts.maxEntries
    this.now = opts.now ?? (() => Date.now())
  }

  get(key: string, read: () => Promise<V>): Promise<V> {
    const hit = this.done.get(key)
    if (hit && this.now() - hit.at < this.ttlMs)
      return Promise.resolve(hit.value)
    this.done.delete(key)

    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight

    const p = read()
      .then((value) => {
        this.done.set(key, { at: this.now(), value })
        if (this.done.size > this.maxEntries) {
          this.done.delete(this.done.keys().next().value as string)
        }
        return value
      })
      .finally(() => this.pending.delete(key))
    this.pending.set(key, p)
    return p
  }

  clear(): void {
    this.done.clear()
    this.pending.clear()
  }
}
