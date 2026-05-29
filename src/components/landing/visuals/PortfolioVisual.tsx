'use client'

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'

const positions = [
  {
    asset: 'USDC',
    protocol: 'Aave V3',
    value: '$12,450',
    pnl: '+$245',
    up: true,
    apy: '4.12%',
  },
  {
    asset: 'ETH',
    protocol: 'Lido',
    value: '$8,200',
    pnl: '+$180',
    up: true,
    apy: '3.85%',
  },
  {
    asset: 'DAI',
    protocol: 'Morpho',
    value: '$5,100',
    pnl: '-$12',
    up: false,
    apy: '5.21%',
  },
]

const chartPoints = [
  20, 25, 22, 30, 28, 35, 42, 38, 45, 52, 48, 55, 60, 58, 65, 72, 68, 75, 80,
]

export function PortfolioVisual() {
  const max = Math.max(...chartPoints)
  const h = 120
  const w = 100
  const points = chartPoints
    .map((v, i) => `${(i / (chartPoints.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ')

  return (
    <div className="border-border/50 bg-card/80 glow-violet relative overflow-hidden rounded-2xl border backdrop-blur-sm">
      {/* Header */}
      <div className="border-border/30 border-b p-6">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Total Portfolio Value
          </span>
          <div className="text-chart-3 flex items-center gap-1 text-xs font-medium">
            <ArrowUpRight className="h-3 w-3" />
            +12.4% (30d)
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="font-inter text-3xl font-bold"
        >
          $25,750
        </motion.div>

        {/* Mini chart */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-4"
        >
          <svg
            aria-label="Portfolio value chart"
            viewBox={`0 0 ${w} ${h}`}
            className="h-24 w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="hsl(265, 85%, 65%)"
                  stopOpacity="0.3"
                />
                <stop
                  offset="100%"
                  stopColor="hsl(265, 85%, 65%)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <polygon
              points={`0,${h} ${points} ${w},${h}`}
              fill="url(#chartGrad)"
            />
            <polyline
              points={points}
              fill="none"
              stroke="hsl(265, 85%, 65%)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>
      </div>

      {/* Positions */}
      <div className="space-y-3 p-6">
        {positions.map((pos, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
            className="hover:bg-secondary/30 flex items-center justify-between rounded-xl px-3 py-2 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-secondary flex h-8 w-8 items-center justify-center rounded-lg">
                <span className="font-mono text-xs font-bold">
                  {pos.asset.slice(0, 2)}
                </span>
              </div>
              <div>
                <div className="text-sm font-medium">{pos.asset}</div>
                <div className="text-muted-foreground text-xs">
                  {pos.protocol}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-medium">{pos.value}</div>
              <div
                className={`flex items-center justify-end gap-0.5 font-mono text-xs ${pos.up ? 'text-chart-3' : 'text-destructive'}`}
              >
                {pos.up ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {pos.pnl}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
