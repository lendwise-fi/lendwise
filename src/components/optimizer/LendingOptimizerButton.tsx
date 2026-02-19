'use client'

import { useMemo, useState } from 'react'

import { useForm } from '@tanstack/react-form'
import { DollarSign, Loader2, Percent, Sparkles } from 'lucide-react'
import { Pie, PieChart, Label as RechartsLabel } from 'recharts'

import { HORIZON_CONFIG } from '@/components/markets/LendingTableClient'
import { Button } from '@/components/ui/button'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DIVERSIFICATION_LEVELS,
  type VaultAllocationResponse,
  optimizeVaults,
} from '@/lib/api/optimizer'
import { formatCompactCurrency } from '@/lib/format-currency'
import type { LendMarket } from '@/types'

const DIVERSIFICATION_OPTIONS = [
  { label: 'High', value: DIVERSIFICATION_LEVELS.HIGH },
  { label: 'Moderate', value: DIVERSIFICATION_LEVELS.MODERATE },
  { label: 'Low', value: DIVERSIFICATION_LEVELS.LOW },
] as const

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

function getDiversificationLabel(value: number): string {
  const match = DIVERSIFICATION_OPTIONS.find((opt) => opt.value === value)
  return match?.label ?? ''
}

type DisplayMode = 'percent' | 'value'

interface OptimizationResult {
  vault: LendMarket
  allocation: number
  allocationPercent: number
}

interface LendingOptimizerViewProps {
  markets: LendMarket[]
  onBack?: () => void
}

