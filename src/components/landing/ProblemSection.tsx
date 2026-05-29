'use client'

import { AlertTriangle, Clock, Shuffle } from 'lucide-react'
import { motion } from 'motion/react'

const problems = [
  {
    icon: Shuffle,
    title: 'Scattered Data',
    description:
      'Lending opportunities are spread across protocols, vaults and chains, leaving investors without a unified view of the market.',
  },
  {
    icon: AlertTriangle,
    title: 'Inconsistent APYs',
    description:
      'Protocols report rates using different conventions, time windows and assumptions. Raw APYs are often not directly comparable.',
  },
  {
    icon: Clock,
    title: 'Manual Analysis',
    description:
      'Investors spend hours switching between dashboards and checking market conditions before making informed decisions.',
  },
]

export function ProblemSection() {
  const protocols = [
    { name: 'Morpho', apy: '7.37%', color: '#3B82F6', note: 'supply APY' },
    { name: 'Aave v3', apy: '3.21%', color: '#B382E8', note: 'net yield' },
    { name: 'Compound', apy: '6.12%', color: '#00D395', note: 'borrow rate' },
    { name: 'Yearn', apy: '~12%', color: '#F59E0B', note: 'estimated' },
    { name: 'Spark', apy: '5.00%', color: '#EF4444', note: 'APR base' },
    { name: 'Pendle', apy: 'variable', color: '#8B5CF6', note: 'PT yield' },
  ]
  return (
    <section className="relative overflow-hidden px-6 py-32">
      <div className="from-background via-card/30 to-background absolute inset-0 bg-linear-to-b" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-20 text-center"
        >
          <h2 className="font-inter text-3xl font-bold tracking-tight sm:text-5xl">
            Lending markets are <span className="text-destructive">fragmented</span>
          </h2>
        </motion.div>

        <div className="relative mb-24">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8">
            {protocols.map((p) => (
              <div key={p.name} className="relative p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden group">
                <div className="absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity" style={{ background: p.color }} />
                <div className="text-[11px] text-muted-foreground mb-1">{p.name}</div>
                <div className="text-xl font-bold font-mono" style={{ color: p.color }}>{p.apy}</div>
                <div className="text-[10px] text-muted-foreground/60 mt-0.5 italic">{p.note}</div>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="px-6 py-3 rounded-full bg-destructive/10 border border-destructive/30 text-destructive font-semibold text-[14px] backdrop-blur-sm">
              Which one is actually better?
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {problems.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="group border-border/50 bg-card/50 hover:border-border relative rounded-2xl border p-8 backdrop-blur-sm transition-all duration-500"
            >
              <div className="from-destructive/3 absolute inset-0 rounded-2xl bg-linear-to-b to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative z-10">
                <div className="bg-destructive/10 border-destructive/20 mb-6 flex h-12 w-12 items-center justify-center rounded-xl border">
                  <item.icon className="text-destructive/70 h-5 w-5" />
                </div>
                <h3 className="font-inter mb-3 text-lg font-semibold">
                  {item.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  )
}
