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
  /** MetadataCap<AssetType> object ID - required for updating Currency metadata */
  metadataCap: string;
  /** Asset Currency<T> object ID from sui::coin_registry */
  assetCurrency: string;
  /** Stable Currency<T> object ID from sui::coin_registry */
  stableCurrency: string;

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
 * Configuration for completing a raise.
 *
 * This performs the core raise completion in a single PTB:
 * 1. settle_raise
 * 2. begin_dao_creation (creates intents)
 * 3. finalize_and_share_dao
 *
 * Actions are executed separately via AutoExecutor.
 */
export interface CompleteRaiseConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Asset Currency<T> object ID from sui::coin_registry */
  assetCurrency: string;
  /** Stable Currency<T> object ID from sui::coin_registry */
  stableCurrency: string;
}

