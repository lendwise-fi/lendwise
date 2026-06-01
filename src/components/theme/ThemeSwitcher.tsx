'use client'

import { useEffect, useState } from 'react'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const ThemeSwitcher = ({ className }: { className?: string }) => {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  if (!mounted) {
    return <div className={cn('h-8 w-8 rounded-md', className)} />
  }

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      className={cn(
        'text-muted-foreground hover:text-foreground h-8 w-8',
        className
      )}
      title={`Theme: ${theme}`}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
