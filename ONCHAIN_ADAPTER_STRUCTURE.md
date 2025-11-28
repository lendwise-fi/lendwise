# Onchain Adapter Structure

This document describes the standardized structure for onchain adapters across all protocols.

## Overview

Onchain adapters fetch data from blockchain subgraphs across multiple chains. The architecture uses a **self-registering pattern** designed to:

1. **Centralize configuration** - All chain configs (subgraph URLs, contracts) in one place
2. **Reuse client creation logic** - Single `createChainClient` utility per protocol version
3. **Auto-register chains** - Each chain folder registers itself, no manual array maintenance
4. **Support multi-chain** - Parallel fetching from multiple chains
5. **Allow chain-specific customization** - Override queries for chains with different schemas

## Directory Structure

```
src/lib/adapters/
├── {protocol}/                    # e.g., compound, morpho, aave
│   ├── config.ts                  # Centralized config for all versions and chains
│   └── v{X}/                      # Version-specific adapter
│       ├── index.ts               # Version adapter assembler
│       └── onchain/               # Onchain data source
│           ├── config.ts          # Re-exports chain configs from ../../config.ts
│           ├── queries.ts         # Shared GraphQL queries
│           ├── index.ts           # Main adapter + createChainClient utility
│           ├── {chain1}/          # Optional: Chain-specific folder
│           │   ├── index.ts       # Chain client (uses createChainClient)
│           │   └── queries.ts     # Chain-specific queries (if schema differs)
│           └── {chain2}/
│               └── index.ts
```

## Implementation Pattern

### 1. Centralized Config (`{protocol}/config.ts`)

All chain configurations are defined here:

```typescript
import { base, mainnet, polygon } from 'viem/chains'

import type { ProtocolConfig } from '@/config/protocols'

export const COMPOUND_CONFIG: Record<string, ProtocolConfig> = {
  compound_v3: {
    id: 'compound_v3',
    name: 'Compound V3',
    chains: {
      [mainnet.id]: {
        ...mainnet,
        custom: {
          subgraphUrl: 'https://gateway.thegraph.com/api/subgraphs/id/...',
        },
      },
      [base.id]: {
        ...base,
        custom: {
          subgraphUrl: 'https://gateway.thegraph.com/api/subgraphs/id/...',
        },
      },
    },
  },
}
```

### 2. Config Re-export (`v{X}/onchain/config.ts`)

Re-export chain configs for convenience:

```typescript
import { COMPOUND_CONFIG } from '../../config'

export const COMPOUND_V3_CHAINS = COMPOUND_CONFIG.compound_v3.chains
export type CompoundV3ChainId = keyof typeof COMPOUND_V3_CHAINS
```

### 3. Client Factory (`v{X}/onchain/index.ts`)

Create a reusable client factory function:

```typescript
import { Client, cacheExchange, createClient, fetchExchange } from '@urql/core'

/**
 * Creates a GraphQL client for a specific chain.
 */
export function createChainClient(
  subgraphUrl: string,
  apiKey?: string
): Client {
  return createClient({
    url: subgraphUrl,
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      signal: AbortSignal.timeout(20000),
    },
    preferGetMethod: false,
    requestPolicy: 'network-only',
  })
}
```

### 4. Self-Registering Chain Pattern

**Each chain folder registers itself automatically:**

```typescript
// ethereum/index.ts
import { mainnet } from 'viem/chains'

import { COMPOUND_V3_CHAINS } from '../config'
import { createChainClient, registerChain } from '../index'

const config = COMPOUND_V3_CHAINS[mainnet.id]

// Create the client
const ethereumClient = createChainClient(
  config.custom.subgraphUrl!,
  process.env.THEGRAPH_API_KEY
)

// Register this chain (auto-included in data fetching)
registerChain({
  client: ethereumClient,
  chainId: config.id,
  chainName: config.name,
  // queries: CUSTOM_QUERIES, // Optional
})
```

**Main adapter imports chain modules:**

```typescript
// Import chain modules (they auto-register)
// Registers Ethereum
import './base'
import './ethereum'

// index.ts
// Chain registry
const chainRegistry: ChainClient[] = []

export function registerChain(config: ChainClient): void {
  chainRegistry.push(config)
}

// Registers Base
// import './polygon'   // Uncomment to enable

function getChainClients(): ChainClient[] {
  return chainRegistry
}

// Use registered chains
async function getUserLendPositions(addresses: Address[]) {
  const results = await Promise.allSettled(
    getChainClients().map(async ({ client, chainName, queries }) => {
      // Fetch from this chain
    })
  )
}
```

