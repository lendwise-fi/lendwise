import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  overwrite: true,
  config: {
    // Ensure generated files have proper type annotations
    useTypeImports: true,
  },
  generates: {
    // AAVE
    // NOTE: Commented out until queries are properly implemented
    'src/lib/adapters/aave/gql/generated/': {
      schema: 'https://api.v3.aave.com/graphql',
      documents: 'src/lib/adapters/aave/gql/queries.ts',
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

    // COMPOUND
    // 'src/lib/adapters/compound/gql/generated/': {
    //   schema:
    //     'https://api.thegraph.com/subgraphs/name/compound-finance/compound-v3-mainnet',
    //   documents: 'src/lib/adapters/compound/gql/queries.ts',
    //   preset: 'client',
    // },
    // 'src/lib/adapters/compound/subgraph/ethereum/generated/': {
    //   schema:
    //     'https://api.thegraph.com/subgraphs/name/messari/compound-ethereum',
    //   documents: 'src/lib/adapters/compound/subgraph/ethereum/queries.ts',
    //   preset: 'client',
    // },
    // 'src/lib/adapters/compound/subgraph/arbitrum/generated/': {
    //   schema:
    //     'https://api.thegraph.com/subgraphs/name/messari/compound-arbitrum',
    //   documents: 'src/lib/adapters/compound/subgraph/arbitrum/queries.ts',
    //   preset: 'client',
    // },

    // MORPHO
    'src/lib/adapters/morpho/gql/generated/': {
      schema: 'https://api.morpho.org/graphql',
      documents: 'src/lib/adapters/morpho/gql/queries.ts',
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
    // 'src/lib/adapters/morpho/subgraph/arbitrum/generated/': {
    //   schema:
    //     'https://gateway.thegraph.com/api/9b0da1f7098ab2fd2e701f84324c48cc/subgraphs/id/XsJn88DNCHJ1kgTqYeTgHMQSK4LuG1LR75339QVeQ26',
    //   documents: 'src/lib/adapters/morpho/subgraph/arbitrum/queries.ts',
    //   preset: 'client',
    //   presetConfig: {
    //     fragmentMasking: false,
    //   },
    // },
  },
}

export default config
