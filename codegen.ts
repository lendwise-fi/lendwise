/**
 * GraphQL Code Generator Configuration
 *
 * This file generates TypeScript types from GraphQL schemas for all protocol adapters.
 *
 * IMPORTANT: All schema URLs are imported from protocol config files to maintain
 * a single source of truth. Never hardcode URLs here - update the config files instead:
 * - AAVE: src/lib/adapters/aave/config.ts (offchainApiUrl)
 * - Morpho: src/lib/adapters/morpho/config.ts (offchainApiUrl)
 * - Compound: src/lib/adapters/compound/config.ts (chains[chainId].custom.subgraphUrl)
 */
import type { CodegenConfig } from '@graphql-codegen/cli'
import { config as loadEnv } from 'dotenv'
import { mainnet, optimism, polygon } from 'viem/chains'

import { AAVE_CONFIG } from './src/lib/adapters/aave/config'
import { COMPOUND_CONFIG } from './src/lib/adapters/compound/config'
import { MORPHO_CONFIG } from './src/lib/adapters/morpho/config'

// Load environment variables from .env file
loadEnv()

// Extract API URLs from configs (single source of truth)
const aaveV3ApiUrl = AAVE_CONFIG.aave_v3.offchainApiUrl
const aaveV3EthereumSubgraphUrl =
  AAVE_CONFIG.aave_v3.chains[mainnet.id]?.custom?.subgraphUrl

const morphoV1ApiUrl = MORPHO_CONFIG.morpho_v1.offchainApiUrl
const morphoV1EthereumSubgraphUrl =
  MORPHO_CONFIG.morpho_v1.chains[polygon.id]?.custom?.subgraphUrl

const compoundV3EthereumSubgraphUrl =
  COMPOUND_CONFIG.compound_v3.chains[mainnet.id]?.custom?.subgraphUrl

const compoundV3OptimismSubgraphUrl =
  COMPOUND_CONFIG.compound_v3.chains[optimism.id]?.custom?.subgraphUrl

if (!aaveV3ApiUrl || !aaveV3EthereumSubgraphUrl) {
  throw new Error(
    'AAVE V3 API URL not found in config. Please update src/lib/adapters/aave/config.ts'
  )
}

if (!morphoV1ApiUrl || !morphoV1EthereumSubgraphUrl) {
  throw new Error(
    'Morpho V1 API URL not found in config. Please update src/lib/adapters/morpho/config.ts'
  )
}

if (!compoundV3EthereumSubgraphUrl || !compoundV3OptimismSubgraphUrl) {
  throw new Error(
    'Compound V3 subgraph URL not found in config. Please update src/lib/adapters/compound/config.ts'
  )
}

const config: CodegenConfig = {
  overwrite: true,
  config: {
    // Ensure generated files have proper type annotations
    useTypeImports: true,
  },
  generates: {
    // AAVE V3 - Offchain (GraphQL API)
    // Schema URL is imported from src/lib/adapters/aave/config.ts
    'src/lib/adapters/aave/v3/offchain/generated/': {
      schema: aaveV3ApiUrl,
      documents: 'src/lib/adapters/aave/v3/offchain/queries.ts',
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
    },
    // AAVE V3 - Onchain (Subgraph)
    // Schema URL is imported from src/lib/adapters/aave/config.ts
    'src/lib/adapters/aave/v3/onchain/generated/': {
      schema: [
        {
          [aaveV3EthereumSubgraphUrl]: {
            headers: process.env.THEGRAPH_API_KEY
              ? {
                  Authorization: `Bearer ${process.env.THEGRAPH_API_KEY}`,
                }
              : {},
          },
        },
      ],
      documents: 'src/lib/adapters/aave/v3/onchain/queries.ts',
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
    },
    // 'src/lib/adapters/aave/subgraph/ethereum/generated/': {
    //   schema:
    //     'https://gateway.thegraph.com/api/9b0da1f7098ab2fd2e701f84324c48cc/subgraphs/id/Cd2gEDVeqnjBn1hSeqFMitw8Q1iiyV9FYUZkLNRcL87g',
    //   documents: 'src/lib/adapters/aave/subgraph/ethereum/queries.ts',
    //   preset: 'client',
    //   presetConfig: {
    //     fragmentMasking: false,
    //   },
    // },
    // 'src/lib/adapters/aave/subgraph/arbitrum/generated/': {
    //   schema:
    //     'https://gateway.thegraph.com/api/9b0da1f7098ab2fd2e701f84324c48cc/subgraphs/id/DLuE98kEb5pQNXAcKFQGQgfSQ57Xdou4jnVbAEqMfy3B',
    //   documents: 'src/lib/adapters/aave/subgraph/arbitrum/queries.ts',
    //   preset: 'client',
    //   presetConfig: {
    //     fragmentMasking: false,
    //   },
    // },

    // COMPOUND V3 - Onchain (Subgraph)
    // Schema URL is imported from src/lib/adapters/compound/config.ts
    'src/lib/adapters/compound/v3/onchain/generated/': {
      schema: [
        {
          [compoundV3EthereumSubgraphUrl]: {
            headers: process.env.THEGRAPH_API_KEY
              ? {
                  Authorization: `Bearer ${process.env.THEGRAPH_API_KEY}`,
                }
              : {},
          },
        },
      ],
      documents: 'src/lib/adapters/compound/v3/onchain/queries.ts',
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
    },
    'src/lib/adapters/compound/v3/onchain/optimism/generated/': {
      schema: [
        {
          [compoundV3OptimismSubgraphUrl]: {
            headers: process.env.THEGRAPH_API_KEY
              ? {
                  Authorization: `Bearer ${process.env.THEGRAPH_API_KEY}`,
                }
              : {},
          },
        },
      ],
      documents: 'src/lib/adapters/compound/v3/onchain/optimism/queries.ts',
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
    },

    // MORPHO V1 - Offchain (GraphQL API)
    // Schema URL is imported from src/lib/adapters/morpho/config.ts
    'src/lib/adapters/morpho/v1/offchain/generated/': {
      schema: morphoV1ApiUrl,
      documents: 'src/lib/adapters/morpho/v1/offchain/queries.ts',
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
    },
    // MORPHO V1 - Onchain (Subgraph)
    // Schema URL is imported from src/lib/adapters/morpho/config.ts
    'src/lib/adapters/morpho/v1/onchain/generated/': {
      schema: [
        {
          [morphoV1EthereumSubgraphUrl]: {
            headers: process.env.THEGRAPH_API_KEY
              ? {
                  Authorization: `Bearer ${process.env.THEGRAPH_API_KEY}`,
                }
              : {},
          },
        },
      ],
      documents: 'src/lib/adapters/morpho/v1/onchain/queries.ts',
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
    },
    // 'src/lib/adapters/morpho/subgraph/ethereum/generated/': {
    //   schema:
    //     'https://gateway.thegraph.com/api/9b0da1f7098ab2fd2e701f84324c48cc/subgraphs/id/EgcP7xm9H7dw7q219oLyxVUHuXySt3FCqrAa4HqVgRvu',
    //   documents: 'src/lib/adapters/morpho/subgraph/ethereum/queries.ts',
    //   preset: 'client',
    //   presetConfig: {
    //     fragmentMasking: false,
    //   },
    // },
  },
}

export default config
