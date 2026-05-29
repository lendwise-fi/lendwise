import type { StatCard as StatCardType } from '@/types'

import { StatCard } from './StatCard'

export function StatsBar({ stats }: { stats: StatCardType[] }) {
  return (
    <div className="bg-card border-border flex shrink-0 items-stretch overflow-x-auto border-b">
      {stats.map((stat: StatCardType) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  )
}
