import { describe, expect, it } from 'vitest'

import type {
  SolanaSession,
  StellarSession,
  Wallet,
} from '@/stores/walletStore'

import {
  activeWalletUpdatesWithoutEvm,
  currentStellarSession,
  isDisplayableActive,
  parseUsedWalletIds,
  restoredStellarWalletUpdate,
  shouldClearStellarSession,
  signedInDuringRestore,
  stellarWalletSections,
} from './stellar-wallets'

const NOW = 1_000_000
const session = (
  address: string,
  overrides: Partial<StellarSession> = {}
): StellarSession => ({
  address,
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  issuedAt: NOW - 100,
  expiresAt: NOW + 100,
  ...overrides,
})

// Solana keys are case-sensitive base58.
const SOL_A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOL_B = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
const solSession = (
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
  address: 'GAAA',
  name: 'w',
  ens: null,
  walletType: null,
  smartContractWalletType: null,
  isActive: true,
  isConnected: true,
  isCurrentlyConnected: true,
  chainFamily: 'stellar',
  avatarUri: '',
  roles: [],
  isUpdating: false,
  ...overrides,
})

describe('restoredStellarWalletUpdate', () => {
  it('restores a sessionless wallet as inactive and disconnected', () => {
    const s = session('GBBB')
    expect(restoredStellarWalletUpdate(wallet({ address: 'GAAA' }), s)).toEqual(
      {
        isConnected: false,
        isCurrentlyConnected: false,
        isActive: false,
        stellarSession: undefined,
      }
    )
    expect(restoredStellarWalletUpdate(wallet(), null)).toMatchObject({
      isConnected: false,
      isActive: false,
    })
  })

  it('keeps the wallet that owns the session', () => {
    const s = session('GAAA')
    expect(restoredStellarWalletUpdate(wallet({ isActive: true }), s)).toEqual({
      isConnected: true,
      isCurrentlyConnected: true,
      stellarSession: s,
    })
    expect(
      restoredStellarWalletUpdate(wallet({ isActive: false }), s)
    ).toMatchObject({ isCurrentlyConnected: false, isConnected: true })
  })
})

describe('isDisplayableActive', () => {
  it('requires a Stellar wallet to hold its own session', () => {
    expect(
      isDisplayableActive(
        wallet({ isConnected: true, stellarSession: undefined })
      )
    ).toBe(false)
    expect(
      isDisplayableActive(wallet({ stellarSession: session('GBBB') }))
    ).toBe(false)
    expect(
      isDisplayableActive(wallet({ stellarSession: session('GAAA') }), NOW)
    ).toBe(true)
    expect(
      isDisplayableActive(
        wallet({ stellarSession: session('GAAA', { expiresAt: NOW }) }),
        NOW
      )
    ).toBe(false)
  })

  it('keeps EVM wallets', () => {
    expect(
      isDisplayableActive(wallet({ chainFamily: 'evm', isConnected: false }))
    ).toBe(true)
  })

  it('requires a Solana wallet to hold its own live session', () => {
    const solana = (overrides: Partial<Wallet> = {}) =>
      wallet({ address: SOL_A, chainFamily: 'solana', ...overrides })
    expect(isDisplayableActive(solana({ isConnected: true }), NOW)).toBe(false)
    expect(
      isDisplayableActive(solana({ solanaSession: solSession(SOL_B) }), NOW)
    ).toBe(false)
    expect(
      isDisplayableActive(solana({ solanaSession: solSession(SOL_A) }), NOW)
    ).toBe(true)
    expect(
      isDisplayableActive(
        solana({ solanaSession: solSession(SOL_A, { expiresAt: NOW }) }),
        NOW
      )
    ).toBe(false)
    // A Stellar session does not stand in for a Solana one.
    expect(
      isDisplayableActive(solana({ stellarSession: session(SOL_A) }), NOW)
    ).toBe(false)
  })
})

describe('shouldClearStellarSession', () => {
  it('fails closed', () => {
    expect(shouldClearStellarSession('GAAA', { ok: false })).toBe(true)
    expect(
      shouldClearStellarSession('GAAA', { ok: true, sessionAddress: null })
    ).toBe(true)
    expect(
      shouldClearStellarSession('GAAA', { ok: true, sessionAddress: 'GAAA' })
    ).toBe(true)
  })

  it('skips only when the session belongs to another address', () => {
    expect(
      shouldClearStellarSession('GAAA', { ok: true, sessionAddress: 'GBBB' })
    ).toBe(false)
  })
})

