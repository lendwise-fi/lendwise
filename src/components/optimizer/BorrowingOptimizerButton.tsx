'use client'

import { useMemo, useState } from 'react'

import {
  ArrowLeftRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  Shield,
  TrendingDown,
  Wallet,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { HORIZON_OPTIONS, HorizonKey } from '@/config/horizon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type OptimizationResponse,
  optimizeBorrow,
  optimizeCollateral,
} from '@/lib/api/optimizer'
import { formatCompactCurrency } from '@/lib/format-currency'
import type { BorrowProduct } from '@/types'

// ============================================================================
// Constants
// ============================================================================

// Default LTV used when market-specific data is unavailable
const DEFAULT_MAX_LTV = 0.8

type BorrowMode = 'collateral_target' | 'loan_target'
type GoalId =
  | 'maximize_loan'
  | 'minimize_cost_borrow'
  | 'minimize_collateral'
  | 'minimize_cost_collateral'

const BORROW_MODES = [
  {
    id: 'collateral_target' as BorrowMode,
    Icon: Wallet,
    label: 'Fixed Collateral',
    desc: 'I have a collateral amount — maximize loan size or minimize cost',
    color: 'text-primary',
    activeBg: 'bg-primary/10 border-primary/30',
  },
  {
    id: 'loan_target' as BorrowMode,
    Icon: CreditCard,
    label: 'Fixed Loan',
    desc: 'I need a loan amount — minimize collateral required or minimize cost',
    color: 'text-cyan-400',
    activeBg: 'bg-cyan-400/10 border-cyan-400/30',
  },
]

const GOALS: Record<BorrowMode, { id: GoalId; label: string; Icon: typeof Shield; omega: number }[]> = {
  collateral_target: [
    { id: 'maximize_loan', label: 'Maximize loan size', Icon: TrendingDown, omega: 1 },
    { id: 'minimize_cost_borrow', label: 'Minimize borrow cost', Icon: Shield, omega: 0 },
  ],
  loan_target: [
    { id: 'minimize_collateral', label: 'Minimize collateral required', Icon: Wallet, omega: 1 },
    { id: 'minimize_cost_collateral', label: 'Minimize borrow cost', Icon: Shield, omega: 0 },
  ],
}

const ALLOCATION_COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b']

// ============================================================================
// Types
// ============================================================================

interface BorrowingOptimizerViewProps {
  markets: BorrowProduct[]
  onBack?: () => void
}

// ============================================================================
// Component
// ============================================================================