export function LendingOptimizerView({
  markets,
  onBack,
}: LendingOptimizerViewProps) {
  const [results, setResults] = useState<OptimizationResult[] | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultingDiversification, setResultingDiversification] = useState<
    number | null
  >(null)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('percent')
  const [investedAmount, setInvestedAmount] = useState(0)

  const form = useForm({
    defaultValues: {
      amount: 0,
      horizon: 'apyMonthly',
      diversification: DIVERSIFICATION_LEVELS.MODERATE as number,
    },
    onSubmit: async ({ value }) => {
      setError(null)
      setResults(null)
      setIsOptimizing(true)

      try {
        if (markets.length === 0) {
          throw new Error('No markets selected')
        }

        // Find the HORIZON_CONFIG entry matching the selected apyKey
        const horizonEntry = Object.values(HORIZON_CONFIG).find(
          (h) => h.apyKey === value.horizon
        )
        const apyKey = (horizonEntry?.apyKey ?? 'apy') as keyof LendMarket

        // Extract APYs per selected market for the chosen horizon
        const apys = markets.map((m) => {
          const v = m[apyKey]
          return typeof v === 'number' ? v : 0
        })
        const diversification = value.diversification

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
            vault: markets[a.vault_index],
            allocation: a.allocation,
            allocationPercent: a.allocation_percent,
          }))
          .sort((a, b) => b.allocationPercent - a.allocationPercent)

        setResults(optimizationResults)
        setResultingDiversification(response.resulting_diversification)
        setInvestedAmount(value.amount)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Optimization failed')
        setResults(null)
      } finally {
        setIsOptimizing(false)
      }
    },
  })

  return (
    <div className="flex gap-6 py-4">
      {/* Left Column - Form (1/3) */}
      <div className="flex w-1/3 flex-col">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-1 flex-col space-y-4"
        >
          <form.Field name="amount">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <div className="border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex items-center rounded-md border focus-within:ring-[3px]">
                  <span className="text-muted-foreground pl-3 text-sm select-none">
                    $
                  </span>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                    onBlur={field.handleBlur}
                    className="border-0 shadow-none focus-visible:ring-0"
                  />
                  <span className="text-muted-foreground pr-3 text-sm select-none">
                    USD
                  </span>
                </div>
              </div>
            )}
          </form.Field>

          <form.Field name="horizon">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="diversification">Horizon</Label>
                <Select
                  value={String(field.state.value)}
                  onValueChange={(value) => field.handleChange(value)}
                >
                  <SelectTrigger id="diversification" className="w-full">
                    <SelectValue placeholder="Select diversification" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(HORIZON_CONFIG).map((opt) => (
                      <SelectItem key={opt.apyKey} value={String(opt.apyKey)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="diversification">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="diversification">Diversification</Label>
                <Select
                  value={String(field.state.value)}
                  onValueChange={(value) => field.handleChange(Number(value))}
                >
                  <SelectTrigger id="diversification" className="w-full">
                    <SelectValue placeholder="Select diversification" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIVERSIFICATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <div className="mt-auto flex gap-3">
            {onBack && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={onBack}
                disabled={isOptimizing}
              >
                Back
              </Button>
            )}
            <Button
              type="submit"
              className={onBack ? 'flex-2' : 'w-full'}
              disabled={isOptimizing}
            >
              {isOptimizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {isOptimizing ? 'Optimizing...' : 'Run Optimization'}
            </Button>
          </div>
        </form>
      </div>

      {/* Separator */}
      <Separator orientation="vertical" className="h-auto" />

      {/* Right Column - Results (2/3) */}
      <div className="w-2/3 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            Recommended Allocations
          </h3>
          {results && results.length > 0 && (
            <ToggleGroup
              type="single"
              value={displayMode}
              onValueChange={(v: string) => {
                if (v) setDisplayMode(v as DisplayMode)
              }}
              className="border"
            >
              <ToggleGroupItem value="percent" aria-label="Show percentages">
                <Percent />
              </ToggleGroupItem>
              <ToggleGroupItem value="value" aria-label="Show dollar values">
                <DollarSign />
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

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

        {/* Results - PieChart + Legend */}
        {results && results.length > 0 && (
          <AllocationPieChart
            results={results}
            displayMode={displayMode}
            investedAmount={investedAmount}
            resultingDiversification={resultingDiversification}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Allocation PieChart Sub-component
// ============================================================================

interface AllocationPieChartProps {
  results: OptimizationResult[]
  displayMode: DisplayMode
  investedAmount: number
  resultingDiversification: number | null
}

function AllocationPieChart({
  results,
  displayMode,
  investedAmount,
  resultingDiversification,
}: AllocationPieChartProps) {
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {
      value: { label: displayMode === 'value' ? 'Amount' : 'Allocation' },
    }
    results.forEach((r, i) => {
      const key = `vault_${i}`
      config[key] = {
        label: r.vault.poolName,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }
    })
    return config
  }, [results, displayMode])

  const chartData = useMemo(
    () =>
      results.map((r, i) => {
        const key = `vault_${i}`
        return {
          id: key,
          label: r.vault.poolName,
          protocol: r.vault.protocol,
          value:
            displayMode === 'value'
              ? investedAmount * (r.allocationPercent / 100)
              : r.allocationPercent,
          percent: r.allocationPercent,
          dollarValue: investedAmount * (r.allocationPercent / 100),
          apy: r.vault.apy,
          fill: `var(--color-${key})`,
        }
      }),
    [results, displayMode, investedAmount]
  )

  const centerLabel = useMemo(() => {
    if (displayMode === 'value' && investedAmount > 0) {
      return formatCompactCurrency(investedAmount, 'USD')
    }
    return `${results.length} vault${results.length > 1 ? 's' : ''}`
  }, [displayMode, investedAmount, results.length])

  const weightedApy = useMemo(
    () =>
      results.reduce(
        (acc, r) => acc + r.vault.apy * (r.allocationPercent / 100),
        0
      ),
    [results]
  )

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Donut Chart */}
      <div className="flex items-center justify-center">
        <div className="h-[250px] w-[250px]">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto! h-full w-full"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    valueFormatter={(val) =>
                      displayMode === 'value'
                        ? formatCompactCurrency(val as number, 'USD')
                        : `${(val as number).toFixed(1)}%`
                    }
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                innerRadius={60}
                strokeWidth={5}
              >
                <RechartsLabel
                  content={({ viewBox }) => {
                    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-lg font-bold"
                          >
                            {centerLabel}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-muted-foreground text-xs"
                          >
                            {displayMode === 'value' ? 'invested' : 'allocated'}
                          </tspan>
                        </text>
                      )
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>
      </div>

      {/* Legend + Summary */}
      <div className="flex flex-col justify-center">
        {/* Legend */}
        <div className="max-h-[140px] space-y-2 overflow-y-auto pr-1">
          {chartData.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor: chartConfig[item.id]?.color ?? item.fill,
                  }}
                />
                <span className="text-muted-foreground truncate">
                  {item.label}
                </span>
              </div>
              <span className="text-foreground ml-2 shrink-0 font-medium">
                {displayMode === 'value'
                  ? formatCompactCurrency(item.dollarValue, 'USD')
                  : `${item.percent.toFixed(1)}%`}
              </span>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="border-border mt-4 space-y-2 border-t pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Weighted Avg APY</span>
            <span className="text-primary font-bold">
              {(weightedApy * 100).toFixed(2)}%
            </span>
          </div>
          {resultingDiversification !== null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Diversification</span>
              <span className="text-muted-foreground font-medium">
                {getDiversificationLabel(resultingDiversification)}{' '}
                {resultingDiversification.toFixed(0)}%
              </span>
            </div>
          )}
          {investedAmount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Yearly Return</span>
              <span className="font-medium text-green-500">
                {formatCompactCurrency(investedAmount * weightedApy, 'USD')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
