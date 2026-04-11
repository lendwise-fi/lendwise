import { Skeleton } from '@/components/ui/skeleton'

// ─── Sidebar skeleton ─────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <aside className="border-border bg-card/40 flex w-72 shrink-0 flex-col overflow-y-auto border-r">
      {/* Header */}
      <div className="border-border border-b px-6 py-5">
        <Skeleton className="mb-1.5 h-5 w-36" />
        <Skeleton className="h-3 w-44" />
      </div>

      {/* Net position */}
      <div className="border-border border-b px-6 py-5">
        <Skeleton className="mb-2 h-2.5 w-20" />
        <Skeleton className="mb-2 h-9 w-32" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3.5 w-3.5 rounded-full" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>

      {/* Supply section */}
      <div className="border-border border-b px-6 py-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <DonutSkeleton />
      </div>

      {/* Borrow section */}
      <div className="px-6 py-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <DonutSkeleton />
      </div>
    </aside>
  )
}

function DonutSkeleton() {
  return (
    <div className="flex items-center gap-4">
      {/* Donut circle */}
      <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
      {/* Legend lines */}
      <div className="flex-1 space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Table section skeleton ───────────────────────────────────────────────────

function TableSectionSkeleton({
  title,
  subtitle,
  row: Row,
  rows = 5,
}: {
  title: string
  subtitle: string
  row: () => React.ReactNode
  rows?: number
}) {
  return (
    <div className="flex flex-col">
      {/* Section header */}
      <div className="border-border/50 flex items-center justify-between border-b px-8 py-5">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      {/* Column headers */}
      <div className="border-border/50 flex items-center gap-4 border-b px-8 py-3">
        {[title, subtitle].map((_, i) => (
          <Skeleton key={i} className="h-2.5 w-12" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <Row key={i} />
      ))}
    </div>
  )
}

// ─── Supply row (7 cols) ──────────────────────────────────────────────────────
// Protocol | Network | Address | Vault/Pool | Deposits | APY | link

function SupplyRow() {
  return (
    <div className="border-border/30 flex items-center gap-4 border-b px-8 py-3.5">
      {/* Protocol */}
      <Skeleton className="h-6 w-[88px] shrink-0 rounded-lg" />
      {/* Network */}
      <Skeleton className="h-6 w-[88px] shrink-0 rounded-lg" />
      {/* Address */}
      <Skeleton className="h-6 w-24 shrink-0 rounded-lg" />
      {/* Vault/Pool */}
      <div className="flex flex-1 items-center gap-2">
        <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      {/* Deposits */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-14 rounded-md" />
      </div>
      {/* APY */}
      <Skeleton className="h-4 w-12" />
      {/* Link */}
      <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
    </div>
  )
}

// ─── Borrow row (9 cols) ──────────────────────────────────────────────────────
// Protocol | Network | Address | Vault/Pool | Debt | Collaterals | Rate | Health | link

function BorrowRow() {
  return (
    <div className="border-border/30 flex items-center gap-4 border-b px-8 py-3.5">
      {/* Protocol */}
      <Skeleton className="h-6 w-[88px] shrink-0 rounded-lg" />
      {/* Network */}
      <Skeleton className="h-6 w-[88px] shrink-0 rounded-lg" />
      {/* Address */}
      <Skeleton className="h-6 w-24 shrink-0 rounded-lg" />
      {/* Vault/Pool */}
      <div className="flex flex-1 items-center gap-2">
        <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-36" />
      </div>
      {/* Debt */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
      {/* Collaterals */}
      <div className="flex items-center gap-1">
        <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-5 -ml-1.5 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-5 -ml-1.5 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-14 ml-1" />
      </div>
      {/* Rate */}
      <Skeleton className="h-4 w-10" />
      {/* Health */}
      <Skeleton className="h-4 w-10" />
      {/* Link */}
      <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
    </div>
  )
}

// ─── Full portfolio skeleton ──────────────────────────────────────────────────

export function PortfolioSkeleton() {
  return (
    <div className="flex h-full overflow-hidden">
      <SidebarSkeleton />

      <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
        {/* Supplying positions */}
        <TableSectionSkeleton
          title="Supplying"
          subtitle="positions"
          row={SupplyRow}
          rows={4}
        />

        {/* Borrowing positions */}
        <TableSectionSkeleton
          title="Borrowing"
          subtitle="positions"
          row={BorrowRow}
          rows={4}
        />
      </div>
    </div>
  )
}