export function BorrowingOptimizerView({
  markets,
  onBack,
}: BorrowingOptimizerViewProps) {
  const [mode, setMode] = useState<BorrowMode>('collateral_target')
  const [goal, setGoal] = useState<GoalId>('maximize_loan')
  const [amount, setAmount] = useState('100')
  const [horizon, setHorizon] = useState<HorizonKey>('medium')
  const [result, setResult] = useState<OptimizationResponse | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)

  const handleModeChange = (m: BorrowMode) => {
    setMode(m)
    setGoal(GOALS[m][0].id)
    setRan(false)
    setResult(null)
  }

  const handleRun = async () => {
    setError(null)
    setResult(null)
    setIsOptimizing(true)
    setRan(false)

    try {
      if (markets.length === 0) throw new Error('No markets selected')

      const amountNum = parseFloat(amount)
      if (!amountNum || amountNum <= 0) throw new Error('Enter a valid amount')

      const horizonEntry = HORIZON_OPTIONS.find((h) => h.key === horizon)
      const apyKey = (horizonEntry?.apyKey ?? 'apy') as keyof BorrowProduct

      const marketData = {
        max_ltv: markets.map(() => DEFAULT_MAX_LTV),
        rates: markets.map((m) => {
          const v = m[apyKey]
          return typeof v === 'number' ? v : m.apy
        }),
        liquidity: markets.map((m) => m.liquidityAmountUsd),
        price: 1,
      }

      const currentGoal = GOALS[mode].find((g) => g.id === goal)
      const omega = currentGoal?.omega ?? 0

      let response: OptimizationResponse
      if (mode === 'collateral_target') {
        response = await optimizeBorrow({
          collateral_amount: amountNum,
          omega,
          markets: marketData,
        })
      } else {
        response = await optimizeCollateral({
          borrow_amount: amountNum,
          omega,
          markets: marketData,
        })
      }

      if (!response.success) throw new Error('Optimization failed')

      setResult(response)
      setRan(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed')
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleReset = () => {
    setMode('collateral_target')
    setGoal('maximize_loan')
    setAmount('100')
    setHorizon('medium')
    setResult(null)
    setRan(false)
    setError(null)
  }

  const amountNum = parseFloat(amount) || 0

  // Allocations filtered to non-zero
  const allocations = useMemo(() => {
    if (!result) return []
    return result.allocations
      .filter((a) => {
        const val = mode === 'collateral_target' ? a.borrow : a.collateral
        return val > 0.001
      })
      .map((a) => ({
        market: markets[a.market_index],
        value: mode === 'collateral_target' ? a.borrow : a.collateral,
      }))
      .sort((a, b) => b.value - a.value)
  }, [result, mode, markets])

  const total = mode === 'collateral_target' ? result?.total_borrow : result?.total_collateral

  const weightedRate = useMemo(() => {
    if (!result || !total || total === 0) return null
    return allocations.reduce((acc, a) => {
      const pct = a.value / total
      return acc + a.market.apy * pct
    }, 0)
  }, [result, total, allocations])

  const projectedCost = useMemo(() => {
    if (!weightedRate || !result) return null
    const loanAmt = mode === 'collateral_target' ? (result.total_borrow ?? 0) : amountNum
    const days = HORIZON_OPTIONS.find((h) => h.key === horizon)?.days ?? 30
    return loanAmt * weightedRate * (days / 365)
  }, [weightedRate, result, mode, amountNum, horizon])

  const horizonLabel = HORIZON_OPTIONS.find((h) => h.key === horizon)?.label ?? ''

  return (
    <div className="flex flex-col">
      {/* Main content */}
      <div className="flex divide-x divide-border">
        {/* Left — parameters */}
        <div className="flex-1 space-y-5 px-1 py-4 pr-6">

          {/* Optimization mode */}
          <div>
            <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wider">
              Optimization mode
            </label>
            <div className="space-y-2">
              {BORROW_MODES.map((m) => {
                const active = mode === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModeChange(m.id)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-150 ${
                      active
                        ? m.activeBg
                        : 'border-border bg-secondary/20 hover:border-border/80'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        active ? m.activeBg : 'bg-secondary'
                      }`}
                    >
                      <m.Icon
                        className={`h-4 w-4 ${active ? m.color : 'text-muted-foreground'}`}
                      />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${active ? m.color : 'text-foreground'}`}>
                        {m.label}
                      </div>
                      <div className="text-muted-foreground text-xs leading-relaxed">
                        {m.desc}
                      </div>
                    </div>
                    {active && (
                      <CheckCircle2 className={`mt-1 h-4 w-4 shrink-0 ${m.color}`} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Objective */}
          <div>
            <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wider">
              Objective
            </label>
            <div className="flex gap-2">
              {GOALS[mode].map((g) => {
                const active = goal === g.id
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setGoal(g.id)
                      setRan(false)
                    }}
                    className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-secondary/20 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <g.Icon className="h-3.5 w-3.5 shrink-0" />
                    {g.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wider">
              {mode === 'collateral_target' ? 'Collateral amount' : 'Loan amount needed'}
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
              {HORIZON_OPTIONS.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => {
                    setHorizon(h.key)
                    setRan(false)
                  }}
                  className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-all ${
                    horizon === h.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-secondary/30 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right — results */}
        <div className="flex w-1/2 shrink-0 flex-col px-6 py-4">
          <div className="text-muted-foreground mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
            <ArrowLeftRight className="h-3.5 w-3.5" />
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
            ) : ran && result && allocations.length > 0 ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-1 flex-col gap-4"
              >
                {/* Key metric card */}
                <div className="rounded-xl border border-border bg-secondary/40 p-4 text-center">
                  {mode === 'collateral_target' ? (
                    <>
                      <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wider">
                        {goal === 'maximize_loan' ? 'Max loan size' : 'Optimal loan size'}
                      </div>
                      <div className="font-mono text-2xl font-bold text-foreground">
                        {formatCompactCurrency(result.total_borrow ?? 0, 'USD')}
                      </div>
                      {amountNum > 0 && (
                        <div className="text-muted-foreground mt-1 text-xs">
                          {(((result.total_borrow ?? 0) / amountNum) * 100).toFixed(1)}% of collateral
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wider">
                        {goal === 'minimize_collateral' ? 'Min collateral required' : 'Optimal collateral'}
                      </div>
                      <div className="font-mono text-2xl font-bold text-foreground">
                        {formatCompactCurrency(result.total_collateral ?? 0, 'USD')}
                      </div>
                      {amountNum > 0 && (
                        <div className="text-muted-foreground mt-1 text-xs">
                          {(((result.total_collateral ?? 0) / amountNum) * 100).toFixed(1)}% of loan value
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Allocation list */}
                <div className="space-y-2">
                  {allocations.map((a, i) => {
                    const pct = total && total > 0 ? (a.value / total) * 100 : 0
                    return (
                      <div
                        key={i}
                        className="border-border/50 bg-secondary/20 flex items-center gap-2.5 rounded-lg border p-2.5"
                      >
                        <div
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-foreground">
                            {a.market.poolName}
                          </div>
                          <div className="text-muted-foreground text-[10px]">
                            {(a.market.apy * 100).toFixed(2)}% APY
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-xs font-semibold text-foreground">
                            {pct.toFixed(0)}%
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {formatCompactCurrency(a.value, 'USD')}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Summary */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mt-auto space-y-1.5 border-t border-border pt-3"
                >
                  {weightedRate !== null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Weighted rate</span>
                      <span className="font-mono font-semibold text-emerald-400">
                        {(weightedRate * 100).toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {projectedCost !== null && amountNum > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Est. cost ({horizonLabel})</span>
                      <span className="font-mono font-semibold text-rose-400">
                        -{formatCompactCurrency(projectedCost, 'USD')}
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
                  <ArrowLeftRight className="h-5 w-5 opacity-40" />
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Set your mode, objective and amount, then run the optimizer.
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
            className={ran ? 'bg-emerald-500 text-white hover:bg-emerald-500/90' : undefined}
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
