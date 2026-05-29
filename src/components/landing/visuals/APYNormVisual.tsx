'use client'

import { motion } from 'motion/react'

const rows = [
  {
    protocol: 'Aave V3',
    chain: 'Ethereum',
    raw: '3.21%',
    normalized: '3.18%',
    color: 'bg-primary',
  },
  {
    protocol: 'Compound',
    chain: 'Ethereum',
    raw: '2.89%',
    normalized: '2.85%',
    color: 'bg-accent',
  },
  {
    protocol: 'Venus',
    chain: 'BSC',
    raw: '5.41%',
    normalized: '4.92%',
    color: 'bg-chart-3',
  },
  {
    protocol: 'Morpho',
    chain: 'Base',
    raw: '4.15%',
    normalized: '4.10%',
    color: 'bg-chart-4',
  },
]

export function APYNormVisual() {
  return (
    <div className="border-border/50 bg-card/80 glow-cyan relative overflow-hidden rounded-2xl border backdrop-blur-sm">
      {/* Header */}
      <div className="border-border/50 flex items-center gap-3 border-b px-6 py-4">
        <div className="flex gap-1.5">
          <div className="bg-destructive/60 h-2.5 w-2.5 rounded-full" />
          <div className="bg-chart-4/60 h-2.5 w-2.5 rounded-full" />
          <div className="bg-chart-3/60 h-2.5 w-2.5 rounded-full" />
        </div>
        <span className="text-muted-foreground font-mono text-xs">
          yield_normalization.tsx
        </span>
      </div>

      {/* Table */}
      <div className="p-4">
        <div className="border-border/30 grid grid-cols-4 gap-4 border-b px-3 pb-3">
          {['Protocol', 'Chain', 'Raw APY', 'Normalized'].map((h) => (
            <span
              key={h}
              className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase"
            >
              {h}
            </span>
          ))}
        </div>

        {rows.map((row, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
            className="hover:bg-secondary/30 grid grid-cols-4 gap-4 rounded-lg px-3 py-3 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${row.color}`} />
              <span className="text-sm font-medium">{row.protocol}</span>
            </div>
            <span className="text-muted-foreground text-sm">{row.chain}</span>
            <span className="text-muted-foreground font-mono text-sm">
              {row.raw}
            </span>
            <span className="text-primary font-mono text-sm font-medium">
              {row.normalized}
            </span>
          </motion.div>
        ))}

        {/* Bottom bar chart */}
        <div className="border-border/30 mt-6 border-t pt-4">
          <div className="flex h-16 items-end gap-2">
            {[65, 52, 90, 75, 45, 82, 60, 70, 88, 55, 42, 78].map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                whileInView={{ height: `${h}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.05 }}
                className={`flex-1 rounded-t ${i % 3 === 0 ? 'bg-primary/60' : i % 3 === 1 ? 'bg-accent/40' : 'bg-primary/30'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
