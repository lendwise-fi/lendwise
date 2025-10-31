'use client'

import * as React from 'react'

import { Address } from 'viem'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { WalletSelector } from './WalletSelector'

export function WalletSelectorExample() {
  const [selectedWallets, setSelectedWallets] = React.useState<Address[]>([])

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Wallet Selection</CardTitle>
        <CardDescription>
          Select multiple wallets to view their combined positions and analytics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <WalletSelector
          selectedWallets={selectedWallets}
          onWalletsChange={setSelectedWallets}
        />

        {selectedWallets.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Selected Wallets:</h4>
            <div className="flex flex-wrap gap-2">
              {selectedWallets.map((address) => (
                <span
                  key={address}
                  className="bg-secondary text-secondary-foreground inline-flex items-center rounded-md px-2 py-1 text-xs font-medium"
                >
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="text-muted-foreground text-sm">
          Total selected: {selectedWallets.length} wallet
          {selectedWallets.length !== 1 ? 's' : ''}
        </div>
      </CardContent>
    </Card>
  )
}
