import { requireSharedStore } from './redis'

const PREFIX = 'lw:sep10:challenge:'
const localChallenges = new Map<string, number>()

function pruneLocal(now = Math.floor(Date.now() / 1000)): void {
  for (const [hash, expiresAt] of localChallenges) {
    if (expiresAt <= now) localChallenges.delete(hash)
  }
}

export async function rememberSep10Challenge({
  hash,
  expiresAt,
}: {
  hash: string
  expiresAt: number
}): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const ttl = Math.max(1, expiresAt - now)
  const store = requireSharedStore()
  if (store) {
    const result = await store.set(PREFIX + hash, '1', { ex: ttl, nx: true })
    if (result !== 'OK') {
      throw new Error('SEP-10 challenge nonce already exists')
    }
    return
  }

  pruneLocal(now)
  localChallenges.set(hash, expiresAt)
}

export async function consumeSep10Challenge(hash: string): Promise<boolean> {
  const store = requireSharedStore()
  if (store) {
    // GETDEL is atomic, so two concurrent verifications of the same
    // challenge cannot both consume it.
    const existing = await store.getdel<string>(PREFIX + hash)
    return existing !== null && existing !== undefined
  }

  pruneLocal()
  const expiresAt = localChallenges.get(hash)
  if (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000)) {
    localChallenges.delete(hash)
    return false
  }
  localChallenges.delete(hash)
  return true
}
