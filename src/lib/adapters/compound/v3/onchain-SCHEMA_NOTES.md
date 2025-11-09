# Compound V3 Subgraph Schema Notes

## Subgraph Provider: Messari

**Subgraph ID:** `AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9`

**Schema Source:** [messari/subgraphs - Compound V3](https://github.com/messari/subgraphs/tree/master/subgraphs/compound-v3)

## Key Schema Differences vs Paperclip Labs

This subgraph uses the **Messari standardized lending schema**, which differs significantly from the Paperclip Labs community subgraph:

### Account Entity
```graphql
type Account @entity {
  id: Bytes!  # This IS the address (no separate address field)
  positionCount: Int!
  positions: [Position!]!
  # ... other fields
}
```

**Query Pattern:**
```graphql
accounts(where: { id_in: ["0x123...", "0x456..."] })
```

### Position Entity
```graphql
type Position @entity {
  id: ID!
  account: Account!
  market: Market!
  asset: Token!              # Direct field (not nested in accounting)
  balance: BigInt!           # Direct field (not nested in accounting)
  side: PositionSide!        # COLLATERAL or BORROWER
  isCollateral: Boolean      # Direct field
  isIsolated: Boolean        # Direct field
  blockNumberOpened: BigInt!
  timestampOpened: BigInt!
  # ... other fields
}
```

**Key Points:**
- ✅ `asset` is a direct field (Token reference)
- ✅ `balance` is a direct field
- ✅ `side` is an enum: `COLLATERAL` (lender) or `BORROWER`
- ✅ `isCollateral` and `isIsolated` are direct boolean fields
- ❌ No `accounting` nested object
- ❌ No `creationBlockNumber` (use `blockNumberOpened`)

### Market Entity
```graphql
type Market @entity {
  id: Bytes!
  name: String!              # Direct field (not in configuration)
  inputToken: Token!         # Direct field (not in configuration)
  rates: [InterestRate!]     # Direct field (not in accounting)
  totalBorrowBalanceUSD: BigDecimal!
  totalDepositBalanceUSD: BigDecimal!
  # ... other fields
}
```

**Key Points:**
- ✅ `name` is a direct field
- ✅ `inputToken` is the main token (e.g., USDC for a USDC market)
- ✅ `rates` array contains interest rates with `side` (LENDER/BORROWER) and `type` (STABLE/VARIABLE)
- ❌ No `configuration` nested object
- ❌ No `accounting` nested object
- ❌ No `cometProxy` field

### Token Entity
```graphql
type Token @entity {
  id: Bytes!                 # Token address
  name: String!
  symbol: String!
  decimals: Int!
  lastPriceUSD: BigDecimal   # Note: USD in caps
}
```

**Key Points:**
- ✅ `lastPriceUSD` (not `lastPriceUsd`)

## Filtering Positions

### Lend Positions (Supply/Collateral)
```graphql
positions(where: { side: COLLATERAL })
```

### Borrow Positions
```graphql
positions(where: { side: BORROWER })
```

## Interest Rates

The `rates` array contains multiple interest rate entries:

```graphql
type InterestRate @entity {
  id: ID!
  rate: BigDecimal!          # APR percentage (e.g., 5.21 for 5.21%)
  side: InterestRateSide!    # LENDER or BORROWER
  type: InterestRateType!    # STABLE, VARIABLE, or FIXED
}
```

**To get supply APR:** Filter `rates` where `side: LENDER`
**To get borrow APR:** Filter `rates` where `side: BORROWER`

## Example Query

```graphql
query UserPositions {
  accounts(where: { id_in: ["0x123..."] }) {
    id  # This is the user address
    positions {
      id
      side  # COLLATERAL or BORROWER
      balance
      asset {
        symbol
        decimals
        lastPriceUSD
      }
      market {
        name
        rates {
          rate
          side
          type
        }
      }
    }
  }
}
```

## Migration from Paperclip Labs Schema

| Paperclip Labs | Messari |
|----------------|---------|
| `account.address` | `account.id` |
| `position.creationBlockNumber` | `position.blockNumberOpened` |
| `position.accounting.baseBalance` | `position.balance` |
| `position.accounting.collateralBalances` | N/A (use `position.balance` for collateral) |
| `market.configuration.name` | `market.name` |
| `market.configuration.baseToken` | `market.inputToken` |
| `market.accounting.supplyApr` | `market.rates` (filter by `side: LENDER`) |
| `market.accounting.borrowApr` | `market.rates` (filter by `side: BORROWER`) |
| `market.cometProxy` | N/A |
| `token.lastPriceUsd` | `token.lastPriceUSD` |

## Resources

- **Messari Subgraphs Repo:** https://github.com/messari/subgraphs
- **Lending Schema:** https://github.com/messari/subgraphs/blob/master/schema-lending.graphql
- **Compound V3 Subgraph:** https://github.com/messari/subgraphs/tree/master/subgraphs/compound-v3
- **Schema Documentation:** https://github.com/messari/subgraphs/blob/master/docs/SCHEMA.md
