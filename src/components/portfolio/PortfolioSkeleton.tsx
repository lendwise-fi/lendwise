import { Skeleton } from '@/components/ui/skeleton'

// ─── Sidebar skeleton ─────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <aside className="border-border bg-card/40 hidden md:flex w-72 shrink-0 flex-col overflow-y-auto border-r">
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
      <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
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

// ─── Mobile summary bar skeleton ─────────────────────────────────────────────

function MobileSummarySkeleton() {
  return (
    <div className="md:hidden border-b bg-card/40 px-4 py-3 grid grid-cols-4 gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-2 w-8" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  )
}

// ─── Tab bar skeleton ─────────────────────────────────────────────────────────

function TabBarSkeleton() {
  return (
    <div className="border-border border-b flex">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="px-4 py-3 md:px-8 md:py-5 space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12 sm:h-6 sm:w-36" />
            <Skeleton className="h-4 w-5 rounded-full" />
          </div>
          <Skeleton className="hidden sm:block h-3 w-52" />
        </div>
      ))}
    </div>
  )
}

// ─── Table rows ───────────────────────────────────────────────────────────────

function SupplyRow() {
  return (
    <div className="border-border/30 flex items-center gap-3 border-b px-4 md:px-8 py-3.5">
      {/* Protocol — hidden on mobile */}
      <Skeleton className="hidden sm:block h-6 w-[88px] shrink-0 rounded-lg" />
      {/* Network — hidden on mobile */}
      <Skeleton className="hidden sm:block h-6 w-[88px] shrink-0 rounded-lg" />
      {/* Address — hidden on mobile */}
      <Skeleton className="hidden md:block h-6 w-24 shrink-0 rounded-lg" />
      {/* Vault/Pool */}
      <div className="flex flex-1 items-center gap-2">
        <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-28 sm:w-40" />
      </div>
      {/* Deposits */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-16 sm:w-20" />
        <Skeleton className="hidden sm:block h-5 w-14 rounded-md" />
      </div>
      {/* APY */}
      <Skeleton className="h-4 w-10 sm:w-12" />
      {/* Link */}
      <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
    </div>
  )
}

function BorrowRow() {
  return (
    <div className="border-border/30 flex items-center gap-3 border-b px-4 md:px-8 py-3.5">
      {/* Protocol — hidden on mobile */}
      <Skeleton className="hidden sm:block h-6 w-[88px] shrink-0 rounded-lg" />
      {/* Network — hidden on mobile */}
      <Skeleton className="hidden sm:block h-6 w-[88px] shrink-0 rounded-lg" />
      {/* Address — hidden on mobile */}
      <Skeleton className="hidden md:block h-6 w-24 shrink-0 rounded-lg" />
      {/* Vault/Pool */}
      <div className="flex flex-1 items-center gap-2">
        <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-24 sm:w-36" />
      </div>
      {/* Debt */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-16 sm:w-20" />
        <Skeleton className="hidden sm:block h-3 w-14" />
      </div>
      {/* Collaterals — hidden on mobile */}
      <div className="hidden sm:flex items-center gap-1">
        <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-5 -ml-1.5 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-5 -ml-1.5 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-14 ml-1" />
      </div>
      {/* Rate */}
      <Skeleton className="h-4 w-10" />
      {/* Health — hidden on mobile */}
      <Skeleton className="hidden sm:block h-4 w-10" />
      {/* Link */}
      <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
    </div>
  )
}

// ─── Table section skeleton ───────────────────────────────────────────────────

function TableSectionSkeleton({
  row: Row,
  rows = 5,
}: {
  row: () => React.ReactNode
  rows?: number
}) {
  return (
    <div className="flex flex-col">
      {/* Column headers */}
      <div className="border-border/50 flex items-center gap-4 border-b px-4 md:px-8 py-3">
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="hidden sm:block h-2.5 w-12" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <Row key={i} />
      ))}
    </div>
  )
}

// ─── Full portfolio skeleton ──────────────────────────────────────────────────

export function PortfolioSkeleton() {
  return (
    <div className="flex h-full overflow-hidden">
      <SidebarSkeleton />

      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileSummarySkeleton />
        <TabBarSkeleton />

        <div className="flex-1 overflow-y-auto">
          <TableSectionSkeleton row={SupplyRow} rows={4} />
        </div>
      </div>
    </div>
  )
}
