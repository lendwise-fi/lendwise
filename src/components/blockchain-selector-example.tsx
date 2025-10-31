'use client'

import * as React from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CHAINS } from '@/config/chains'

import { BlockchainSelector } from './blockchain-selector'

export function BlockchainSelectorExample() {
  const [selectedChains, setSelectedChains] = React.useState<number[]>([])

  const getChainName = (chainId: number) => {
    const allChains = [...CHAINS.MAINNETS, ...CHAINS.TESTNETS]
    const chain = allChains.find((c) => c.id === chainId)
    return chain ? chain.name : `Chain ${chainId}`
  }

  const isTestnet = (chainId: number) => {
    return CHAINS.TESTNETS.some((chain) => chain.id === chainId)
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Blockchain Selection</CardTitle>
        <CardDescription>
          Select multiple blockchains to view positions and data across networks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <BlockchainSelector
          selectedChains={selectedChains}
          onChainsChange={setSelectedChains}
          showTestnets={true}
        />

        {selectedChains.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Selected Networks:</h4>
            <div className="flex flex-wrap gap-2">
              {selectedChains.map((chainId) => (
                <span
                  key={chainId}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                    isTestnet(chainId)
                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  }`}
                >
                  <span className="text-sm">
                    {chainId === 1
                      ? '🌐'
                      : chainId === 42161
                        ? '🔷'
                        : chainId === 10
                          ? '🔴'
                          : chainId === 137
                            ? '🟣'
                            : chainId === 8453
                              ? '🔵'
                              : chainId === 59144
                                ? '🟢'
                                : chainId === 42220
                                  ? '🟡'
                                  : chainId === 43114
                                    ? '🔺'
                                    : chainId === 56
                                      ? '🟡'
                                      : chainId === 324
                                        ? '⚫'
                                        : chainId === 100
                                          ? '🟠'
                                          : '🔗'}
                  </span>
                  {getChainName(chainId)}
                  {isTestnet(chainId) && (
                    <span className="ml-1 text-xs">🧪</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="text-muted-foreground text-sm">
          Total selected: {selectedChains.length} network
          {selectedChains.length !== 1 ? 's' : ''}
          {selectedChains.length > 0 && (
            <span className="block">
              Mainnets: {selectedChains.filter((id) => !isTestnet(id)).length} |
              Testnets: {selectedChains.filter((id) => isTestnet(id)).length}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
