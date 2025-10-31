'use client'

import React from 'react'

interface HealthFactorBarProps {
  healthFactor: number
  minValue?: number
  maxValue?: number
  liquidationThreshold?: number
  riskThreshold?: number
}

export const HealthFactorBar: React.FC<HealthFactorBarProps> = ({
  healthFactor,
  minValue = 0.5,
  maxValue = 3.0,
  liquidationThreshold = 1.0,
  riskThreshold = 2.0,
}) => {
  // Calculate percentages for zone boundaries
  const liquidationPercent =
    ((liquidationThreshold - minValue) / (maxValue - minValue)) * 100
  const riskPercent = ((riskThreshold - minValue) / (maxValue - minValue)) * 100

  // Calculate position of the health factor indicator
  const healthFactorPercent = Math.min(
    Math.max(((healthFactor - minValue) / (maxValue - minValue)) * 100, 0),
    100
  )

  // Determine which zone the health factor is in
  const getZone = () => {
    if (healthFactor < liquidationThreshold) return 'liquidation'
    if (healthFactor < riskThreshold) return 'risk'
    return 'safe'
  }

  const zone = getZone()

  return (
    <div className="w-full space-y-2">
      {/* Bar Container */}
      <div className="relative h-24 w-full overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
        {/* Liquidation Zone */}
        <div
          className="absolute top-0 left-0 flex h-full items-center justify-center bg-red-300 dark:bg-red-400/80"
          style={{ width: `${liquidationPercent}%` }}
        >
          <span className="text-sm font-bold text-red-700 md:text-base dark:text-red-900">
            Liquidation Zone
          </span>
        </div>

        {/* At Risk Zone */}
        <div
          className="absolute top-0 flex h-full items-center justify-center bg-orange-200 dark:bg-orange-300/80"
          style={{
            left: `${liquidationPercent}%`,
            width: `${riskPercent - liquidationPercent}%`,
          }}
        >
          <span className="text-sm font-bold text-orange-700 md:text-base dark:text-orange-900">
            At Risk Zone
          </span>
        </div>

        {/* Safe Zone */}
        <div
          className="absolute top-0 flex h-full items-center justify-center bg-green-300 dark:bg-green-400/80"
          style={{
            left: `${riskPercent}%`,
            width: `${100 - riskPercent}%`,
          }}
        >
          <span className="text-sm font-bold text-green-700 md:text-base dark:text-green-900">
            Safe Zone
          </span>
        </div>

        {/* Vertical dashed lines at boundaries */}
        <div
          className="absolute top-0 h-full w-0.5 border-l-2 border-dashed border-red-600 dark:border-red-700"
          style={{ left: `${liquidationPercent}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 border-l-2 border-dashed border-orange-600 dark:border-orange-700"
          style={{ left: `${riskPercent}%` }}
        />

        {/* Health Factor Indicator - Shiny vertical line */}
        <div
          className="absolute top-0 h-full transition-all duration-500 ease-out"
          style={{ left: `${healthFactorPercent}%` }}
        >
          {/* Glow effect */}
          <div className="absolute top-0 h-full w-1 -translate-x-1/2 bg-linear-to-r from-transparent via-white to-transparent opacity-50 blur-sm" />

          {/* Main indicator line */}
          <div className="absolute top-0 h-full w-1 -translate-x-1/2 animate-pulse bg-linear-to-b from-blue-400 via-blue-500 to-blue-600 shadow-lg shadow-blue-500/50" />

          {/* Shine effect */}
          <div className="absolute top-0 left-0.5 h-full w-0.5 -translate-x-1/2 bg-linear-to-b from-white via-transparent to-transparent opacity-60" />

          {/* Top indicator */}
          <div className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-blue-500 shadow-lg shadow-blue-500/50 dark:border-gray-800" />

          {/* Bottom indicator */}
          <div className="absolute -bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-blue-500 shadow-lg shadow-blue-500/50 dark:border-gray-800" />
        </div>
      </div>

      {/* Scale Labels */}
      <div className="relative h-6 w-full">
        <div className="absolute left-0 text-xs text-gray-600 dark:text-gray-400">
          {minValue.toFixed(1)}
        </div>
        <div
          className="absolute text-xs text-gray-600 dark:text-gray-400"
          style={{
            left: `${liquidationPercent}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {liquidationThreshold.toFixed(1)}
        </div>
        <div
          className="absolute text-xs text-gray-600 dark:text-gray-400"
          style={{ left: `${riskPercent}%`, transform: 'translateX(-50%)' }}
        >
          {riskThreshold.toFixed(1)}
        </div>
        <div className="absolute right-0 text-xs text-gray-600 dark:text-gray-400">
          {maxValue.toFixed(1)}
        </div>
      </div>

      {/* Health Factor Label */}
      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Health Factor (HF)
        </p>
        <p
          className={`text-2xl font-bold ${
            zone === 'liquidation'
              ? 'text-red-600 dark:text-red-400'
              : zone === 'risk'
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-green-600 dark:text-green-400'
          }`}
        >
          {healthFactor.toFixed(2)}
        </p>
      </div>
    </div>
  )
}
