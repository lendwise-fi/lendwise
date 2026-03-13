'use client'

import { useEffect, useState } from 'react'

import {
  ChevronRight,
  Shield,
  TrendingDown,
  Wallet,
} from 'lucide-react'

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
import { Position } from '@/lib/entities'

interface BorrowingOpportunity {
  protocol: string
  loanAsset: string
  collateralAsset: string
  borrowRateRealtime: number
  borrowRate7d: number
  borrowRate30d: number
  borrowRate90d: number
  ltv: number
  liquidationThreshold: number
  blockchain: string
  maxBorrowAmount: number
  minCollateralRequired: number
}

export default function Borrowing() {
  const [positions, setPositions] = useState<Position[]>([])
  const [selectedChain, setSelectedChain] = useState('all')
  const [investmentHorizon, setInvestmentHorizon] = useState('short')
  const [collateralToken, setCollateralToken] = useState('ETH')
  const [loanToken, setLoanToken] = useState('USDC')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const positionsData = await Position.list()
    setPositions(positionsData.filter((p) => p.position_type === 'borrowing'))
  }

  const mockBorrowingOpportunities: BorrowingOpportunity[] = [
    {
      protocol: 'Aave V3',
      loanAsset: 'USDC',
      collateralAsset: 'ETH',
      borrowRateRealtime: 3.2,
      borrowRate7d: 3.4,
      borrowRate30d: 3.6,
      borrowRate90d: 3.8,
      ltv: 85,
      liquidationThreshold: 90,
      blockchain: 'ethereum',
      maxBorrowAmount: 850000,
      minCollateralRequired: 1000000,
    },
    {
      protocol: 'Compound V3',
      loanAsset: 'USDC',
      collateralAsset: 'ETH',
      borrowRateRealtime: 2.8,
      borrowRate7d: 3.0,
      borrowRate30d: 3.2,
      borrowRate90d: 3.4,
      ltv: 80,
      liquidationThreshold: 85,
      blockchain: 'ethereum',
      maxBorrowAmount: 800000,
      minCollateralRequired: 1000000,
    },
    {
      protocol: 'Morpho Blue',
      loanAsset: 'USDC',
      collateralAsset: 'ETH',
      borrowRateRealtime: 2.5,
      borrowRate7d: 2.7,
      borrowRate30d: 2.9,
      borrowRate90d: 3.1,
      ltv: 90,
      liquidationThreshold: 94,
      blockchain: 'ethereum',
      maxBorrowAmount: 900000,
      minCollateralRequired: 1000000,
    },
    {
      protocol: 'Radiant Capital',
      loanAsset: 'USDC',
      collateralAsset: 'ETH',
      borrowRateRealtime: 4.1,
      borrowRate7d: 4.0,
      borrowRate30d: 3.9,
      borrowRate90d: 3.8,
      ltv: 75,
      liquidationThreshold: 80,
      blockchain: 'arbitrum',
      maxBorrowAmount: 750000,
      minCollateralRequired: 1000000,
    },
  ]

  const getBorrowRateForHorizon = (opportunity: BorrowingOpportunity) => {
    switch (investmentHorizon) {
      case 'short':
        return opportunity.borrowRateRealtime
      case 'medium':
        return opportunity.borrowRate7d
      case 'long':
        return opportunity.borrowRate30d
      case 'very_long':
        return opportunity.borrowRate90d
      default:
        return opportunity.borrowRateRealtime
    }
  }

  const filteredOpportunities = mockBorrowingOpportunities
    .filter(
      (opp) => selectedChain === 'all' || opp.blockchain === selectedChain
    )
    .filter(
      (opp) =>
        opp.loanAsset === loanToken && opp.collateralAsset === collateralToken
    )
    .sort((a, b) => getBorrowRateForHorizon(a) - getBorrowRateForHorizon(b))

  const totalBorrowed = positions.reduce(
    (sum, p) => sum + (p.usd_value || 0),
    0
  )
  const avgBorrowRate =
    positions.length > 0
      ? positions.reduce((sum, p) => sum + (p.apy || 0), 0) / positions.length
      : 0
  const avgHealthFactor =
    positions.length > 0
      ? positions.reduce((sum, p) => sum + (p.health_factor || 0), 0) /
        positions.length
      : 0

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground mb-2 text-3xl font-bold">
          Borrowing Optimization
        </h1>
        <p className="text-muted-foreground-400">
          Minimize costs and maximize capital efficiency while maintaining safe
          health factors
        </p>
      </div>

      {/* Current Borrowing Overview */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground-300 flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4" />
              Total Borrowed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-foreground mb-2 text-2xl font-bold">
              ${totalBorrowed.toLocaleString()}
            </div>
            <div className="text-muted-foreground-400 text-sm">
              Across {positions.length} positions
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground-300 flex items-center gap-2 text-sm">
              <TrendingDown className="h-4 w-4" />
              Avg Borrow Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-2xl font-bold text-red-400">
              {avgBorrowRate.toFixed(2)}%
            </div>
            <div className="text-muted-foreground-400 text-sm">
              Weighted average
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-muted backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground-300 flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" />
              Avg Health Factor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`mb-2 text-2xl font-bold ${avgHealthFactor > 2 ? 'text-green-400' : avgHealthFactor > 1.5 ? 'text-yellow-400' : 'text-red-400'}`}
            >
              {avgHealthFactor.toFixed(2)}
            </div>
            <div className="text-muted-foreground-400 text-sm">
              {avgHealthFactor > 2
                ? 'Healthy'
                : avgHealthFactor > 1.5
                  ? 'Caution'
                  : 'At Risk'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-card-muted backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="text-muted-foreground-400 mb-2 block text-sm">
                Collateral Asset
              </label>
              <Select
                value={collateralToken}
                onValueChange={setCollateralToken}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ETH">ETH</SelectItem>
                  <SelectItem value="WBTC">WBTC</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-muted-foreground-400 mb-2 block text-sm">
                Loan Asset
              </label>
              <Select value={loanToken} onValueChange={setLoanToken}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="DAI">DAI</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                  <SelectItem value="arbitrum">Arbitrum</SelectItem>
                  <SelectItem value="polygon">Polygon</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-muted-foreground-400 mb-2 block text-sm">
                Time Horizon
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
          </div>
        </CardContent>
      </Card>

      {/* Borrowing Opportunities */}
      <div className="space-y-4">
        <h2 className="text-foreground text-xl font-semibold">
          Best Borrowing Rates ({filteredOpportunities.length})
        </h2>
        {filteredOpportunities.map((opp, index) => {
          const currentRate = getBorrowRateForHorizon(opp)

          return (
            <Card
              key={index}
              className="bg-card border-card-muted backdrop-blur-sm transition-all hover:bg-slate-800/80"
            >
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex flex-1 items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-600">
                      <TrendingDown className="text-foreground h-6 w-6" />
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
                      </div>

                      <div className="text-muted-foreground-400 flex items-center gap-6 text-sm">
                        <span>
                          Borrow:{' '}
                          <span className="text-foreground font-medium">
                            {opp.loanAsset}
                          </span>
                        </span>
                        <span>
                          Collateral:{' '}
                          <span className="text-foreground font-medium">
                            {opp.collateralAsset}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-3xl font-bold text-red-400">
                        {currentRate.toFixed(2)}%
                      </div>
                      <div className="text-muted-foreground-400 text-xs">
                        Borrow APR
                      </div>
                    </div>

                    <Button className="bg-blue-600 hover:bg-blue-700">
                      Borrow
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* LTV Metrics */}
                <div className="grid grid-cols-3 gap-4 border-t border-slate-700/50 pt-4">
                  <div>
                    <div className="text-muted-foreground-400 mb-1 text-xs">
                      Max LTV
                    </div>
                    <div className="text-foreground text-lg font-semibold">
                      {opp.ltv}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground-400 mb-1 text-xs">
                      Liquidation Threshold
                    </div>
                    <div className="text-foreground text-lg font-semibold">
                      {opp.liquidationThreshold}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground-400 mb-1 text-xs">
                      Safety Margin
                    </div>
                    <div className="text-lg font-semibold text-green-400">
                      {opp.liquidationThreshold - opp.ltv}%
                    </div>
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
