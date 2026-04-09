'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { BookMarked, HelpCircle, Moon, MoreHorizontal } from 'lucide-react'
import { useAccount } from 'wagmi'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { ThemeSwitcher } from './theme/ThemeSwitcher'
import { UserMenu } from './user/UserMenu'

const DisconnectedNav = () => (
  <div className="flex items-center gap-x-2">
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => {
        if (!mounted) return null
        return <Button onClick={openConnectModal}>Connect wallet</Button>
      }}
    </ConnectButton.Custom>
    <GeneralMenu />
  </div>
)

const ConnectedNav = () => {
  return (
    <div className="flex items-center gap-x-2">
      <UserMenu />
    </div>
  )
}

const GeneralMenu = () => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon">
        <MoreHorizontal className="h-5 w-5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-64">
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
    </DropdownMenuContent>
  </DropdownMenu>
)

export function Navbar() {
  const { isConnected } = useAccount()

  return (
    <header className="border-border bg-background/50 sticky top-0 z-50 w-full border-b backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between px-8">
        <div>{/* Logo or other left-side content can go here */}</div>
        <div className="flex items-center gap-x-4">
          {isConnected ? <ConnectedNav /> : <DisconnectedNav />}
        </div>
      </div>
    </header>
  )
}
