'use client'

import Link from 'next/link'

import { Zap } from 'lucide-react'

const links = {
  Product: ['Features', 'Pricing', 'API Docs', 'Changelog'],
  Resources: ['Documentation', 'Blog', 'Tutorials', 'Status'],
  Company: ['About', 'Careers', 'Contact', 'Privacy'],
}

export function Footer() {
  return (
    <footer className="border-border/50 border-t px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <div className="bg-primary/10 border-primary/20 flex h-7 w-7 items-center justify-center rounded-lg border">
                <Zap className="text-primary h-3.5 w-3.5" />
              </div>
              <span className="font-inter text-lg font-bold tracking-tight">
                Lend<span className="text-primary">wise</span>
              </span>
            </div>
            <p className="text-muted-foreground max-w-[200px] text-xs leading-relaxed">
              The unified yield aggregation and optimization platform for DeFi.
            </p>
          </div>

          {Object.entries(links).map(([title, items]) => (
            <div key={title}>
              <h4 className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
                {title}
              </h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item}>
                    <Link
                      href="#"
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-300"
                    >
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-border/30 mt-16 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          <span className="text-muted-foreground text-xs">
            © 2026 Lendwise. All rights reserved.
          </span>
          <div className="flex items-center gap-6">
            <Link
              href="#"
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Terms
            </Link>
            <Link
              href="#"
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="#"
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
