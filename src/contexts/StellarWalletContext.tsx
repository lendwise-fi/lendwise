'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  expiresAt: string
  serverSigningKey: string
}

interface Sep10SessionResponse {
  session: StellarSession
}

/**
 * The wallet modal's colors, as the app's own theme tokens. The kit writes each
 * value into a `--swk-*` custom property on <html>, where the `.dark` class
 * next-themes toggles also lives — so the modal follows light and dark mode
 * with no listener. Without this it kept the kit's light default in dark mode.
 * (`lighter` and `light` are unused by the kit's components.)
 */
const SWK_THEME = {
  background: 'var(--popover)',
  'background-secondary': 'var(--muted)',
  'foreground-strong': 'var(--foreground)',
  foreground: 'var(--popover-foreground)',
  'foreground-secondary': 'var(--muted-foreground)',
  primary: 'var(--primary)',
  'primary-foreground': 'var(--primary-foreground)',
  transparent: 'rgba(0, 0, 0, 0)',
  lighter: 'var(--muted)',
  light: 'var(--accent)',
  'light-gray': 'var(--muted-foreground)',
  gray: 'var(--muted-foreground)',
  danger: 'var(--destructive)',
  border: 'var(--border)',
  shadow:
    '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  'border-radius': 'var(--radius)',
  // The app's font variable is declared on <body>, below <html>: inherit it.
  'font-family': 'inherit',
}

/**
 * Wallets that sign in a browser popup opened by this page (`window.open`).
 * Connecting already opened one, for the address, and spent the click that
 * allowed it; the challenge only arrives after a server round trip, so the
 * signing popup would be blocked — Albedo then waits forever, silently. For
 * these, the user confirms with a click first, which lets the popup open.
 * Extension (Freighter, xBull) and WalletConnect (Lobstr) wallets are unaffected.
 */
const SIGNS_IN_A_POPUP = new Set(['albedo'])

interface SignPrompt {
  walletName: string
  resolve: () => void
  reject: (error: Error) => void
}

const StellarWalletContext = createContext<
  StellarWalletContextType | undefined
>(undefined)

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  const payload = (await res.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!res.ok) throw new Error(payload.error ?? `Request failed: ${res.status}`)
  return payload
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return requestJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function manageDataValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return new TextDecoder().decode(value)
  return ''
}

/**
 * Checks the challenge before handing it to the wallet: it must be a SEP-10
 * challenge from our server, for this address and this network, and nothing
 * the wallet could be tricked into signing as a real payment.
 */
async function validateSep10Challenge({
  address,
  challenge,
}: {
  address: string
  challenge: Sep10ChallengeResponse
}): Promise<void> {
  const { Keypair, Networks, Transaction } =
    await import('@stellar/stellar-sdk')
  // Mainnet only, like the server (lib/auth/stellar-sep10.ts): a challenge for
  // any other passphrase is refused before the wallet is asked to sign it.
  if (challenge.networkPassphrase !== Networks.PUBLIC) {
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
  if (!tx.signatures.some((sig) => server.verify(hash, sig.signature()))) {
    throw new Error('Challenge is missing the server signature')
  }

  if (tx.operations.some((op) => op.type !== 'manageData')) {
    throw new Error('Challenge contains a non-ManageData operation')
  }
  const authOp = tx.operations[0]
  if (authOp?.type !== 'manageData') {
    throw new Error('Challenge first operation must be ManageData')
  }
  if (authOp.source !== address) {
    throw new Error('Challenge operation source does not match address')
  }
  // SEP-10: the challenge must name the site we are on, not whatever domain
  // the response claims.
  const domain = window.location.hostname
  if (
    authOp.name !== `${domain} auth` ||
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
  if (manageDataValue(webAuthOp.value) !== domain) {
    throw new Error('web_auth_domain does not match server domain')
  }
}

export function StellarWalletProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [signPrompt, setSignPrompt] = useState<SignPrompt | null>(null)

  /** Resolves when the user clicks "Sign", rejects if they cancel. */
  const confirmSigning = (walletName: string) =>
    new Promise<void>((resolve, reject) =>
      setSignPrompt({ walletName, resolve, reject })
    )

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
          network: Networks.PUBLIC,
          theme: SWK_THEME,
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

  // After a refresh, a persisted Stellar wallet counts as connected only if
  // the server still holds a valid SEP-10 session for that address. Wallets
  // persisted before SEP-10 existed carry no session and are downgraded too.
  useEffect(() => {
    const restoreSession = async () => {
      const stellarWallets = useWalletStore
        .getState()
        .wallets.filter((wallet) => wallet.chainFamily === 'stellar')
      if (stellarWallets.length === 0) return

      const session = await requestJson<Sep10SessionResponse>(
        '/api/auth/stellar/session'
      )
        .then((r) => r.session)
        .catch(() => null)

      for (const wallet of stellarWallets) {
        const owned = session?.address === wallet.address ? session : undefined
        updateWallet(wallet.address, {
          isConnected: owned !== undefined,
          isCurrentlyConnected: owned !== undefined && wallet.isActive,
          stellarSession: owned,
        })
      }
    }

    restoreSession()
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
      const result = await StellarWalletsKit.authModal()
      const address = result?.address

      if (!address) {
        throw new Error('Failed to retrieve address from the wallet')
      }

      // SEP-10: the server issues a challenge, the wallet signs it without
      // broadcasting, the server verifies it and sets the session cookie.
      const challenge = await postJson<Sep10ChallengeResponse>(
        '/api/auth/stellar/challenge',
        { address }
      )
      await validateSep10Challenge({ address, challenge })
      const wallet = StellarWalletsKit.selectedModule
      if (SIGNS_IN_A_POPUP.has(wallet.productId)) {
        await confirmSigning(wallet.productName)
      }
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(
        challenge.transactionXdr,
        { networkPassphrase: challenge.networkPassphrase, address }
      )
      if (!signedTxXdr) {
        throw new Error('Wallet did not return a signed challenge')
      }
      const { session } = await postJson<Sep10SessionResponse>(
        '/api/auth/stellar/verify',
        { address, transactionXdr: signedTxXdr }
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
        stellarSession: session,
      }

      // addWallets skips an address already in the store (e.g. a wallet
      // persisted before sign-in), so update it explicitly as well.
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
      await requestJson<{ ok: boolean }>('/api/auth/stellar/session', {
        method: 'DELETE',
      })
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
      <Dialog
        open={signPrompt !== null}
        onOpenChange={(open) => {
          if (open || !signPrompt) return
          signPrompt.reject(new Error('Stellar sign-in cancelled'))
          setSignPrompt(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify your wallet</DialogTitle>
            <DialogDescription>
              Sign a short challenge with {signPrompt?.walletName} to prove you
              own this address. It is never sent to the Stellar network, so it
              costs nothing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                signPrompt?.reject(new Error('Stellar sign-in cancelled'))
                setSignPrompt(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Resolving here, inside the click, lets the wallet's popup open.
                signPrompt?.resolve()
                setSignPrompt(null)
              }}
            >
              Sign with {signPrompt?.walletName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
