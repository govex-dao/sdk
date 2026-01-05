/**
 * Proposal Workflow Types
 *
 * Configuration types for governance proposal workflows.
 *
 * @module workflows/types/proposal
 */

import type { WorkflowBaseConfig, ObjectIdOrRef } from './common';
import type { ActionConfig } from './actions';

/**
 * Configuration for creating a new proposal
 *
 * NOTE: For the atomic creation flow, use this config combined with AdvanceToReviewConfig
 * via createAndInitializeProposal() which creates the proposal and initializes it atomically.
 */
export interface CreateProposalConfig extends WorkflowBaseConfig {
  /** DAO account object ID or full ObjectRef */
  daoAccountId: ObjectIdOrRef;
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
  /** Fee payment coin object IDs (stable coins if feeInAsset=false, asset coins if feeInAsset=true) */
  feeCoins: string[];
  /** Fee amount */
  feeAmount: bigint;
  /** Whether fee is paid in asset token (true) or stable token (false, default) */
  feeInAsset?: boolean;
  /**
   * Actions to add to specific outcomes during atomic creation.
   * This is applied BEFORE finalizing the proposal.
   */
  outcomeActions?: Array<{
    outcomeIndex: number;
    actions: ActionConfig[];
    maxActionsPerOutcome?: number;
  }>;
  /** Package registry ID (required if outcomeActions is provided) */
  registryId?: ObjectIdOrRef;
}

/**
 * Configuration for adding actions to a proposal outcome
 *
 * SECURITY: Action packages are validated based on the account's authorization level.
 * See AuthorizationLevel enum for details on when checks occur.
 */
export interface AddProposalActionsConfig extends WorkflowBaseConfig {
  /** Proposal object ID or full ObjectRef */
  proposalId: ObjectIdOrRef;
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
  /** DAO account ID or full ObjectRef (for whitelist validation) */
  daoAccountId: ObjectIdOrRef;
  /** Package registry ID or full ObjectRef (for whitelist validation) */
  registryId: ObjectIdOrRef;
}

/**
 * Configuration for advancing proposal to review state
 *
 * NOTE: This is now used in combination with CreateProposalConfig for the atomic
 * createAndInitializeProposal() flow. The old separate advanceToReview() has been removed.
 */
