'use client'

import { useState, useEffect } from 'react'
import { Position } from '@/lib/entities'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Settings,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react'
import { format } from 'date-fns'

export default function Portfolio() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const positionsData = await Position.list()
      setPositions(positionsData)
    } catch (error) {
      console.error('Error loading positions:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculatePortfolioSummary = () => {
    const lendingPositions = positions.filter(
      (p) => p.position_type === 'lending'
    )
    const borrowingPositions = positions.filter(
      (p) => p.position_type === 'borrowing'
    )

    const totalLending = lendingPositions.reduce(
      (sum, p) => sum + (p.usd_value || 0),
      0
    )
    const totalBorrowing = borrowingPositions.reduce(
      (sum, p) => sum + (p.usd_value || 0),
      0
    )
    const netWorth = totalLending - totalBorrowing

    return {
      totalLending,
      totalBorrowing,
      netWorth,
      lendingPositions,
      borrowingPositions,
    }
  }

  const {
    totalLending,
    totalBorrowing,
    netWorth,
    lendingPositions,
    borrowingPositions,
  } = calculatePortfolioSummary()

  const getBlockchainBadge = (blockchain: string) => {
    const colors: Record<string, string> = {
      ethereum: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      polygon: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      arbitrum: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      optimism: 'bg-red-500/20 text-red-400 border-red-500/30',
      avalanche: 'bg-red-500/20 text-red-400 border-red-500/30',
      bsc: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    }
    return (
      colors[blockchain] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    )
  }

  const getRiskIndicator = (healthFactor?: number) => {
    if (!healthFactor || healthFactor >= 2.0) return null
    if (healthFactor >= 1.5) {
      return {
        icon: AlertTriangle,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        label: 'Caution',
      }
    }
    if (healthFactor >= 1.2) {
      return {
        icon: AlertTriangle,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        label: 'Warning',
      }
    }
    return {
      icon: AlertCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      label: 'Critical',
    }
  }

  if (loading) {
    return (
      <div className="p-8 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-card rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Portfolio Tracker
          </h1>
          <p className="text-muted-foreground-400">
            Monitor all your DeFi positions across protocols and chains
          </p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Settings className="w-4 h-4 mr-2" />
          Portfolio Settings
        </Button>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground-300 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Total Lending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground mb-2">
              ${totalLending.toLocaleString()}
            </div>
            <div className="text-green-400 text-sm">
              {lendingPositions.length} active positions
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground-300 text-sm flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Total Borrowing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground mb-2">
              ${totalBorrowing.toLocaleString()}
            </div>
            <div className="text-red-400 text-sm">
              {borrowingPositions.length} active positions
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground-300 text-sm">
              Net Worth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground mb-2">
              ${Math.abs(netWorth).toLocaleString()}
            </div>
            <Badge
              className={
                netWorth >= 0
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-red-500/20 text-red-400 border-red-500/30'
              }
            >
              {netWorth >= 0 ? 'Net Positive' : 'Net Negative'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Lending Positions */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-400" />
          Lending Positions ({lendingPositions.length})
        </h2>
        <div className="grid gap-4">
          {lendingPositions.length > 0 ? (
            lendingPositions.map((position, index) => (
              <Card
                key={index}
                className="bg-card border-card-muted backdrop-blur-sm hover:bg-slate-800/80 transition-all duration-200"
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-green-500 to-blue-600 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-foreground">
                            {position.protocol}
                          </h3>
                          <Badge
                            variant="outline"
                            className={getBlockchainBadge(position.blockchain)}
                          >
                            {position.blockchain}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground-400">
                          <span>
                            {position.amount.toLocaleString()} {position.asset}
                          </span>
                          <span>•</span>
                          <span className="text-green-400">
                            {position.apy.toFixed(2)}% APY
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-foreground">
                        ${position.usd_value.toLocaleString()}
                      </div>
                      <Button variant="ghost" size="sm" className="mt-2">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="bg-card border-card-muted backdrop-blur-sm">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground-400">
                  No lending positions found
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Borrowing Positions */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-red-400" />
          Borrowing Positions ({borrowingPositions.length})
        </h2>
        <div className="grid gap-4">
          {borrowingPositions.length > 0 ? (
            borrowingPositions.map((position, index) => {
              const riskIndicator = getRiskIndicator(position.health_factor)

              return (
                <Card
                  key={index}
                  className="bg-card border-card-muted backdrop-blur-sm hover:bg-slate-800/80 transition-all duration-200"
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-red-500 to-orange-600 flex items-center justify-center">
                          <TrendingDown className="w-6 h-6 text-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold text-foreground">
                              {position.protocol}
                            </h3>
                            <Badge
                              variant="outline"
                              className={getBlockchainBadge(
                                position.blockchain
                              )}
                            >
                              {position.blockchain}
                            </Badge>
                            {riskIndicator && (
                              <Badge
                                className={`${riskIndicator.bgColor} ${riskIndicator.color} border-0`}
                              >
                                {riskIndicator.label}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground-400">
                            <span>
                              {position.amount.toLocaleString()}{' '}
                              {position.asset}
                            </span>
                            <span>•</span>
                            <span className="text-red-400">
                              {position.apy.toFixed(2)}% APR
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-foreground">
                          ${position.usd_value.toLocaleString()}
                        </div>
                        <Button variant="ghost" size="sm" className="mt-2">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          View Details
                        </Button>
                      </div>
                    </div>

                    {position.health_factor && (
                      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700/50">
                        <div>
                          <div className="text-xs text-muted-foreground-400 mb-1">
                            Health Factor
                          </div>
                          <div
                            className={`text-lg font-semibold ${
                              position.health_factor > 2
                                ? 'text-green-400'
                                : position.health_factor > 1.5
                                  ? 'text-yellow-400'
                                  : 'text-red-400'
                            }`}
                          >
                            {position.health_factor.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground-400 mb-1">
                            Collateral Ratio
                          </div>
                          <div className="text-lg font-semibold text-foreground">
                            {position.collateral_ratio}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground-400 mb-1">
                            Liquidation Price
                          </div>
                          <div className="text-lg font-semibold text-foreground">
                            ${position.liquidation_price?.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          ) : (
            <Card className="bg-card border-card-muted backdrop-blur-sm">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground-400">
                  No borrowing positions found
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
