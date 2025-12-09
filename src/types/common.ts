/**
 * Common Types - Base type definitions shared across the SDK
 *
 * @module types/common
 */

/**
 * SignedU128 for TWAP threshold values
 */
export interface SignedU128 {
  value: bigint;
  isNegative: boolean;
}

// ============================================================================
// Unified Package and Shared Object Types
// ============================================================================

/**
 * All package IDs used across the SDK
 *
 * Single source of truth - services use what they need, ignore the rest.
 */
export interface Packages {
  // Protocol packages
  accountProtocol: string;
  accountActions: string;

  // Futarchy core packages
  futarchyCore: string;
  futarchyTypes: string;
  futarchyFactory: string;
  futarchyActions: string;

  // Governance packages
  futarchyGovernance: string;
  futarchyGovernanceActions: string;
  futarchyOracleActions: string;

  // Markets packages
  futarchyMarketsCore: string;
  futarchyMarketsPrimitives: string;
  futarchyMarketsOperations: string;

  // Optional packages
  oneShotUtils?: string;
}

/**
 * Reference to a shared object
 */
export interface SharedObjectRef {
  id: string;
  version: number;
}

/**
 * All shared objects used across the SDK
 *
 * Single source of truth - services use what they need, ignore the rest.
 */
export interface SharedObjects {
  factory: SharedObjectRef;
  feeManager: SharedObjectRef;
  packageRegistry: SharedObjectRef;
}