export interface AdvanceToReviewConfig extends WorkflowBaseConfig {
  /** Proposal object ID or full ObjectRef (not needed for atomic creation) */
  proposalId?: ObjectIdOrRef;
  /** DAO account object ID or full ObjectRef */
  daoAccountId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool (third type parameter of UnifiedSpotPool) */
  lpType: string;
  /** Spot pool object ID or full ObjectRef */
  spotPoolId: ObjectIdOrRef;
  /** Sender address (for receiving unused fees back) */
  senderAddress: string;
  /** Base asset Currency<T> object ID (e.g., SUI Currency) - required for add_outcome_coins_to_proposal */
  baseAssetCurrencyId: ObjectIdOrRef;
  /**
   * Base stable Currency<T> object ID (e.g., USDC Currency)
   * @deprecated Use baseStableCurrencyId instead. This alias kept for backwards compatibility.
   */
  baseStableMetadataId?: ObjectIdOrRef;
  /** Base stable Currency<T> object ID (e.g., USDC Currency) - required for add_outcome_coins_to_proposal */
  baseStableCurrencyId?: ObjectIdOrRef;
  /** Conditional coin registry config (if using typed conditional coins from registry) */
  conditionalCoinsRegistry?: ConditionalCoinsRegistryConfig;
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
  /** Asset Currency<T> object ID (shared) - needed for add_outcome_coins_to_proposal */
  assetCurrencyId: string;
  /** Asset coin decimals (default: 9) - must match Currency<T>.decimals() */
  assetDecimals?: number;
  /** Stable conditional coin type (fully qualified) */
  stableCoinType: string;
  /** Stable TreasuryCap ID (used as key in registry) */
  stableCapId: string;
  /** Stable Currency<T> object ID (shared) - needed for add_outcome_coins_to_proposal */
  stableCurrencyId: string;
  /** Stable coin decimals (default: 6) - must match Currency<T>.decimals() */
  stableDecimals?: number;
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
 *
 * Gap Fee: When transitioning to TRADING, a gap fee may be charged based on time
 * since last proposal ended. The fee starts at 10000x proposal_creation_fee at t=0
 * and decays exponentially to 0 at t=12hr (30-minute half-life).
 *
 * - If 12+ hours have passed, no gap fee is charged
 * - Fee type must match DAO's fee_in_asset_token setting
 * - Excess fee is returned to the sender
 */
export interface AdvanceToTradingConfig extends WorkflowBaseConfig {
  /** Proposal object ID or full ObjectRef */
  proposalId: ObjectIdOrRef;
  /** DAO account object ID or full ObjectRef */
  daoAccountId: ObjectIdOrRef;
  /** Escrow object ID or full ObjectRef */
  escrowId: ObjectIdOrRef;
  /** Spot pool object ID or full ObjectRef */
  spotPoolId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool (third type parameter of UnifiedSpotPool) */
  lpType: string;
  /**
   * Gap fee coin object IDs. Pass coins of the correct type based on DAO's fee setting.
   * - If feeInAsset=true: pass asset coins here
   * - If feeInAsset=false: pass stable coins here
   * If 12+ hours have passed since last proposal, no fee is needed (pass empty array).
   */
  gapFeeCoins?: string[];
  /**
   * Maximum gap fee amount to pay. Any excess will be returned.
   * If not specified and gapFeeCoins are provided, the full coin value is used.
   */
  maxGapFee?: bigint;
  /**
   * Whether the gap fee is in asset token (true) or stable token (false).
   * Must match the DAO's fee_in_asset_token config setting.
   */
  feeInAsset?: boolean;
  /** Sender address (for receiving excess gap fee refund) */
  senderAddress: string;
}

/**
 * Configuration for finalizing a proposal
 */
export interface FinalizeProposalConfig extends WorkflowBaseConfig {
  /** Proposal object ID or full ObjectRef */
  proposalId: ObjectIdOrRef;
  /** Escrow object ID or full ObjectRef */
  escrowId: ObjectIdOrRef;
  /** Spot pool object ID or full ObjectRef */
  spotPoolId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool (third type parameter of UnifiedSpotPool) */
  lpType: string;
  /** DAO account object ID or full ObjectRef (optional, only needed if proposal uses daoAccountId) */
  daoAccountId?: ObjectIdOrRef;
}

// ============================================================================
// SWAP WORKFLOW TYPES
// ============================================================================

/**
 * Configuration for a spot swap
 */
export interface SpotSwapConfig extends WorkflowBaseConfig {
  /** Spot pool object ID or full ObjectRef */
  spotPoolId: ObjectIdOrRef;
  /** Proposal object ID or full ObjectRef (if during active proposal) */
  proposalId?: ObjectIdOrRef;
  /** Escrow object ID or full ObjectRef (if during active proposal) */
  escrowId?: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool */
  lpType: string;
  /** Direction of swap */
  direction: 'stable_to_asset' | 'asset_to_stable';
  /** Amount to swap (in input token) */
  amountIn: bigint;
  /** Minimum output amount */
  minAmountOut: bigint;
  /** Recipient address */
  recipient: string;
  /** Input coin object IDs */
  inputCoins: string[];
}

/**
 * Configuration for a conditional swap
 */
export interface ConditionalSwapConfig extends WorkflowBaseConfig {
  /** Escrow object ID or full ObjectRef */
  escrowId: ObjectIdOrRef;
  /** Spot pool object ID or full ObjectRef */
  spotPoolId: ObjectIdOrRef;
  /** Proposal object ID or full ObjectRef */
  proposalId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool */
  lpType: string;
  /** Outcome index to swap in (this is where the swap will occur) */
  outcomeIndex: number;
  /** Direction of swap */
  direction: 'stable_to_asset' | 'asset_to_stable';
  /** Amount to swap */
  amountIn: bigint;
  /** Minimum output amount */
  minAmountOut: bigint;
  /** Recipient address */
  recipient: string;
  /**
   * All conditional coin types for each outcome
   * Key is outcome index (0, 1, etc.)
   * Required because stable splitting must happen across ALL outcomes
   */
  allOutcomeCoins: Array<{
    outcomeIndex: number;
    assetCoinType: string;
    stableCoinType: string;
  }>;
  /** Input stable coins (for splitting) */
  stableCoins: string[];
}

