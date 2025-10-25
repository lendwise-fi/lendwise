'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, TrendingUp, Shield, Wallet, PieChart } from 'lucide-react'
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
    <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-sm">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-border p-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-600">
              <TrendingUp className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                Yield Optimizer
              </h1>
              <p className="text-xs text-muted-foreground">DeFi Optimization</p>
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
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/50'
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
