'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import { SolanaSignMessage } from '@solana/wallet-standard-features'
import { getWallets } from '@wallet-standard/app'
import { toast } from 'sonner'

import { SolanaWalletPicker } from '@/components/wallet/SolanaWalletPicker'
import { identifyWallet } from '@/lib/analytics/identifyWallet'
import { formatAddress } from '@/lib/utils'
import { reconnectHint, takeExpectedReconnect } from '@/lib/wallet/reconnect'
import {
  STANDARD_CONNECT,
  STANDARD_DISCONNECT,
  STANDARD_EVENTS,
  type SiwsChallenge,
  type SolanaWallet,
  type StandardWallet,
  type StandardWalletAccount,
  encodeSolanaSignature,
  restoredSolanaWalletUpdate,
  sameBytes,
  shouldClearSolanaSession,
  siwsChallengeProblem,
  solanaAccount,
  solanaAccountChange,
  solanaSignedInDuringRestore,
  walletUpdatesAfterSolanaSignIn,
} from '@/lib/wallet/solana-wallets'
import { useWalletStore } from '@/stores/walletStore'
import type { SolanaSession, Wallet } from '@/stores/walletStore'

interface SolanaWalletContextType {
  /** Opens the wallet picker, then signs the chosen account in (SIWS). */
  connectSolana: () => Promise<void>
  /** Signs `address` out on the server and removes it from the store. */
  disconnectSolana: (address: string) => Promise<void>
  isConnecting: boolean
  error: string | null
}

interface SolanaSessionResponse {
  session: SolanaSession
}

/** A wallet connected in this page, on the account it shares. */
interface Connected {
  wallet: SolanaWallet
  account: StandardWalletAccount
}

/** The picker while it is open, and the connect call waiting on it. */
interface WalletPicker {
  resolve: (connected: Connected) => void
  reject: (error: Error) => void
}

/** Closing the picker: the user changed their mind, nothing to report. */
class WalletPickerClosed extends Error {
  constructor() {
    super('Solana wallet picker closed')
  }
}

const ACCOUNT_SWITCH_TOAST = 'solana-account-switch'

const SolanaWalletContext = createContext<SolanaWalletContextType | undefined>(
  undefined
)

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

/** Asks the wallet for its accounts and keeps the first Solana mainnet one. */
async function connectWallet(wallet: SolanaWallet): Promise<Connected> {
  const { accounts } = await wallet.features[STANDARD_CONNECT].connect()
  const account = solanaAccount(accounts)
  if (!account) {
    throw new Error(`${wallet.name} did not share a Solana mainnet account`)
  }
  return { wallet, account }
}

