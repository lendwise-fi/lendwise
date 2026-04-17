'use client'

import { useCallback, useEffect, useState } from 'react'

import { Activity, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlotInfo {
  hour: string
  count: number
  status: 'complete' | 'partial' | 'building'
  healed: boolean
  productCount: number
  expectedProducts: number
}

interface ProtocolRow {
  protocol: string
  label: string
  totalProducts: number
  slots: SlotInfo[]
  summary: {
    complete: number
    partial: number
    missing: number
    total: number
  }
}

interface LatestReports {
  gapDetection: {
    id: string
    createdAt: string
    missingSlots: number
    incompleteSlots: number
    expectedSlots: number
  } | null
  gapHealing: {
    id: string
    createdAt: string
    totalGaps: number
    healed: number
    healedByRefetch: number
    healedByNeighbor: number
    noDonor: number
  } | null
}

interface QualityData {
  window: { start: string; end: string; hours: number }
  protocols: ProtocolRow[]
  latestReports: LatestReports
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatHour(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function slotColor(slot: SlotInfo, _totalProducts: number): string {
  if (slot.productCount === 0) return 'bg-red-500/80'
  if (slot.status === 'complete') return 'bg-emerald-500/80'
  if (slot.healed) return 'bg-emerald-500/60'
  if (slot.count >= 4) return 'bg-amber-400/80'
  if (slot.count >= 1) return 'bg-orange-500/80'
  return 'bg-red-500/80'
}

function slotLabel(slot: SlotInfo, _totalProducts: number): string {
  if (slot.productCount === 0) return 'No data'
  if (slot.status === 'complete') return 'Complete'
  if (slot.healed) return 'Healed'
  if (slot.count >= 4) return 'Partial'
  if (slot.count >= 1) return 'Sparse'
  return 'Missing'
}

// ─── Components ─────────────────────────────────────────────────────────────

function ProtocolHeatmap({ row }: { row: ProtocolRow }) {
  const { label, totalProducts, slots, summary } = row
  const pct =
    summary.total > 0 ? Math.round((summary.complete / summary.total) * 100) : 0

  // Group slots by calendar day (midnight-aligned)
  const dayMap = new Map<string, SlotInfo[]>()
  for (const slot of slots) {
    const d = new Date(slot.hour)
    const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const list = dayMap.get(dayKey) ?? []
    list.push(slot)
    dayMap.set(dayKey, list)
  }
  const days: { label: string; slots: SlotInfo[] }[] = []
  for (const [dayKey, daySlots] of dayMap) {
    const dayDate = new Date(dayKey + 'T00:00:00Z')
    days.push({
      label: dayDate.toLocaleDateString('en-GB', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      slots: daySlots,
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{label}</CardTitle>
            <CardDescription>
              {totalProducts} products · {summary.complete}/{summary.total}{' '}
              hours complete ({pct}%)
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge
              variant={
                pct >= 95 ? 'default' : pct >= 70 ? 'secondary' : 'destructive'
              }
              className="text-xs"
            >
              {pct >= 95 ? 'Healthy' : pct >= 70 ? 'Degraded' : 'Critical'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {days.map((day) => (
            <div key={day.label} className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 shrink-0 text-right font-mono text-xs">
                {day.label}
              </span>
              <div
                className="grid flex-1 grid-cols-24 gap-px"
                style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}
              >
                {day.slots.map((slot) => {
                  const slotHour = new Date(slot.hour).getUTCHours()
                  return (
                    <Tooltip key={slot.hour}>
                      <TooltipTrigger asChild>
                        <div
                          style={{ gridColumn: slotHour + 1 }}
                          className={`h-5 cursor-pointer rounded-[2px] transition-all hover:scale-y-125 hover:brightness-110 ${slotColor(slot, totalProducts)} ${slot.healed ? 'ring-1 ring-blue-400/50' : ''}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="bg-popover text-popover-foreground max-w-xs border shadow-md"
                      >
                        <div className="space-y-1 py-1">
                          <div className="text-xs font-semibold">
                            {formatHour(slot.hour)} UTC
                          </div>
                          <div className="space-y-0.5 text-xs">
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">
                                Status
                              </span>
                              <span className="font-medium">
                                {slotLabel(slot, totalProducts)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">
                                Avg. spots
                              </span>
                              <span className="font-medium">
                                {slot.count}/6
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">
                                Products
                              </span>
                              <span className="font-medium">
                                {slot.productCount}/{slot.expectedProducts}
                              </span>
                            </div>
                            {slot.healed && (
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">
                                  Healed
                                </span>
                                <span className="font-medium text-blue-400">
                                  Yes
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {/* Hour labels */}
        <div className="mt-1 flex items-center gap-2">
          <span className="w-24 shrink-0" />
          <div className="text-muted-foreground flex flex-1 justify-between font-mono text-2xs">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ReportCard({ reports }: { reports: LatestReports }) {
  const gap = reports.gapDetection
  const heal = reports.gapHealing

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" />
            Latest Gap Detection
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gap ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Run</span>
                <span className="font-mono text-xs">
                  {formatRelative(gap.createdAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected slots</span>
                <span className="font-mono">
                  {gap.expectedSlots.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Missing</span>
                <span
                  className={`font-mono ${gap.missingSlots > 0 ? 'text-red-400' : 'text-emerald-400'}`}
                >
                  {gap.missingSlots.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Incomplete</span>
                <span
                  className={`font-mono ${gap.incompleteSlots > 0 ? 'text-amber-400' : 'text-emerald-400'}`}
                >
                  {gap.incompleteSlots.toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No reports yet</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Latest Heal Job
          </CardTitle>
        </CardHeader>
        <CardContent>
          {heal ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Run</span>
                <span className="font-mono text-xs">
                  {formatRelative(heal.createdAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total gaps</span>
                <span className="font-mono">
                  {heal.totalGaps.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Healed</span>
                <span className="font-mono text-emerald-400">
                  {heal.healed.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">By refetch</span>
                <span className="font-mono">
                  {heal.healedByRefetch.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">By neighbor</span>
                <span className="font-mono">
                  {heal.healedByNeighbor.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">No donor</span>
                <span
                  className={`font-mono ${heal.noDonor > 0 ? 'text-red-400' : 'text-emerald-400'}`}
                >
                  {heal.noDonor.toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No reports yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [data, setData] = useState<QualityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/status/quality')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Data Quality Status</h1>
          <p className="text-muted-foreground text-sm">
            APY pipeline health — last 7 days (168 hourly slots per protocol)
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Legend */}
      <div className="text-muted-foreground flex items-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-[2px] bg-emerald-500/80" />
          Complete (≥95% products, 6/6 spots)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-[2px] bg-amber-400/80" />
          Partial (4-5 spots)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-[2px] bg-orange-500/80" />
          Sparse (1-3 spots)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-[2px] bg-red-500/80" />
          Missing (0 spots)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="bg-muted h-3 w-3 rounded-[2px] ring-1 ring-blue-400/50" />
          Contains healed data
        </div>
      </div>

      {error && (
        <div className="border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border p-4 text-sm">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-20">
          <Clock className="h-5 w-5 animate-pulse" />
          Loading quality data…
        </div>
      )}

      {data && (
        <>
          {/* Window info */}
          <p className="text-muted-foreground font-mono text-xs">
            Window: {formatHour(data.window.start)} →{' '}
            {formatHour(data.window.end)} UTC
          </p>

          {/* Protocol heatmaps */}
          <div className="space-y-4">
            {data.protocols.map((row) => (
              <ProtocolHeatmap key={row.protocol} row={row} />
            ))}
          </div>

          {/* Reports */}
          <ReportCard reports={data.latestReports} />
        </>
      )}
    </div>
  )
}
