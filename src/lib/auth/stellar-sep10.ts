import {
  Account,
  Horizon,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

import { isProduction } from './redis'
import {
  consumeSep10Challenge,
  rememberSep10Challenge,
} from './stellar-challenge-store'

const CHALLENGE_TIMEOUT_SECONDS = 5 * 60
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
// `||`, not `??`: an empty variable (as copied from .env.example) means unset.
const HOME_DOMAIN = process.env.STELLAR_HOME_DOMAIN || 'lendwise.fi'
const WEB_AUTH_DOMAIN = process.env.STELLAR_WEB_AUTH_DOMAIN || HOME_DOMAIN
const CHALLENGE_NAME = HOME_DOMAIN + ' auth'

export interface StellarSessionPayload {
  // Session ID, used to revoke the session on sign-out.
  sid: string
  address: string
  networkPassphrase: string
  issuedAt: number
  expiresAt: number
}

export interface StellarChallengePayload {
  address: string
  networkPassphrase: string
  transactionXdr: string
  transaction: string
  expiresAt: string
  homeDomain: string
  webAuthDomain: string
  serverSigningKey: string
}

interface StellarSigner {
  key: string
  weight: number
  type?: string
}

interface StellarAccountLike {
  signers?: StellarSigner[]
  thresholds?: {
    low_threshold?: number
    med_threshold?: number
    high_threshold?: number
  }
}

function signingKeypair(): Keypair {
  const secret = process.env.STELLAR_SEP10_SIGNING_SECRET
  if (!secret) {
    throw new Error('STELLAR_SEP10_SIGNING_SECRET is not configured')
  }
  return Keypair.fromSecret(secret)
}

// LendWise reads and authenticates on Stellar mainnet only — the same network
// the Blend adapters are pinned to (blend/common/api.ts). The client signs for
// the same SDK constant, so the two cannot drift apart through configuration.
const NETWORK_PASSPHRASE = Networks.PUBLIC

function horizonUrl(): string {
  return process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org'
}

function assertPublicKey(address: string): void {
  try {
    Keypair.fromPublicKey(address)
  } catch {
    throw new Error('Invalid Stellar public key')
  }
}

function txHashKey(tx: Transaction): string {
  return tx.hash().toString('base64url')
}

export async function issueStellarChallenge(
  address: string
): Promise<StellarChallengePayload> {
  assertPublicKey(address)
  const server = signingKeypair()
  const networkPassphrase = NETWORK_PASSPHRASE
  const now = Math.floor(Date.now() / 1000)
  const timeout = now + CHALLENGE_TIMEOUT_SECONDS
  const nonce = randomBytes(48).toString('base64url')

  const tx = new TransactionBuilder(new Account(server.publicKey(), '-1'), {
    fee: '100',
    networkPassphrase,
    timebounds: { minTime: now, maxTime: timeout },
  })
    .addOperation(
      Operation.manageData({
        source: address,
        name: CHALLENGE_NAME,
        value: nonce,
      })
    )
    .addOperation(
      Operation.manageData({
        source: server.publicKey(),
        name: 'web_auth_domain',
        value: WEB_AUTH_DOMAIN,
      })
    )
    .build()

  tx.sign(server)
  await rememberSep10Challenge({ hash: txHashKey(tx), expiresAt: timeout })

  const transactionXdr = tx.toXDR()
  return {
    address,
    networkPassphrase,
    transactionXdr,
    transaction: transactionXdr,
    expiresAt: new Date(timeout * 1000).toISOString(),
    homeDomain: HOME_DOMAIN,
    webAuthDomain: WEB_AUTH_DOMAIN,
    serverSigningKey: server.publicKey(),
  }
}

function signatureCount(tx: Transaction, keypair: Keypair): number {
  const hash = tx.hash()
  return tx.signatures.filter((sig) => keypair.verify(hash, sig.signature()))
    .length
}

function verifies(tx: Transaction, keypair: Keypair): boolean {
  return signatureCount(tx, keypair) > 0
}

function readTimebound(value: unknown): number {
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (value && typeof value === 'object' && 'toString' in value) {
    return Number(value.toString())
  }
  return 0
}

function manageDataValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8')
  return ''
}

async function loadAccount(
  address: string
): Promise<StellarAccountLike | null> {
  const server = new Horizon.Server(horizonUrl())
  try {
    return (await server.loadAccount(address)) as StellarAccountLike
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response
      ?.status
    if (status === 404) return null
    throw error
  }
}

function signerVerified(tx: Transaction, signer: StellarSigner): boolean {
  if (signer.weight <= 0) return false
  if (signer.type && signer.type !== 'ed25519_public_key') return false
  try {
    return verifies(tx, Keypair.fromPublicKey(signer.key))
  } catch {
    return false
  }
}

