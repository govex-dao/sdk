/**
 * Package Types
 *
 * Types for package IDs and shared objects.
 *
 * @module types/services/packages
 */

/**
 * All package IDs used by the SDK
 */
export interface Packages {
  accountProtocol: string;
  accountActions: string;
  futarchyCore: string;
  futarchyTypes: string;
  futarchyFactory: string;
  futarchyActions: string;
  futarchyGovernance: string;
  futarchyGovernanceActions: string;
  futarchyOracleActions: string;
  futarchyMarketsCore: string;
  futarchyMarketsPrimitives: string;
  futarchyMarketsOperations: string;
  futarchyLaunchpad?: string;
  oneShotUtils?: string;
}

/**
 * Reference to a shared object with ID and version
 */
export interface SharedObjectRef {
  id: string;
  version: number;
}

/**
 * Shared objects used by the SDK
 */
export interface SharedObjects {
  factory: SharedObjectRef;
  packageRegistry: SharedObjectRef;
  feeManager: SharedObjectRef;
}

/**
 * Admin capability reference
 */
export interface AdminCapRef {
  name: string;
  objectId: string;
}

/**
 * Full SDK context with all references
 */
export interface SDKContext {
  packages: Packages;
  sharedObjects: SharedObjects;
  adminCaps?: AdminCapRef[];
}
