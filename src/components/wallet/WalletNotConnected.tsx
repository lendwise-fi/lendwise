import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import {
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

export function WalletNotConnected() {
  return (
    <div className="flex-1 p-8">
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wallet />
          </EmptyMedia>
          <EmptyTitle>No Wallet Connected</EmptyTitle>
          <EmptyDescription>
            Get started by connecting your wallet.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => {
              if (!mounted) return null
              return <Button onClick={openConnectModal}>Connect wallet</Button>
            }}
          </ConnectButton.Custom>
        </EmptyContent>
      </Empty>
    </div>
  )
}
