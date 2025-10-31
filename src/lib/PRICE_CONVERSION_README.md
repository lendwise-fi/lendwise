# Crypto Price Conversion System

This system provides real-time cryptocurrency price conversion using the CoinGecko API, with a Next.js proxy to avoid CORS issues and fallback mechanisms.

## Features

- ✅ Real-time ETH and token price conversion to USD, EUR, BTC
- ✅ Next.js API proxy to avoid CORS issues
- ✅ Automatic fallback to mock data if API fails
- ✅ Automatic price updates every 60 seconds
- ✅ Manual refresh functionality
- ✅ Comprehensive error handling and loading states
- ✅ TypeScript support with proper interfaces

## Architecture

### API Proxy (`/src/app/api/prices/route.ts`)

- Proxies requests to CoinGecko API to avoid CORS issues
- Handles server-side requests safely
- Provides detailed error logging

### Price Hook (`/src/hooks/useCryptoPrices.ts`)

- Client-side React hook for fetching prices
- Automatic fallback to mock data after 10 seconds
- Manual refresh capability
- Comprehensive error handling

### Formatters (`/src/lib/formatters.ts`)

- Viem-powered precise BigInt conversion
- Multi-currency formatting
- Price change indicators

## Usage Examples

```typescript
import { useEthPrice } from '@/hooks/useCryptoPrices'
import { formatEth, formatEthInCurrency } from '@/lib/formatters'

// In your component
const { price: ethPrice, loading, error } = useEthPrice('usd')
const totalEth = formatEth(weiAmount)
const totalUsd = formatEthInCurrency(weiAmount, ethPrice.current_price)
```

### Multiple Currency Support

```typescript
import { useEthPriceMultiCurrency } from '@/hooks/useCryptoPrices'

// Get prices in USD, EUR, and BTC
const { usd, eur, btc, loading, error } = useEthPriceMultiCurrency()
```

### Token Price Conversion

```typescript
import { useCryptoPrice } from '@/hooks/useCryptoPrices'
import { formatTokenInCurrency } from '@/lib/formatters'

// For USDC (6 decimals)
const { price: usdcPrice } = useCryptoPrice('usd-coin', 'usd')
const usdcValue = formatTokenInCurrency(tokenAmount, 6, usdcPrice.current_price)

// For WETH (18 decimals)
const { price: wethPrice } = useCryptoPrice('weth', 'usd')
const wethValue = formatEthInCurrency(wethAmount, wethPrice.current_price)
```

## Supported Coins

The system supports all coins available on CoinGecko. Popular ones include:

- `ethereum` - ETH
- `usd-coin` - USDC
- `tether` - USDT
- `dai` - DAI
- `wrapped-bitcoin` - WBTC
- `chainlink` - LINK
- `uniswap` - UNI

## Supported Currencies

- `usd` - US Dollar
- `eur` - Euro
- `btc` - Bitcoin
- `eth` - Ethereum

## API Rate Limits

CoinGecko Free Tier:

- 10-50 requests per minute
- Updates every 60 seconds (configured in hooks)

## Error Handling

The system includes comprehensive error handling:

- Network failures
- API rate limits
- Invalid coin IDs
- Loading states

Always check the `loading` and `error` states in your components.

## Performance Tips

1. **Memoization**: Use React.memo for components that consume price data
2. **Polling**: Prices update automatically every 60 seconds
3. **Caching**: Consider implementing price caching for production
4. **Fallbacks**: Always provide fallback values for when prices are unavailable

## Alternative Price Sources

1. **Chainlink Price Feeds** (on-chain, decentralized)
2. **Pyth Network** (high-frequency updates)
3. **Redstone Oracles** (EVM compatible)
4. **Custom API integration** (CoinMarketCap, CryptoCompare)

## Testing

Mock the price hooks for testing:

```typescript
// In your test files
jest.mock('@/hooks/useCryptoPrices', () => ({
  useEthPrice: () => ({
    price: { current_price: 2000, price_change_24h: 50 },
    loading: false,
    error: null,
  }),
}))
```
