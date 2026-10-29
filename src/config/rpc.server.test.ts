import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveServerRpc, rpcOverrideVar } from './rpc.server'

const base = {
  NEXT_PUBLIC_RPC_PROVIDER: 'infura',
  RPC_API_KEY: 'serverkey',
  RPC_API_KEY_SECRET: 'serversecret',
}
const basic = `Basic ${Buffer.from(':serversecret').toString('base64')}`

describe('resolveServerRpc', () => {
  it('uses the server key and sends the secret as Basic auth', () => {
    expect(resolveServerRpc('linea', base)).toEqual({
      url: 'https://linea-mainnet.infura.io/v3/serverkey',
      headers: { Authorization: basic },
    })
  })

  it('never sends the Infura secret to dRPC', () => {
    expect(
      resolveServerRpc('celo', {
        NEXT_PUBLIC_RPC_PROVIDER: 'drpc',
        RPC_API_KEY: 'drpckey',
        RPC_API_KEY_SECRET: 'serversecret',
      })?.headers
    ).toEqual({})
  })

  it('signs a dRPC JWT naming the uploaded key', () => {
    const privateKeyPem = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString()
    const rpc = resolveServerRpc('celo', {
      NEXT_PUBLIC_RPC_PROVIDER: 'drpc',
      RPC_API_KEY: 'drpckey',
      RPC_JWT_PRIVATE_KEY: privateKeyPem,
      RPC_JWT_KEY_ID: 'FINGERPRINT',
    })
    const token = rpc?.headers.Authorization ?? ''
    expect(token.split('.')).toHaveLength(3)
    expect(
      JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).kid
    ).toBe('FINGERPRINT')
  })

  it('asks for both JWT variables together', () => {
    expect(() =>
      resolveServerRpc('celo', {
        NEXT_PUBLIC_RPC_PROVIDER: 'drpc',
        RPC_API_KEY: 'drpckey',
        RPC_JWT_KEY_ID: 'FINGERPRINT',
      })
    ).toThrow(/RPC_JWT_PRIVATE_KEY and RPC_JWT_KEY_ID/)
  })

  it('sends no header without a secret', () => {
    const { RPC_API_KEY_SECRET: _, ...noSecret } = base
    expect(resolveServerRpc('base', noSecret)?.headers).toEqual({})
  })

  it('takes an override URL as is, without the provider header', () => {
    expect(
      resolveServerRpc('stellar', {
        ...base,
        RPC_URL_STELLAR: ' https://soroban.example.org ',
      })
    ).toEqual({ url: 'https://soroban.example.org', headers: {} })
  })

  it('authenticates an override with its own secret, never the provider one', () => {
    expect(
      resolveServerRpc('stellar', {
        ...base,
        RPC_URL_STELLAR: 'https://stellar-mainnet.infura.io/v3/otherkey',
        RPC_URL_STELLAR_SECRET: 'othersecret',
      })
    ).toEqual({
      url: 'https://stellar-mainnet.infura.io/v3/otherkey',
      headers: {
        Authorization: `Basic ${Buffer.from(':othersecret').toString('base64')}`,
      },
    })
  })

  it('builds dRPC URLs with the server key and no header', () => {
    expect(
      resolveServerRpc('celo', {
        NEXT_PUBLIC_RPC_PROVIDER: 'drpc',
        RPC_API_KEY: 'drpckey',
      })
    ).toEqual({ url: 'https://lb.drpc.live/celo/drpckey', headers: {} })
  })

  it('names the missing variable', () => {
    expect(() =>
      resolveServerRpc('linea', {
        ...base,
        NEXT_PUBLIC_RPC_PROVIDER: undefined,
      })
    ).toThrow(/NEXT_PUBLIC_RPC_PROVIDER/)
    expect(() =>
      resolveServerRpc('linea', { ...base, NEXT_PUBLIC_RPC_PROVIDER: 'nope' })
    ).toThrow(/NEXT_PUBLIC_RPC_PROVIDER/)
    expect(() =>
      resolveServerRpc('linea', { ...base, RPC_API_KEY: '' })
    ).toThrow(/RPC_API_KEY/)
  })

  it('reaches Solana on the public mainnet RPC, with no provider config', () => {
    expect(resolveServerRpc('solana', {})).toEqual({
      url: 'https://api.mainnet-beta.solana.com',
      headers: {},
    })
    // The provider key is never used for Solana, whatever provider is set.
    expect(resolveServerRpc('solana', { ...base })).toEqual({
      url: 'https://api.mainnet-beta.solana.com',
      headers: {},
    })
  })

  it('lets RPC_URL_SOLANA replace the public RPC', () => {
    expect(
      resolveServerRpc('solana', {
        RPC_URL_SOLANA: 'https://sol.example.org/key',
        RPC_URL_SOLANA_SECRET: 's',
      })
    ).toEqual({
      url: 'https://sol.example.org/key',
      headers: {
        Authorization: `Basic ${Buffer.from(':s').toString('base64')}`,
      },
    })
  })

  it('needs no provider config when the network is overridden', () => {
    expect(
      resolveServerRpc('monad', { RPC_URL_MONAD: 'https://monad.example.org' })
    ).toEqual({ url: 'https://monad.example.org', headers: {} })
  })
})

describe('rpcOverrideVar', () => {
  it('upper-cases the slug', () => {
    expect(rpcOverrideVar('hyperevm')).toBe('RPC_URL_HYPEREVM')
  })
})

describe('importing the module', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not throw with every RPC env var unset', async () => {
    vi.resetModules()
    for (const name of [
      'NEXT_PUBLIC_RPC_PROVIDER',
      'NEXT_PUBLIC_RPC_API_KEY',
      'RPC_API_KEY',
      'RPC_API_KEY_SECRET',
    ]) {
      vi.stubEnv(name, '')
    }
    await expect(import('./rpc.server')).resolves.toBeDefined()
  })
})
