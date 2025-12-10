'use client'

import { useForm } from '@tanstack/react-form'
import { Bot, Sparkles } from 'lucide-react'

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

// Mock data for selects
const TOKENS = ['USDC', 'USDT', 'DAI', 'ETH', 'WBTC']
const RISK_LEVELS = ['Conservative', 'Moderate', 'Aggressive']

// Mock results
const MOCK_RESULTS = [
  {
    protocol: 'Morpho',
    vault: 'Steakhouse USDC',
    apy: '12.5%',
    allocation: '40%',
  },
  { protocol: 'AAVE', vault: 'USDC Supply', apy: '8.2%', allocation: '35%' },
  { protocol: 'Compound', vault: 'cUSDC', apy: '6.8%', allocation: '25%' },
]

export function LendingOptimizerButton() {
  const form = useForm({
    defaultValues: {
      token: 'USDC',
      riskLevel: 'Moderate',
    },
    onSubmit: async ({ value }) => {
      console.log('Optimization params:', value)
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
                        {TOKENS.map((token) => (
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
                      onValueChange={(value) => field.handleChange(value)}
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

              <Button type="submit" className="mt-auto w-full">
                <Sparkles className="mr-2 h-4 w-4" />
                Run Optimization
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

            <div className="space-y-3">
              {MOCK_RESULTS.map((result, index) => (
                <div
                  key={index}
                  className="bg-muted/50 hover:bg-muted rounded-lg border p-4 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{result.vault}</p>
                      <p className="text-muted-foreground text-sm">
                        {result.protocol}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-500">
                        {result.apy}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {result.allocation}
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
                <span className="text-primary text-lg font-bold">9.45%</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
