/**
 * Launchpad Service Types - Configuration types for launchpad operations
 *
 * @module types/services/launchpad
 */

import { ActionConfig } from '../protocol/actions';

/**
 * Configuration for creating a new raise
 */
export interface CreateRaiseConfig {
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
  /** Maximum raise amount (in stable) */
  maxRaiseAmount?: bigint;

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
  /** Extra tokens to mint and return to caller (for creator allocation) */
  extraMintToCaller?: bigint;
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for staging success/failure actions
 */
export interface StageActionsConfig {
  /** Raise object ID */
  raiseId: string;
  /** Creator cap object ID */
  creatorCapId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Actions to stage */
  actions: ActionConfig[];
  /** Whether these are success or failure actions */
  outcome: 'success' | 'failure';
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for contributing to a raise
 */
export interface ContributeConfig {
  /** Raise object ID */
  raiseId: string;
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
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for completing a raise
 */
export interface CompleteRaiseConfig {
  /** Raise object ID */
  raiseId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for executing launchpad init actions
 */
export interface ExecuteLaunchpadActionsConfig {
  /** Raise object ID */
  raiseId: string;
  /** Account (DAO) object ID */
  accountId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Action types to execute (in order) */
  actionTypes: LaunchpadActionType[];
  /** Clock object ID */
  clockId?: string;
}

/**
 * Supported launchpad action types for execution
 */
export type LaunchpadActionType =
  | { type: 'create_stream'; coinType: string }
  | { type: 'create_pool_with_mint'; assetType: string; stableType: string; lpType: string; lpTreasuryCapId: string; lpMetadataId: string }
  | { type: 'update_trading_params' }
  | { type: 'update_twap_config' }
  | { type: 'return_treasury_cap'; coinType: string }
  | { type: 'return_metadata'; coinType: string };
