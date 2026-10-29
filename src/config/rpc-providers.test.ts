import { describe, expect, it } from 'vitest'

import {
  PUBLIC_RPC_DEFAULTS,
  RPC_NETWORKS,
  isRpcNetwork,
  isRpcProvider,
  rpcUrl,
} from './rpc-providers'

describe('rpcUrl', () => {
  it('builds Infura URLs from the registry slug', () => {
    expect(rpcUrl('infura', 'ethereum', 'k1')).toBe(
      'https://mainnet.infura.io/v3/k1'
    )
    expect(rpcUrl('infura', 'linea', 'k1')).toBe(
      'https://linea-mainnet.infura.io/v3/k1'
    )
    expect(rpcUrl('infura', 'stellar', 'k1')).toBe(
      'https://stellar-mainnet.infura.io/v3/k1'
    )
  })

  it('serves every network on Infura', () => {
    for (const n of RPC_NETWORKS.filter((n) => n !== 'solana')) {
      expect(rpcUrl('infura', n, 'k')).toMatch(
        /^https:\/\/[a-z]+(-mainnet)?\.infura\.io\/v3\/k$/
      )
    }
  })

  it('builds dRPC URLs, HyperEVM under its dRPC name', () => {
    expect(rpcUrl('drpc', 'ethereum', 'k1')).toBe(
      'https://lb.drpc.live/ethereum/k1'
    )
    expect(rpcUrl('drpc', 'hyperevm', 'k1')).toBe(
      'https://lb.drpc.live/hyperliquid/k1'
    )
    expect(rpcUrl('drpc', 'stellar', 'k1')).toBe(
      'https://lb.drpc.live/stellar/k1'
    )
  })

  it('serves every network on dRPC', () => {
    for (const n of RPC_NETWORKS.filter((n) => n !== 'solana')) {
      expect(rpcUrl('drpc', n, 'k')).toMatch(
        /^https:\/\/lb\.drpc\.live\/[a-z]+\/k$/
      )
    }
  })

  it('serves Solana on no provider: it has a public default instead', () => {
    expect(rpcUrl('infura', 'solana', 'k')).toBeNull()
    expect(rpcUrl('drpc', 'solana', 'k')).toBeNull()
    expect(PUBLIC_RPC_DEFAULTS.solana).toBe(
      'https://api.mainnet-beta.solana.com'
    )
  })

  it('refuses an empty key instead of building a broken URL', () => {
    expect(() => rpcUrl('infura', 'base', '')).toThrow(/key/)
  })
})

describe('guards', () => {
  it('recognises networks and providers', () => {
    expect(isRpcNetwork('linea')).toBe(true)
    expect(isRpcNetwork('gnosis')).toBe(false)
    expect(isRpcProvider('infura')).toBe(true)
    expect(isRpcProvider('drpc')).toBe(true)
    expect(isRpcProvider('alchemy')).toBe(false)
    expect(isRpcProvider(undefined)).toBe(false)
    expect(isRpcProvider('toString')).toBe(false)
  })
})
