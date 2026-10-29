import { requireSharedStore } from './redis'

/**
 * A Sign-In With Solana challenge, kept server-side under its nonce: the
 * exact message the wallet is asked to sign, and what it was issued for.
 * Verification reads the message from here, never from the client.
 */
export interface SiwsChallengeRecord {
  address: string
  /** EIP-4361 domain (host, with its port if any) the message names. */
  domain: string
  message: string
  /** Unix seconds; the message's `Expiration Time`. */
  expiresAt: number
}

const PREFIX = 'lw:siws:challenge:'
const localChallenges = new Map<string, SiwsChallengeRecord>()

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function pruneLocal(now = nowSeconds()): void {
  for (const [nonce, record] of localChallenges) {
    if (record.expiresAt <= now) localChallenges.delete(nonce)
  }
}

function asRecord(value: unknown): SiwsChallengeRecord | null {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object') return null
  const r = parsed as Partial<SiwsChallengeRecord>
  if (typeof r.address !== 'string') return null
  if (typeof r.domain !== 'string') return null
  if (typeof r.message !== 'string') return null
  if (typeof r.expiresAt !== 'number' || !Number.isFinite(r.expiresAt))
    return null
  return {
    address: r.address,
    domain: r.domain,
    message: r.message,
    expiresAt: r.expiresAt,
  }
}

/** Keeps a challenge until its expiry. A nonce is never stored twice. */
export async function rememberSiwsChallenge(
  nonce: string,
  record: SiwsChallengeRecord
): Promise<void> {
  const now = nowSeconds()
  const ttl = Math.max(1, record.expiresAt - now)
  const store = requireSharedStore()
  if (store) {
    const result = await store.set(PREFIX + nonce, record, {
      ex: ttl,
      nx: true,
    })
    if (result !== 'OK') {
      throw new Error('SIWS challenge nonce already exists')
    }
    return
  }

  pruneLocal(now)
  if (localChallenges.has(nonce)) {
    throw new Error('SIWS challenge nonce already exists')
  }
  localChallenges.set(nonce, record)
}

/**
 * Takes the challenge out of the store: the first call gets it, every later
 * call gets null. The caller checks `expiresAt`; a record can outlive its
 * expiry by up to a second in Redis, whose TTL is whole seconds.
 */
export async function consumeSiwsChallenge(
  nonce: string
): Promise<SiwsChallengeRecord | null> {
  const store = requireSharedStore()
  if (store) {
    // GETDEL is atomic, so two concurrent verifications of the same
    // challenge cannot both consume it.
    return asRecord(await store.getdel(PREFIX + nonce))
  }

  const record = localChallenges.get(nonce) ?? null
  localChallenges.delete(nonce)
  pruneLocal()
  return record
}

// Test helper: clears in-memory state between cases.
export function resetLocalSiwsChallenges(): void {
  localChallenges.clear()
}
