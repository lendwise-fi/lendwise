'use client'

import { useEffect, useState } from 'react'

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  DollarSign,
  PieChart as PieChartIcon,
  Shield,
  TrendingDown,
} from 'lucide-react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Position } from '@/lib/entities'

export default function Risk() {
  const [positions, setPositions] = useState<Position[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const positionsData = await Position.list()
    setPositions(positionsData)
  }

  const mockHealthHistory = [
    { name: '1d', value: 2.8 },
    { name: '2d', value: 2.6 },
    { name: '3d', value: 2.9 },
    { name: '4d', value: 2.7 },
    { name: '5d', value: 2.5 },
    { name: '6d', value: 2.3 },
    { name: 'Today', value: 2.1 },
  ]

  const collateralData = [
    { name: 'ETH', value: 65, color: 'var(--color-chart-1)' },
    { name: 'WBTC', value: 20, color: 'var(--color-chart-2)' },
    { name: 'USDC', value: 10, color: 'var(--color-chart-3)' },
    { name: 'Others', value: 5, color: 'var(--color-chart-4)' },
  ]

  const getRiskZone = (healthFactor: number) => {
    if (healthFactor >= 2.0)
      return { zone: 'safe', label: 'Safe Zone', color: 'green' }
    if (healthFactor >= 1.5)
      return { zone: 'caution', label: 'Caution Zone', color: 'yellow' }
    if (healthFactor >= 1.2)
      return { zone: 'warning', label: 'Warning Zone', color: 'orange' }
    return { zone: 'critical', label: 'Critical Zone', color: 'red' }
  }

  const calculateRiskMetrics = () => {
    const borrowPositions = positions.filter(
      (p) => p.position_type === 'borrowing'
    )
    const avgHealthFactor =
      borrowPositions.length > 0
        ? borrowPositions.reduce((sum, p) => sum + (p.health_factor || 0), 0) /
          borrowPositions.length
        : 0

    const safePositions = borrowPositions.filter(
      (p) => (p.health_factor || 0) >= 2.0
    )
    const cautionPositions = borrowPositions.filter(
      (p) => (p.health_factor || 0) >= 1.5 && (p.health_factor || 0) < 2.0
    )
    const warningPositions = borrowPositions.filter(
      (p) => (p.health_factor || 0) >= 1.2 && (p.health_factor || 0) < 1.5
    )
    const criticalPositions = borrowPositions.filter(
      (p) => (p.health_factor || 0) < 1.2
    )

    const totalPositions = borrowPositions.length || 1
    const riskScore =
      10 -
      (cautionPositions.length * 2 +
        warningPositions.length * 4 +
        criticalPositions.length * 8) /
        totalPositions

    const mostRiskyPosition =
      borrowPositions.length > 0
        ? borrowPositions.reduce((min, p) =>
            (p.health_factor || Infinity) < (min.health_factor || Infinity)
              ? p
              : min
          )
        : null

    return {
      avgHealthFactor,
      safePositions: safePositions.length,
      cautionPositions: cautionPositions.length,
      warningPositions: warningPositions.length,
      criticalPositions: criticalPositions.length,
      totalPositions: borrowPositions.length,
      riskScore: Math.max(0, Math.min(10, riskScore)),
      mostRiskyPosition,
    }
  }

  const {
    avgHealthFactor,
    safePositions,
    cautionPositions,
    warningPositions,
    criticalPositions,
    totalPositions,
    riskScore,
    mostRiskyPosition,
  } = calculateRiskMetrics()

  const riskZone = getRiskZone(avgHealthFactor)

  const getRecommendations = () => {
    const recommendations = []

    if (riskZone.zone === 'critical') {
      recommendations.push({
        icon: AlertCircle,
        title: 'URGENT: Add Collateral',
        description:
          'Deposit more collateral to increase health factor above 1.5',
        action: 'Add Collateral',
        color: 'red',
      })
      recommendations.push({
        icon: TrendingDown,
        title: 'Repay Debt Immediately',
        description: 'Reduce borrowed amount to move out of critical zone',
        action: 'Repay Debt',
        color: 'red',
      })
    } else if (riskZone.zone === 'warning') {
      recommendations.push({
        icon: AlertTriangle,
        title: 'Add Collateral',
        description: 'Increase collateral to reach safe zone (HF > 2.0)',
        action: 'Add Collateral',
        color: 'orange',
      })
      recommendations.push({
        icon: DollarSign,
        title: 'Partial Debt Repayment',
        description: 'Reduce debt by 20-30% to improve health factor',
        action: 'Repay',
        color: 'orange',
      })
    } else if (riskZone.zone === 'caution') {
      recommendations.push({
        icon: Shield,
        title: 'Monitor Closely',
        description: 'Watch market volatility and maintain HF above 1.5',
        action: 'Set Alert',
        color: 'yellow',
      })
      recommendations.push({
        icon: ArrowUp,
        title: 'Increase Buffer',
        description: 'Add collateral to reach safe zone for peace of mind',
        action: 'Optimize',
        color: 'yellow',
      })
    } else {
      recommendations.push({
        icon: Shield,
        title: 'Position Healthy',
        description: 'Your positions are in a safe zone. Continue monitoring.',
        action: 'Monitor',
        color: 'green',
      })
    }

    return recommendations
  }

  const recommendations = getRecommendations()

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground mb-2 text-3xl font-bold">
          Risk Monitor
        </h1>
        <p className="text-muted-foreground-400">
          Track health factors and manage liquidation risks across all positions
        </p>
      </div>

      {/* Risk Overview Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground-300 flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" />
              Avg Health Factor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`mb-2 text-3xl font-bold ${
                avgHealthFactor >= 2
                  ? 'text-green-400'
                  : avgHealthFactor >= 1.5
                    ? 'text-yellow-400'
                    : avgHealthFactor >= 1.2
                      ? 'text-orange-400'
                      : 'text-red-400'
              }`}
            >
              {avgHealthFactor.toFixed(2)}
            </div>
            <Badge
              className={
                avgHealthFactor >= 2
                  ? 'border-green-500/30 bg-green-500/20 text-green-400'
                  : avgHealthFactor >= 1.5
                    ? 'border-yellow-500/30 bg-yellow-500/20 text-yellow-400'
                    : 'border-red-500/30 bg-red-500/20 text-red-400'
              }
            >
              {riskZone.label}
            </Badge>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground-300 flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4" />
              Risk Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-foreground mb-2 text-3xl font-bold">
              {riskScore.toFixed(1)}/10
            </div>
            <Progress value={riskScore * 10} className="h-2" />
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground-300 text-sm">
              Positions at Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-foreground mb-2 text-3xl font-bold">
              {cautionPositions + warningPositions + criticalPositions}
            </div>
            <div className="text-muted-foreground-400 text-xs">
              of {totalPositions} total positions
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground-300 text-sm">
              Safe Positions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-3xl font-bold text-green-400">
              {safePositions}
            </div>
            <div className="text-muted-foreground-400 text-xs">
              Health Factor &gt; 2.0
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Health Factor Trend & Collateral Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground">
              Health Factor Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={mockHealthHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  style={{ fontSize: '12px' }}
                />
                <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground">
              Collateral Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={collateralData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {collateralData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {collateralData.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground-300">
                      {item.name}
                    </span>
                  </div>
                  <span className="text-foreground font-medium">
                    {item.value}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Alerts & Recommendations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Active Risk Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {criticalPositions > 0 && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-200">
                  <span className="font-semibold">
                    {criticalPositions} Critical Position
                    {criticalPositions > 1 ? 's' : ''}
                  </span>
                  <br />
                  Health factor below 1.2 - immediate action required
                </AlertDescription>
              </Alert>
            )}

            {warningPositions > 0 && (
              <Alert className="border-orange-500/50 bg-orange-500/10">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                <AlertDescription className="text-orange-200">
                  <span className="font-semibold">
                    {warningPositions} Position{warningPositions > 1 ? 's' : ''}{' '}
                    in Warning Zone
                  </span>
                  <br />
                  Health factor between 1.2-1.5 - consider adding collateral
                </AlertDescription>
              </Alert>
            )}

            {cautionPositions > 0 && (
              <Alert className="border-yellow-500/50 bg-yellow-500/10">
                <Shield className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-200">
                  <span className="font-semibold">
                    {cautionPositions} Position{cautionPositions > 1 ? 's' : ''}{' '}
                    Need Attention
                  </span>
                  <br />
                  Health factor between 1.5-2.0 - monitor closely
                </AlertDescription>
              </Alert>
            )}

            {criticalPositions === 0 &&
              warningPositions === 0 &&
              cautionPositions === 0 && (
                <Alert className="border-green-500/50 bg-green-500/10">
                  <Shield className="h-4 w-4 text-green-400" />
                  <AlertDescription className="text-green-200">
                    <span className="font-semibold">All Positions Healthy</span>
                    <br />
                    No immediate risks detected. Keep monitoring market
                    conditions.
                  </AlertDescription>
                </Alert>
              )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-blue-400" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.map((rec, index) => {
              const Icon = rec.icon
              const colorClass =
                rec.color === 'red'
                  ? 'text-red-400 bg-red-500/10 border-red-500/20'
                  : rec.color === 'orange'
                    ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                    : rec.color === 'yellow'
                      ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                      : 'text-green-400 bg-green-500/10 border-green-500/20'

              return (
                <div
                  key={index}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${colorClass}`}
                >
                  <Icon className="mt-0.5 h-5 w-5" />
                  <div className="flex-1">
                    <p className="text-foreground text-sm font-medium">
                      {rec.title}
                    </p>
                    <p className="text-muted-foreground-300 mt-1 text-xs">
                      {rec.description}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0">
                    {rec.action}
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Most At-Risk Position */}
      {mostRiskyPosition && (
        <Card className="bg-card border-card-muted border-l-4 border-l-red-500 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-400" />
              Most At-Risk Position
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-foreground mb-2 text-xl font-semibold">
                  {mostRiskyPosition.protocol}
                </h3>
                <div className="text-muted-foreground-400 flex items-center gap-4 text-sm">
                  <span>
                    Asset:{' '}
                    <span className="text-foreground">
                      {mostRiskyPosition.asset}
                    </span>
                  </span>
                  <span>
                    Borrowed:{' '}
                    <span className="text-foreground">
                      ${mostRiskyPosition.usd_value.toLocaleString()}
                    </span>
                  </span>
                  <span>
                    Health Factor:{' '}
                    <span className="font-bold text-red-400">
                      {mostRiskyPosition.health_factor?.toFixed(2)}
                    </span>
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Add Collateral
                </Button>
                <Button variant="outline">Repay Debt</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
