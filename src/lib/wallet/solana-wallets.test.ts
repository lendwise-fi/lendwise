import { base64 } from '@scure/base'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { SolanaSession, Wallet } from '@/stores/walletStore'

import {
  FEATURED_SOLANA_WALLETS,
  type SiwsChallenge,
  type StandardWallet,
  type StandardWalletAccount,
  currentSolanaSession,
  encodeSolanaSignature,
  isSolanaWallet,
  restoredSolanaWalletUpdate,
  sameBytes,
  shouldClearSolanaSession,
  siwsChallengeProblem,
  solanaAccount,
  solanaAccountChange,
  solanaSignedInDuringRestore,
  solanaWalletSections,
  walletUpdatesAfterSolanaSignIn,
} from './solana-wallets'

// Valid base58 keys of 32 bytes. Case matters: lowercasing changes the key.
const ALICE = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const BOB = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'

const ICON = 'data:image/svg+xml;base64,PHN2Zy8+' as const
const NOW = 1_000_000

const solanaFeatures = (): StandardWallet['features'] => ({
  'standard:connect': {
    version: '1.0.0',
    connect: async () => ({ accounts: [] }),
  },
  'solana:signMessage': { version: '1.1.0', signMessage: async () => [] },
})

const standardWallet = (
  name: string,
  {
    chains = ['solana:mainnet', 'solana:devnet'],
    features = solanaFeatures(),
  }: {
    chains?: StandardWallet['chains']
    features?: StandardWallet['features']
  } = {}
): StandardWallet => ({
  version: '1.0.0',
  name,
  icon: ICON,
  chains,
  features,
  accounts: [],
})

const account = (
  address: string,
  chains: StandardWalletAccount['chains'] = ['solana:mainnet']
): StandardWalletAccount => ({
  address,
  publicKey: new Uint8Array(32),
  chains,
  features: ['solana:signMessage'],
})

const session = (
  address: string,
  overrides: Partial<SolanaSession> = {}
): SolanaSession => ({
  sid: 'sid',
  address,
  chain: 'solana:mainnet',
  issuedAt: NOW - 100,
  expiresAt: NOW + 100,
  ...overrides,
})

const wallet = (overrides: Partial<Wallet> = {}): Wallet => ({
  address: ALICE,
  name: 'w',
  ens: null,
  walletType: 'Phantom',
  smartContractWalletType: null,
  isActive: true,
  isConnected: true,
  isCurrentlyConnected: true,
  chainFamily: 'solana',
  avatarUri: '',
  roles: [],
  isUpdating: false,
  ...overrides,
})

describe('isSolanaWallet', () => {
  it('accepts a wallet that connects and signs messages on Solana mainnet', () => {
    expect(isSolanaWallet(standardWallet('Phantom'))).toBe(true)
  })

  it('refuses a wallet without message signing or without connect', () => {
    const { 'solana:signMessage': _sign, ...noSign } = solanaFeatures()
    const { 'standard:connect': _connect, ...noConnect } = solanaFeatures()
    expect(isSolanaWallet(standardWallet('A', { features: noSign }))).toBe(
      false
    )
    expect(isSolanaWallet(standardWallet('B', { features: noConnect }))).toBe(
      false
    )
  })

  it('refuses a feature that has no method to call', () => {
    expect(
      isSolanaWallet(
        standardWallet('C', {
          features: { ...solanaFeatures(), 'solana:signMessage': {} },
        })
      )
    ).toBe(false)
  })

  it('refuses a wallet that is not on Solana mainnet', () => {
    expect(
      isSolanaWallet(standardWallet('Devnet', { chains: ['solana:devnet'] }))
    ).toBe(false)
    expect(
      isSolanaWallet(standardWallet('Sui Wallet', { chains: ['sui:mainnet'] }))
    ).toBe(false)
  })
})

