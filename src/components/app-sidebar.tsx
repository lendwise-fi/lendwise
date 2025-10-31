'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BarChart3, PieChart, Shield, TrendingUp, Wallet } from 'lucide-react'

import { cn } from '@/lib/utils'

const navigationItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: BarChart3,
    description: 'Overview & Analytics',
  },
  {
    title: 'Lending',
    href: '/lending',
    icon: TrendingUp,
    description: 'Yield Optimization',
  },
  {
    title: 'Borrowing',
    href: '/borrowing',
    icon: Wallet,
    description: 'Cost Minimization',
  },
  {
    title: 'Risk Monitor',
    href: '/risk',
    icon: Shield,
    description: 'Health & Safety',
  },
  {
    title: 'Portfolio',
    href: '/portfolio',
    icon: PieChart,
    description: 'Positions Tracker',
  },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="border-border bg-card/50 w-64 border-r backdrop-blur-sm">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-border border-b p-6">
          <div className="flex items-center gap-2">
            <div className="from-primary flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br to-purple-600">
              <TrendingUp className="text-foreground h-6 w-6" />
            </div>
            <div>
              <h1 className="text-foreground text-lg font-bold">
                Yield Optimizer
              </h1>
              <p className="text-muted-foreground text-xs">DeFi Optimization</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-primary/50 shadow-lg'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <div className="flex-1">
                  <div>{item.title}</div>
                  <div className="text-xs opacity-60">{item.description}</div>
                </div>
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
