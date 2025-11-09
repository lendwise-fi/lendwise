'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import {
  Bell,
  BookMarked,
  HelpCircle,
  Moon,
  MoreHorizontal,
} from 'lucide-react'
import { useAccount } from 'wagmi'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import { ThemeSwitcher } from './theme/ThemeSwitcher'
import { UserMenu } from './user/UserMenu'

const NotificationsPopover = () => {
  const { isConnected } = useAccount()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        {isConnected ? (
          <div className="flex flex-col items-center gap-y-4 py-4 text-center">
            <div className="bg-muted rounded-full p-3">
              <Bell className="h-8 w-8" />
            </div>
            <p className="font-semibold">No new notifications</p>
            <p className="text-muted-foreground text-sm">Check back later!</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-y-4 py-4 text-center">
            <div className="bg-muted rounded-full p-3">
              <Bell className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold">Notifications</p>
              <p className="text-muted-foreground text-sm">
                En signant, vous acceptez les conditions d’utilisation de Zapper
                et acceptez sa politique de confidentialité
              </p>
            </div>
            <Button className="w-full">Sign in with Ethereum</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

const DisconnectedNav = () => (
  <div className="flex items-center gap-x-2">
    <NotificationsPopover />
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
      <NotificationsPopover />
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