describe('solanaWalletSections', () => {
  it('lists Phantom then Solflare first, then the other wallets in detection order', () => {
    const { available, toInstall } = solanaWalletSections([
      standardWallet('Backpack'),
      standardWallet('Solflare'),
      standardWallet('Glow'),
      standardWallet('Phantom'),
    ])
    expect(available.map((w) => w.name)).toEqual([
      'Phantom',
      'Solflare',
      'Backpack',
      'Glow',
    ])
    expect(toInstall).toEqual([])
  })

  it('offers to install Phantom and Solflare when neither is detected', () => {
    const { available, toInstall } = solanaWalletSections([])
    expect(available).toEqual([])
    expect(toInstall).toEqual([
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
    ])
  })

  it('offers to install only the featured wallet that is missing', () => {
    const { available, toInstall } = solanaWalletSections([
      standardWallet('Backpack'),
      standardWallet('Solflare'),
    ])
    expect(available.map((w) => w.name)).toEqual(['Solflare', 'Backpack'])
    expect(toInstall.map((w) => w.id)).toEqual(['phantom'])
  })

  it('leaves out wallets that cannot sign in on Solana mainnet', () => {
    const { available, toInstall } = solanaWalletSections([
      standardWallet('Sui Wallet', { chains: ['sui:mainnet'] }),
      standardWallet('Phantom', { chains: ['solana:devnet'] }),
      standardWallet('Backpack'),
    ])
    expect(available.map((w) => w.name)).toEqual(['Backpack'])
    expect(toInstall.map((w) => w.id)).toEqual(['phantom', 'solflare'])
  })

  it('matches the featured names case-insensitively and lists a wallet once', () => {
    const { available, toInstall } = solanaWalletSections([
      standardWallet('PHANTOM'),
      standardWallet('Phantom'),
    ])
    expect(available.map((w) => w.name)).toEqual(['PHANTOM'])
    expect(toInstall.map((w) => w.id)).toEqual(['solflare'])
  })

  it('ships an icon for every wallet it offers to install', () => {
    for (const w of FEATURED_SOLANA_WALLETS) {
      expect(existsSync(path.join(process.cwd(), 'public', w.icon))).toBe(true)
    }
  })
})

describe('solanaAccount', () => {
  it('takes the first account on Solana mainnet with a valid address', () => {
    expect(
      solanaAccount([
        account(BOB, ['solana:devnet']),
        account('not-a-key'),
        account(ALICE),
        account(BOB),
      ])?.address
    ).toBe(ALICE)
  })

  it('finds none in an empty or unusable list', () => {
    expect(solanaAccount([])).toBeNull()
    expect(solanaAccount([account(BOB, ['solana:testnet'])])).toBeNull()
  })
})

describe('solanaAccountChange', () => {
  it('ignores a change that does not touch the accounts', () => {
    expect(solanaAccountChange(ALICE, undefined)).toEqual({ kind: 'none' })
  })

  it('ignores a change that keeps the signed-in account', () => {
    expect(solanaAccountChange(ALICE, [account(BOB), account(ALICE)])).toEqual({
      kind: 'none',
    })
  })

  it('reports the account the wallet switched to', () => {
    const bob = account(BOB)
    expect(solanaAccountChange(ALICE, [bob])).toEqual({
      kind: 'switched',
      account: bob,
    })
  })

  it('compares addresses with their case', () => {
    const lower = account(ALICE.toLowerCase())
    // A lowercased base58 string is another key, or no key at all.
    expect(solanaAccountChange(ALICE, [lower]).kind).not.toBe('none')
  })

  it('reports a wallet that no longer shares any account', () => {
    expect(solanaAccountChange(ALICE, [])).toEqual({ kind: 'disconnected' })
    expect(
      solanaAccountChange(ALICE, [account(BOB, ['solana:devnet'])])
    ).toEqual({ kind: 'disconnected' })
  })
})

