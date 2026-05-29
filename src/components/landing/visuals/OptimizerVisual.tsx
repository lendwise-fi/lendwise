'use client'

import { Shield, TrendingUp, Zap } from 'lucide-react'
import { motion } from 'motion/react'

const allocations = [
  {
    name: 'Aave V3 USDC',
    chain: 'Ethereum',
    apy: '4.12%',
    share: 35,
    color: 'bg-primary',
  },
  {
    name: 'Morpho Blue',
    chain: 'Base',
    apy: '5.87%',
    share: 28,
    color: 'bg-accent',
  },
  {
    name: 'Pendle PT',
    chain: 'Arbitrum',
    apy: '8.21%',
    share: 22,
    color: 'bg-chart-3',
  },
  {
    name: 'Yearn V3',
    chain: 'Ethereum',
    apy: '3.95%',
    share: 15,
    color: 'bg-chart-4',
  },
]

export function OptimizerVisual() {
  return (
    <div className="border-border/50 bg-card/80 glow-violet relative overflow-hidden rounded-2xl border backdrop-blur-sm">
      {/* Top stats */}
      <div className="border-border/30 border-b p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Optimized Portfolio
          </span>
          <div className="text-chart-3 flex items-center gap-1 text-xs font-medium">
            <TrendingUp className="h-3 w-3" />
            +2.4% vs manual
          </div>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-inter text-foreground text-4xl font-bold">
            5.82
          </span>
          <span className="text-primary text-lg font-medium">% APY</span>
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          Blended yield across 4 positions
        </div>
      </div>

      {/* Allocation bars */}
      <div className="p-6">
        <div className="mb-6 flex h-3 gap-1 overflow-hidden rounded-full">
          {allocations.map((a, i) => (
            <motion.div
              key={a.name}
              initial={{ width: 0 }}
              whileInView={{ width: `${a.share}%` }}
              viewport={{ once: true }}
              transition={{
                duration: 0.6,
                delay: 0.3 + i * 0.1,
                ease: 'easeOut',
              }}
              className={`${a.color} rounded-full`}
            />
          ))}
        </div>

        <div className="space-y-3">
          {allocations.map((a, i) => (
            <motion.div
              key={a.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
              className="flex items-center justify-between py-2"
            >
              <div className="flex items-center gap-3">
                <div className={`h-2.5 w-2.5 rounded-full ${a.color}`} />
                <div>
                  <span className="text-sm font-medium">{a.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {a.chain}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground text-xs">
                  {a.share}%
                </span>
                <span className="text-primary font-mono text-sm font-medium">
                  {a.apy}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Risk tag */}
        <div className="border-border/30 mt-6 flex items-center gap-4 border-t pt-4">
          <div className="text-chart-3 flex items-center gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" />
            Low Risk
          </div>
          <div className="text-primary flex items-center gap-1.5 text-xs">
            <Zap className="h-3.5 w-3.5" />
            Auto-compound
          </div>
        </div>
      </div>
    </div>
  )
}
