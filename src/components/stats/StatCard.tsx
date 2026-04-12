import { StatCard as StatCardType } from '@/types'

export function StatCard({ label, value, sub, accent }: StatCardType) {
  return (
    <div className="border-border flex flex-col gap-1 border-r px-6 py-4 last:border-r-0">
      <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {label}
      </p>
      <p
        className={`font-mono text-xl font-semibold ${accent ? 'text-primary' : 'text-foreground'}`}
      >
        {value}
      </p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
    </div>
  )
}