describe('siwsChallengeProblem', () => {
  // The server's challenge, as documented by the sign-in routes.
  const challenge = (overrides: Partial<SiwsChallenge> = {}): SiwsChallenge => {
    const nonce = '72a0d9854f7617da3c6dea3563a98d34'
    return {
      address: ALICE,
      nonce,
      message: [
        `localhost:3000 wants you to sign in with your Solana account:`,
        ALICE,
        '',
        'Sign in to LendWise with this Solana account. Signing sends no transaction and costs no fee.',
        '',
        'URI: http://localhost:3000',
        'Version: 1',
        'Chain ID: mainnet',
        `Nonce: ${nonce}`,
        'Issued At: 2026-10-29T11:37:13.000Z',
        'Expiration Time: 2026-10-29T11:42:13.000Z',
      ].join('\n'),
      domain: 'localhost:3000',
      uri: 'http://localhost:3000',
      issuedAt: '2026-10-29T11:37:13.000Z',
      expiresAt: '2026-10-29T11:42:13.000Z',
      ...overrides,
    }
  }

  it("accepts the server's challenge for this account, whatever host it names", () => {
    expect(siwsChallengeProblem(challenge(), ALICE)).toBeNull()
  })

  it('refuses a challenge issued for another account', () => {
    expect(siwsChallengeProblem(challenge({ address: BOB }), ALICE)).toMatch(
      /another account/
    )
    expect(
      siwsChallengeProblem(
        challenge({ message: challenge().message.replace(ALICE, BOB) }),
        ALICE
      )
    ).toMatch(/does not name this account/)
  })

  it('refuses a message that does not carry the nonce', () => {
    expect(
      siwsChallengeProblem(challenge({ nonce: 'f'.repeat(32) }), ALICE)
    ).toMatch(/nonce/)
  })
})

describe('encodeSolanaSignature', () => {
  const signature = Uint8Array.from({ length: 64 }, (_, i) => (i * 37) % 256)

  it('encodes the 64 signature bytes as padded standard base64', () => {
    const encoded = encodeSolanaSignature(signature)
    expect(encoded).toHaveLength(88)
    expect(encoded.endsWith('==')).toBe(true)
    expect(encoded).toBe(btoa(String.fromCharCode(...signature)))
    expect(base64.decode(encoded)).toEqual(signature)
  })

  it('refuses a signature that is not 64 bytes', () => {
    expect(() => encodeSolanaSignature(new Uint8Array(63))).toThrow(/signature/)
    expect(() => encodeSolanaSignature(new Uint8Array(65))).toThrow(/signature/)
  })
})

describe('sameBytes', () => {
  it('compares bytes, not references', () => {
    const message = new TextEncoder().encode('sign in')
    expect(sameBytes(message, new TextEncoder().encode('sign in'))).toBe(true)
    expect(sameBytes(message, new TextEncoder().encode('sign in!'))).toBe(false)
    expect(sameBytes(message, new TextEncoder().encode('sign on'))).toBe(false)
  })
})

describe('restoredSolanaWalletUpdate', () => {
  it('keeps the wallet that owns the server session', () => {
    const s = session(ALICE)
    expect(restoredSolanaWalletUpdate(wallet({ isActive: true }), s)).toEqual({
      isConnected: true,
      isCurrentlyConnected: true,
      solanaSession: s,
    })
    expect(
      restoredSolanaWalletUpdate(wallet({ isActive: false }), s)
    ).toMatchObject({ isConnected: true, isCurrentlyConnected: false })
  })

  it('signs out every other wallet, without lowercasing the address', () => {
    const signedOut = {
      isConnected: false,
      isCurrentlyConnected: false,
      isActive: false,
      solanaSession: undefined,
    }
    expect(restoredSolanaWalletUpdate(wallet(), session(BOB))).toEqual(
      signedOut
    )
    expect(restoredSolanaWalletUpdate(wallet(), null)).toEqual(signedOut)
    expect(
      restoredSolanaWalletUpdate(wallet(), session(ALICE.toLowerCase()))
    ).toEqual(signedOut)
  })
})

