'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

import { identifyWallet } from '@/lib/analytics/identifyWallet'
import { formatAddress } from '@/lib/utils'
import { useWalletStore } from '@/stores/walletStore'
import type { StellarSession, Wallet } from '@/stores/walletStore'

interface StellarWalletContextType {
  connectStellar: () => Promise<void>
  disconnectStellar: (address: string) => Promise<void>
  isConnecting: boolean
  error: string | null
}

interface Sep10ChallengeResponse {
  address: string
  networkPassphrase: string
  transactionXdr: string
  transaction: string
  expiresAt: string
  homeDomain: string
  webAuthDomain: string
  serverSigningKey: string
}

interface Sep10VerifyResponse {
  session: StellarSession
}

interface Sep10SessionResponse {
  session: StellarSession
}

type StellarWalletsKitApi = {
  authModal: () => Promise<{ address?: string } | undefined>
  signTransaction?: (
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ) => Promise<
    string | { signedTxXdr?: string; signedXDR?: string; xdr?: string }
  >
  sign?: (p: {
    xdr: string
    networkPassphrase?: string
    address?: string
  }) => Promise<
    string | { signedTxXdr?: string; signedXDR?: string; xdr?: string }
  >
}

const StellarWalletContext = createContext<
  StellarWalletContextType | undefined
>(undefined)

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  })
  const payload = (await res.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!res.ok) throw new Error(payload.error ?? `Request failed: ${res.status}`)
  return payload
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' })
  const payload = (await res.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!res.ok) throw new Error(payload.error ?? `Request failed: ${res.status}`)
  return payload
}

async function deleteJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' })
  const payload = (await res.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!res.ok) throw new Error(payload.error ?? `Request failed: ${res.status}`)
  return payload
}

function manageDataValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value)
  }
  return ''
}

function expectedNetworkPassphrase(): string | null {
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? null
}

function walletKitNetwork<T extends { PUBLIC: unknown; TESTNET: unknown }>(
  Networks: T
): T['PUBLIC'] | T['TESTNET'] {
  const expected = expectedNetworkPassphrase()
  if (expected === 'Public Global Stellar Network ; September 2015') {
    return Networks.PUBLIC
  }
  return Networks.TESTNET
}

async function validateSep10Challenge({
  address,
  challenge,
}: {
  address: string
  challenge: Sep10ChallengeResponse
}): Promise<void> {
  const { Keypair, Transaction } = await import('@stellar/stellar-sdk')
  const expected = expectedNetworkPassphrase()
  if (expected && expected !== challenge.networkPassphrase) {
    throw new Error(
      'Challenge network does not match configured Stellar network'
    )
  }

  const tx = new Transaction(
    challenge.transactionXdr,
    challenge.networkPassphrase
  )
  if (tx.source !== challenge.serverSigningKey) {
    throw new Error('Challenge source account does not match server signer')
  }
  if (String(tx.sequence) !== '0') {
    throw new Error('Challenge sequence must be 0')
  }
  const server = Keypair.fromPublicKey(challenge.serverSigningKey)
  const hash = tx.hash()
  const signedByServer = tx.signatures.some((sig) =>
    server.verify(hash, sig.signature())
  )
  if (!signedByServer) {
    throw new Error('Challenge is missing the server signature')
  }

  const authOp = tx.operations[0]
  if (authOp?.type !== 'manageData') {
    throw new Error('Challenge first operation must be ManageData')
  }
  if (authOp.source !== address) {
    throw new Error('Challenge operation source does not match address')
  }
  if (
    authOp.name !== challenge.homeDomain + ' auth' ||
    manageDataValue(authOp.value).length < 32
  ) {
    throw new Error('Challenge nonce is malformed')
  }

  const webAuthOp = tx.operations.find(
    (op) => op.type === 'manageData' && op.name === 'web_auth_domain'
  )
  if (!webAuthOp || webAuthOp.type !== 'manageData') {
    throw new Error('Challenge is missing web_auth_domain')
  }
  if (webAuthOp.source !== challenge.serverSigningKey) {
    throw new Error('web_auth_domain operation must be server-sourced')
  }
  if (manageDataValue(webAuthOp.value) !== challenge.webAuthDomain) {
    throw new Error('web_auth_domain does not match server domain')
  }
}

function signedXdrFromResult(
  result: string | { signedTxXdr?: string; signedXDR?: string; xdr?: string }
): string {
  if (typeof result === 'string') return result
  const signed = result.signedTxXdr ?? result.signedXDR ?? result.xdr
  if (typeof signed !== 'string' || signed.length === 0) {
    throw new Error('Wallet did not return a signed challenge transaction')
  }
  return signed
}

