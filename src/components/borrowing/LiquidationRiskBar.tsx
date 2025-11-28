import { cn } from '@/lib/utils'

interface LiquidationRiskBarProps {
  borrowCapacity: number
  borrowing: number
}

export function LiquidationRiskBar({
  borrowCapacity,
  borrowing,
}: LiquidationRiskBarProps) {
  const riskFactor = borrowing / borrowCapacity
  const risk = riskFactor * 100
  return (
    <div className="flex w-full flex-col items-center gap-0">
      <div className="flex w-full flex-row justify-between">
        <span className="text-muted-foreground w-20 text-left text-xs wrap-break-word">
          Liquidation Risk
        </span>
        <span className="text-muted-foreground w-20 text-right text-xs wrap-break-word">
          Borrow Capacity
        </span>
      </div>

      <div className="relative flex w-full flex-1 items-center">
        {/* Green Bar */}
        <div
          className={cn('h-1 rounded-l-full bg-emerald-500', {
            'bg-red-500': riskFactor > 0.6,
          })}
          style={{ width: `${Math.round(risk)}%` }}
        />

        {/* Percentage Label */}
        <span className="text-foreground mx-2 text-xs font-bold">
          {Math.round(risk)}%
        </span>

        {/* Grey Bar */}
        <div className="bg-secondary h-1 flex-1 rounded-r-full" />

        {/* Dot at the end */}
        <div className="bg-foreground absolute right-3 h-2 w-2 rounded-full" />
      </div>
    </div>
  )
}