async function verifyClientSignerThreshold({
  address,
  tx,
  server,
}: {
  address: string
  tx: Transaction
  server: Keypair
}): Promise<void> {
  if (signatureCount(tx, server) !== 1) {
    throw new Error('Challenge must contain exactly one server signature')
  }

  const account = await loadAccount(address)
  if (!account) {
    if (tx.signatures.length !== 2) {
      throw new Error('Unfunded account challenge must contain two signatures')
    }
    if (!verifies(tx, Keypair.fromPublicKey(address))) {
      throw new Error('Challenge is missing the wallet signature')
    }
    return
  }

  const signers = account.signers ?? []
  const threshold = Math.max(1, account.thresholds?.med_threshold ?? 1)
  let weight = 0
  const counted = new Set<string>()
  for (const signer of signers) {
    if (counted.has(signer.key)) continue
    if (!signerVerified(tx, signer)) continue
    counted.add(signer.key)
    weight += signer.weight
  }

  if (weight < threshold) {
    throw new Error('Challenge signatures do not meet account threshold')
  }

  // SEP-10: every signature must belong to the server or to a signer of the
  // account. An extra signature is rejected rather than ignored.
  if (tx.signatures.length !== 1 + counted.size) {
    throw new Error('Challenge contains unrecognized signatures')
  }
}

// Session tokens use a key derived from a dedicated session secret, never the
// SEP-10 signing key itself. Production requires the dedicated secret.
function sessionKey(): Buffer {
  const configured = process.env.STELLAR_SESSION_SECRET
  if (configured) {
    return createHmac('sha256', configured)
      .update('stellar-session-v1')
      .digest()
  }
  if (isProduction()) {
    throw new Error('STELLAR_SESSION_SECRET is not configured')
  }
  const signing = process.env.STELLAR_SEP10_SIGNING_SECRET
  if (!signing) throw new Error('STELLAR_SESSION_SECRET is not configured')
  return createHmac('sha256', signing).update('stellar-session-dev-v1').digest()
}

export function signSession(payload: StellarSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  )
  const sig = createHmac('sha256', sessionKey())
    .update(body)
    .digest('base64url')
  return body + '.' + sig
}

export function verifySessionToken(
  token: string
): StellarSessionPayload | null {
  let key: Buffer
  try {
    key = sessionKey()
  } catch {
    return null
  }
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', key).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as Partial<StellarSessionPayload>
    if (typeof payload.sid !== 'string' || payload.sid.length < 16) return null
    if (typeof payload.address !== 'string') return null
    // A session issued on another network (testnet cookie on mainnet) is not
    // a session here.
    if (payload.networkPassphrase !== NETWORK_PASSPHRASE) return null
    if (typeof payload.issuedAt !== 'number') return null
    if (typeof payload.expiresAt !== 'number') return null
    if (payload.expiresAt <= Math.floor(Date.now() / 1000)) return null
    return payload as StellarSessionPayload
  } catch {
    return null
  }
}

export async function verifyStellarChallenge({
  address,
  transactionXdr,
}: {
  address: string
  transactionXdr: string
}): Promise<{ session: StellarSessionPayload; token: string }> {
  assertPublicKey(address)
  const server = signingKeypair()
  const networkPassphrase = NETWORK_PASSPHRASE
  const tx = new Transaction(transactionXdr, networkPassphrase)

  if (tx.source !== server.publicKey()) {
    throw new Error('Challenge source account does not match server signer')
  }
  if (String(tx.sequence) !== '0') {
    throw new Error('Challenge sequence must be 0')
  }
  if (tx.operations.length < 2) {
    throw new Error(
      'Challenge must contain auth and web_auth_domain operations'
    )
  }

  const authOp = tx.operations[0]
  if (authOp.type !== 'manageData') {
    throw new Error('Challenge first operation must be ManageData')
  }
  if (authOp.source !== address) {
    throw new Error('Challenge operation source does not match address')
  }
  if (
    authOp.name !== CHALLENGE_NAME ||
    manageDataValue(authOp.value).length < 32
  ) {
    throw new Error('Challenge nonce is malformed')
  }

  let sawWebAuthDomain = false
  for (const op of tx.operations.slice(1)) {
    if (op.type !== 'manageData') {
      throw new Error('Challenge contains a non-ManageData operation')
    }
    if (op.name === 'web_auth_domain') {
      if (op.source !== server.publicKey()) {
        throw new Error('web_auth_domain operation must be server-sourced')
      }
      if (manageDataValue(op.value) !== WEB_AUTH_DOMAIN) {
        throw new Error('web_auth_domain does not match server domain')
      }
      sawWebAuthDomain = true
      continue
    }
    if (op.source !== server.publicKey()) {
      throw new Error('Unexpected challenge operation source')
    }
  }
  if (!sawWebAuthDomain) {
    throw new Error('Challenge is missing web_auth_domain')
  }

  const minTime = readTimebound(tx.timeBounds?.minTime)
  const maxTime = readTimebound(tx.timeBounds?.maxTime)
  const now = Math.floor(Date.now() / 1000)
  if (!minTime || !maxTime || now < minTime || now > maxTime) {
    throw new Error('Challenge is outside its valid time window')
  }

  if (!verifies(tx, server)) {
    throw new Error('Challenge is missing the server signature')
  }
  await verifyClientSignerThreshold({ address, tx, server })

  const consumed = await consumeSep10Challenge(txHashKey(tx))
  if (!consumed) {
    throw new Error('Challenge nonce has already been consumed or expired')
  }

  const issuedAt = now
  const session: StellarSessionPayload = {
    sid: randomBytes(18).toString('base64url'),
    address,
    networkPassphrase,
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_SECONDS,
  }

  return { session, token: signSession(session) }
}
