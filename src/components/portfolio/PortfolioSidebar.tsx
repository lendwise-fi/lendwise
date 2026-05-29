import { Activity, TrendingDown, TrendingUp } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

type BreakdownItem = { name: string; value: number; color: string }

type PortfolioSummary = {
  totalSupplying: { value: number; currency: string; positions: number }
  totalBorrowing: { value: number; currency: string; positions: number }
  supplyBreakdown: BreakdownItem[]
  borrowBreakdown: BreakdownItem[]
}

export default function PortfolioSidebar({
  summary,
}: {
  summary: PortfolioSummary
}) {
  const { totalSupplying, totalBorrowing, supplyBreakdown, borrowBreakdown } =
    summary
  const netPosition = totalSupplying.value - totalBorrowing.value
  const healthRatio =
    totalBorrowing.value > 0
      ? (totalSupplying.value / totalBorrowing.value).toFixed(2)
      : '∞'

  return (
    <aside className="border-border bg-card/40 hidden w-72 shrink-0 flex-col overflow-y-auto border-r md:flex">
      {/* Header */}
      <div className="border-border border-b px-6 py-5">
        <h1 className="text-foreground text-lg font-semibold">
          Portfolio Tracker
        </h1>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Monitor your DeFi positions
        </p>
      </div>

      {/* Net position */}
      <div className="border-border border-b px-6 py-5">
        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
          Net Position
        </p>
        <p className="text-foreground font-mono text-3xl font-semibold">
          ${netPosition.toFixed(2)}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-muted-foreground text-xs">
            Health ratio:{' '}
            <span className="font-mono font-medium text-emerald-400">
              {healthRatio}
            </span>
          </span>
        </div>
      </div>

      {/* Supply chart */}
      <div className="border-border border-b px-6 py-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Total Supplying
            </p>
            <p className="text-muted-foreground text-xs">
              {totalSupplying.positions} positions
            </p>
          </div>
          <div className="flex items-center gap-1 text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="font-mono text-lg font-semibold">
              ${totalSupplying.value.toFixed(2)}
            </span>
          </div>
        </div>
        <DonutWithLegend data={supplyBreakdown} />
      </div>

      {/* Borrow chart */}
      <div className="px-6 py-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Total Borrowing
            </p>
            <p className="text-muted-foreground text-xs">
              {totalBorrowing.positions} positions
            </p>
          </div>
          <div className="flex items-center gap-1 text-rose-400">
            <TrendingDown className="h-3.5 w-3.5" />
            <span className="font-mono text-lg font-semibold">
              ${totalBorrowing.value.toFixed(2)}
            </span>
          </div>
        </div>
        <DonutWithLegend data={borrowBreakdown} />
      </div>
    </aside>
  )
}

function DonutWithLegend({ data }: { data: BreakdownItem[] }) {
  const chartData = data.map((d) => ({ ...d, value: Math.max(d.value, 0.01) }))

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={24}
              outerRadius={36}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-2">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground text-xs">{item.name}</span>
            </div>
            <span className="text-foreground font-mono text-xs">
              {item.value.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
