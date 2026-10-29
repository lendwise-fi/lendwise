import { describe, expect, it } from 'vitest'

import {
  WALLET_FAMILIES,
  hasActiveSignedInWallet,
  walletConnector,
} from './wallet-families'

describe('WALLET_FAMILIES', () => {
  it('offers every chain family once, EVM first', () => {
    expect(WALLET_FAMILIES).toEqual(['evm', 'stellar', 'solana'])
  })
})

describe('walletConnector', () => {
  it('sends EVM wallets to wagmi and the others to their own context', () => {
    expect(walletConnector('evm')).toBe('wagmi')
    expect(walletConnector('stellar')).toBe('stellar')
    expect(walletConnector('solana')).toBe('solana')
  })
})

describe('hasActiveSignedInWallet', () => {
  const w = (
    chainFamily: 'evm' | 'stellar' | 'solana',
    isActive: boolean,
    isConnected: boolean
  ) => ({ chainFamily, isActive, isConnected })

  it('counts an active Stellar or Solana wallet that is signed in', () => {
    expect(hasActiveSignedInWallet([w('stellar', true, true)])).toBe(true)
    expect(hasActiveSignedInWallet([w('solana', true, true)])).toBe(true)
  })

  it('needs the wallet to be both active and signed in', () => {
    expect(
      hasActiveSignedInWallet([
        w('solana', false, true),
        w('solana', true, false),
        w('stellar', false, true),
      ])
    ).toBe(false)
  })

  it('leaves EVM wallets to wagmi', () => {
    expect(hasActiveSignedInWallet([w('evm', true, true)])).toBe(false)
    expect(hasActiveSignedInWallet([])).toBe(false)
  })
})