**Benefits of Self-Registration:**

- ✅ **Zero boilerplate** - No manual array maintenance
- ✅ **Automatic discovery** - Just import the module
- ✅ **Easy to enable/disable** - Comment out a single import line
- ✅ **Type-safe** - Registration enforces correct structure
- ✅ **Decoupled** - Each chain is independent
- ✅ **No magic numbers** - Clear chain identification

### 5. Chain-Specific Queries (Optional)

For chains with different schemas:

```typescript
// base/queries.ts
export const USER_LEND_POSITIONS_BASE = gql`
  query UserLendPositionsBase($where: AccountFilters) {
    accounts(where: $where) {
      # Different schema for Base
    }
  }
`

// base/index.ts
export const BASE_QUERIES = {
  USER_LEND_POSITIONS: USER_LEND_POSITIONS_BASE,
  USER_BORROW_POSITIONS: USER_BORROW_POSITIONS_BASE,
}

// In CHAIN_CLIENTS array
{
  client: baseClient,
  chainId: BASE_CHAIN_ID,
  chainName: BASE_CHAIN_NAME,
  queries: BASE_QUERIES, // Uses Base-specific queries
}
```

## Benefits

✅ **Single Source of Truth** - All configs in centralized location
✅ **DRY Principle** - Reusable `createChainClient` utility
✅ **Consistent Configuration** - Same client settings across all chains
✅ **Easy to Scale** - Add new chains by updating config and CHAIN_CLIENTS array
✅ **Flexible** - Support chain-specific queries when needed
✅ **Type-Safe** - Chain IDs from viem
✅ **Parallel Fetching** - All chains queried simultaneously

## Adding a New Chain

1. **Update centralized config:**

```typescript
// {protocol}/config.ts
export const PROTOCOL_CONFIG = {
  protocol_v3: {
    chains: {
      [newChain.id]: {
        ...newChain,
        custom: {
          subgraphUrl: 'https://...',
        },
      },
    },
  },
}
```

2. **Add to CHAIN_CLIENTS array:**

```typescript
// Direct approach
{
  client: createChainClient(
    PROTOCOL_V3_CHAINS[newChain.id].custom.subgraphUrl!,
    process.env.API_KEY
  ),
  chainId: PROTOCOL_V3_CHAINS[newChain.id].id,
  chainName: PROTOCOL_V3_CHAINS[newChain.id].name,
}

// OR create a separate folder for better organization
```

## Current Implementation Status

### Compound V3 ✅

- ✅ Centralized config in `/src/lib/adapters/compound/config.ts`
- ✅ `createChainClient` utility in `/src/lib/adapters/compound/v3/onchain/index.ts`
- ✅ Chain folders: `ethereum/`, `base/`, `polygon/`
- ✅ Base has custom queries due to different schema

### Morpho V1 🔄

- ✅ Centralized config in `/src/lib/adapters/morpho/config.ts`
- ⏳ TODO: Create onchain adapter with `createChainClient` utility
- ⏳ TODO: Support multiple chains (mainnet, base, arbitrum, polygon, optimism)

### AAVE V3 ⏳

- ⏳ TODO: Create centralized config
- ⏳ TODO: Create onchain adapter structure
- ⏳ TODO: Support multiple chains

## Environment Variables

Each protocol may require API keys:

```env
# Compound
THEGRAPH_API_KEY=your_api_key_here

# Morpho (if using authenticated subgraphs)
MORPHO_THEGRAPH_API_KEY=your_api_key_here

# AAVE (if using authenticated subgraphs)
AAVE_THEGRAPH_API_KEY=your_api_key_here
```

## Best Practices

1. **Always use centralized config** - Never hardcode URLs in chain files
2. **Use `createChainClient`** - Don't duplicate client creation logic
3. **Document schema differences** - If a chain needs custom queries, document why
4. **Parallel fetching** - Use `Promise.allSettled` to fetch from all chains
5. **Error handling** - Handle chain-specific errors gracefully
6. **Type safety** - Use viem chain types and TypeScript strict mode
