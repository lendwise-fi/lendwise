'use client'

import { useEffect, useState } from 'react'

import { ChevronRight, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Asset, Position, Protocol } from '@/lib/entities'

interface LendingOpportunity {
  protocol: string
  asset: string
  apyRealtime: number
  apy7d: number
  apy30d: number
  apy90d: number
  tvl: number
  riskScore: number
  blockchain: string
  utilization: number
  category: string
}

export default function Lending() {
  const [positions, setPositions] = useState<Position[]>([])
  const [selectedChain, setSelectedChain] = useState('all')
  const [sortBy, setSortBy] = useState('apy')
  const [investmentHorizon, setInvestmentHorizon] = useState('short')
  const [selectedToken, setSelectedToken] = useState('all')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [positionsData] = await Promise.all([
      Position.list(),
      Protocol.list(),
      Asset.list(),
    ])
    setPositions(positionsData.filter((p) => p.position_type === 'lending'))
  }

  const mockOpportunities: LendingOpportunity[] = [
    {
      protocol: 'Aave V3',
      asset: 'USDC',
      apyRealtime: 4.25,
      apy7d: 4.15,
      apy30d: 4.05,
      apy90d: 3.95,
      tvl: 850000000,
      riskScore: 2,
      blockchain: 'ethereum',
      utilization: 75,
      category: 'stable',
    },
    {
      protocol: 'Compound V3',
      asset: 'ETH',
      apyRealtime: 3.8,
      apy7d: 3.9,
      apy30d: 4.1,
      apy90d: 4.3,
      tvl: 1200000000,
      riskScore: 3,
      blockchain: 'ethereum',
      utilization: 68,
      category: 'volatile',
    },
    {
      protocol: 'Venus',
      asset: 'BNB',
      apyRealtime: 5.2,
      apy7d: 5.0,
      apy30d: 4.8,
      apy90d: 4.6,
      tvl: 340000000,
      riskScore: 4,
      blockchain: 'bsc',
      utilization: 82,
      category: 'volatile',
    },
    {
      protocol: 'Radiant Capital',
      asset: 'USDT',
      apyRealtime: 6.1,
      apy7d: 5.9,
      apy30d: 5.7,
      apy90d: 5.5,
      tvl: 120000000,
      riskScore: 6,
      blockchain: 'arbitrum',
      utilization: 89,
      category: 'stable',
    },
    {
      protocol: 'Aave V3',
      asset: 'USDC',
      apyRealtime: 3.9,
      apy7d: 3.85,
      apy30d: 3.8,
      apy90d: 3.75,
      tvl: 280000000,
      riskScore: 2,
      blockchain: 'polygon',
      utilization: 70,
      category: 'stable',
    },
  ]

  const getApyForHorizon = (opportunity: LendingOpportunity) => {
    switch (investmentHorizon) {
      case 'short':
        return opportunity.apyRealtime
      case 'medium':
        return opportunity.apy7d
      case 'long':
        return opportunity.apy30d
      case 'very_long':
        return opportunity.apy90d
      default:
        return opportunity.apyRealtime
    }
  }

  const filteredOpportunities = mockOpportunities
    .filter(
      (opp) => selectedChain === 'all' || opp.blockchain === selectedChain
    )
    .filter((opp) => selectedToken === 'all' || opp.asset === selectedToken)
    .sort((a, b) => {
      if (sortBy === 'apy') return getApyForHorizon(b) - getApyForHorizon(a)
      if (sortBy === 'tvl') return b.tvl - a.tvl
      if (sortBy === 'risk') return a.riskScore - b.riskScore
      return 0
    })

  const getRiskBadge = (score: number) => {
    if (score <= 3)
      return {
        text: 'Low Risk',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
      }
    if (score <= 6)
      return {
        text: 'Medium Risk',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      }
    return {
      text: 'High Risk',
      className: 'bg-red-500/20 text-red-400 border-red-500/30',
    }
  }

  const formatTVL = (tvl: number) => {
    if (tvl >= 1000000000) return `$${(tvl / 1000000000).toFixed(1)}B`
    if (tvl >= 1000000) return `$${(tvl / 1000000).toFixed(0)}M`
    return `$${tvl.toLocaleString()}`
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-foreground mb-2 text-3xl font-bold">
            Lending Optimization
          </h1>
          <p className="text-muted-foreground-400">
            Maximize yields while managing risk across protocols and chains
          </p>
        </div>
      </div>

      {/* Current Positions Summary */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground-300 text-sm">
              Total Lending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-foreground mb-2 text-2xl font-bold">
              $
              {positions
                .reduce((sum, p) => sum + (p.usd_value || 0), 0)
                .toLocaleString()}
            </div>
            <p className="text-muted-foreground-400 text-xs">
              {positions.length} positions
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground-300 text-sm">
              Avg APY
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-2xl font-bold text-green-400">
              {positions.length > 0
                ? (
                    positions.reduce((sum, p) => sum + p.apy, 0) /
                    positions.length
                  ).toFixed(2)
                : '0.00'}
              %
            </div>
            <p className="text-muted-foreground-400 text-xs">
              Weighted average
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground-300 text-sm">
              Diversification
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-2xl font-bold text-blue-400">
              {new Set(positions.map((p) => p.protocol)).size}
            </div>
            <p className="text-muted-foreground-400 text-xs">Protocols used</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground-300 text-sm">
              Estimated Yield
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-2xl font-bold text-purple-400">
              $
              {positions
                .reduce((sum, p) => sum + (p.usd_value * p.apy) / 100, 0)
                .toLocaleString()}
            </div>
            <p className="text-muted-foreground-400 text-xs">Annually</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-card-muted backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="text-muted-foreground-400 mb-2 block text-sm">
                Blockchain
              </label>
              <Select value={selectedChain} onValueChange={setSelectedChain}>
                <SelectTrigger>
                  <SelectValue placeholder="All Chains" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Chains</SelectItem>
                  <SelectItem value="ethereum">Ethereum</SelectItem>
                  <SelectItem value="polygon">Polygon</SelectItem>
                  <SelectItem value="arbitrum">Arbitrum</SelectItem>
                  <SelectItem value="bsc">BSC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-muted-foreground-400 mb-2 block text-sm">
                Asset
              </label>
              <Select value={selectedToken} onValueChange={setSelectedToken}>
                <SelectTrigger>
                  <SelectValue placeholder="All Assets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assets</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="ETH">ETH</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="BNB">BNB</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-muted-foreground-400 mb-2 block text-sm">
                Investment Horizon
              </label>
              <Select
                value={investmentHorizon}
                onValueChange={setInvestmentHorizon}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Real-time</SelectItem>
                  <SelectItem value="medium">7-day avg</SelectItem>
                  <SelectItem value="long">30-day avg</SelectItem>
                  <SelectItem value="very_long">90-day avg</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-muted-foreground-400 mb-2 block text-sm">
                Sort By
              </label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apy">Highest APY</SelectItem>
                  <SelectItem value="tvl">Highest TVL</SelectItem>
                  <SelectItem value="risk">Lowest Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Opportunities List */}
      <div className="space-y-4">
        <h2 className="text-foreground text-xl font-semibold">
          Available Opportunities ({filteredOpportunities.length})
        </h2>
        {filteredOpportunities.map((opp, index) => {
          const riskBadge = getRiskBadge(opp.riskScore)
          const currentApy = getApyForHorizon(opp)

          return (
            <Card
              key={index}
              className="bg-card border-card-muted backdrop-blur-sm transition-all hover:bg-slate-800/80"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex flex-1 items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-blue-600">
                      <TrendingUp className="text-foreground h-6 w-6" />
                    </div>

                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="text-foreground text-lg font-semibold">
                          {opp.protocol}
                        </h3>
                        <Badge
                          variant="outline"
                          className="border-blue-500/30 text-blue-400"
                        >
                          {opp.blockchain}
                        </Badge>
                        <Badge className={riskBadge.className}>
                          {riskBadge.text}
                        </Badge>
                      </div>

                      <div className="text-muted-foreground-400 flex items-center gap-6 text-sm">
                        <span>
                          Asset:{' '}
                          <span className="text-foreground font-medium">
                            {opp.asset}
                          </span>
                        </span>
                        <span>
                          TVL:{' '}
                          <span className="text-foreground font-medium">
                            {formatTVL(opp.tvl)}
                          </span>
                        </span>
                        <span>
                          Utilization:{' '}
                          <span className="text-foreground font-medium">
                            {opp.utilization}%
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-3xl font-bold text-green-400">
                        {currentApy.toFixed(2)}%
                      </div>
                      <div className="text-muted-foreground-400 text-xs">
                        APY
                      </div>
                    </div>

                    <Button className="bg-blue-600 hover:bg-blue-700">
                      Deposit
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