async function signSep10Challenge({
  kit,
  address,
  challenge,
}: {
  kit: StellarWalletsKitApi
  address: string
  challenge: Sep10ChallengeResponse
}): Promise<string> {
  if (kit.signTransaction) {
    return signedXdrFromResult(
      await kit.signTransaction(challenge.transactionXdr, {
        networkPassphrase: challenge.networkPassphrase,
        address,
      })
    )
  }
  if (kit.sign) {
    return signedXdrFromResult(
      await kit.sign({
        xdr: challenge.transactionXdr,
        networkPassphrase: challenge.networkPassphrase,
        address,
      })
    )
  }
  throw new Error(
    'Selected Stellar wallet does not support transaction signing'
  )
}

export function StellarWalletProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const { addWallets, updateWallet, removeWallet } = useWalletStore()

  useEffect(() => {
    // Dynamically initialize the Stellar Wallets Kit on the client side
    const initKit = async () => {
      try {
        const { StellarWalletsKit, Networks } =
          await import('@creit-tech/stellar-wallets-kit')
        const { AlbedoModule } =
          await import('@creit-tech/stellar-wallets-kit/modules/albedo')
        const { FreighterModule } =
          await import('@creit-tech/stellar-wallets-kit/modules/freighter')
        const { LobstrModule } =
          await import('@creit-tech/stellar-wallets-kit/modules/lobstr')
        const { xBullModule } =
          await import('@creit-tech/stellar-wallets-kit/modules/xbull')

        StellarWalletsKit.init({
          network: walletKitNetwork(Networks),
          modules: [
            new AlbedoModule(),
            new FreighterModule(),
            new LobstrModule(),
            new xBullModule(),
          ],
        })
        setInitialized(true)
      } catch (err) {
        console.error('Failed to initialize StellarWalletsKit:', err)
      }
    }
    initKit()
  }, [])

  useEffect(() => {
    const validatePersistedSession = async () => {
      const stellarWallets = useWalletStore
        .getState()
        .wallets.filter(
          (wallet) => wallet.chainFamily === 'stellar' && wallet.stellarSession
        )

      if (stellarWallets.length === 0) return

      try {
        const { session } = await getJson<Sep10SessionResponse>(
          '/api/auth/stellar/session'
        )

        for (const wallet of stellarWallets) {
          const isSessionWallet =
            wallet.address.toLowerCase() === session.address.toLowerCase()
          updateWallet(wallet.address, {
            isConnected: isSessionWallet,
            isCurrentlyConnected: isSessionWallet,
            stellarSession: isSessionWallet ? session : undefined,
          })
        }
      } catch {
        for (const wallet of stellarWallets) {
          updateWallet(wallet.address, {
            isConnected: false,
            isCurrentlyConnected: false,
            stellarSession: undefined,
          })
        }
      }
    }

    validatePersistedSession()
  }, [updateWallet])

  const connectStellar = async () => {
    if (!initialized) {
      setError('Stellar wallet kit is not initialized yet.')
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const { StellarWalletsKit } =
        await import('@creit-tech/stellar-wallets-kit')
      const kit = StellarWalletsKit as StellarWalletsKitApi
      const result = await kit.authModal()
      const address = result?.address

      if (!address) {
        throw new Error('Failed to retrieve address from the wallet')
      }

      const challenge = await postJson<Sep10ChallengeResponse>(
        '/api/auth/stellar/challenge',
        { address }
      )
      await validateSep10Challenge({ address, challenge })
      const signedChallengeXdr = await signSep10Challenge({
        kit,
        address,
        challenge,
      })
      const verified = await postJson<Sep10VerifyResponse>(
        '/api/auth/stellar/verify',
        { address, transactionXdr: signedChallengeXdr }
      )

      const newWallet: Wallet = {
        address: address,
        name: formatAddress(address),
        ens: null,
        walletType: 'Stellar Wallet',
        smartContractWalletType: null,
        isActive: true,
        isConnected: true,
        isCurrentlyConnected: true,
        chainFamily: 'stellar',
        avatarUri: '',
        roles: [],
        isUpdating: false,
        stellarSession: verified.session,
      }

      addWallets([newWallet])
      updateWallet(address, newWallet)
      identifyWallet({ address, chainFamily: 'stellar' })

      // Deselect other active wallets
      const allWallets = useWalletStore.getState().wallets
      allWallets.forEach((w) => {
        if (w.address !== address) {
          updateWallet(w.address, {
            isActive: false,
            isCurrentlyConnected: false,
          })
        }
      })
    } catch (err: unknown) {
      console.error('Failed to connect Stellar wallet:', err)
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(errMsg || 'Failed to connect Stellar wallet')
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnectStellar = async (address: string) => {
    try {
      await deleteJson<{ ok: boolean }>('/api/auth/stellar/session')
    } catch (err) {
      console.warn('Failed to clear Stellar server session:', err)
    } finally {
      removeWallet(address)
    }
  }

  return (
    <StellarWalletContext.Provider
      value={{ connectStellar, disconnectStellar, isConnecting, error }}
    >
      {children}
    </StellarWalletContext.Provider>
  )
}

export function useStellarWallet() {
  const context = useContext(StellarWalletContext)
  if (context === undefined) {
    throw new Error(
      'useStellarWallet must be used within a StellarWalletProvider'
    )
  }
  return context
}
