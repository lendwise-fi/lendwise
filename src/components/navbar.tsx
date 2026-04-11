'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { TrendingUp } from 'lucide-react'
import { useAccount } from 'wagmi'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { ThemeSwitcher } from './theme/ThemeSwitcher'
import { UserMenu } from './user/UserMenu'

const navItems = [
  { label: 'Supply', href: '/supply' },
  { label: 'Borrow', href: '/borrow' },
  { label: 'Portfolio', href: '/portfolio' },
]

export function Navbar() {
  const { isConnected } = useAccount()
  const pathname = usePathname()

  return (
    <header className="border-border bg-card sticky top-0 z-50 w-full border-b">
      <div className="flex h-14 items-center gap-8 px-6">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="from-primary flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br to-purple-600">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <div className="leading-none">
            <div className="text-foreground text-sm font-bold">
              Yield Optimizer
            </div>
            <div className="text-muted-foreground text-[10px]">
              DeFi Optimization
            </div>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitcher />
          {isConnected ? (
            <UserMenu />
          ) : (
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => {
                if (!mounted) return null
                return (
                  <Button size="sm" onClick={openConnectModal}>
                    Connect wallet
                  </Button>
                )
              }}
            </ConnectButton.Custom>
          )}
        </div>
      </div>
    </header>
  )
}
