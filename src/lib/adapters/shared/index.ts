/**
 * Shared utilities for protocol adapters.
 *
 * This module provides reusable infrastructure for multi-chain subgraph adapters:
 * - `createSubgraphClient` - Factory for creating urql GraphQL clients
 * - `createChainRegistry` - Factory for managing chain client registries
 * - Base types for chain clients and transformers
 */

export { createGraphQLClient, DEFAULT_SUBGRAPH_TIMEOUT } from './graphql-client'
export { createChainRegistry } from './chain-registry'
export type {
  ChainImporter,
  ChainRegistry,
  ChainRegistryOptions,
} from './chain-registry'
export type {
  BaseChainClient,
  BaseChainTransformers,
  ChainConfig,
} from './types'
