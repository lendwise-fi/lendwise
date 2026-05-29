# Aave Collateral Data Discrepancies

## Overview

This document documents known discrepancies between Aave's official GraphQL API data and the Aave UI display regarding collateral eligibility status.

## Current Known Discrepancies

### rsETH on AaveV3Arbitrum

**Asset:** KelpDao Restaked ETH (rsETH)  
**Address:** `0x4186BFC76E2E237523CBC30FD220FE055156b41F`  
**Chain:** Arbitrum (42161)  
**Market:** AaveV3Arbitrum

| Data Source | canBeCollateral | Max LTV | Liquidation Threshold | Borrowing State |
| ----------- | --------------- | ------- | --------------------- | --------------- |
| GraphQL API | `false`         | `0`     | `0.001`               | `DISABLED`      |
| Aave UI     | `true` (green)  | -       | -                     | -               |

**Last Verified:** 2026-03-17T23:52:18.568Z

## Investigation Findings

### 1. API Data Consistency ✅

The GraphQL API consistently returns `canBeCollateral: false` for rsETH across multiple calls:

- Tested with 5 consecutive API calls
- All returned the same result: `false`
- No timing or cache issues detected

### 2. Alternative Data Sources ❌

Several alternative Aave data sources were investigated:

- **Aave v2 API**: Not available or rsETH not found
- **Aave Subgraph**: Requires authentication, not publicly accessible
- **Other GraphQL endpoints**: No alternative public endpoints found

### 3. Code Logic Analysis ✅

The yieldoptimizer code correctly processes the API data:

```typescript
const marketCollaterals: Collateral[] = market.reserves
  .filter((r) => r.supplyInfo?.canBeCollateral === true) // ✅ Correctly filters out rsETH
  .map((r) => ({
    // ... collateral mapping
    canBeCollateral: true, // ✅ Hardcoded for filtered results
  }))
```

The filtering logic is sound and will correctly exclude rsETH from collateral lists.

## Likely Root Causes

1. **UI-Specific Data Source**: The Aave UI likely uses a different data source than the public GraphQL API
2. **Real-time vs Cached Data**: UI might use real-time blockchain data while GraphQL uses cached subgraph data
3. **Business Logic Overrides**: UI might apply additional business logic or feature flags
4. **Data Lag**: GraphQL API might have delayed updates compared to the UI

## Impact on Yieldoptimizer

### ✅ No Impact on Current Implementation

The yieldoptimizer correctly:

- Filters out rsETH from collateral lists based on API data
- Prevents rsETH from being used as collateral in optimization calculations
- Maintains data consistency with the official API

### ⚠️ Potential User Confusion

Users might see:

- rsETH listed as collateral in Aave UI
- rsETH NOT available as collateral in yieldoptimizer
- This discrepancy could cause confusion about data accuracy

## Recommendations

### 1. Trust the Official API ✅

**Continue using the official GraphQL API data** for the following reasons:

- It's the documented and supported data source
- Consistent and reliable across calls
- Used by other DeFi applications
- Provides complete market data structure

### 2. Add Validation Monitoring ✅

**Implemented monitoring system** that:

- Detects collateral discrepancies automatically
- Logs detailed discrepancy information
- Provides summary statistics
- Alerts on known UI vs API differences

### 3. User Communication 📋

**Consider adding user-facing explanations** when:

- Assets are excluded from collateral lists
- Known discrepancies exist
- Users might question data accuracy

### 4. Periodic Validation 🔄

**Schedule regular validation** to:

- Monitor for new discrepancies
- Track resolution of existing ones
- Update known discrepancy lists

## Monitoring Implementation

The yieldoptimizer now includes:

1. **CollateralValidator Class**: Automatically detects and logs discrepancies
2. **Integration with Products Fetcher**: Validates data during sync operations
3. **Test Script**: `pnpm run test:collateral` for manual validation
4. **Detailed Logging**: Comprehensive discrepancy reporting

### Usage

```bash
# Run manual validation
pnpm run test:collateral

# Check logs during products sync
pnpm run products:sync
```

## Future Considerations

1. **Cross-chain Monitoring**: Extend validation to all supported chains
2. **Historical Tracking**: Store discrepancy history for trend analysis
3. **Alert System**: Implement notifications for new discrepancies
4. **UI Data Source**: Investigate possibility of using same data source as UI (if documented)

## Conclusion

The rsETH collateral discrepancy is a known issue between Aave's UI and API. The yieldoptimizer implementation is correct and should continue using the official GraphQL API data. The added monitoring system will help track such issues and maintain data integrity.
