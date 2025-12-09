/**
 * Action Types - All action configuration types for staging intents
 *
 * @module types/protocol/actions
 */

import { TierSpec } from '../oracle';

// Re-export all action types
export * from './account';
export * from './dao';
export * from './governance';

// Import union types for the combined ActionConfig
import { AccountActionConfig } from './account';
import { DAOActionConfig } from './dao';
import { GovernanceActionConfig } from './governance';

// ============================================================================
// ORACLE ACTIONS
// ============================================================================

/**
 * Create oracle grant with price-based unlocks
 */
export interface CreateOracleGrantActionConfig {
  type: 'create_oracle_grant';
  /** Tier specifications */
  tierSpecs: TierSpec[];
  /** Use relative pricing */
  useRelativePricing: boolean;
  /** Launchpad multiplier */
  launchpadMultiplier: bigint;
  /** Earliest execution offset (ms) */
  earliestExecutionOffsetMs: bigint;
  /** Grant expiry in years */
  expiryYears: bigint;
  /** Whether grant is cancelable */
  cancelable: boolean;
  /** Description */
  description: string;
}

/**
 * Cancel oracle grant
 */
export interface CancelOracleGrantActionConfig {
  type: 'cancel_oracle_grant';
  /** Grant ID to cancel */
  grantId: string;
}

/**
 * Union of oracle action configurations
 */
export type OracleActionConfig =
  | CreateOracleGrantActionConfig
  | CancelOracleGrantActionConfig;

// ============================================================================
// UNION OF ALL ACTION CONFIGS
// ============================================================================

/**
 * Union of all action configurations for staging
 */
export type ActionConfig =
  | AccountActionConfig
  | DAOActionConfig
  | GovernanceActionConfig
  | OracleActionConfig;
