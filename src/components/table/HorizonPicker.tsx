'use client'

import { useState } from 'react'

import { Calendar } from 'lucide-react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { HORIZON_OPTIONS, HorizonKey } from '@/config/horizon'
import { cn } from '@/lib/utils'

interface HorizonPickerProps {
  value: HorizonKey
  onChange: (value: HorizonKey) => void
}

export function HorizonPicker({ value, onChange }: HorizonPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = HORIZON_OPTIONS.find((h) => h.key === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium whitespace-nowrap shadow-xs transition-all"
        >
          <Calendar className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span>{selected?.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-auto p-1.5">
        <div className="grid grid-cols-1 gap-1">
          {HORIZON_OPTIONS.map((h) => {
            const isActive = h.key === value
            return (
              <button
                key={h.key}
                type="button"
                onClick={() => {
                  onChange(h.key as HorizonKey)
                  setOpen(false)
                }}
                className={cn(
                  'border-border rounded-md border px-4 py-1.5 text-xs font-semibold transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {h.label}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
