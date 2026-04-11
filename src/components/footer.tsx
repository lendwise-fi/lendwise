'use client'

import Link from 'next/link'

import { Badge } from '@/components/ui/badge'

export function Footer() {
  return (
    <footer className="border-border/50 bg-background border-t">
      <div className="flex h-10 items-center justify-end px-6">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
            <Link
              href="/status"
              className="hover:text-primary transition-colors"
            >
              Status
            </Link>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </Badge>
        </div>
      </div>
    </footer>
  )
}
