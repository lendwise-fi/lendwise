'use client'

import { useState } from 'react'

import Image from 'next/image'
import Link from 'next/link'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Moon,
  Power,
  Settings,
  Users,
  Wallet,
} from 'lucide-react'

import { TokenIcon } from '@/components/icon/TokenIcon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WalletAvatar } from '@/components/wallet/WalletAvatar'
import { SUPPORTED_CURRENCIES, getCurrencyByCode } from '@/config/currencies'
import { cn, formatAddress } from '@/lib/utils'
import { useWalletStore } from '@/stores/walletStore'

import { ThemeSwitcher } from './ThemeSwitcher'
import { UserWalletList } from './UserWalletList'

type MenuView = 'main' | 'currency' | 'wallets'

export const UserMenu = () => {
  const { baseCurrency, setBaseCurrency } = useWalletStore()
  const selectedCurrency = getCurrencyByCode(baseCurrency)
  const [currentView, setCurrentView] = useState<MenuView>('main')

  const handleCurrencySelect = (currencyCode: string) => {
    setBaseCurrency(currencyCode)
    setCurrentView('main')
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCurrentView('main')
    }
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, mounted }) => {
        if (!mounted || !account || !chain) {
          return null
        }

        return (
          <DropdownMenu onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-x-2">
                {account.ensAvatar ? (
                  <Image
                    src={account.ensAvatar}
                    alt="ENS Avatar"
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                ) : (
                  <WalletAvatar address={account.address} size={20} />
                )}
                <span>{account.ensName || formatAddress(account.address)}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {currentView === 'currency' ? (
                <>
                  {/* Currency List View */}
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      setCurrentView('main')
                    }}
                    className="cursor-pointer"
                  >
                    <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
                    <span className="font-medium">Monnaie de base</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="max-h-96 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-1 p-1">
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <DropdownMenuItem
                          key={currency.code}
                          onClick={() => handleCurrencySelect(currency.code)}
                          className={cn(
                            'cursor-pointer',
                            baseCurrency === currency.code && 'bg-accent'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <TokenIcon symbol={currency.code} size={20} />
                            <span className="font-medium">{currency.code}</span>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </div>
                </>
              ) : currentView === 'wallets' ? (
                <>
                  {/* Wallets List View */}
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      setCurrentView('main')
                    }}
                    className="cursor-pointer"
                  >
                    <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
                    <span className="font-medium">Wallets</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <UserWalletList />
                  </div>
                </>
              ) : (
                <>
                  {/* Main Menu View */}
                  <DropdownMenuItem>
                    <Link
                      href="/settings?tab=accounts"
                      className="flex items-center gap-x-2"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      <span>Accounts</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link
                      href="/settings?tab=general"
                      className="flex items-center gap-x-2"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      setCurrentView('wallets')
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center">
                        <Wallet className="mr-2 h-4 w-4" />
                        <span>Wallets</span>
                      </div>
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      setCurrentView('currency')
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        {selectedCurrency && (
                          <TokenIcon symbol={selectedCurrency.code} size={16} />
                        )}
                        <span>{selectedCurrency?.code || 'Currency'}</span>
                      </div>
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="cursor-default hover:bg-transparent focus:bg-transparent"
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center">
                        <Moon className="mr-2 h-4 w-4" />
                        <span>Theme</span>
                      </div>
                      <ThemeSwitcher />
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>Support</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <BookMarked className="mr-2 h-4 w-4" />
                    <span>FAQs</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={openAccountModal}>
                    <Power className="mr-2 h-4 w-4" />
                    <span>Deconnexion</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }}
    </ConnectButton.Custom>
  )
}