describe('signedInDuringRestore', () => {
  it('does not skip a persisted stale session (unchanged issuedAt)', () => {
    const w = wallet({ stellarSession: session('GAAA') })
    expect(signedInDuringRestore(w, { ...w })).toBe(false)
    // server answers with another address or none: restore update downgrades
    expect(restoredStellarWalletUpdate(w, session('GBBB'))).toMatchObject({
      isConnected: false,
      stellarSession: undefined,
    })
    expect(restoredStellarWalletUpdate(w, null)).toMatchObject({
      isConnected: false,
    })
  })

  it('skips a session issued during the await', () => {
    const before = wallet({ stellarSession: undefined })
    const after = wallet({ stellarSession: session('GAAA') })
    expect(signedInDuringRestore(before, after)).toBe(true)
    expect(
      signedInDuringRestore(
        wallet({ stellarSession: session('GAAA') }),
        wallet({ stellarSession: session('GAAA', { issuedAt: NOW }) })
      )
    ).toBe(true)
    expect(signedInDuringRestore(before, wallet())).toBe(false)
  })
})

describe('currentStellarSession', () => {
  it('picks the newest unexpired Stellar session, the one the cookie holds', () => {
    const older = session('GAAA', { issuedAt: NOW - 500 })
    const newer = session('GBBB', { issuedAt: NOW - 10 })
    const wallets = [
      wallet({ address: 'GAAA', stellarSession: older }),
      wallet({ address: 'GBBB', stellarSession: newer }),
    ]
    expect(currentStellarSession(wallets, NOW)).toBe(newer)
    expect(currentStellarSession([...wallets].reverse(), NOW)).toBe(newer)
  })

  it('skips expired sessions and non-Stellar wallets', () => {
    const expired = session('GBBB', { issuedAt: NOW - 10, expiresAt: NOW })
    const live = session('GAAA', { issuedAt: NOW - 500 })
    expect(
      currentStellarSession(
        [
          wallet({ address: 'GAAA', stellarSession: live }),
          wallet({ address: 'GBBB', stellarSession: expired }),
          wallet({
            address: '0xabc',
            chainFamily: 'evm',
            stellarSession: session('0xabc', { issuedAt: NOW }),
          }),
        ],
        NOW
      )
    ).toBe(live)
    expect(currentStellarSession([wallet()], NOW)).toBeNull()
    expect(currentStellarSession([], NOW)).toBeNull()
  })
})

