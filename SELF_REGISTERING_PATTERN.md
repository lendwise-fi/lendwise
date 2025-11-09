# Self-Registering Chain Pattern

## Problem Statement

Previously, we had to manually maintain a `CHAIN_CLIENTS` array in the main adapter:

```typescript
// ❌ Old approach - manual maintenance required
const CHAIN_CLIENTS: ChainClient[] = [
  {
    client: createChainClient(COMPOUND_V3_CHAINS[1].custom.subgraphUrl!, ...),  // Magic number!
    chainId: COMPOUND_V3_CHAINS[1].id,
    chainName: COMPOUND_V3_CHAINS[1].name,
  },
  // ... repeat for each chain
]
```

**Issues:**
- ❌ Magic numbers (`CHAINS[1]`, `CHAINS[8453]`)
- ❌ Redundant code - repeating chain info
- ❌ Manual maintenance - have to update array when adding/removing chains
- ❌ Error-prone - easy to forget to add a chain to the array

## Solution: Self-Registering Pattern

Each chain folder **registers itself** when imported. No manual array maintenance needed.

### How It Works

#### 1. Main Adapter Provides Registry

```typescript
// compound/v3/onchain/index.ts

// Registry to hold all registered chains
const chainRegistry: ChainClient[] = []

// Function for chains to register themselves
export function registerChain(config: ChainClient): void {
  chainRegistry.push(config)
}

// Import chain modules (they auto-register when imported)
import './ethereum'  // ✅ Registers Ethereum automatically
// import './base'     // ✅ Uncomment to enable Base
// import './polygon'  // ✅ Uncomment to enable Polygon

// Getter for registered chains
function getChainClients(): ChainClient[] {
  return chainRegistry
}

// Use registered chains
async function getUserLendPositions(addresses: Address[]) {
  const results = await Promise.allSettled(
    getChainClients().map(async ({ client, chainName, queries }) => {
      // Fetch from each registered chain
    })
  )
}
```

#### 2. Each Chain Registers Itself

```typescript
// compound/v3/onchain/ethereum/index.ts
import { mainnet } from 'viem/chains'
import { createChainClient, registerChain } from '../index'
import { COMPOUND_V3_CHAINS } from '../config'

const config = COMPOUND_V3_CHAINS[mainnet.id]

// Create client
const ethereumClient = createChainClient(
  config.custom.subgraphUrl!,
  process.env.COMPOUND_THEGRAPH_API_KEY
)

// ✅ Register this chain - that's it!
registerChain({
  client: ethereumClient,
  chainId: config.id,
  chainName: config.name,
})
```

#### 3. Chain with Custom Queries

```typescript
// compound/v3/onchain/base/index.ts
import { base } from 'viem/chains'
import { createChainClient, registerChain } from '../index'
import { COMPOUND_V3_CHAINS } from '../config'
import { USER_LEND_POSITIONS_BASE, USER_BORROW_POSITIONS_BASE } from './queries'

const config = COMPOUND_V3_CHAINS[base.id]

const baseClient = createChainClient(
  config.custom.subgraphUrl!,
  process.env.COMPOUND_THEGRAPH_API_KEY
)

// ✅ Register with custom queries
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

## Benefits

### ✅ Zero Boilerplate
No need to manually maintain a `CHAIN_CLIENTS` array. Each chain manages its own registration.

### ✅ Automatic Discovery
Just import the chain module and it's automatically included in data fetching.

### ✅ Easy to Enable/Disable
```typescript
// Enable/disable chains with a single line
import './ethereum'  // ✅ Enabled
// import './base'     // ❌ Disabled (commented out)
import './polygon'   // ✅ Enabled
```

### ✅ Type-Safe
The `registerChain` function enforces the correct structure at compile time.

### ✅ Decoupled
Each chain is completely independent. Adding a new chain doesn't require touching existing code.

### ✅ No Magic Numbers
No more `CHAINS[1]` or `CHAINS[8453]`. Everything is explicit and clear.

### ✅ Self-Documenting
Looking at the imports immediately shows which chains are active:
```typescript
import './ethereum'  // Active
import './base'      // Active
// import './polygon'  // Inactive
```

## Adding a New Chain

### Step 1: Add to Centralized Config

```typescript
// compound/config.ts
export const COMPOUND_CONFIG = {
  compound_v3: {
    chains: {
      [arbitrum.id]: {
        ...arbitrum,
        custom: {
          subgraphUrl: 'https://...',
        },
      },
    },
  },
}
```

### Step 2: Create Chain Folder

```typescript
// compound/v3/onchain/arbitrum/index.ts
import { arbitrum } from 'viem/chains'
import { createChainClient, registerChain } from '../index'
import { COMPOUND_V3_CHAINS } from '../config'

const config = COMPOUND_V3_CHAINS[arbitrum.id]

const arbitrumClient = createChainClient(
  config.custom.subgraphUrl!,
  process.env.COMPOUND_THEGRAPH_API_KEY
)

registerChain({
  client: arbitrumClient,
  chainId: config.id,
  chainName: config.name,
})
```

### Step 3: Import in Main Adapter

```typescript
// compound/v3/onchain/index.ts
import './ethereum'
import './base'
import './arbitrum'  // ✅ That's it! Chain is now active
```

## Comparison

### Before (Manual Array)
```typescript
// ❌ Lots of boilerplate
import { ethereumClient, ETHEREUM_CHAIN_ID, ETHEREUM_CHAIN_NAME } from './ethereum'
import { baseClient, BASE_CHAIN_ID, BASE_CHAIN_NAME } from './base'

const CHAIN_CLIENTS: ChainClient[] = [
  {
    client: ethereumClient,
    chainId: ETHEREUM_CHAIN_ID,
    chainName: ETHEREUM_CHAIN_NAME,
  },
  {
    client: baseClient,
    chainId: BASE_CHAIN_ID,
    chainName: BASE_CHAIN_NAME,
  },
]
```

### After (Self-Registration)
```typescript
// ✅ Clean and simple
import './ethereum'  // Auto-registers
import './base'      // Auto-registers
```

## Pattern Applicability

This pattern is ideal for:
- ✅ Multi-chain adapters (Compound, Morpho, AAVE)
- ✅ Plugin systems
- ✅ Modular architectures
- ✅ When you want to easily enable/disable modules
- ✅ When each module is independent

## Implementation Status

### Compound V3 ✅
- ✅ Self-registering pattern implemented
- ✅ Ethereum chain registered
- ⏳ Base chain (commented out - pending subgraph)
- ⏳ Polygon chain (commented out - pending subgraph)

### Morpho V1 ⏳
- ⏳ TODO: Implement self-registering pattern for onchain adapter

### AAVE V3 ⏳
- ⏳ TODO: Implement self-registering pattern for onchain adapter
