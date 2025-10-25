'use client'

import * as React from 'react'
import Image from 'next/image'
import { useAccount } from 'wagmi'
import { useTheme } from 'next-themes'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import {
  Bell,
  ChevronDown,
  User,
  Settings,
  HelpCircle,
  MoreHorizontal,
  Moon,
  Sun,
  Euro,
  Power,
  Copy,
  Check,
  Users,
  BookMarked,
  Monitor,
} from 'lucide-react'
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
import { cn, formatAddress } from '@/lib/utils'

const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
        <div className="h-8 w-8 rounded-md" />
        <div className="h-8 w-8 rounded-md" />
        <div className="h-8 w-8 rounded-md" />
      </div>
    )
  }

  const themes = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ]

  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
      {themes.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          onClick={() => setTheme(value)}
          className={cn(
            'h-8 w-8 p-0 transition-all hover:bg-accent',
            theme === value
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'text-muted-foreground hover:text-accent-foreground'
          )}
          title={label}
        >
          <Icon className="h-4 w-4" />
          <span className="sr-only">{label}</span>
        </Button>
      ))}
    </div>
  )
}

import { useWalletStore, type Wallet } from '@/stores/walletStore'
import { useEnsName } from 'wagmi'
import { WalletAvatar } from './wallet-avatar'

const WalletRow = ({ wallet }: { wallet: Wallet }) => {
  const { data: ensName } = useEnsName({
    address: wallet.address as `0x${string}`,
  })
  const [copiedAddress, setCopiedAddress] = React.useState<string | null>(null)

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => {
      setCopiedAddress(null)
    }, 2000)
  }

  return (
    <div
      key={wallet.address}
      className="flex items-center justify-between rounded-md p-2 hover:bg-accent"
    >
      <div className="flex items-center gap-x-3">
        <div className="h-8 w-8 rounded-full flex items-center justify-center">
          <WalletAvatar address={wallet.address} size={30} />
        </div>
        <span className="text-sm font-medium">{ensName || wallet.name}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => handleCopy(wallet.address)}
      >
        {copiedAddress === wallet.address ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}

const UserWalletPopover = () => {
  const { wallets } = useWalletStore()
  const { connector, isConnected } = useAccount()

  const handleAddWallet = async () => {
    if (!isConnected || !connector) {
      // Si pas connecté, on ne peut pas ouvrir le wallet
      return
    }

    try {
      // Récupérer le provider du wallet connecté
      const provider = await connector.getProvider()

      // Vérifier que c'est un provider EIP-1193
      if (
        provider &&
        typeof provider === 'object' &&
        provider !== null &&
        'request' in provider &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (provider as any).request === 'function'
      ) {
        // Demander au wallet de changer de compte (ouvre MetaMask directement)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (provider as any).request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        })
      }
    } catch (error) {
      console.error('Failed to request account change:', error)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <User className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="p-2">
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              Mes Wallets
            </p>
            {isConnected ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleAddWallet}
              >
                + Add
              </Button>
            ) : (
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) => {
                  if (!mounted) return null
                  return (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={openConnectModal}
                    >
                      + Add
                    </Button>
                  )
                }}
              </ConnectButton.Custom>
            )}
          </div>
          <div className="space-y-1">
            {wallets.length > 0 ? (
              wallets.map((wallet) => (
                <WalletRow key={wallet.address} wallet={wallet} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground px-2 text-center py-4">
                No wallets connected.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

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
          <div className="flex flex-col items-center text-center gap-y-4 py-4">
            <div className="p-3 bg-muted rounded-full">
              <Bell className="h-8 w-8" />
            </div>
            <p className="font-semibold">No new notifications</p>
            <p className="text-sm text-muted-foreground">Check back later!</p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center gap-y-4 py-4">
            <div className="p-3 bg-muted rounded-full">
              <Bell className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold">Notifications</p>
              <p className="text-sm text-muted-foreground">
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
    <UserWalletPopover />
    <NotificationsPopover />
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => {
        if (!mounted) return null
        return (
          <Button onClick={openConnectModal}>
            Connecter votre portefeuille
          </Button>
        )
      }}
    </ConnectButton.Custom>
    <GeneralMenu />
  </div>
)

const ConnectedNav = () => (
  <div className="flex items-center gap-x-2">
    <UserWalletPopover />
    <NotificationsPopover />
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, mounted }) => {
        if (!mounted || !account || !chain) {
          return null
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-x-2">
                {account.ensAvatar && (
                  <Image
                    src={account.ensAvatar}
                    alt="ENS Avatar"
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                )}
                <span>{account.ensName || formatAddress(account.address)}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem>
                <Users className="mr-2 h-4 w-4" />
                <span>Accounts</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="focus:bg-transparent hover:bg-transparent cursor-default"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center">
                    <Moon className="mr-2 h-4 w-4" />
                    <span>Theme</span>
                  </div>
                  <ThemeSwitcher />
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Euro className="mr-2 h-4 w-4" />
                <span>Currency</span>
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
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }}
    </ConnectButton.Custom>
  </div>
)

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
        className="focus:bg-transparent hover:bg-transparent cursor-default"
      >
        <div className="flex items-center justify-between w-full">
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
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/50 backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between px-8">
        <div>{/* Logo or other left-side content can go here */}</div>
        <div className="flex items-center gap-x-4">
          {isConnected ? <ConnectedNav /> : <DisconnectedNav />}
        </div>
      </div>
    </header>
  )
}