describe('activeWalletUpdatesWithoutEvm', () => {
  const evm = (overrides: Partial<Wallet> = {}) =>
    wallet({ address: '0xabc', chainFamily: 'evm', ...overrides })

  it('hands the active slot back to the Stellar session once the EVM wallet is gone', () => {
    // Connecting MetaMask deactivated the Stellar wallet; MetaMask then left.
    const wallets = [
      evm(),
      wallet({
        isActive: false,
        isCurrentlyConnected: false,
        stellarSession: session('GAAA'),
      }),
    ]
    expect(activeWalletUpdatesWithoutEvm(wallets, NOW)).toEqual([
      {
        address: '0xabc',
        update: { isActive: false, isCurrentlyConnected: false },
      },
      {
        address: 'GAAA',
        update: {
          isActive: true,
          isCurrentlyConnected: true,
          isConnected: true,
        },
      },
    ])
  })

  it('changes nothing once the session owner is the active wallet', () => {
    const wallets = [
      evm({ isActive: false, isCurrentlyConnected: false }),
      wallet({ stellarSession: session('GAAA') }),
    ]
    expect(activeWalletUpdatesWithoutEvm(wallets, NOW)).toEqual([])
  })

  it('activates no Stellar wallet without a live session', () => {
    const wallets = [
      evm(),
      wallet({
        isActive: false,
        isCurrentlyConnected: false,
        stellarSession: session('GAAA', { expiresAt: NOW }),
      }),
      wallet({
        address: 'GBBB',
        isActive: false,
        isCurrentlyConnected: false,
      }),
    ]
    expect(activeWalletUpdatesWithoutEvm(wallets, NOW)).toEqual([
      {
        address: '0xabc',
        update: { isActive: false, isCurrentlyConnected: false },
      },
    ])
  })

  it('activates only the wallet whose session the cookie holds', () => {
    const wallets = [
      wallet({
        address: 'GAAA',
        stellarSession: session('GAAA', { issuedAt: NOW - 500 }),
      }),
      wallet({
        address: 'GBBB',
        isActive: false,
        isCurrentlyConnected: false,
        stellarSession: session('GBBB', { issuedAt: NOW - 10 }),
      }),
    ]
    expect(activeWalletUpdatesWithoutEvm(wallets, NOW)).toEqual([
      {
        address: 'GAAA',
        update: { isActive: false, isCurrentlyConnected: false },
      },
      {
        address: 'GBBB',
        update: {
          isActive: true,
          isCurrentlyConnected: true,
          isConnected: true,
        },
      },
    ])
  })

  const solana = (overrides: Partial<Wallet> = {}) =>
    wallet({ address: SOL_A, chainFamily: 'solana', ...overrides })

  it('hands the active slot to the Solana session once the EVM wallet is gone', () => {
    const wallets = [
      evm(),
      solana({
        isActive: false,
        isCurrentlyConnected: false,
        solanaSession: solSession(SOL_A),
      }),
    ]
    expect(activeWalletUpdatesWithoutEvm(wallets, NOW)).toEqual([
      {
        address: '0xabc',
        update: { isActive: false, isCurrentlyConnected: false },
      },
      {
        address: SOL_A,
        update: {
          isActive: true,
          isCurrentlyConnected: true,
          isConnected: true,
        },
      },
    ])
  })

  it('gives the slot to the newest sign-in when Stellar and Solana both hold a session', () => {
    const stellarNewer = [
      wallet({ stellarSession: session('GAAA', { issuedAt: NOW - 10 }) }),
      solana({ solanaSession: solSession(SOL_A, { issuedAt: NOW - 500 }) }),
    ]
    expect(activeWalletUpdatesWithoutEvm(stellarNewer, NOW)).toEqual([
      {
        address: SOL_A,
        update: { isActive: false, isCurrentlyConnected: false },
      },
    ])

    const solanaNewer = [
      wallet({ stellarSession: session('GAAA', { issuedAt: NOW - 500 }) }),
      solana({
        isActive: false,
        isCurrentlyConnected: false,
        solanaSession: solSession(SOL_A, { issuedAt: NOW - 10 }),
      }),
    ]
    expect(activeWalletUpdatesWithoutEvm(solanaNewer, NOW)).toEqual([
      {
        address: 'GAAA',
        update: { isActive: false, isCurrentlyConnected: false },
      },
      {
        address: SOL_A,
        update: {
          isActive: true,
          isCurrentlyConnected: true,
          isConnected: true,
        },
      },
    ])
  })

  it('takes the slot from a Solana wallet without a live session', () => {
    const wallets = [
      solana({ solanaSession: solSession(SOL_A, { expiresAt: NOW }) }),
      solana({ address: SOL_B, isActive: false, isCurrentlyConnected: false }),
    ]
    expect(activeWalletUpdatesWithoutEvm(wallets, NOW)).toEqual([
      {
        address: SOL_A,
        update: { isActive: false, isCurrentlyConnected: false },
      },
    ])
  })
})

describe('stellarWalletSections', () => {
  const wallets = [
    { id: 'albedo', isAvailable: true },
    { id: 'freighter', isAvailable: false },
    { id: 'lobstr', isAvailable: true },
    { id: 'xbull', isAvailable: true },
  ]

  it('lists the usable wallets most recently used first, then the ones to install', () => {
    const { available, toInstall } = stellarWalletSections(wallets, [
      'xbull',
      'lobstr',
    ])
    expect(available.map((a) => a.wallet.id)).toEqual([
      'xbull',
      'lobstr',
      'albedo',
    ])
    expect(toInstall.map((w) => w.id)).toEqual(['freighter'])
  })

  it('flags only the latest wallet used as recent', () => {
    const { available } = stellarWalletSections(wallets, ['lobstr', 'xbull'])
    expect(available.filter((a) => a.recent).map((a) => a.wallet.id)).toEqual([
      'lobstr',
    ])
  })

  it('keeps the kit order when no wallet was used yet', () => {
    const { available } = stellarWalletSections(wallets, [])
    expect(available.map((a) => a.wallet.id)).toEqual([
      'albedo',
      'lobstr',
      'xbull',
    ])
    expect(available.some((a) => a.recent)).toBe(false)
  })
})

describe('parseUsedWalletIds', () => {
  it('reads the kit record, keeping string ids only', () => {
    expect(parseUsedWalletIds('["xbull", 3, "albedo"]')).toEqual([
      'xbull',
      'albedo',
    ])
  })

  it('falls back to no recent wallet on a missing or broken record', () => {
    expect(parseUsedWalletIds(null)).toEqual([])
    expect(parseUsedWalletIds('{oops')).toEqual([])
    expect(parseUsedWalletIds('{"a":1}')).toEqual([])
  })
})
