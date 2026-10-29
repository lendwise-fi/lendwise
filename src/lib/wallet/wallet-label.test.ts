import { describe, expect, it } from 'vitest'

import {
  isWalletConnected,
  walletRowMenu,
  walletSubtitle,
} from './wallet-label'

describe('walletSubtitle', () => {
  it('names the EVM family, and says when there is no client', () => {
    expect(
      walletSubtitle({ chainFamily: 'evm', isConnected: true }, true)
    ).toBe('EVM')
    expect(
      walletSubtitle({ chainFamily: 'evm', isConnected: true }, false)
    ).toBe('EVM · Not connected')
  })

  it('keeps the Stellar labels', () => {
    expect(
      walletSubtitle({ chainFamily: 'stellar', isConnected: true }, false)
    ).toBe('Stellar')
    expect(
      walletSubtitle({ chainFamily: 'stellar', isConnected: false }, false)
    ).toBe('Stellar · Not signed in')
  })

  it('says when a Solana wallet holds no session, as for Stellar', () => {
    expect(
      walletSubtitle({ chainFamily: 'solana', isConnected: true }, false)
    ).toBe('Solana')
    expect(
      walletSubtitle({ chainFamily: 'solana', isConnected: false }, true)
    ).toBe('Solana · Not signed in')
  })
})

describe('walletRowMenu', () => {
  it('offers to reconnect a wallet that is not connected, and only to remove it', () => {
    expect(
      walletRowMenu({ chainFamily: 'evm', isConnected: true }, false)
    ).toEqual({ connect: 'Connect', remove: 'Remove' })
    expect(
      walletRowMenu({ chainFamily: 'stellar', isConnected: false }, false)
    ).toEqual({ connect: 'Sign in', remove: 'Remove' })
  })

  it('offers to disconnect a connected wallet', () => {
    expect(
      walletRowMenu({ chainFamily: 'evm', isConnected: true }, true)
    ).toEqual({ connect: null, remove: 'Disconnect' })
    expect(
      walletRowMenu({ chainFamily: 'stellar', isConnected: true }, false)
    ).toEqual({ connect: null, remove: 'Disconnect' })
    expect(
      walletRowMenu({ chainFamily: 'solana', isConnected: true }, false)
    ).toEqual({ connect: null, remove: 'Disconnect' })
  })

  it('offers to sign a Solana wallet back in, as for Stellar', () => {
    expect(
      walletRowMenu({ chainFamily: 'solana', isConnected: false }, false)
    ).toEqual({ connect: 'Sign in', remove: 'Remove' })
    // A wagmi client says nothing about a Solana session.
    expect(
      walletRowMenu({ chainFamily: 'solana', isConnected: false }, true)
    ).toEqual({ connect: 'Sign in', remove: 'Remove' })
  })
})

describe('isWalletConnected', () => {
  it('reads the wagmi client for EVM and the flag for other families', () => {
    expect(
      isWalletConnected({ chainFamily: 'evm', isConnected: true }, false)
    ).toBe(false)
    expect(
      isWalletConnected({ chainFamily: 'evm', isConnected: false }, true)
    ).toBe(true)
    expect(
      isWalletConnected({ chainFamily: 'solana', isConnected: true }, false)
    ).toBe(true)
    expect(
      isWalletConnected({ chainFamily: 'solana', isConnected: false }, true)
    ).toBe(false)
    expect(
      isWalletConnected({ chainFamily: 'stellar', isConnected: true }, false)
    ).toBe(true)
  })
})
