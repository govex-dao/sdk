/**
 * Launchpad Workflow Types
 *
 * Configuration types for launchpad (token raise) workflows.
 *
 * @module workflows/types/launchpad
 */

import type { WorkflowBaseConfig, ObjectIdOrRef } from './common';
import type { ActionConfig } from './actions';


/**
 * Configuration for creating a new raise
 */
export interface CreateRaiseConfig extends WorkflowBaseConfig {
  /** Asset token type (e.g., "0x123::coin::COIN") */
  assetType: string;
  /** Stable token type (e.g., "0x2::sui::SUI") */
  stableType: string;
  /** Treasury cap object ID */
  treasuryCap: string;
  /** Coin metadata object ID */
  coinMetadata: string;

  /** Number of tokens for sale */
  tokensForSale: bigint;
  /** Minimum raise amount (in stable) */
  minRaiseAmount: bigint;

  /** Allowed contribution caps (array of amounts) */
  allowedCaps: bigint[];
  /** Allow early completion when max is reached */
  allowEarlyCompletion: boolean;

  /** Start delay in milliseconds */
  startDelayMs?: number;
  /** Description of the raise */
  description: string;
  /** Optional affiliate ID */
  affiliateId?: string;
  /** Optional metadata keys */
  metadataKeys?: string[];
  /** Optional metadata values */
  metadataValues?: string[];
  /** Launchpad fee amount (in SUI MIST) */
  launchpadFee: bigint;
}

/**
 * Configuration for staging success/failure actions
 */
export interface StageActionsConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Creator cap object ID or full ObjectRef */
  creatorCapId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Actions to stage */
  actions: ActionConfig[];
  /** Whether these are success or failure actions */
  outcome: 'success' | 'failure';
}

/**
 * Configuration for contributing to a raise
 */
export interface ContributeConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Amount to contribute (in stable) */
  amount: bigint;
  /** Cap tier to use (or UNLIMITED_CAP) */
  capTier: bigint;
  /** Crank fee amount */
  crankFee: bigint;
  /** Stable coin object IDs to use for payment */
  stableCoins: string[];
}

/**
 * Configuration for completing a raise
 */
export interface CompleteRaiseConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
}

/**
 * Configuration for executing launchpad init actions
 */
export interface ExecuteLaunchpadActionsConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Account (DAO) object ID or full ObjectRef */
  accountId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Action types to execute (in order) */
  actionTypes: LaunchpadActionType[];
}

/**
 * Supported launchpad action types for execution
 */
export type LaunchpadActionType =
  | { type: 'create_stream'; coinType: string }
  | { type: 'create_pool_with_mint'; assetType: string; stableType: string; lpType: string; lpTreasuryCapId: string; lpMetadataId: string }
  | { type: 'update_trading_params' }
  | { type: 'update_twap_config' }
  | { type: 'update_governance' }
  | { type: 'return_treasury_cap'; coinType: string }
  | { type: 'return_metadata'; coinType: string }
  | { type: 'mint'; coinType: string }
  | { type: 'transfer_coin'; coinType: string }
  | { type: 'deposit'; coinType: string }
  | { type: 'deposit_from_resources'; coinType: string };

