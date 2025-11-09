'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react'

import { useCurrencyConverter } from '@/hooks/useCurrencyConverter'

interface CurrencyContextValue {
  // Current selected currency
  baseCurrency: string
  
  // Conversion rate from USD to baseCurrency
  rate: number
  
  // Loading state for rate fetching
  loading: boolean
  
  // Error state
  error: string | null
  
  // Change the base currency
  setBaseCurrency: (currency: string) => void
  
  // Convert a USD value to the current base currency
  convertFromUSD: (usdValue: number) => number
  
  // Convert a value from current base currency back to USD
  convertToUSD: (value: number) => number
  
  // Format a USD value in the current currency with proper symbol
  formatValue: (usdValue: number) => string
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(
  undefined
)

interface CurrencyProviderProps {
  children: ReactNode
  defaultCurrency?: string
}

const STORAGE_KEY = 'yieldoptimizer:baseCurrency'

export function CurrencyProvider({
  children,
  defaultCurrency = 'USD',
}: CurrencyProviderProps) {
  // Load currency from localStorage on mount
  const [baseCurrency, setBaseCurrencyState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || defaultCurrency
    }
    return defaultCurrency
  })

  // Fetch conversion rate for current currency
  const {
    rate,
    loading,
    error,
    convertFromUSD: hookConvertFromUSD,
    convertToUSD: hookConvertToUSD,
  } = useCurrencyConverter(baseCurrency)

  // Persist currency changes to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, baseCurrency)
    }
  }, [baseCurrency])

  // Wrapper for setBaseCurrency to ensure persistence
  const setBaseCurrency = useCallback((currency: string) => {
    setBaseCurrencyState(currency)
  }, [])

  // Memoized conversion functions
  const convertFromUSD = useCallback(
    (usdValue: number): number => {
      return hookConvertFromUSD(usdValue)
    },
    [hookConvertFromUSD]
  )

  const convertToUSD = useCallback(
    (value: number): number => {
      return hookConvertToUSD(value)
    },
    [hookConvertToUSD]
  )

  // Format value with currency symbol (basic implementation)
  const formatValue = useCallback(
    (usdValue: number): string => {
      const converted = convertFromUSD(usdValue)
      
      // For crypto currencies
      if (baseCurrency === 'BTC') {
        return `₿${converted.toFixed(8)}`
      }
      if (baseCurrency === 'ETH') {
        return `ETH ${converted.toFixed(6)}`
      }
      
      // For fiat currencies, use Intl.NumberFormat
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: baseCurrency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(converted)
      } catch {
        // Fallback if currency not supported by Intl
        return `${baseCurrency} ${converted.toFixed(2)}`
      }
    },
    [baseCurrency, convertFromUSD]
  )

  const value: CurrencyContextValue = {
    baseCurrency,
    rate,
    loading,
    error,
    setBaseCurrency,
    convertFromUSD,
    convertToUSD,
    formatValue,
  }

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  )
}

/**
 * Hook to access currency context
 * Must be used within a CurrencyProvider
 */
export function useCurrency() {
  const context = useContext(CurrencyContext)
  
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  
  return context
}
