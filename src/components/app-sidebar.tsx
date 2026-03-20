'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Shield,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

import { Separator } from './ui/separator'

const navigationItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: BarChart3,
    description: 'Overview & Analytics',
  },
  {
    title: 'Supplying',
    href: '/supplying',
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
  const { open, toggleSidebar } = useSidebar()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 py-0.5">
          <div
            className={cn(
              'from-primary flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br to-purple-600',
              open ? 'w-10' : 'my-1 h-9 w-9'
            )}
          >
            <TrendingUp className="text-foreground" />
          </div>
          {open && (
            <div>
              <h1 className="text-foreground text-lg font-bold">
                Yield Optimizer
              </h1>
              <p className="text-muted-foreground text-xs">DeFi Optimization</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="py-6"
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex-row justify-end">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="size-7"
        >
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
