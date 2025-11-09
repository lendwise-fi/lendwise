# Compound V3 Onchain Adapter

This adapter fetches data from Compound V3 subgraphs across multiple chains.

## Architecture

### Chain-Specific Structure

```
onchain/
├── config.ts              # Re-exports chain configs from centralized config
├── queries.ts             # Shared GraphQL queries
├── index.ts               # Main adapter + createChainClient utility
├── ethereum/
│   └── index.ts          # Ethereum client (uses createChainClient)
├── base/
│   ├── index.ts          # Base client (uses createChainClient)
│   └── queries.ts        # Base-specific queries (different schema)
└── polygon/
    └── index.ts          # Polygon client (uses createChainClient)
```

### How It Works

1. **Centralized Config** (`../../config.ts`)
   - All chain configurations (subgraph URLs, contracts) are defined in the main Compound config
   - `onchain/config.ts` re-exports `COMPOUND_V3_CHAINS` for convenience

2. **Client Factory** (`index.ts` - `createChainClient`)
   - Utility function that creates urql clients with consistent configuration
   - Takes subgraph URL and optional API key
   - Used by all chain-specific clients

3. **Self-Registering Chains** (`{chain}/index.ts`)
   - Each chain folder creates its client using `createChainClient`
   - Automatically registers itself by calling `registerChain()`
   - No need to manually maintain a list of chains in the main adapter
   - Chain-specific queries can be included in the registration

4. **Chain Registry** (`index.ts`)
   - Maintains a registry of all registered chains
   - Chains register themselves when their module is imported
   - Main adapter loops through all registered chains to fetch data

5. **Shared Queries** (`queries.ts`)
   - Contains GraphQL queries used across all chains
   - Reusable and chain-agnostic
   - Can be overridden per chain if needed

6. **Main Adapter** (`index.ts`)
   - Imports chain modules (which auto-register)
   - Fetches data from all registered chains in parallel
   - Returns combined results from all chains

### Adding a New Chain

**With Automatic Registration (Recommended):**

1. **Add chain config with `clientPath` to centralized config:**

   ```typescript
   // ../../config.ts
   export const COMPOUND_CONFIG: Record<string, ProtocolConfig> = {
     compound_v3: {
       chains: {
         [arbitrum.id]: {
           ...arbitrum,
           custom: {
             subgraphUrl: 'https://gateway.thegraph.com/api/subgraphs/id/YOUR_ARBITRUM_ID',
             clientPath: 'arbitrum', // ✨ This enables automatic registration
           },
         },
       },
     },
   }
   ```

2. **Create chain folder with self-registration:**

   ```typescript
   // arbitrum/index.ts
   import { arbitrum } from 'viem/chains'
   import { createChainClient, registerChain } from '../index'
   import { COMPOUND_V3_CHAINS } from '../config'
   
   const config = COMPOUND_V3_CHAINS[arbitrum.id]
   
   // Create the client
   const arbitrumClient = createChainClient(
     config.custom.subgraphUrl!,
     process.env.COMPOUND_THEGRAPH_API_KEY
   )
   
   // Register this chain (it will automatically be included in data fetching)
   registerChain({
     client: arbitrumClient,
     chainId: config.id,
     chainName: config.name,
     // queries: CUSTOM_QUERIES, // Optional: add if schema differs
   })
   ```

3. **That's it!** The chain will be automatically discovered and registered when the adapter initializes.

**Benefits of Automatic Registration:**
- ✅ **Zero boilerplate** - No manual imports or array maintenance
- ✅ **Config-driven** - Just add `clientPath` to the chain config
- ✅ **Automatic discovery** - System reads the config and imports chains automatically
- ✅ **Easy to enable/disable** - Remove `clientPath` to disable a chain
- ✅ **Type-safe** - Registration enforces correct structure
- ✅ **Decoupled** - Each chain is independent
- ✅ **Single source of truth** - Chain configuration in one place

### Chain-Specific Queries

Some chains may have different subgraph schemas. You can override queries per chain:

**Example: Base chain has a different schema**

1. **Create chain-specific queries:**

   ```typescript
   // base/queries.ts
   export const USER_LEND_POSITIONS_BASE = gql`
     query UserLendPositionsBase($where: AccountFilters) {
       accounts(where: $where) {
         # Different schema for Base
       }
     }
   `
   ```

2. **Register with custom queries:**

   ```typescript
   // base/index.ts
   import { base } from 'viem/chains'
   import { createChainClient, registerChain } from '../index'
   import { COMPOUND_V3_CHAINS } from '../config'
   import { USER_LEND_POSITIONS_BASE, USER_BORROW_POSITIONS_BASE } from './queries'
   
   const config = COMPOUND_V3_CHAINS[base.id]
   
   const baseClient = createChainClient(
     config.custom.subgraphUrl!,
     process.env.COMPOUND_THEGRAPH_API_KEY
   )
   
   // Register with custom queries
   registerChain({
     client: baseClient,
     chainId: config.id,
     chainName: config.name,
     queries: {
       USER_LEND_POSITIONS: USER_LEND_POSITIONS_BASE,
       USER_BORROW_POSITIONS: USER_BORROW_POSITIONS_BASE,
     },
   })
   ```

The adapter will automatically use chain-specific queries when provided in the registration, falling back to default queries otherwise.

### Benefits

✅ **Parallel Fetching** - All chains queried simultaneously
✅ **Shared Queries** - No duplication across chains
✅ **Easy to Scale** - Just add new chain client
✅ **Type-Safe** - Chain IDs from viem
✅ **Centralized Config** - All URLs in one place

## Environment Variables

```env
COMPOUND_THEGRAPH_API_KEY=your_api_key_here
```

## TODO

- [ ] Implement actual query logic in `getUserLendPositions`
- [ ] Implement `getUserBorrowPositions`
- [ ] Add Base subgraph URL
- [ ] Add Polygon subgraph URL
- [ ] Add error handling per chain
- [ ] Add retry logic for failed chains
