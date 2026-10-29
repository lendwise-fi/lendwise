import { base64 } from '@scure/base'
import {
  SolanaSignMessage,
  type SolanaSignMessageFeature,
} from '@solana/wallet-standard-features'
import type { Wallets } from '@wallet-standard/app'

import type { SolanaSession, Wallet } from '@/stores/walletStore'

import { isSolanaAddress } from './address'

/** A wallet registered through Wallet Standard (`@wallet-standard/base`). */
export type StandardWallet = ReturnType<Wallets['get']>[number]
export type StandardWalletAccount = StandardWallet['accounts'][number]

/** `SOLANA_MAINNET_CHAIN` of `@solana/wallet-standard-chains`. */
export const SOLANA_MAINNET_CHAIN = 'solana:mainnet'

// Feature names and shapes of `@wallet-standard/features` 1.1.1, which comes
// with `@solana/wallet-standard-features` but is not a direct dependency.
export const STANDARD_CONNECT = 'standard:connect'
export const STANDARD_DISCONNECT = 'standard:disconnect'
export const STANDARD_EVENTS = 'standard:events'

interface StandardConnectFeature {
  readonly [STANDARD_CONNECT]: {
    readonly version: string
    readonly connect: (input?: {
      readonly silent?: boolean
    }) => Promise<{ readonly accounts: readonly StandardWalletAccount[] }>
  }
}

interface StandardDisconnectFeature {
  readonly [STANDARD_DISCONNECT]?: {
    readonly version: string
    readonly disconnect: () => Promise<void>
  }
}

interface StandardEventsFeature {
  readonly [STANDARD_EVENTS]?: {
    readonly version: string
    readonly on: (
      event: 'change',
      listener: (properties: {
        readonly accounts?: readonly StandardWalletAccount[]
      }) => void
    ) => () => void
  }
}

/** A Standard wallet that can sign in to LendWise on Solana mainnet. */
export type SolanaWallet = Omit<StandardWallet, 'features'> & {
  readonly features: StandardWallet['features'] &
    StandardConnectFeature &
    SolanaSignMessageFeature &
    StandardDisconnectFeature &
    StandardEventsFeature
}

function hasMethod(
  features: StandardWallet['features'],
  name: `${string}:${string}`,
  method: string
): boolean {
  const feature = features[name]
  return (
    typeof feature === 'object' &&
    feature !== null &&
    typeof (feature as Record<string, unknown>)[method] === 'function'
  )
}

/**
 * Whether a wallet can sign in: it connects (`standard:connect`), signs a
 * message (`solana:signMessage`) and runs on Solana mainnet.
 */
export function isSolanaWallet(wallet: StandardWallet): wallet is SolanaWallet {
  return (
    wallet.chains.includes(SOLANA_MAINNET_CHAIN) &&
    hasMethod(wallet.features, STANDARD_CONNECT, 'connect') &&
    hasMethod(wallet.features, SolanaSignMessage, 'signMessage')
  )
}

export interface FeaturedSolanaWallet {
  id: 'phantom' | 'solflare'
  /** The name the wallet registers under. */
  name: string
  installUrl: string
  /** Under `public/`. */
  icon: string
}

/** The wallets the picker always shows: installed, or with an install link. */
export const FEATURED_SOLANA_WALLETS: readonly FeaturedSolanaWallet[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    installUrl: 'https://phantom.com/download',
    icon: '/wallets/phantom.svg',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    installUrl: 'https://solflare.com/download',
    icon: '/wallets/solflare.svg',
  },
]

const nameKey = (name: string) => name.trim().toLowerCase()

/**
 * The Solana wallet picker's two lists: the wallets that can sign in, Phantom
 * then Solflare first and every other one (Backpack…) after them in detection
 * order; then Phantom and Solflare when they are not installed.
 */
export function solanaWalletSections(wallets: readonly StandardWallet[]): {
  available: SolanaWallet[]
  toInstall: FeaturedSolanaWallet[]
} {
  const seen = new Set<string>()
  const compatible: SolanaWallet[] = []
  for (const wallet of wallets) {
    const key = nameKey(wallet.name)
    if (!isSolanaWallet(wallet) || seen.has(key)) continue
    seen.add(key)
    compatible.push(wallet)
  }
  const rank = (w: SolanaWallet) => {
    const i = FEATURED_SOLANA_WALLETS.findIndex(
      (f) => nameKey(f.name) === nameKey(w.name)
    )
    return i === -1 ? FEATURED_SOLANA_WALLETS.length : i
  }
  return {
    available: compatible.sort((a, b) => rank(a) - rank(b)),
    toInstall: FEATURED_SOLANA_WALLETS.filter(
      (f) => !seen.has(nameKey(f.name))
    ),
  }
}

/** The first account the wallet shares on Solana mainnet with a valid address. */
export function solanaAccount(
  accounts: readonly StandardWalletAccount[]
): StandardWalletAccount | null {
  return (
    accounts.find(
      (a) =>
        a.chains.includes(SOLANA_MAINNET_CHAIN) && isSolanaAddress(a.address)
    ) ?? null
  )
}

export type SolanaAccountChange =
  | { kind: 'none' }
  | { kind: 'switched'; account: StandardWalletAccount }
  | { kind: 'disconnected' }