describe('solanaSignedInDuringRestore', () => {
  it('skips only a wallet signed in while the session request was out', () => {
    const before = wallet({ solanaSession: undefined })
    expect(
      solanaSignedInDuringRestore(
        before,
        wallet({ solanaSession: session(ALICE) })
      )
    ).toBe(true)
    expect(
      solanaSignedInDuringRestore(
        wallet({ solanaSession: session(ALICE) }),
        wallet({ solanaSession: session(ALICE, { issuedAt: NOW }) })
      )
    ).toBe(true)
    const stale = wallet({ solanaSession: session(ALICE) })
    expect(solanaSignedInDuringRestore(stale, { ...stale })).toBe(false)
    expect(solanaSignedInDuringRestore(before, before)).toBe(false)
  })
})

describe('currentSolanaSession', () => {
  it('picks the newest unexpired Solana session, the one the cookie holds', () => {
    const older = session(ALICE, { issuedAt: NOW - 500 })
    const newer = session(BOB, { issuedAt: NOW - 10 })
    const wallets = [
      wallet({ address: ALICE, solanaSession: older }),
      wallet({ address: BOB, solanaSession: newer }),
    ]
    expect(currentSolanaSession(wallets, NOW)).toBe(newer)
    expect(currentSolanaSession([...wallets].reverse(), NOW)).toBe(newer)
  })

  it('skips expired sessions and wallets of other families', () => {
    const live = session(ALICE, { issuedAt: NOW - 500 })
    expect(
      currentSolanaSession(
        [
          wallet({ address: ALICE, solanaSession: live }),
          wallet({
            address: BOB,
            solanaSession: session(BOB, { issuedAt: NOW - 1, expiresAt: NOW }),
          }),
          wallet({
            address: '0xabc',
            chainFamily: 'evm',
            solanaSession: session('0xabc', { issuedAt: NOW }),
          }),
        ],
        NOW
      )
    ).toBe(live)
    expect(currentSolanaSession([wallet()], NOW)).toBeNull()
  })
})

describe('shouldClearSolanaSession', () => {
  it('fails closed, and keeps a session that belongs to another account', () => {
    expect(shouldClearSolanaSession(ALICE, { ok: false })).toBe(true)
    expect(
      shouldClearSolanaSession(ALICE, { ok: true, sessionAddress: null })
    ).toBe(true)
    expect(
      shouldClearSolanaSession(ALICE, { ok: true, sessionAddress: ALICE })
    ).toBe(true)
    expect(
      shouldClearSolanaSession(ALICE, { ok: true, sessionAddress: BOB })
    ).toBe(false)
  })
})

describe('walletUpdatesAfterSolanaSignIn', () => {
  it('deactivates every other wallet and signs out the other Solana ones', () => {
    const wallets = [
      wallet({ address: ALICE }),
      wallet({ address: BOB, solanaSession: session(BOB) }),
      wallet({ address: '0xabc', chainFamily: 'evm' }),
      wallet({
        address: 'GAAA',
        chainFamily: 'stellar',
        isActive: false,
        isCurrentlyConnected: false,
      }),
    ]
    expect(walletUpdatesAfterSolanaSignIn(wallets, ALICE)).toEqual([
      {
        address: BOB,
        update: {
          isActive: false,
          isCurrentlyConnected: false,
          isConnected: false,
          solanaSession: undefined,
        },
      },
      {
        address: '0xabc',
        update: { isActive: false, isCurrentlyConnected: false },
      },
    ])
  })

  it('leaves the Stellar session alone: it lives in its own cookie', () => {
    const stellar = wallet({
      address: 'GAAA',
      chainFamily: 'stellar',
      stellarSession: {
        address: 'GAAA',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
        issuedAt: NOW - 10,
        expiresAt: NOW + 10,
      },
    })
    expect(walletUpdatesAfterSolanaSignIn([stellar], ALICE)).toEqual([
      {
        address: 'GAAA',
        update: { isActive: false, isCurrentlyConnected: false },
      },
    ])
  })
})
