import { describe, expect, it } from 'vitest'

import { isSolanaAddress, normalizeAddress } from './address'

const SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const EVM = '0x52908400098527886E0F7030069857D2E4169EE7'
const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'

describe('isSolanaAddress', () => {
  it('accepts a base58 string that decodes to 32 bytes', () => {
    expect(isSolanaAddress(SOL)).toBe(true)
    expect(isSolanaAddress('11111111111111111111111111111111')).toBe(true)
  })

  it('rejects other lengths, bad alphabets and other families', () => {
    expect(isSolanaAddress('')).toBe(false)
    expect(isSolanaAddress('abc')).toBe(false)
    expect(isSolanaAddress(SOL.slice(8))).toBe(false)
    expect(isSolanaAddress(`${SOL}111`)).toBe(false)
    expect(isSolanaAddress(`0${SOL.slice(1)}`)).toBe(false)
    expect(isSolanaAddress(EVM)).toBe(false)
    expect(isSolanaAddress(G)).toBe(false)
  })

  it('is case-sensitive: a lowercased address is another key', () => {
    expect(isSolanaAddress(SOL.toLowerCase())).toBe(false)
  })
})

describe('normalizeAddress', () => {
  it('lowercases EVM only', () => {
    expect(normalizeAddress('evm', EVM)).toBe(EVM.toLowerCase())
    expect(normalizeAddress('solana', SOL)).toBe(SOL)
    expect(normalizeAddress('stellar', G)).toBe(G)
  })
})
