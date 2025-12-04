'use client'

export function LendingTableSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="bg-muted h-10 rounded" />
      ))}
    </div>
  )
}
