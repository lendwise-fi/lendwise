'use client'

import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MetricCardProps {
  title: string
  value: string
  change?: string
  changeType?: 'positive' | 'negative'
  icon?: LucideIcon
  subtitle?: string
  badge?: {
    text: string
    className: string
  }
}

export default function MetricCard({
  title,
  value,
  change,
  changeType = 'positive',
  icon: Icon,
  subtitle,
  badge,
}: MetricCardProps) {
  return (
    <Card className="bg-card border-card-muted backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-card-foreground text-sm font-medium">
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {badge && <Badge className={badge.className}>{badge.text}</Badge>}
          {Icon && (
            <div className="bg-primary/20 rounded-lg p-2">
              <Icon className="text-primary h-4 w-4" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-card-foreground mb-1 text-2xl font-bold">
          {value}
        </div>
        {subtitle && (
          <p className="text-muted-foreground mb-2 text-xs">{subtitle}</p>
        )}
        {change && (
          <div
            className={`flex items-center gap-1 text-xs ${
              changeType === 'positive' ? 'text-success' : 'text-destructive'
            }`}
          >
            {changeType === 'positive' ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {change}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
