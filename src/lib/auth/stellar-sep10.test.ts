import { Keypair, Networks, Transaction } from '@stellar/stellar-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { issueStellarChallenge, verifyStellarChallenge } from './stellar-sep10'

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>()
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: class {
        async loadAccount() {
          throw { response: { status: 404 } }
        }
      },
    },
  }
})

const ORIGINAL_ENV = { ...process.env }

describe('stellar SEP-10 auth', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('accepts a server-issued challenge only after the wallet signs it', async () => {
    const server = Keypair.random()
    const user = Keypair.random()
    process.env.STELLAR_SEP10_SIGNING_SECRET = server.secret()
    process.env.STELLAR_SESSION_SECRET = 'test-session-secret'
    process.env.STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET
    process.env.NEXT_PUBLIC_APP_DOMAIN = 'lendwise.fi'

    const challenge = await issueStellarChallenge(user.publicKey())

    expect(challenge.transaction).toBe(challenge.transactionXdr)
    expect(challenge.homeDomain).toBe('lendwise.fi')
    expect(challenge.webAuthDomain).toBe('lendwise.fi')

    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: challenge.transactionXdr,
      })
    ).rejects.toThrow('two signatures')

    const tx = new Transaction(challenge.transactionXdr, Networks.TESTNET)
    tx.sign(user)

    const { session, token } = await verifyStellarChallenge({
      address: user.publicKey(),
      transactionXdr: tx.toXDR(),
    })

    expect(session.address).toBe(user.publicKey())
    expect(session.networkPassphrase).toBe(Networks.TESTNET)
    expect(token).toContain('.')

    await expect(
      verifyStellarChallenge({
        address: user.publicKey(),
        transactionXdr: tx.toXDR(),
      })
    ).rejects.toThrow('consumed or expired')
  })
})
