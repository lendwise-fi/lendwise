'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react'

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
        <CardTitle className="text-sm font-medium text-card-foreground">
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {badge && <Badge className={badge.className}>{badge.text}</Badge>}
          {Icon && (
            <div className="p-2 rounded-lg bg-primary/20">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-card-foreground mb-1">
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>
        )}
        {change && (
          <div
            className={`flex items-center gap-1 text-xs ${
              changeType === 'positive' ? 'text-success' : 'text-destructive'
            }`}
          >
            {changeType === 'positive' ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {change}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
