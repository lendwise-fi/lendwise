'use client'

import type { ReactNode } from 'react'

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Separator } from '@/components/ui/separator'
import { useCurrency } from '@/contexts'
import { formatCompactCurrency } from '@/lib/format-currency'
import type { HealthSummary } from '@/lib/risk/summary'
import type { HealthFactorResult, UnknownReason } from '@/lib/risk/types'
import { cn } from '@/lib/utils'

const zone = (hf: number) =>
  hf < 1 ? 'text-rose-400' : hf < 1.5 ? 'text-amber-400' : 'text-emerald-400'

const REASON: Record<UnknownReason, string> = {
  'missing-price': 'No current price for',
  'invalid-weight': 'No usable risk weight for',
  'invalid-amount': 'Invalid amount for',
  'missing-risk-data': 'Risk data unavailable for',
}

function HealthHoverCard({
  trigger,
  value,
  children,
}: {
  trigger: ReactNode
  value: ReactNode
  children: ReactNode
}) {
  return (
    <HoverCard openDelay={50} closeDelay={50}>
      <HoverCardTrigger asChild>
        <div className="hover:bg-accent inline-flex cursor-pointer items-center rounded-md p-1.5 transition-colors">
          {trigger}
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="border-border/60 bg-popover/95 w-64 rounded-md border p-0 shadow-2xl backdrop-blur-sm"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-muted-foreground text-xs">Health factor</p>
          <p className="font-mono text-sm">{value}</p>
        </div>
        <Separator className="bg-border/60" />
        <div className="py-3 text-xs">{children}</div>
      </HoverCardContent>
    </HoverCard>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

function SourceDetails({ result }: { result: HealthFactorResult }) {
  const observedAt = result.observedAt ? new Date(result.observedAt) : null
  return result.sourceLabel ? (
    <p className="text-muted-foreground px-4 py-1">
      {result.sourceLabel}
      {observedAt && Number.isFinite(observedAt.getTime()) && (
        <>
          {' '}
          ·{' '}
          <time dateTime={result.observedAt}>
            {observedAt.toLocaleString()}
          </time>
        </>
      )}
    </p>
  ) : null
}

export function HealthFactorValue({ result }: { result: HealthFactorResult }) {
  const { baseCurrency, rate } = useCurrency()

  if (result.status === 'no-liability') {
    return (
      <HealthHoverCard
        trigger={<span className="font-mono text-emerald-400">∞</span>}
        value={<span className="text-emerald-400">∞</span>}
      >
        <SourceDetails result={result} />
        <p className="text-muted-foreground px-4 py-1">
          No debt — this account cannot be liquidated.
        </p>
      </HealthHoverCard>
    )
  }
  if (result.status === 'unknown') {
    return (
      <HealthHoverCard
        trigger={
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-xs text-rose-300">
            Unknown
          </span>
        }
        value={<span className="text-rose-300">Unknown</span>}
      >
        <SourceDetails result={result} />
        <p className="px-4 py-1">
          {result.symbols.length === 0
            ? 'Risk data unavailable'
            : `${REASON[result.reason]} ${result.symbols.join(', ')}`}
        </p>
        <p className="text-muted-foreground px-4 py-1">
          Not computed rather than guessed.
        </p>
      </HealthHoverCard>
    )
  }
  const value = result.healthFactor.toFixed(2)
  return (
    <HealthHoverCard
      trigger={
        <span className={cn('font-mono', zone(result.healthFactor))}>
          {value}
        </span>
      }
      value={<span className={zone(result.healthFactor)}>{value}</span>}
    >
      <SourceDetails result={result} />
      <DetailRow
        label="Weighted collateral"
        value={
          result.weightedCollateralUsd == null
            ? '—'
            : formatCompactCurrency(
                result.weightedCollateralUsd * rate,
                baseCurrency
              )
        }
      />
      <DetailRow
        label="Weighted debt"
        value={
          result.weightedLiabilityUsd == null
            ? '—'
            : formatCompactCurrency(
                result.weightedLiabilityUsd * rate,
                baseCurrency
              )
        }
      />
      <p className="text-muted-foreground px-4 py-1">
        Below 1.00 the position can be liquidated.
      </p>
    </HealthHoverCard>
  )
}

export function HealthSummaryValue({ summary }: { summary: HealthSummary }) {
  switch (summary.status) {
    case 'none':
      return <span className="text-muted-foreground font-mono">—</span>
    case 'no-liability':
      return <span className="font-mono text-emerald-400">∞</span>
    case 'ok':
      return (
        <span className={cn('font-mono', zone(summary.lowest))}>
          {summary.lowest.toFixed(2)}
        </span>
      )
    case 'unknown':
      return (
        <span className="font-mono text-rose-300">
          Unknown ({summary.unknownCount} account
          {summary.unknownCount > 1 ? 's' : ''})
        </span>
      )
  }
}
