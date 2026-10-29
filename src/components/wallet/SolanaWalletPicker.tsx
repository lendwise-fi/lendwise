'use client'

import type { ReactNode } from 'react'

import Image from 'next/image'

import { ArrowUpRight, X } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FEATURED_SOLANA_WALLETS,
  type SolanaWallet,
  type StandardWallet,
  solanaWalletSections,
} from '@/lib/wallet/solana-wallets'

const ROW_CLASS =
  'hover:bg-accent flex min-h-10 w-full items-center gap-3 rounded-lg p-[5px] text-left transition-[background-color,transform] duration-150 active:scale-95'

/**
 * The Solana wallet list, drawn like the Stellar one (StellarWalletPicker) and
 * RainbowKit's EVM modal. Wallet Standard supplies the installed wallets and
 * their icons; Phantom and Solflare are offered with an install link when
 * they are missing.
 */
export function SolanaWalletPicker({
  open,
  wallets,
  onSelect,
  onClose,
}: {
  open: boolean
  /** Every wallet registered through Wallet Standard, in detection order. */
  wallets: readonly StandardWallet[]
  onSelect: (wallet: SolanaWallet) => void
  onClose: () => void
}) {
  const { available, toInstall } = solanaWalletSections(wallets)
  const [suggested] = FEATURED_SOLANA_WALLETS

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="bg-popover text-popover-foreground w-[370px] max-w-[calc(100%-2rem)] gap-0 rounded-2xl p-0 shadow-[0_8px_32px_rgba(0,0,0,0.32)] sm:max-w-[370px]"
      >
        <div className="relative px-[18px] pt-[19px] pb-2">
          <DialogTitle className="text-center text-lg leading-6 font-extrabold">
            Connect a Wallet
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose the Solana wallet to sign in with.
          </DialogDescription>
          <DialogClose
            aria-label="Close"
            className="bg-muted text-muted-foreground absolute top-[17px] right-[17px] flex size-7 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 active:scale-90"
          >
            <X className="size-3.5" strokeWidth={3} />
          </DialogClose>
        </div>

        <div className="px-[18px] pb-[18px]">
          {available.length > 0 && (
            <Section title="Available" accent>
              {available.map((wallet) => (
                <button
                  key={wallet.name}
                  type="button"
                  onClick={() => onSelect(wallet)}
                  className={ROW_CLASS}
                >
                  <WalletRowContent name={wallet.name} icon={wallet.icon} />
                </button>
              ))}
            </Section>
          )}
          {toInstall.length > 0 && (
            <Section title="Get a wallet">
              {toInstall.map((wallet) => (
                <a
                  key={wallet.id}
                  href={wallet.installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Install ${wallet.name}`}
                  className={ROW_CLASS}
                >
                  <WalletRowContent name={wallet.name} icon={wallet.icon} />
                  <ArrowUpRight className="text-muted-foreground size-4 shrink-0" />
                </a>
              ))}
            </Section>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-6 pt-5 pb-[18px] text-sm">
          <span className="text-muted-foreground font-medium">
            New to Solana wallets?
          </span>
          <a
            href={suggested.installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-bold transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            Get {suggested.name}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({
  title,
  accent = false,
  children,
}: {
  title: string
  accent?: boolean
  children: ReactNode
}) {
  return (
    <section className="mt-4">
      <h2
        className={`mb-2 pl-1.5 text-sm font-bold ${accent ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {title}
      </h2>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  )
}

function WalletRowContent({ name, icon }: { name: string; icon: string }) {
  return (
    <>
      <Image
        src={icon}
        alt=""
        width={28}
        height={28}
        className="size-7 shrink-0 rounded-md"
      />
      <span className="min-w-0 flex-1 truncate text-base font-bold">
        {name}
      </span>
    </>
  )
}
