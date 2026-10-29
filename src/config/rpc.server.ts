import 'server-only'

import { cachedRpcJwt } from './rpc-jwt'
import {
  PUBLIC_RPC_DEFAULTS,
  type RpcNetwork,
  type RpcProvider,
  isRpcProvider,
  rpcUrl,
} from './rpc-providers'

/** Where the server reaches one network, and how it authenticates there. */
export interface ServerRpc {
  url: string
  /** How the key proves itself: Infura's Basic secret, dRPC's JWT, or nothing. */
  headers: Record<string, string>
}

/**
 * `RPC_URL_<SLUG>`: a full URL that replaces the provider's for one network,
 * with its own optional secret in `RPC_URL_<SLUG>_SECRET`.
 */
export function rpcOverrideVar(network: RpcNetwork): string {
  return `RPC_URL_${network.toUpperCase()}`
}

/** A key secret as the Basic auth header Infura expects; none without one. */
function basicAuth(secret: string | undefined): Record<string, string> {
  return secret
    ? { Authorization: `Basic ${Buffer.from(`:${secret}`).toString('base64')}` }
    : {}
}

const rpcJwt = cachedRpcJwt()

/**
 * The JWT dRPC checks when "JSON web token" is on for the server key, signed
 * with `RPC_JWT_PRIVATE_KEY` and naming the uploaded public key by
 * `RPC_JWT_KEY_ID`. Without either variable, no token: the key works alone.
 */
function drpcJwtAuth(
  env: Record<string, string | undefined>
): Record<string, string> {
  const privateKeyPem = env.RPC_JWT_PRIVATE_KEY?.trim()
  const keyId = env.RPC_JWT_KEY_ID?.trim()
  if (!privateKeyPem && !keyId) return {}
  if (!privateKeyPem || !keyId) {
    throw new Error('RPC_JWT_PRIVATE_KEY and RPC_JWT_KEY_ID go together')
  }
  return { Authorization: rpcJwt({ privateKeyPem, keyId }) }
}

/** Each provider's own proof for the server key; never another provider's. */
function providerAuth(
  provider: RpcProvider,
  env: Record<string, string | undefined>
): Record<string, string> {
  switch (provider) {
    case 'infura':
      return basicAuth(env.RPC_API_KEY_SECRET?.trim())
    case 'drpc':
      return drpcJwtAuth(env)
  }
}

/**
 * Server RPC of a network. An override URL wins, authenticated only by its
 * own `RPC_URL_<SLUG>_SECRET` — the provider's secret never goes to another
 * host. Otherwise the provider URL with the server key and that provider's
 * own proof (Infura: the key's secret as Basic auth; dRPC: a signed JWT).
 * A network with a public default (Solana) falls back to it, before and
 * without any provider config. Null when the provider does not serve the
 * network.
 */
export function resolveServerRpc(
  network: RpcNetwork,
  env: Record<string, string | undefined>
): ServerRpc | null {
  const overrideVar = rpcOverrideVar(network)
  const override = env[overrideVar]?.trim()
  if (override) {
    return {
      url: override,
      headers: basicAuth(env[`${overrideVar}_SECRET`]?.trim()),
    }
  }

  const publicDefault = PUBLIC_RPC_DEFAULTS[network]
  if (publicDefault) return { url: publicDefault, headers: {} }

  const provider = env.NEXT_PUBLIC_RPC_PROVIDER?.trim()
  if (!isRpcProvider(provider)) {
    throw new Error(
      'NEXT_PUBLIC_RPC_PROVIDER is missing or not a known provider'
    )
  }
  const key = env.RPC_API_KEY?.trim()
  if (!key) throw new Error('RPC_API_KEY is not defined')

  const url = rpcUrl(provider, network, key)
  if (url === null) return null
  return { url, headers: providerAuth(provider, env) }
}

/** `resolveServerRpc` on the process env, read at call time, never at import. */
export function serverRpc(network: RpcNetwork): ServerRpc | null {
  return resolveServerRpc(network, process.env)
}
