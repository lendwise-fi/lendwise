import { StatCard as StatCardType } from '@/types'

import { StatCard } from './StatCard'

export function StatsBar({ stats }: { stats: StatCardType[] }) {
  return (
    <div className="bg-card border-border flex items-stretch overflow-x-auto border-b">
      {stats.map((stat: StatCardType, i: number) => (
        <StatCard key={i} {...stat} />
      ))}
    </div>
  )
}
