'use client'

import React, { useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { HealthFactorBar } from './HealthFactorBar'

/**
 * Demo component to showcase the HealthFactorBar with interactive controls
 */
export const HealthFactorBarDemo: React.FC = () => {
  const [healthFactor, setHealthFactor] = useState(2.5)

  return (
    <div className="space-y-8 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Health Factor Monitoring Bar</CardTitle>
          <CardDescription>
            Visual representation of position health across liquidation, risk,
            and safe zones
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Interactive Demo */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Adjust Health Factor: {healthFactor.toFixed(2)}
              </label>
            </div>
            <input
              type="range"
              value={healthFactor}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setHealthFactor(parseFloat(e.target.value))
              }
              min={0.5}
              max={3.0}
              step={0.1}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
            />
          </div>

          {/* Health Factor Bar */}
          <HealthFactorBar healthFactor={healthFactor} />
        </CardContent>
      </Card>

      {/* Example Scenarios */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liquidation Zone</CardTitle>
            <CardDescription>HF &lt; 1.0</CardDescription>
          </CardHeader>
          <CardContent>
            <HealthFactorBar healthFactor={0.85} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">At Risk Zone</CardTitle>
            <CardDescription>1.0 ≤ HF &lt; 2.0</CardDescription>
          </CardHeader>
          <CardContent>
            <HealthFactorBar healthFactor={1.5} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Safe Zone</CardTitle>
            <CardDescription>HF ≥ 2.0</CardDescription>
          </CardHeader>
          <CardContent>
            <HealthFactorBar healthFactor={2.7} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
