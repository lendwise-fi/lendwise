'use client'

import { useMemo, useState } from 'react'

import {
  BarChart3,
  CheckCircle2,
  Flame,
  Loader2,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { HORIZON_CONFIG } from '@/components/products/SupplyTableClient'
import { ProtocolBadge } from '@/components/badge/ProtocolBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DIVERSIFICATION_LEVELS,
  type VaultAllocationResponse,
  optimizeVaults,
} from '@/lib/api/optimizer'
import { formatCompactCurrency } from '@/lib/format-currency'
import type { SupplyProduct } from '@/types'

// ============================================================================
// Constants
// ============================================================================

const HORIZON_BUTTONS = [
  { label: '1D', key: 'intraday', days: 1 },
  { label: '7D', key: 'short', days: 7 },
  { label: '1M', key: 'medium', days: 30 },
  { label: '1Y', key: 'long', days: 365 },
] as const

type HorizonKey = (typeof HORIZON_BUTTONS)[number]['key']

const STRATEGIES = [
  {
    id: 'conservative' as const,
    label: 'Conservative',
    Icon: Shield,
    desc: 'Lower risk, stable yields',
    color: 'text-emerald-400',
    activeBg: 'bg-emerald-400/10 border-emerald-400/30',
    diversification: DIVERSIFICATION_LEVELS.HIGH,
    expectedApy: '4–8%',
  },
  {
    id: 'balanced' as const,
    label: 'Balanced',
    Icon: BarChart3,
    desc: 'Optimized risk/reward',
    color: 'text-primary',
    activeBg: 'bg-primary/10 border-primary/30',
    diversification: DIVERSIFICATION_LEVELS.MODERATE,
    expectedApy: '8–20%',
  },
  {
    id: 'aggressive' as const,
    label: 'Aggressive',
    Icon: Flame,
    desc: 'Max yield, higher risk',
    color: 'text-orange-400',
    activeBg: 'bg-orange-400/10 border-orange-400/30',
    diversification: DIVERSIFICATION_LEVELS.LOW,
    expectedApy: '20%+',
  },
]

type StrategyId = (typeof STRATEGIES)[number]['id']

const ALLOCATION_COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b']

// ============================================================================
// Types
// ============================================================================

interface OptimizationResult {
  vault: SupplyProduct
  allocation: number
  allocationPercent: number
}

interface SupplyingOptimizerViewProps {
  markets: SupplyProduct[]
  onBack?: () => void
}

// ============================================================================
// Component
// ============================================================================

