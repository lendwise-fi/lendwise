'use client'

import { useEffect, useState } from 'react'

import { DollarSign, Shield, TrendingUp, Wallet } from 'lucide-react'
import { AlertTriangle, Percent } from 'lucide-react'

import MetricCard from '@/components/dashboard/metric-card'
import PortfolioChart from '@/components/dashboard/portfolio-chart'
import ProtocolAllocation from '@/components/dashboard/protocol-allocation'
import { Position, Protocol } from '@/lib/entities'

export default function DashboardPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [positionsData] = await Promise.all([
        Position.list(),
        Protocol.list(),
      ])
      setPositions(positionsData)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateMetrics = () => {
    const totalValue = positions.reduce(
      (sum, pos) => sum + (pos.usd_value || 0),
      0
    )
    const lendPositions = positions.filter((p) => p.position_type === 'lending')
    const borrowPositions = positions.filter(
      (p) => p.position_type === 'borrowing'
    )

    const totalLending = lendPositions.reduce(
      (sum, pos) => sum + (pos.usd_value || 0),
      0
    )
    const totalBorrowing = borrowPositions.reduce(
      (sum, pos) => sum + (pos.usd_value || 0),
      0
    )

    const avgYield =
      lendPositions.length > 0
        ? lendPositions.reduce((sum, pos) => sum + (pos.apy || 0), 0) /
          lendPositions.length
        : 0

    const avgHealthFactor =
      borrowPositions.length > 0
        ? borrowPositions.reduce(
            (sum, pos) => sum + (pos.health_factor || 0),
            0
          ) / borrowPositions.length
        : 0

    return {
      totalValue,
      totalLending,
      totalBorrowing,
      avgYield,
      avgHealthFactor,
      netPosition: totalLending - totalBorrowing,
    }
  }

  const metrics = calculateMetrics()

  if (loading) {
    return (
      <div className="animate-pulse p-8">
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card h-32 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-foreground mb-2 text-3xl font-bold">
            DeFi Portfolio Overview
          </h1>
          <p className="text-muted-foreground">
            Monitor your lending, borrowing, and yield optimization strategies
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          title="Total Portfolio Value"
          value={`$${metrics.totalValue.toLocaleString()}`}
          change="+12.5% this month"
          changeType="positive"
          icon={Wallet}
          subtitle="Across all protocols"
        />

        <MetricCard
          title="Average Yield"
          value={`${metrics.avgYield.toFixed(1)}%`}
          change="+0.8% vs last week"
          changeType="positive"
          icon={TrendingUp}
          subtitle="APY on lending positions"
          badge={{
            text: 'Optimized',
            className: 'bg-green-500/20 text-green-400 border-green-500/30',
          }}
        />

        <MetricCard
          title="Health Factor"
          value={metrics.avgHealthFactor.toFixed(2)}
          change="Stable"
          changeType="positive"
          icon={Shield}
          subtitle="Average across positions"
          badge={{
            text: metrics.avgHealthFactor > 2 ? 'Healthy' : 'Caution',
            className:
              metrics.avgHealthFactor > 2
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
          }}
        />

        <MetricCard
          title="Net Position"
          value={`$${Math.abs(metrics.netPosition).toLocaleString()}`}
          change={metrics.netPosition >= 0 ? 'Net Lender' : 'Net Borrower'}
          changeType={metrics.netPosition >= 0 ? 'positive' : 'negative'}
          icon={DollarSign}
          subtitle="Lending minus borrowing"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PortfolioChart />
        <ProtocolAllocation />
      </div>

      {/* Quick Actions & Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-card border-card-muted rounded-xl border p-6 backdrop-blur-sm">
          <h3 className="text-foreground mb-4 text-lg font-semibold">
            Optimization Opportunities
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
              <TrendingUp className="h-5 w-5 text-blue-400" />
              <div>
                <p className="text-foreground text-sm font-medium">
                  Higher Yield Available
                </p>
                <p className="text-muted-foreground-400 text-xs">
                  Move USDC to Aave for +1.2% APY
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-3">
              <Percent className="h-5 w-5 text-green-400" />
              <div>
                <p className="text-foreground text-sm font-medium">
                  Collateral Optimization
                </p>
                <p className="text-muted-foreground-400 text-xs">
                  Reduce ETH collateral by 15%
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border-card-muted rounded-xl border p-6 backdrop-blur-sm">
          <h3 className="text-foreground mb-4 text-lg font-semibold">
            Risk Alerts
          </h3>
          <div className="space-y-3">
            {metrics.avgHealthFactor < 1.5 && (
              <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div>
                  <p className="text-foreground text-sm font-medium">
                    Low Health Factor
                  </p>
                  <p className="text-muted-foreground-400 text-xs">
                    Consider adding collateral or reducing debt
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
              <Shield className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="text-foreground text-sm font-medium">
                  Market Concentration
                </p>
                <p className="text-muted-foreground-400 text-xs">
                  70% exposure to ETH ecosystem
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
