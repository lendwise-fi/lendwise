import { Keypair, Networks, Transaction } from '@stellar/stellar-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  issueStellarChallenge,
  signSession,
  verifySessionToken,
  verifyStellarChallenge,
} from './stellar-sep10'

// The account Horizon reports for the signing address. `null` = unfunded (404).
const horizon = vi.hoisted(() => ({
  account: null as null | {
    signers: { key: string; weight: number; type?: string }[]
    thresholds: { med_threshold: number }
  },
}))

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>()
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: class {
        async loadAccount() {
          if (!horizon.account) throw { response: { status: 404 } }
          return horizon.account
        }
      },
    },
  }
})

const ORIGINAL_ENV = { ...process.env }
const DOMAIN = 'lendwise.fi'

let server: Keypair
let user: Keypair

beforeEach(() => {
  server = Keypair.random()
  user = Keypair.random()
  horizon.account = null
  process.env.STELLAR_SEP10_SIGNING_SECRET = server.secret()
  process.env.STELLAR_SESSION_SECRET = 'test-session-secret'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.useRealTimers()
})

async function signedChallenge(
  signers: Keypair[],
  passphrase: string = Networks.PUBLIC
): Promise<string> {
  const challenge = await issueStellarChallenge({
    address: user.publicKey(),
    domain: DOMAIN,
  })
  const tx = new Transaction(challenge.transactionXdr, passphrase)
  for (const kp of signers) tx.sign(kp)
  return tx.toXDR()
}

describe('stellar SEP-10 challenge', () => {
  it('issues a sequence-0, server-signed ManageData challenge on mainnet', async () => {
    const challenge = await issueStellarChallenge({
      address: user.publicKey(),
      domain: DOMAIN,
    })

    expect(challenge.networkPassphrase).toBe(Networks.PUBLIC)
    expect(challenge.serverSigningKey).toBe(server.publicKey())

    const tx = new Transaction(challenge.transactionXdr, Networks.PUBLIC)
    expect(tx.source).toBe(server.publicKey())
    expect(String(tx.sequence)).toBe('0')
    expect(tx.operations[0]).toMatchObject({
      type: 'manageData',
      source: user.publicKey(),
      name: `${DOMAIN} auth`,
    })
    expect(
      tx.signatures.some((s) => server.verify(tx.hash(), s.signature()))
    ).toBe(true)
  })

  it('rejects an invalid public key', async () => {
    await expect(
      issueStellarChallenge({ address: 'not-a-key', domain: DOMAIN })
    ).rejects.toThrow('Invalid Stellar public key')
  })

  it('refuses a host too long for a ManageData name', async () => {
    await expect(
      issueStellarChallenge({
        address: user.publicKey(),
        domain: `${'a'.repeat(60)}.vercel.app`,
      })
    ).rejects.toThrow('cannot be used as a SEP-10 domain')
  })
})

describe('stellar SEP-10 verification', () => {
  it('accepts a challenge only after the wallet signs it, and only once', async () => {
    const challenge = await issueStellarChallenge({
      address: user.publicKey(),
      domain: DOMAIN,
    })

    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: challenge.transactionXdr,
        domain: DOMAIN,
      })
    ).rejects.toThrow('two signatures')

    const tx = new Transaction(challenge.transactionXdr, Networks.PUBLIC)
    tx.sign(user)

    const { session, token } = await verifyStellarChallenge({
      address: user.publicKey(),
      transactionXdr: tx.toXDR(),
      domain: DOMAIN,
    })
    expect(session.address).toBe(user.publicKey())
    expect(session.networkPassphrase).toBe(Networks.PUBLIC)
    expect(verifySessionToken(token)?.address).toBe(user.publicKey())

    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: tx.toXDR(),
        domain: DOMAIN,
      })
    ).rejects.toThrow('consumed or expired')
  })

  it('rejects a signature made for another network passphrase', async () => {
    // The wallet signed for testnet while the server runs on mainnet: the
    // transaction hash differs per passphrase, so the signature cannot match.
    const xdr = await signedChallenge([user], Networks.TESTNET)

    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: xdr,
        domain: DOMAIN,
      })
    ).rejects.toThrow('missing the wallet signature')
  })

  it('rejects a challenge signed after its time bounds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const xdr = await signedChallenge([user])

    vi.setSystemTime(new Date('2030-01-01T00:06:00Z'))
    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: xdr,
        domain: DOMAIN,
      })
    ).rejects.toThrow('outside its valid time window')
  })

  it('rejects a challenge presented for another address', async () => {
    const xdr = await signedChallenge([user])

    await expect(
      verifyStellarChallenge({
        address: Keypair.random().publicKey(),
        transactionXdr: xdr,
        domain: DOMAIN,
      })
    ).rejects.toThrow('operation source does not match address')
  })

  it('rejects a challenge replayed on another domain', async () => {
    const xdr = await signedChallenge([user])

    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: xdr,
        domain: 'evil.example',
      })
    ).rejects.toThrow('Challenge nonce is malformed')
  })

  it('rejects a challenge not issued by this server', async () => {
    const xdr = await signedChallenge([user])
    process.env.STELLAR_SEP10_SIGNING_SECRET = Keypair.random().secret()

    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: xdr,
        domain: DOMAIN,
      })
    ).rejects.toThrow('does not match server signer')
  })

  it('checks a funded account against its signers and medium threshold', async () => {
    const cosigner = Keypair.random()
    horizon.account = {
      signers: [
        { key: user.publicKey(), weight: 1, type: 'ed25519_public_key' },
        { key: cosigner.publicKey(), weight: 1, type: 'ed25519_public_key' },
      ],
      thresholds: { med_threshold: 2 },
    }

    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: await signedChallenge([user]),
        domain: DOMAIN,
      })
    ).rejects.toThrow('do not meet account threshold')

    const { session } = await verifyStellarChallenge({
      address: user.publicKey(),
      transactionXdr: await signedChallenge([user, cosigner]),
      domain: DOMAIN,
    })
    expect(session.address).toBe(user.publicKey())
  })

  it('rejects a funded-account challenge carrying an unrecognized signature', async () => {
    horizon.account = {
      signers: [
        { key: user.publicKey(), weight: 1, type: 'ed25519_public_key' },
      ],
      thresholds: { med_threshold: 1 },
    }

    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: await signedChallenge([user, Keypair.random()]),
        domain: DOMAIN,
      })
    ).rejects.toThrow('unrecognized signatures')
  })
})

describe('stellar session token', () => {
  it('rejects a session issued for another network', () => {
    const now = Math.floor(Date.now() / 1000)
    const token = signSession({
      sid: 'sid-network-test-0123',
      address: user.publicKey(),
      networkPassphrase: Networks.TESTNET,
      issuedAt: now,
      expiresAt: now + 3600,
    })

    expect(verifySessionToken(token)).toBeNull()
  })
})