/**
 * What a wallet's `standard:events` change means for the signed-in account:
 * nothing, a switch to another account, or no account shared any more.
 * Addresses are compared with their case.
 */
export function solanaAccountChange(
  signedIn: string,
  accounts: readonly StandardWalletAccount[] | undefined
): SolanaAccountChange {
  if (accounts === undefined) return { kind: 'none' }
  const usable = accounts.filter((a) => solanaAccount([a]) !== null)
  if (usable.length === 0) return { kind: 'disconnected' }
  if (usable.some((a) => a.address === signedIn)) return { kind: 'none' }
  return { kind: 'switched', account: usable[0] }
}

/** `POST /api/auth/solana/challenge`. */
export interface SiwsChallenge {
  address: string
  nonce: string
  message: string
  domain: string
  uri: string
  issuedAt: string
  expiresAt: string
}

/**
 * Checks the challenge before the wallet signs it: it names this account and
 * carries its nonce. The domain is not compared with the page's host: under
 * `next dev` the server signs `localhost:3000` whatever host the page is on.
 */
export function siwsChallengeProblem(
  challenge: SiwsChallenge,
  address: string
): string | null {
  if (challenge.address !== address) {
    return 'Challenge was issued for another account'
  }
  const header = `${challenge.domain} wants you to sign in with your Solana account:\n${address}\n`
  if (!challenge.message.startsWith(header)) {
    return 'Challenge message does not name this account'
  }
  if (!challenge.message.includes(`\nNonce: ${challenge.nonce}\n`)) {
    return 'Challenge message does not carry its nonce'
  }
  return null
}

const ED25519_SIGNATURE_BYTES = 64

/**
 * The signature as `/api/auth/solana/verify` takes it: the 64 bytes in padded
 * standard base64 (88 characters).
 */
export function encodeSolanaSignature(signature: Uint8Array): string {
  if (!signature || signature.length !== ED25519_SIGNATURE_BYTES) {
    throw new Error('Wallet returned a malformed signature')
  }
  return base64.encode(signature)
}

/** Byte equality: a wallet may return the message it signed altered. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i])
}

/**
 * Partial store update applied to a persisted Solana wallet on restore. Only
 * the wallet owning the server session stays signed in; every other one is
 * kept but shown as signed out and never active.
 */
export function restoredSolanaWalletUpdate(
  wallet: Pick<Wallet, 'address' | 'isActive'>,
  session: SolanaSession | null | undefined
): Partial<Wallet> {
  if (session && session.address === wallet.address) {
    return {
      isConnected: true,
      isCurrentlyConnected: wallet.isActive,
      solanaSession: session,
    }
  }
  return {
    isConnected: false,
    isCurrentlyConnected: false,
    isActive: false,
    solanaSession: undefined,
  }
}

/**
 * True when the wallet was signed in while the restore request was in flight:
 * its session now exists and differs (by issuedAt) from the pre-await one.
 */
export function solanaSignedInDuringRestore(
  before: Pick<Wallet, 'solanaSession'> | undefined,
  after: Pick<Wallet, 'solanaSession'> | undefined
): boolean {
  const next = after?.solanaSession
  if (!next) return false
  const prev = before?.solanaSession
  return !prev || prev.issuedAt !== next.issuedAt
}

/**
 * The session the `solana_session` cookie holds: the newest unexpired Solana
 * session in the store (epoch seconds). Each sign-in replaces the cookie.
 */
export function currentSolanaSession(
  wallets: readonly Pick<Wallet, 'chainFamily' | 'solanaSession'>[],
  now: number = Math.floor(Date.now() / 1000)
): SolanaSession | null {
  let current: SolanaSession | null = null
  for (const w of wallets) {
    const s = w.solanaSession
    if (w.chainFamily !== 'solana' || !s || s.expiresAt <= now) continue
    if (!current || s.issuedAt > current.issuedAt) current = s
  }
  return current
}

/**
 * Fail closed, as for Stellar: skip clearing the server session only when it
 * is known to belong to another account.
 */
export function shouldClearSolanaSession(
  address: string,
  server: { ok: true; sessionAddress: string | null } | { ok: false }
): boolean {
  if (!server.ok || server.sessionAddress === null) return true
  return server.sessionAddress === address
}

/**
 * Store updates once `address` signed in: it takes the active slot, and the
 * other Solana wallets lose their session (the server holds one cookie per
 * family, so the Stellar session stays).
 */
export function walletUpdatesAfterSolanaSignIn(
  wallets: readonly Pick<
    Wallet,
    | 'address'
    | 'chainFamily'
    | 'isActive'
    | 'isConnected'
    | 'isCurrentlyConnected'
    | 'solanaSession'
  >[],
  address: string
): { address: string; update: Partial<Wallet> }[] {
  const updates: { address: string; update: Partial<Wallet> }[] = []
  for (const w of wallets) {
    if (w.chainFamily === 'solana' && w.address === address) continue
    const signsOut =
      w.chainFamily === 'solana' && (w.isConnected || !!w.solanaSession)
    if (!signsOut && !w.isActive && !w.isCurrentlyConnected) continue
    updates.push({
      address: w.address,
      update: {
        isActive: false,
        isCurrentlyConnected: false,
        ...(signsOut && { isConnected: false, solanaSession: undefined }),
      },
    })
  }
  return updates
}
