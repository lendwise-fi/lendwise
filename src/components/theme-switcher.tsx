'use client'

import * as React from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Prevent hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-slate-800/50 p-1">
        <div className="h-8 w-8 rounded-md" />
        <div className="h-8 w-8 rounded-md" />
        <div className="h-8 w-8 rounded-md" />
      </div>
    )
  }

  const themes = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ]

  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-800/50 p-1">
      {themes.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          onClick={() => setTheme(value)}
          className={cn(
            'h-8 w-8 p-0 transition-all hover:bg-slate-700',
            theme === value
              ? 'bg-blue-600 text-foreground hover:bg-blue-500'
              : 'text-muted-foreground-400 hover:text-foreground'
          )}
          title={label}
        >
          <Icon className="h-4 w-4" />
          <span className="sr-only">{label}</span>
        </Button>
      ))}
    </div>
  )
}
