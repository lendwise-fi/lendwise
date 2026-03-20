/**
 * Yield Optimizer API Client
 * Calls the local proxy API at /api/optimizer
 *
 * API Documentation: https://yieldoptimizer-api.onrender.com/redoc
 *
 * Types are auto-generated from OpenAPI spec.
 * Run `pnpm codegen:optimizer` to regenerate types.
 */
import type { components, paths } from './optimizer.generated'

// ============================================================================
// Re-export generated types with convenient aliases
// ============================================================================

// Schemas
export type MarketData = components['schemas']['MarketData']
export type AllocationResult = components['schemas']['AllocationResult']
export type VaultAllocationRequest =
  components['schemas']['VaultAllocationRequest']
export type VaultAllocationResult =
  components['schemas']['VaultAllocationResult']
export type VaultAllocationResponse =
  components['schemas']['VaultAllocationResponse']
export type OptimalBorrowRequest = components['schemas']['OptimalBorrowRequest']
export type OptimalCollateralRequest =
  components['schemas']['OptimalCollateralRequest']
export type OptimizationResponse = components['schemas']['OptimizationResponse']
export type BreakpointsBorrowRequest =
  components['schemas']['BreakpointsBorrowRequest']
export type BreakpointsCollateralRequest =
  components['schemas']['BreakpointsCollateralRequest']
export type BreakpointsResponse = components['schemas']['BreakpointsResponse']

// ============================================================================
// Endpoints
// ============================================================================

export type OptimizerEndpoint = keyof paths

export const OPTIMIZER_ENDPOINTS = {
  HEALTH: '/health',
  OPTIMIZE_VAULTS: '/optimize/vaults',
  OPTIMIZE_BORROW: '/optimize/borrow',
  OPTIMIZE_COLLATERAL: '/optimize/collateral',
  BREAKPOINTS_BORROW: '/breakpoints/borrow',
  BREAKPOINTS_COLLATERAL: '/breakpoints/collateral',
} as const satisfies Record<string, OptimizerEndpoint>

// ============================================================================
// Diversification Levels
// ============================================================================

export const DIVERSIFICATION_LEVELS = {
  HIGH: 80,
  MODERATE: 60,
  LOW: 40,
  NONE: 0,
} as const

export type DiversificationLevel = keyof typeof DIVERSIFICATION_LEVELS

// ============================================================================
// Generic API Client
// ============================================================================

/**
 * Generic function to call the optimizer API proxy
 */
async function callOptimizer<TRequest, TResponse>(
  endpoint: OptimizerEndpoint,
  data?: TRequest
): Promise<TResponse> {
  const response = await fetch('/api/optimizer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ endpoint, data }),
  })

  if (!response.ok) {
    const errorData = (await response.json()) as { error?: string }
    throw new Error(errorData.error || `API error: ${response.status}`)
  }

  return response.json()
}

// ============================================================================
// API Functions
// ============================================================================

/** Health check */
export function healthCheck(): Promise<Record<string, unknown>> {
  return callOptimizer(OPTIMIZER_ENDPOINTS.HEALTH)
}

/** Optimize vault allocation for supplying */
export function optimizeVaults(
  request: VaultAllocationRequest
): Promise<VaultAllocationResponse> {
  return callOptimizer(OPTIMIZER_ENDPOINTS.OPTIMIZE_VAULTS, request)
}

/** Optimize borrowing allocation across markets */
export function optimizeBorrow(
  request: OptimalBorrowRequest
): Promise<OptimizationResponse> {
  return callOptimizer(OPTIMIZER_ENDPOINTS.OPTIMIZE_BORROW, request)
}

/** Optimize collateral allocation across markets */
export function optimizeCollateral(
  request: OptimalCollateralRequest
): Promise<OptimizationResponse> {
  return callOptimizer(OPTIMIZER_ENDPOINTS.OPTIMIZE_COLLATERAL, request)
}

/** Get omega breakpoints for borrowing optimization */
export function getBreakpointsBorrow(
  request: BreakpointsBorrowRequest
): Promise<BreakpointsResponse> {
  return callOptimizer(OPTIMIZER_ENDPOINTS.BREAKPOINTS_BORROW, request)
}

/** Get omega breakpoints for collateral optimization */
export function getBreakpointsCollateral(
  request: BreakpointsCollateralRequest
): Promise<BreakpointsResponse> {
  return callOptimizer(OPTIMIZER_ENDPOINTS.BREAKPOINTS_COLLATERAL, request)
}
