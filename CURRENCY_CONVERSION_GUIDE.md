# Currency Conversion System - Centralized Implementation

## Overview

The application now supports **centralized currency conversion** at the data source level. All USD values from the backend are automatically converted to the user's selected base currency before being displayed in any component.

## Architecture

### Design Decision: Convert at Source

**Approach**: Convert all USD values once in the Portfolio component, then pass converted data to child components.

**Benefits**:
- ✅ Single source of truth for conversion
- ✅ Consistent values across all components
- ✅ Better performance (convert once, not per component)
- ✅ Easier to maintain and debug
- ✅ Simpler component logic

## How It Works

### 1. **Currency Configuration**

File: `/src/config/currencies.ts`

Each currency includes its CoinGecko API identifier:

```typescript
{
  code: 'EUR',
  name: 'Euro',
  symbol: '€',
  type: 'fiat',
  coinGeckoId: 'eur'  // Used for API calls
}
```

Supports:
- **Fiat**: USD, EUR, GBP, JPY, CHF, CAD, AUD, BRL, HKD, INR, KRW, MXN, NOK, NZD, RUB, SEK, SGD, TRY
- **Crypto**: BTC, ETH

### 2. **Exchange Rate Fetching**

Hook: `/src/hooks/useCurrencyConverter.ts`

Fetches USD → Target Currency conversion rates:

```typescript
const { rate, loading, convertFromUSD } = useCurrencyConverter('EUR')
// rate = 0.92 (1 USD = 0.92 EUR)
```

**How it works**:
- **Fiat currencies**: Fetches USDT price in target currency (proxy for USD)
- **Crypto currencies**: Fetches crypto price in USD, then inverts (1 / price)
- **Caching**: 1-hour client-side cache to minimize API calls
- **Deduplication**: Prevents duplicate requests for same currency

### 3. **Value Conversion**

File: `/src/lib/format-currency.ts`

Simple utility for converting USD values:

```typescript
import { convertValue } from '@/lib/format-currency'

// Convert a USD value to target currency
const converted = convertValue(usdValue, rate)

// Or inline in components
const { rate } = useCurrency()
const converted = usdValue * rate
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

## Implementation Flow

### In Portfolio Component

File: `/src/components/portfolio/Portfolio.tsx`

```typescript
export function Portfolio() {
  // 1. Get selected currency from global store
  const { baseCurrency } = useWalletStore()
  
  // 2. Fetch conversion rate
  const { rate, loading: conversionLoading } = useCurrencyConverter(baseCurrency)
  
  // 3. Load positions (in USD from backend)
  const { userPositions } = useLoadUserPositions(addresses)
  
  // 4. Convert all positions at source
  const convertedPositions = useMemo(() => {
    if (baseCurrency === 'USD' || rate === 1) {
      return userPositions
    }
    
    return {
      lend: convertLendPositions(userPositions.lend, rate),
      borrow: convertBorrowPositions(userPositions.borrow, rate),
    }
  }, [userPositions, rate, baseCurrency])
  
  // 5. Pass converted data to child components
  return (
    <>
      <LendingTable data={convertedPositions.lend} currency={baseCurrency} />
      <BorrowingTable data={convertedPositions.borrow} currency={baseCurrency} />
    </>
  )
}
```

### In Table Components

Files: `/src/components/portfolio/LendingTable.tsx`, `BorrowingTable.tsx`

```typescript
export function LendingTable({ data, currency = 'USD' }) {
  // Columns now use the currency prop for formatting
  const columns = createColumns(currency)
  
  // formatCompactCurrency automatically uses correct symbol
  formatCompactCurrency(position.assetAmountUsd, currency)
  // EUR: "€1.2K"
  // BTC: "₿0.00003"
}
```

## Files Created/Modified

### New Files

1. **`/src/contexts/CurrencyContext.tsx`** - Complete currency management context
2. **`/src/hooks/useCurrencyConverter.ts`** - Hook for fetching USD conversion rates
3. **`CURRENCY_CONVERSION_GUIDE.md`** - This documentation

### Modified Files

1. **`/src/config/currencies.ts`**
   - Added `coinGeckoId` field to Currency interface
   - Expanded fiat currency list to match available icons

2. **`/src/lib/format-currency.ts`**
   - Added `convertValue()` utility function
   - Consolidated all currency formatting utilities

3. **`/src/stores/walletStore.ts`**
   - Removed `baseCurrency` and `setBaseCurrency` (moved to CurrencyContext)

4. **`/src/app/layout.tsx`**
   - Wrapped app with `CurrencyProvider`

5. **`/src/components/portfolio/Portfolio.tsx`**
   - Use `useCurrency()` hook instead of WalletStore
   - Convert values inline during aggregation (`usdValue * rate`)

6. **`/src/components/portfolio/LendingTable.tsx`**
   - Use `useCurrency()` hook for rate and currency
   - Convert values inline during rendering

7. **`/src/components/portfolio/BorrowingTable.tsx`**
   - Same refactoring as LendingTable

8. **`/src/components/user/UserMenu.tsx`**
   - Use `useCurrency()` hook for currency selection

## API Usage

### CoinGecko API Endpoints

The system uses CoinGecko's `/simple/price` endpoint via our proxy:

**For Fiat Currencies:**
```
GET /api/prices?ids=tether&vs_currencies=eur
Response: { "tether": { "eur": 0.92 } }
```

**For Crypto Currencies:**
```
GET /api/prices?ids=bitcoin&vs_currencies=usd
Response: { "bitcoin": { "usd": 50000 } }
```

### Rate Calculation

**Fiat (e.g., EUR):**
- Fetch: USDT price in EUR
- Rate = direct value (e.g., 0.92)
- Conversion: `1000 USD * 0.92 = 920 EUR`

**Crypto (e.g., BTC):**
- Fetch: BTC price in USD (e.g., 50000)
- Rate = 1 / price (e.g., 0.00002)
- Conversion: `1000 USD * 0.00002 = 0.02 BTC`

## Adding New Currencies

To add support for a new currency:

1. **Add to config** (`/src/config/currencies.ts`):
```typescript
const SUPPORTED_FIAT_CODES = [
  // ... existing
  { code: 'ZAR', coinGeckoId: 'zar' },
]
```

2. **Add currency icon** to `/public/icons/native/`:
   - Name: `{code}.svg` (lowercase, e.g., `zar.svg`)
   - The `CurrencyIcon` component will automatically load it

3. **Test**: Select the currency in the user menu and verify conversion works

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