export function SupplyingOptimizerView({
  markets,
  onBack,
}: SupplyingOptimizerViewProps) {
  const [amount, setAmount] = useState('')
  const [horizon, setHorizon] = useState<HorizonKey>('medium')
  const [strategy, setStrategy] = useState<StrategyId>('balanced')
  const [results, setResults] = useState<OptimizationResult[] | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)

  const handleRun = async () => {
    setError(null)
    setResults(null)
    setIsOptimizing(true)
    setRan(false)

    try {
      if (markets.length === 0) throw new Error('No markets selected')

      const horizonEntry = HORIZON_CONFIG[horizon]
      const apyKey = (horizonEntry?.apyKey ?? 'apy') as keyof SupplyProduct

      const apys = markets.map((m) => {
        const v = m[apyKey]
        return typeof v === 'number' ? v : 0
      })

      const selectedStrategy = STRATEGIES.find((s) => s.id === strategy)
      const diversification =
        selectedStrategy?.diversification ?? DIVERSIFICATION_LEVELS.MODERATE

      const response: VaultAllocationResponse = await optimizeVaults({
        apy: apys,
        diversification,
      })

      if (!response.success) throw new Error('Optimization failed')

      const optimizationResults: OptimizationResult[] = response.allocations
        .filter((a) => a.allocation > 0.001)
        .map((a) => ({
          vault: markets[a.vault_index],
          allocation: a.allocation,
          allocationPercent: a.allocation_percent,
        }))
        .sort((a, b) => b.allocationPercent - a.allocationPercent)

      setResults(optimizationResults)
      setRan(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed')
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleReset = () => {
    setAmount('')
    setHorizon('medium')
    setStrategy('balanced')
    setResults(null)
    setRan(false)
    setError(null)
  }

  const amountNum = parseFloat(amount) || 0

  const weightedApy = useMemo(() => {
    if (!results) return null
    return results.reduce(
      (acc, r) => acc + r.vault.apy * (r.allocationPercent / 100),
      0
    )
  }, [results])

  const projectedReturn = useMemo(() => {
    if (!weightedApy || !amountNum) return null
    const days = HORIZON_BUTTONS.find((h) => h.key === horizon)?.days ?? 30
    return amountNum * weightedApy * (days / 365)
  }, [weightedApy, amountNum, horizon])

  const horizonLabel = HORIZON_BUTTONS.find((h) => h.key === horizon)?.label ?? ''

  return (
    <div className="flex flex-col">
      {/* Main content */}
      <div className="flex divide-x divide-border">
        {/* Left — parameters */}
        <div className="flex-1 space-y-6 px-1 py-4 pr-6">
          {/* Capital */}
          <div>
            <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wider">
              Capital to deploy
            </label>
            <div className="border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex items-center rounded-xl border focus-within:ring-[3px]">
              <span className="text-muted-foreground pl-3.5 text-sm font-medium select-none">
                $
              </span>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setRan(false)
                }}
                className="border-0 font-mono shadow-none focus-visible:ring-0"
              />
              <span className="text-muted-foreground bg-secondary mr-1 rounded-lg px-2 py-1 text-xs font-semibold select-none">
                USDC
              </span>
            </div>
          </div>

          {/* Time horizon */}
          <div>
            <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wider">
              Time horizon
            </label>
            <div className="flex gap-1.5">
              {HORIZON_BUTTONS.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => {
                    setHorizon(h.key)
                    setRan(false)
                  }}
                  className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-all ${horizon === h.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-secondary/30 text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          {/* Risk strategy */}
          <div>
            <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wider">
              Risk strategy
            </label>
            <div className="space-y-2">
              {STRATEGIES.map((s) => {
                const active = strategy === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setStrategy(s.id)
                      setRan(false)
                    }}
                    className={`flex w-full items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition-all duration-150 ${active
                        ? s.activeBg
                        : 'border-border bg-secondary/20 hover:border-border/80'
                      }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? s.activeBg : 'bg-secondary'
                        }`}
                    >
                      <s.Icon
                        className={`h-4 w-4 ${active ? s.color : 'text-muted-foreground'}`}
                      />
                    </div>
                    <div className="flex-1">
                      <div
                        className={`text-sm font-semibold ${active ? s.color : 'text-foreground'}`}
                      >
                        {s.label}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {s.desc}
                      </div>
                    </div>
                    <div
                      className={`font-mono text-xs font-semibold ${active ? s.color : 'text-muted-foreground'}`}
                    >
                      {s.expectedApy}
                    </div>
                    {active && (
                      <CheckCircle2
                        className={`h-4 w-4 shrink-0 ${s.color}`}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right — results */}
        <div className="flex w-1/2 shrink-0 flex-col px-6 py-4">
          <div className="text-muted-foreground mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
            <TrendingUp className="h-3.5 w-3.5" />
            Recommended allocation
          </div>

          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
              >
                {error}
              </motion.div>
            ) : isOptimizing ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center text-center"
              >
                <Loader2 className="text-muted-foreground mb-2 h-5 w-5 animate-spin" />
                <p className="text-muted-foreground text-xs">
                  Computing optimal allocation…
                </p>
              </motion.div>
            ) : ran && results && results.length > 0 ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 space-y-3"
              >
                {results.map((r, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground max-w-[140px] truncate text-xs font-medium">
                        {r.vault.poolName}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs font-semibold">
                        {r.allocationPercent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${r.allocationPercent}%` }}
                        transition={{
                          delay: i * 0.08,
                          duration: 0.45,
                          ease: 'easeOut',
                        }}
                        className="h-full rounded-full"
                        style={{
                          background:
                            ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                        }}
                      />
                    </div>
                    <ProtocolBadge protocol={r.vault.protocol} />
                  </div>
                ))}

                {/* Summary */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="border-border mt-4 space-y-2 border-t pt-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Weighted APY</span>
                    <span className="font-mono font-semibold text-emerald-400">
                      {((weightedApy ?? 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  {projectedReturn !== null && amountNum > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Est. return ({horizonLabel})
                      </span>
                      <span className="text-foreground font-mono font-semibold">
                        +{formatCompactCurrency(projectedReturn, 'USD')}
                      </span>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center space-y-2 text-center"
              >
                <div className="bg-secondary/60 mb-1 flex h-12 w-12 items-center justify-center rounded-2xl">
                  <Zap className="h-5 w-5 opacity-40" />
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Set your parameters and run the optimizer to see recommended
                  allocations.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="border-border bg-secondary/10 flex items-center justify-between border-t px-1 py-4 pt-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={isOptimizing}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors disabled:opacity-40"
          >
            ← Back
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          {ran && (
            <button
              type="button"
              onClick={handleReset}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              Reset
            </button>
          )}
          <Button
            onClick={ran ? onBack : handleRun}
            disabled={isOptimizing || (!ran && !amount)}
            className={
              ran
                ? 'bg-emerald-500 text-white hover:bg-emerald-500/90'
                : undefined
            }
          >
            {isOptimizing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Optimizing…
              </>
            ) : ran ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Apply Allocation
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Run Optimizer
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
