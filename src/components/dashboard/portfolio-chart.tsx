'use client'

import { useState } from 'react'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const portfolioData = [
  { name: 'Jan', value: 12000, yield: 8.5, borrow: 5200, supplying: 17200 },
  { name: 'Feb', value: 14500, yield: 9.2, borrow: 5800, supplying: 20300 },
  { name: 'Mar', value: 13800, yield: 8.8, borrow: 5400, supplying: 19200 },
  { name: 'Apr', value: 16200, yield: 10.1, borrow: 6100, supplying: 22300 },
  { name: 'May', value: 18900, yield: 11.3, borrow: 6800, supplying: 25700 },
  { name: 'Jun', value: 22100, yield: 12.7, borrow: 7500, supplying: 29600 },
]

export default function PortfolioChart() {
  const [activeMetric, setActiveMetric] = useState('value')

  const getChartConfig = () => {
    switch (activeMetric) {
      case 'yield':
        return {
          dataKey: 'yield',
          color: 'var(--color-chart-3)',
          label: 'Average Yield (%)',
          format: (value: number) => `${value}%`,
        }
      case 'borrow':
        return {
          dataKey: 'borrow',
          color: 'var(--color-destructive)',
          label: 'Total Borrow ($)',
          format: (value: number) => `$${value.toLocaleString()}`,
        }
      case 'supplying':
        return {
          dataKey: 'supplying',
          color: 'var(--color-chart-1)',
          label: 'Total Supplying ($)',
          format: (value: number) => `$${value.toLocaleString()}`,
        }
      default:
        return {
          dataKey: 'value',
          color: 'var(--color-chart-1)',
          label: 'Portfolio Value ($)',
          format: (value: number) => `$${value.toLocaleString()}`,
        }
    }
  }

  const chartConfig = getChartConfig()

  return (
    <Card className="bg-card border-card-muted col-span-2 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-card-foreground">
            Portfolio Performance
          </CardTitle>
          <Tabs value={activeMetric} onValueChange={setActiveMetric}>
            <TabsList className="bg-accent">
              <TabsTrigger value="value" className="text-xs">
                Value
              </TabsTrigger>
              <TabsTrigger value="yield" className="text-xs">
                Yield
              </TabsTrigger>
              <TabsTrigger value="supplying" className="text-xs">
                Supplying
              </TabsTrigger>
              <TabsTrigger value="borrow" className="text-xs">
                Borrow
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={portfolioData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="name"
              stroke="var(--color-muted-foreground)"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              style={{ fontSize: '12px' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--accent)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--accent-foreground)',
              }}
              formatter={(value: number) => chartConfig.format(value)}
            />
            <Line
              type="monotone"
              dataKey={chartConfig.dataKey}
              stroke={chartConfig.color}
              strokeWidth={2}
              dot={{ fill: chartConfig.color, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
