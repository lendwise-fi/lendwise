import type { StellarSession, Wallet } from '@/stores/walletStore'

import { currentSolanaSession } from './solana-wallets'

/**
 * Partial store update applied to a persisted Stellar wallet on restore.
 * Only the wallet owning the server SEP-10 session stays connected; every
 * other one is kept but shown as signed out and never active.
 */
export function restoredStellarWalletUpdate(
  wallet: Pick<Wallet, 'address' | 'isActive'>,
  session: StellarSession | null | undefined
): Partial<Wallet> {
  if (session && session.address === wallet.address) {
    return {
      isConnected: true,
      isCurrentlyConnected: wallet.isActive,
      stellarSession: session,
    }
  }
  return {
    isConnected: false,
    isCurrentlyConnected: false,
    isActive: false,
    stellarSession: undefined,
  }
}

/**
 * The session the server cookie holds: the newest unexpired Stellar session in
 * the store. Each sign-in replaces the cookie, so an older session is dead even
 * while its wallet still carries it (expiresAt and issuedAt are in epoch seconds).
 */
export function currentStellarSession(
  wallets: readonly Pick<Wallet, 'chainFamily' | 'stellarSession'>[],
  now: number = Math.floor(Date.now() / 1000)
): StellarSession | null {
  let current: StellarSession | null = null
  for (const w of wallets) {
    const s = w.stellarSession
    if (w.chainFamily !== 'stellar' || !s || s.expiresAt <= now) continue
    if (!current || s.issuedAt > current.issuedAt) current = s
  }
  return current
}

/**
 * Store updates for when no EVM wallet is connected. Connecting an EVM wallet
 * deactivates the Stellar or Solana one but leaves its session alive; when the
 * EVM wallet goes away, the navbar and the portfolio would show nobody signed
 * in while the session is still there. The wallet whose session was issued
 * last, Stellar or Solana (each family has its own cookie), takes the active
 * slot back, a tie going to Stellar; every other wallet leaves it.
 */
export function activeWalletUpdatesWithoutEvm(
  wallets: readonly Pick<
    Wallet,
    | 'address'
    | 'chainFamily'
    | 'isActive'
    | 'isConnected'
    | 'isCurrentlyConnected'
    | 'stellarSession'
    | 'solanaSession'
  >[],
  now: number = Math.floor(Date.now() / 1000)
): { address: string; update: Partial<Wallet> }[] {
  const stellar = currentStellarSession(wallets, now)
  const solana = currentSolanaSession(wallets, now)
  const owner =
    solana && (!stellar || solana.issuedAt > stellar.issuedAt)
      ? { family: 'solana' as const, address: solana.address }
      : stellar && { family: 'stellar' as const, address: stellar.address }
  const updates: { address: string; update: Partial<Wallet> }[] = []
  for (const w of wallets) {
    const isOwner =
      !!owner && w.chainFamily === owner.family && w.address === owner.address
    if (isOwner) {
      if (!w.isActive || !w.isCurrentlyConnected || !w.isConnected)
        updates.push({
          address: w.address,
          update: {
            isActive: true,
            isCurrentlyConnected: true,
            isConnected: true,
          },
        })
    } else if (w.isActive || w.isCurrentlyConnected) {
      updates.push({
        address: w.address,
        update: { isActive: false, isCurrentlyConnected: false },
      })
    }
  }
  return updates
}

/**
 * Fail closed: skip clearing the server session only when it is known to
 * belong to a different address.
 */
export function shouldClearStellarSession(
  address: string,
  server: { ok: true; sessionAddress: string | null } | { ok: false }
): boolean {
  if (!server.ok || server.sessionAddress === null) return true
  return server.sessionAddress === address
}

/**
 * True when the wallet was signed in while the restore request was in flight:
 * its session now exists and differs (by issuedAt) from the pre-await one.
 */
export function signedInDuringRestore(
  before: Pick<Wallet, 'stellarSession'> | undefined,
  after: Pick<Wallet, 'stellarSession'> | undefined
): boolean {
  const next = after?.stellarSession
  if (!next) return false
  const prev = before?.stellarSession
  return !prev || prev.issuedAt !== next.issuedAt
}

/**
 * Whether an active wallet may be shown as the header wallet. A Stellar or
 * Solana wallet needs its own, unexpired session (expiresAt in epoch seconds).
 */
export function isDisplayableActive(
  wallet: Pick<
    Wallet,
    'address' | 'chainFamily' | 'stellarSession' | 'solanaSession'
  >,
  now: number = Math.floor(Date.now() / 1000)
): boolean {
  const ownLive = (
    session: { address: string; expiresAt: number } | undefined
  ) =>
    !!session && session.address === wallet.address && session.expiresAt > now
  switch (wallet.chainFamily) {
    case 'evm':
      return true
    case 'stellar':
      return ownLive(wallet.stellarSession)
    case 'solana':
      return ownLive(wallet.solanaSession)
    default: {
      const unreachable: never = wallet.chainFamily
      return unreachable
    }
  }
}

/**
 * The Stellar wallet picker's two lists, in the kit's own order: the wallets
 * usable now, most recently used first (the latest one flagged `recent`), then
 * the ones to install. `usedIds` is the kit's recent-wallets record, newest
 * first.
 */
export function stellarWalletSections<
  W extends { id: string; isAvailable: boolean },
>(
  wallets: readonly W[],
  usedIds: readonly string[]
): { available: { wallet: W; recent: boolean }[]; toInstall: W[] } {
  const rank = (w: W) => {
    const i = usedIds.indexOf(w.id)
    return i === -1 ? usedIds.length : i
  }
  return {
    available: wallets
      .filter((w) => w.isAvailable)
      .sort((a, b) => rank(a) - rank(b))
      .map((wallet) => ({ wallet, recent: wallet.id === usedIds[0] })),
    toInstall: wallets.filter((w) => !w.isAvailable),
  }
}

/** The kit's recent-wallets record (a JSON array of ids), or [] if unreadable. */
export function parseUsedWalletIds(raw: string | null): string[] {
  try {
    const ids: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}
