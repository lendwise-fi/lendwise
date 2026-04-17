'use client'

import { useEffect, useRef, useState } from 'react'

import Link from 'next/link'

import { ArrowRight, CheckCircle, ChevronDown, Moon, Sun, Zap } from 'lucide-react'
import { useTheme } from 'next-themes'

import ApiCanvas from '@/components/landing/ApiCanvas'
import NormalizationCanvas from '@/components/landing/NormalizationCanvas'
import OptimizerCanvas from '@/components/landing/OptimizerCanvas'
import PortfolioCanvas from '@/components/landing/PortfolioCanvas'

export default function Landing() {
  const { theme, setTheme } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* NAV */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-8 gap-6 transition-all duration-300 ${
          scrolled ? 'bg-card/80 backdrop-blur-md border-b border-border' : 'bg-transparent'
        }`}
      >
        <Link href="/" className="flex shrink-0 items-center">
          <div className="text-foreground text-sm font-bold font-mono">Yield</div>
        </Link>
        <div className="flex-1" />
        {mounted && (
          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-secondary/60 border border-border hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        )}
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          Launch App
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      <HeroSection />
      <ProblemSection />
      <NormalizationSection />
      <OptimizerSection />
      <ApiSection />
      <PortfolioSection />
      <CtaSection />

      <footer className="border-t border-border px-8 py-8 flex items-center justify-between text-[12px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-sm font-bold font-mono">Yield</span>
          <span>© 2026</span>
        </div>
        <p>DeFi Intelligence Layer</p>
      </footer>
    </div>
  )
}

function HeroSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      r: Math.random() * 1.5 + 0.5,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1,
    }))

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach(p => {
        p.x += p.dx
        p.y += p.dy
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99,120,255,${p.alpha})`
        ctx.fill()
      })
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 100) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(99,120,255,${0.08 * (1 - dist / 100)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] animate-pulse-glow" />
      <div
        className="absolute bottom-1/3 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-[100px] animate-pulse-glow"
        style={{ animationDelay: '1s' }}
      />

      <div className="relative z-10 text-center max-w-4xl mx-auto px-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[12px] font-medium mb-8">
          <Zap className="w-3 h-3" />
          DeFi Yield Intelligence
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.05]">
          One view for{' '}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            all DeFi yields
          </span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          Stop juggling between protocols. Yield Optimizer normalizes APYs across every major DeFi protocol and lets you allocate capital with surgical precision.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 text-[15px]"
          >
            Launch App <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#problem"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-secondary/60 border border-border text-foreground font-semibold hover:bg-secondary transition-all text-[15px]"
          >
            Learn more
          </a>
        </div>
      </div>

      <div className="absolute bottom-8 flex flex-col items-center gap-2 animate-bounce">
        <span className="text-[11px] text-muted-foreground">Scroll</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </div>
    </section>
  )
}

