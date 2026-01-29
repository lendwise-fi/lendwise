'use client'

import { useMemo, useState } from 'react'

import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { Bot, Loader2, Sparkles } from 'lucide-react'

import { loadLendingMarkets } from '@/app/actions/markets.actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  type VaultAllocationResponse,
  optimizeVaults,
  riskLevelToDiversification,
} from '@/lib/api/optimizer'
import type { LendMarket } from '@/types'

type RiskLevel = 'Conservative' | 'Moderate' | 'Aggressive'

const RISK_LEVELS: RiskLevel[] = ['Conservative', 'Moderate', 'Aggressive']

interface OptimizationResult {
  vault: LendMarket
  allocation: number
  allocationPercent: number
}

export function LendingOptimizerButton() {
  const [results, setResults] = useState<OptimizationResult[] | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultingDiversification, setResultingDiversification] = useState<
    number | null
  >(null)

  // Use the same query as LendingTableClient
  const { data: markets = [] } = useQuery<LendMarket[]>({
    queryKey: ['lendingMarkets'],
    queryFn: loadLendingMarkets,
    staleTime: 60_000,
  })

  // Extract unique tokens from markets
  const availableTokens = useMemo(() => {
    const tokens = new Set(markets.map((m) => m.assetSymbol))
    return Array.from(tokens).sort()
  }, [markets])

  const form = useForm({
    defaultValues: {
      token: 'USDC',
      riskLevel: 'Moderate' as RiskLevel,
    },
    onSubmit: async ({ value }) => {
      setError(null)
      setIsOptimizing(true)

      try {
        // Filter markets by selected token
        const filteredMarkets = markets.filter(
          (m) => m.assetSymbol === value.token
        )

        if (filteredMarkets.length === 0) {
          throw new Error(`No markets found for ${value.token}`)
        }

        // Extract APYs (use current apy, convert to decimal if needed)
        const apys = filteredMarkets.map((m) => m.apy)
        const diversification = riskLevelToDiversification(value.riskLevel)

        // Call API
        const response: VaultAllocationResponse = await optimizeVaults({
          apy: apys,
          diversification,
        })

        if (!response.success) {
          throw new Error('Optimization failed')
        }

        // Map results back to vaults
        const optimizationResults: OptimizationResult[] = response.allocations
          .filter((a) => a.allocation > 0.001) // Filter out negligible allocations
          .map((a) => ({
            vault: filteredMarkets[a.vault_index],
            allocation: a.allocation,
            allocationPercent: a.allocation_percent,
          }))
          .sort((a, b) => b.allocationPercent - a.allocationPercent)

        setResults(optimizationResults)
        setResultingDiversification(response.resulting_diversification)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Optimization failed')
        setResults(null)
      } finally {
        setIsOptimizing(false)
      }
    },
  })

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Bot className="mr-2 h-4 w-4" />
          <span>Optimize</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="min-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-amber-500" />
            Lending Optimizer
          </DialogTitle>
          <DialogDescription>
            Configure your optimization parameters to find the best lending
            strategies
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 py-4">
          {/* Left Column - Form (1/3) */}
          <div className="flex w-1/3 flex-col">
            <h3 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              Parameters
            </h3>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                form.handleSubmit()
              }}
              className="mt-6 flex flex-1 flex-col space-y-4"
            >
              {/* Token Select */}
              <form.Field name="token">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="token">Token</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => field.handleChange(value)}
                    >
                      <SelectTrigger id="token" className="w-full">
                        <SelectValue placeholder="Select token" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTokens.map((token) => (
                          <SelectItem key={token} value={token}>
                            {token}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              {/* Risk Level Select */}
              <form.Field name="riskLevel">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="riskLevel">Risk Level</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value as RiskLevel)
                      }
                    >
                      <SelectTrigger id="riskLevel" className="w-full">
                        <SelectValue placeholder="Select risk level" />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              <Button
                type="submit"
                className="mt-auto w-full"
                disabled={isOptimizing}
              >
                {isOptimizing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {isOptimizing ? 'Optimizing...' : 'Run Optimization'}
              </Button>
            </form>
          </div>

          {/* Separator */}
          <Separator orientation="vertical" className="h-auto" />

          {/* Right Column - Results (2/3) */}
          <div className="w-2/3 space-y-4">
            <h3 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              Recommended Allocations
            </h3>

            {/* Error State */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Empty State */}
            {!results && !error && !isOptimizing && (
              <div className="text-muted-foreground flex h-48 items-center justify-center rounded-lg border border-dashed">
                <p className="text-center text-sm">
                  Configure parameters and run optimization
                  <br />
                  to see recommended allocations
                </p>
              </div>
            )}

            {/* Loading State */}
            {isOptimizing && (
              <div className="text-muted-foreground flex h-48 items-center justify-center rounded-lg border border-dashed">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                <p className="text-sm">Computing optimal allocation...</p>
              </div>
            )}

            {/* Results */}
            {results && results.length > 0 && (
              <>
                <div className="space-y-3">
                  {results.map((result, index) => (
                    <div
                      key={index}
                      className="bg-muted/50 hover:bg-muted rounded-lg border p-4 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{result.vault.poolName}</p>
                          <p className="text-muted-foreground text-sm">
                            {result.vault.protocol}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-500">
                            {(result.vault.apy * 100).toFixed(2)}%
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {result.allocationPercent.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="border-primary/20 bg-primary/5 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Weighted Average APY
                    </span>
                    <span className="text-primary text-lg font-bold">
                      {(
                        results.reduce(
                          (acc, r) =>
                            acc + r.vault.apy * (r.allocationPercent / 100),
                          0
                        ) * 100
                      ).toFixed(2)}
                      %
                    </span>
                  </div>
                  {resultingDiversification !== null && (
                    <div className="mt-2 flex items-center justify-between border-t pt-2">
                      <span className="text-muted-foreground text-sm">
                        Diversification Score
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {resultingDiversification.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
