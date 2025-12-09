/**
 * Proposal Service Types - Configuration types for proposal operations
 *
 * @module types/services/proposal
 */

import { ActionConfig } from '../protocol/actions';
import { IntentActionConfig } from './execution';

/**
 * Configuration for creating a new proposal
 */
export interface CreateProposalConfig {
  /** DAO account object ID */
  daoAccountId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Proposal title */
  title: string;
  /** Introduction/description */
  introduction: string;
  /** Metadata JSON string */
  metadata: string;
  /** Outcome messages (e.g., ["Reject", "Accept"]) */
  outcomeMessages: string[];
  /** Outcome details/descriptions */
  outcomeDetails: string[];
  /** Proposer address */
  proposer: string;
  /** Treasury address for fees */
  treasuryAddress: string;
  /** Whether to use quota */
  usedQuota: boolean;
  /** Fee payment coin object IDs */
  feeCoins: string[];
  /** Fee amount */
  feeAmount: bigint;
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for adding actions to a proposal outcome
 */
export interface AddProposalActionsConfig {
  /** Proposal object ID */
  proposalId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Outcome index (0 = Reject, 1 = Accept, etc.) */
  outcomeIndex: number;
  /** Actions to add */
  actions: ActionConfig[];
  /** Max actions per outcome (default 10) */
  maxActionsPerOutcome?: number;
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for starting a proposal (stage actions + advance to review)
 */
export interface StartProposalConfig {
  /** Proposal object ID */
  proposalId: string;
  /** DAO account object ID */
  daoAccountId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool */
  lpType: string;
  /** Spot pool object ID */
  spotPoolId: string;
  /** Sender address (for receiving unused fees back) */
  senderAddress: string;
  /** Actions per outcome (key = outcome index, value = actions) */
  outcomeActions: Record<number, ActionConfig[]>;
  /** Max actions per outcome (default 10) */
  maxActionsPerOutcome?: number;
  /** Conditional coin registry config (if using typed conditional coins) */
  conditionalCoinsRegistry?: ConditionalCoinsRegistryConfig;
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for advancing proposal to review state
 */
export interface AdvanceToReviewConfig {
  /** Proposal object ID */
  proposalId: string;
  /** DAO account object ID */
  daoAccountId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool (third type parameter of UnifiedSpotPool) */
  lpType: string;
  /** Spot pool object ID */
  spotPoolId: string;
  /** Sender address (for receiving unused fees back) */
  senderAddress: string;
  /** Conditional coin registry config (if using typed conditional coins from registry) */
  conditionalCoinsRegistry?: ConditionalCoinsRegistryConfig;
  /** Clock object ID */
  clockId?: string;
}

/**
 * Conditional coin set configuration for a single outcome
 */
export interface ConditionalCoinSetConfig {
  /** Outcome index */
  outcomeIndex: number;
  /** Asset conditional coin type (fully qualified) */
  assetCoinType: string;
  /** Asset TreasuryCap ID (used as key in registry) */
  assetCapId: string;
  /** Stable conditional coin type (fully qualified) */
  stableCoinType: string;
  /** Stable TreasuryCap ID (used as key in registry) */
  stableCapId: string;
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for conditional coins from a registry
 */
export interface ConditionalCoinsRegistryConfig {
  /** CoinRegistry object ID that holds the conditional coin caps */
  registryId: string;
  /** Coin sets per outcome */
  coinSets: ConditionalCoinSetConfig[];
}

/**
 * Configuration for advancing proposal to trading state
 */
export interface AdvanceToTradingConfig {
  /** Proposal object ID */
  proposalId: string;
  /** DAO account object ID */
  daoAccountId: string;
  /** Escrow object ID */
  escrowId: string;
  /** Spot pool object ID */
  spotPoolId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool (third type parameter of UnifiedSpotPool) */
  lpType: string;
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for finalizing a proposal
 */
export interface FinalizeProposalConfig {
  /** Proposal object ID */
  proposalId: string;
  /** DAO account object ID */
  daoAccountId: string;
  /** Escrow object ID */
  escrowId: string;
  /** Spot pool object ID */
  spotPoolId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool (third type parameter of UnifiedSpotPool) */
  lpType: string;
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for executing proposal actions
 */
export interface ExecuteProposalActionsConfig {
  /** Proposal object ID */
  proposalId: string;
  /** DAO account object ID */
  daoAccountId: string;
  /** Escrow object ID */
  escrowId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Action types to execute (in order) */
  actionTypes: IntentActionConfig[];
  /** Clock object ID */
  clockId?: string;
}

/**
 * Supported proposal action types for execution
 */
export type ProposalActionType =
  | { type: 'create_stream'; coinType: string }
  | { type: 'mint'; coinType: string }
  | { type: 'burn'; coinType: string }
  | { type: 'deposit'; coinType: string }
  | { type: 'withdraw'; coinType: string }
  | { type: 'transfer'; objectType: string }
  | { type: 'memo' };

/**
 * Configuration for spot swap during an active proposal
 */
export interface ProposalSpotSwapConfig {
  /** Spot pool object ID */
  spotPoolId: string;
  /** Proposal object ID */
  proposalId: string;
  /** Escrow object ID */
  escrowId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type */
  lpType: string;
  /** Swap direction */
  direction: 'stable_to_asset' | 'asset_to_stable';
  /** Amount to swap */
  amountIn: bigint;
  /** Minimum output amount */
  minAmountOut: bigint;
  /** Recipient address */
  recipient: string;
  /** Input coin object IDs */
  inputCoins: string[];
  /** Clock object ID */
  clockId?: string;
}