export function SolanaWalletProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detected, setDetected] = useState<readonly StandardWallet[]>([])
  const [walletPicker, setWalletPicker] = useState<WalletPicker | null>(null)
  // The wallet signed in from this page, and how to stop following it.
  const liveRef = useRef<(Connected & { stop: () => void }) | null>(null)

  const { addWallets, updateWallet, removeWallet } = useWalletStore()

  // Wallets announce themselves through Wallet Standard, before or after the
  // page loads: the picker lists them as they register.
  useEffect(() => {
    const registry = getWallets()
    const refresh = () => setDetected(registry.get())
    refresh()
    const offs = [
      registry.on('register', refresh),
      registry.on('unregister', refresh),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => () => liveRef.current?.stop(), [])

  // After a refresh, a persisted Solana wallet counts as connected only if the
  // server still holds a valid SIWS session for that address.
  useEffect(() => {
    const restoreSession = async () => {
      const solanaWallets = useWalletStore
        .getState()
        .wallets.filter((wallet) => wallet.chainFamily === 'solana')
      if (solanaWallets.length === 0) return

      const session = await requestJson<SolanaSessionResponse>(
        '/api/auth/solana/session'
      )
        .then((r) => r.session)
        .catch(() => null)

      // Re-read after the await: skip only wallets signed in meanwhile.
      const current = useWalletStore.getState().wallets
      for (const wallet of solanaWallets) {
        const latest = current.find(
          (w) => w.chainFamily === 'solana' && w.address === wallet.address
        )
        if (!latest) continue
        if (solanaSignedInDuringRestore(wallet, latest)) continue
        updateWallet(
          wallet.address,
          restoredSolanaWalletUpdate(latest, session)
        )
      }
    }

    restoreSession()
  }, [updateWallet])

  /** Opens the picker; resolves once the chosen wallet shares an account. */
  const pickWallet = () =>
    new Promise<Connected>((resolve, reject) => {
      // A picker already open (a second connect click) is cancelled, not left hanging.
      walletPicker?.reject(new WalletPickerClosed())
      setWalletPicker({ resolve, reject })
    })

  /** A picker row: connect inside the click, so the wallet may open a window. */
  const onWalletPicked = (wallet: SolanaWallet) => {
    if (!walletPicker) return
    const { resolve, reject } = walletPicker
    setWalletPicker(null)
    connectWallet(wallet).then(resolve, reject)
  }

  /**
   * Follows the wallet's account changes. A switch to another account offers
   * to sign that one in; the signed-in session is left as it is.
   */
  const follow = (connected: Connected) => {
    liveRef.current?.stop()
    const signedIn = connected.account.address
    const off = connected.wallet.features[STANDARD_EVENTS]?.on(
      'change',
      ({ accounts }) => {
        const change = solanaAccountChange(signedIn, accounts)
        if (change.kind === 'none') {
          toast.dismiss(ACCOUNT_SWITCH_TOAST)
          return
        }
        if (change.kind === 'disconnected') {
          toast.dismiss(ACCOUNT_SWITCH_TOAST)
          liveRef.current?.stop()
          return
        }
        const next = { wallet: connected.wallet, account: change.account }
        toast.info(
          `${connected.wallet.name} is now on ${formatAddress(change.account.address)}.`,
          {
            id: ACCOUNT_SWITCH_TOAST,
            description: 'Sign in to switch LendWise to that account.',
            action: {
              label: 'Sign in',
              onClick: () => void run(() => signIn(next, null)),
            },
          }
        )
      }
    )
    const live = {
      ...connected,
      stop: () => {
        off?.()
        if (liveRef.current === live) liveRef.current = null
      },
    }
    liveRef.current = live
  }

  /**
   * Sign-In With Solana: the server issues a message, the wallet signs its
   * exact bytes, the server verifies them and sets the session cookie.
   */
  const signIn = async (
    { wallet, account }: Connected,
    expectedAddress: string | null
  ) => {
    const address = account.address

    // The wallet is open on another account than the row's: stop before
    // signing that one in, and say which account to switch to.
    const hint = reconnectHint({
      expected: expectedAddress,
      actual: address,
      family: 'solana',
      walletName: wallet.name,
    })
    if (hint) {
      toast.info(hint)
      return
    }

    const challenge = await postJson<SiwsChallenge>(
      '/api/auth/solana/challenge',
      { address }
    )
    const problem = siwsChallengeProblem(challenge, address)
    if (problem) throw new Error(problem)

    const message = new TextEncoder().encode(challenge.message)
    const [signed] = await wallet.features[SolanaSignMessage].signMessage({
      account,
      message,
    })
    if (!signed) throw new Error(`${wallet.name} did not sign the message`)
    // The server verifies its own copy of the message: altered bytes would
    // only fail there, so stop here with a clear reason.
    if (!signed.signedMessage || !sameBytes(signed.signedMessage, message)) {
      throw new Error(
        `${wallet.name} changed the sign-in message before signing it`
      )
    }
    const { session } = await postJson<SolanaSessionResponse>(
      '/api/auth/solana/verify',
      {
        address,
        nonce: challenge.nonce,
        signature: encodeSolanaSignature(signed.signature),
      }
    )

    const newWallet: Wallet = {
      address,
      name: formatAddress(address),
      ens: null,
      walletType: wallet.name,
      smartContractWalletType: null,
      isActive: true,
      isConnected: true,
      isCurrentlyConnected: true,
      chainFamily: 'solana',
      avatarUri: '',
      roles: [],
      isUpdating: false,
      solanaSession: session,
    }

    // addWallets skips an address already in the store (a wallet persisted
    // before this sign-in), so update it explicitly as well.
    addWallets([newWallet])
    updateWallet(address, newWallet)
    identifyWallet({ address, chainFamily: 'solana' })

    const others = walletUpdatesAfterSolanaSignIn(
      useWalletStore.getState().wallets,
      address
    )
    for (const { address: other, update } of others) {
      updateWallet(other, update)
    }

    toast.dismiss(ACCOUNT_SWITCH_TOAST)
    follow({ wallet, account })
  }

  const run = async (task: () => Promise<void>) => {
    setIsConnecting(true)
    setError(null)
    try {
      await task()
    } catch (err: unknown) {
      if (err instanceof WalletPickerClosed) return
      console.error('Failed to connect Solana wallet:', err)
      const message =
        (err instanceof Error ? err.message : String(err)) ||
        'Failed to connect Solana wallet'
      setError(message)
      toast.error(message)
    } finally {
      setIsConnecting(false)
    }
  }

  const connectSolana = () => {
    // Set when a wallet-list row asked to sign its own address back in.
    const expectedAddress = takeExpectedReconnect('solana')
    return run(async () => signIn(await pickWallet(), expectedAddress))
  }

  const disconnectSolana = async (address: string) => {
    const live = liveRef.current
    if (live && live.account.address === address) {
      live.stop()
      // Lets the wallet clean up; it keeps the site's authorization.
      try {
        await live.wallet.features[STANDARD_DISCONNECT]?.disconnect()
      } catch (err) {
        console.warn('Solana wallet disconnect failed:', err)
      }
    }
    // Fail closed: skip the DELETE only when the server session is known to
    // belong to another account.
    try {
      const server = await requestJson<SolanaSessionResponse>(
        '/api/auth/solana/session'
      )
        .then((r) => ({
          ok: true as const,
          sessionAddress: r.session?.address ?? null,
        }))
        .catch(() => ({ ok: false as const }))
      if (shouldClearSolanaSession(address, server)) {
        await requestJson<{ ok: boolean }>('/api/auth/solana/session', {
          method: 'DELETE',
        })
      }
    } catch (err) {
      console.warn('Failed to clear Solana server session:', err)
    } finally {
      removeWallet(address)
    }
  }

  return (
    <SolanaWalletContext.Provider
      value={{ connectSolana, disconnectSolana, isConnecting, error }}
    >
      {children}
      <SolanaWalletPicker
        open={walletPicker !== null}
        wallets={detected}
        onSelect={onWalletPicked}
        onClose={() => {
          walletPicker?.reject(new WalletPickerClosed())
          setWalletPicker(null)
        }}
      />
    </SolanaWalletContext.Provider>
  )
}

export function useSolanaWallet() {
  const context = useContext(SolanaWalletContext)
  if (context === undefined) {
    throw new Error(
      'useSolanaWallet must be used within a SolanaWalletProvider'
    )
  }
  return context
}