function ProblemSection() {
  const protocols = [
    { name: 'Morpho', apy: '7.37%', color: '#3B82F6', note: 'supply APY' },
    { name: 'Aave v3', apy: '3.21%', color: '#B382E8', note: 'net yield' },
    { name: 'Compound', apy: '6.12%', color: '#00D395', note: 'borrow rate' },
    { name: 'Yearn', apy: '~12%', color: '#F59E0B', note: 'estimated' },
    { name: 'Spark', apy: '5.00%', color: '#EF4444', note: 'APR base' },
    { name: 'Pendle', apy: 'variable', color: '#8B5CF6', note: 'PT yield' },
  ]

  return (
    <section id="problem" className="py-32 px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-[12px] font-semibold text-destructive uppercase tracking-widest">The Problem</span>
          <h2 className="text-4xl font-bold mt-3 mb-4">DeFi yields are a mess</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-base leading-relaxed">
            Every protocol uses its own methodology to display returns — APY, APR, net yield, estimated, variable… Comparing them is nearly impossible without deep expertise.
          </p>
        </div>

        <div className="relative">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8">
            {protocols.map((p, i) => (
              <div key={i} className="relative p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden group">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          {[
            { label: 'Protocols tracked', value: '20+', sub: 'across major ecosystems' },
            { label: 'APY definitions', value: '6+', sub: 'incompatible methodologies' },
            { label: 'Time wasted', value: 'Hours', sub: 'per investment decision' },
          ].map((s, i) => (
            <div key={i} className="text-center p-6 rounded-2xl bg-card border border-border">
              <div className="text-4xl font-bold text-destructive mb-2">{s.value}</div>
              <div className="text-[13px] font-semibold text-foreground mb-1">{s.label}</div>
              <div className="text-[12px] text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function NormalizationSection() {
  return (
    <section className="py-32 px-8 border-t border-border/50">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        <div>
          <span className="text-[12px] font-semibold text-primary uppercase tracking-widest">Solution 1/4</span>
          <h2 className="text-4xl font-bold mt-3 mb-5">APY Normalization</h2>
          <p className="text-muted-foreground text-base leading-relaxed mb-6">
            Our engine ingests raw rate data from every protocol and applies a unified methodology — converting APR, compound frequency, fee adjustments, and incentive tokens into a single comparable metric.
          </p>
          <ul className="space-y-3">
            {['Compound frequency normalization', 'Fee & gas cost adjustment', 'Reward token valuation', 'Risk-adjusted yield scoring'].map(item => (
              <li key={item} className="flex items-center gap-3 text-[14px] text-foreground">
                <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl overflow-hidden border border-border bg-card h-72 md:h-96">
          <NormalizationCanvas />
        </div>
      </div>
    </section>
  )
}

function OptimizerSection() {
  return (
    <section className="py-32 px-8 border-t border-border/50">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        <div className="order-2 md:order-1 rounded-2xl overflow-hidden border border-border bg-card h-72 md:h-96">
          <OptimizerCanvas />
        </div>
        <div className="order-1 md:order-2">
          <span className="text-[12px] font-semibold text-accent-foreground uppercase tracking-widest">Solution 2/4</span>
          <h2 className="text-4xl font-bold mt-3 mb-5">Powerful Optimizer</h2>
          <p className="text-muted-foreground text-base leading-relaxed mb-6">
            Define your objective — maximize yield, minimize risk, or balance both. Our optimizer distributes capital across protocols in real time, respecting your constraints and investment horizon.
          </p>
          <ul className="space-y-3">
            {['Risk profile configuration', 'Multi-horizon projections (1W → 1Y)', 'Multi-protocol allocation', 'Real-time rebalancing signals'].map(item => (
              <li key={item} className="flex items-center gap-3 text-[14px] text-foreground">
                <CheckCircle className="w-4 h-4 text-chart-2 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function ApiSection() {
  return (
    <section className="py-32 px-8 border-t border-border/50">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        <div>
          <span className="text-[12px] font-semibold text-chart-3 uppercase tracking-widest">Solution 3/4</span>
          <h2 className="text-4xl font-bold mt-3 mb-5">GraphQL API</h2>
          <p className="text-muted-foreground text-base leading-relaxed mb-6">
            Hedge funds, institutions, and blockchain protocols can consume our normalized data and optimization engine via a robust GraphQL API — built for performance, reliability, and scale.
          </p>
          <ul className="space-y-3">
            {['Sub-100ms normalized rate queries', 'Historical APY time series', 'Optimization endpoint', 'Webhook integrations'].map(item => (
              <li key={item} className="flex items-center gap-3 text-[14px] text-foreground">
                <CheckCircle className="w-4 h-4 text-chart-3 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            {['Hedge Funds', 'Institutions', 'Blockchains', 'DeFi Protocols'].map(tag => (
              <span key={tag} className="px-3 py-1 rounded-full border border-border bg-secondary/40 text-[12px] text-muted-foreground">{tag}</span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden border border-border bg-card h-72 md:h-96">
          <ApiCanvas />
        </div>
      </div>
    </section>
  )
}

function PortfolioSection() {
  return (
    <section className="py-32 px-8 border-t border-border/50">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        <div>
          <span className="text-[12px] font-semibold text-chart-5 uppercase tracking-widest">Solution 4/4</span>
          <h2 className="text-4xl font-bold mt-3 mb-5">Portfolio Tracker</h2>
          <p className="text-muted-foreground text-base leading-relaxed mb-6">
            Visualize your entire DeFi position in one place. Track lending and borrowing across every protocol and chain — with real-time health factors, weighted returns, and net exposure at a glance.
          </p>
          <ul className="space-y-3">
            {[
              'Unified lending & borrowing view',
              'Real-time health factor monitoring',
              'Cross-chain position aggregation',
              'Net APY & exposure calculation',
            ].map(item => (
              <li key={item} className="flex items-center gap-3 text-[14px] text-foreground">
                <CheckCircle className="w-4 h-4 text-chart-5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl overflow-hidden border border-border bg-card h-72 md:h-96">
          <PortfolioCanvas />
        </div>
      </div>
    </section>
  )
}

function CtaSection() {
  return (
    <section className="py-32 px-8 border-t border-border/50">
      <div className="max-w-3xl mx-auto text-center">
        <div className="relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-96 h-96 bg-primary/10 rounded-full blur-[100px]" />
          </div>
          <div className="relative">
            <h2 className="text-5xl font-bold mb-6">Ready to optimize?</h2>
            <p className="text-muted-foreground text-base mb-10">
              Access real-time normalized yields across every major DeFi protocol and let our engine do the heavy lifting.
            </p>
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
            >
              Launch the App <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
