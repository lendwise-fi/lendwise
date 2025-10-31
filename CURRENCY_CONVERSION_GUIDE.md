# Currency Conversion Implementation Guide

## Overview

The user positions component now automatically converts crypto asset amounts to the selected base currency using real-time prices from CoinGecko API.

## How It Works

### 1. **Asset Symbol to CoinGecko ID Mapping**

File: `/src/lib/crypto-mapping.ts`

Maps common crypto asset symbols (WETH, USDC, etc.) to their CoinGecko IDs:

```typescript
WETH -> 'ethereum'
USDC -> 'usd-coin'
BTC -> 'bitcoin'
// etc.
```

### 2. **Price Fetching**

The component:

1. Extracts all unique asset symbols from positions
2. Maps them to CoinGecko IDs
3. Fetches prices for all assets in the selected base currency
4. Uses the existing `/api/prices` proxy to avoid CORS issues

### 3. **Amount Conversion**

For each position:

```typescript
// 1. Convert from wei (BigInt) to token amount
const tokenAmount = Number(supplied) / 1e18

// 2. Get price in target currency
const price = prices[coinGeckoId][targetCurrency]

// 3. Calculate value
const value = tokenAmount * price
```

### 4. **Display Formatting**

File: `/src/lib/format-currency.ts`

- **Fiat currencies**: Uses `Intl.NumberFormat` with currency style
- **Crypto currencies**: Uses number formatting without currency symbol
- **Compact notation**: Formats large numbers as 1.2K, 3.4M, etc.
  - Automatically disabled for small numbers (< 1) to preserve precision
  - Example: 0.0003 ETH stays as "0.0003" not "0.00"
- **Smart decimals**: Automatically adjusts decimal places based on amount size
  - Very small (< 0.01): Shows up to 8 decimals (e.g., 0.00031004)
  - Small (< 1): Shows up to 4 decimals (e.g., 0.6807)
  - Normal (≥ 1): Shows 2 decimals (e.g., 123.45)

## Files Created/Modified

### New Files:

1. **`/src/lib/crypto-mapping.ts`** - Asset symbol to CoinGecko ID mapping
2. **`/src/lib/format-currency.ts`** - Currency formatting utilities
3. **`CURRENCY_CONVERSION_GUIDE.md`** - This documentation

### Modified Files:

1. **`/src/components/user-positions.tsx`**
   - Added price fetching with `useCryptoPrices` hook
   - Added conversion logic in positions processing
   - Updated display to use formatted currency

## Supported Assets

Currently mapped assets include:

- **Ethereum**: ETH, WETH
- **Bitcoin**: BTC, WBTC
- **Stablecoins**: USDC, USDT, DAI, USDE, FRAX, LUSD
- **DeFi Tokens**: AAVE, COMP, UNI, LINK, CRV, etc.
- **Liquid Staking**: stETH, rETH, cbETH, wstETH
- **Layer 2**: MATIC, ARB, OP

## Adding New Assets

To add support for a new asset, update `/src/lib/crypto-mapping.ts`:

```typescript
export const ASSET_TO_COINGECKO_ID: Record<string, string> = {
  // ... existing mappings
  NEWTOKEN: 'coingecko-id-for-new-token',
}
```

Find CoinGecko IDs at: https://www.coingecko.com/

## Token Decimals

The system now properly handles different decimal places for various tokens using the `TOKEN_DECIMALS` mapping in `/src/lib/crypto-mapping.ts`:

```typescript
// Token decimals mapping
export const TOKEN_DECIMALS: Record<string, number> = {
  // 18 decimals (most ERC-20 tokens)
  ETH: 18, WETH: 18, DAI: 18, LINK: 18, etc.

  // 8 decimals
  WBTC: 8,

  // 6 decimals (stablecoins)
  USDC: 6,
  USDT: 6,

  // Default: 18 if not found
}

// Helper function to convert from smallest unit
export function fromSmallestUnit(amount: bigint | number, symbol: string): number {
  const decimals = getTokenDecimals(symbol)
  return amount / (10 ** decimals)
}
```

**Usage:**

```typescript
// Automatically uses correct decimals
const tokenAmount = fromSmallestUnit(p.supplied, p.assetSymbol)
// USDC: divides by 1e6
// WBTC: divides by 1e8
// ETH/WETH: divides by 1e18
```

## Error Handling

- **Missing price data**: Position value defaults to 0
- **API failures**: Falls back to mock data after 10 seconds
- **Unknown assets**: Logged to console, value defaults to 0

## Performance Considerations

### Multi-Layer Caching Strategy

**1. Request Deduplication (In-Flight)**

- Tracks pending requests to prevent duplicate fetches
- When multiple components request the same data simultaneously, only ONE fetch happens
- Other components wait for and share the result
- Automatically cleans up after request completes

**2. Client-Side Cache (In-Memory)**

- Caches price data in browser memory for 1 hour
- Prevents duplicate requests from multiple components
- Instant response for repeated queries
- Cache key: `coinIds_currency` (e.g., `ethereum,bitcoin_usd`)

**3. Server-Side Cache (Next.js)**

- API route caches responses for 1 hour (`revalidate: 3600`)
- Shared across all users
- Reduces load on CoinGecko API
- Cache headers: `s-maxage=3600, stale-while-revalidate=7200`

**4. Benefits**

- **Request deduplication**: 3 components = 1 API call (not 3!)
- **No polling**: Prices fetched only when needed
- **Rate limit protection**: Prevents CoinGecko 429 errors
- **Fast loading**: Cached responses are instant
- **Efficient**: Multiple components share the same cached data
- **Manual refresh**: Use `refetch()` to force update when needed

## Testing

To test with different currencies:

1. Change base currency in navbar dropdown
2. Verify amounts update correctly
3. Check console for any price fetch errors

## Future Enhancements

1. **Custom decimals per token**: Support tokens with non-18 decimals
2. **Historical prices**: Show price changes over time
3. **Price alerts**: Notify when positions reach certain values
4. **Multiple currency display**: Show value in multiple currencies simultaneously
