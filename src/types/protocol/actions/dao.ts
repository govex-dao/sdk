/**
 * DAO Action Types - Action configurations for DAO/Futarchy operations
 *
 * Includes: Config, Quota, Liquidity, Dissolution
 *
 * @module types/protocol/actions/dao
 */

import { SignedU128 } from '@/types/common';

// ============================================================================
// FUTARCHY CONFIG ACTIONS
// ============================================================================

/**
 * Set proposals enabled/disabled
 */
export interface SetProposalsEnabledActionConfig {
  type: 'set_proposals_enabled';
  /** Whether proposals are enabled */
  enabled: boolean;
}

/**
 * Terminate DAO permanently
 */
export interface TerminateDaoActionConfig {
  type: 'terminate_dao';
  /** Reason for termination */
  reason: string;
  /** Delay before dissolution unlocks (ms) */
  dissolutionUnlockDelayMs: bigint;
}

/**
 * Update DAO name
 */
export interface UpdateDaoNameActionConfig {
  type: 'update_dao_name';
  /** New name */
  newName: string;
}

/**
 * Update trading params action configuration
 */
export interface UpdateTradingParamsActionConfig {
  type: 'update_trading_params';
  /** Minimum asset amount for proposals */
  minAssetAmount?: bigint;
  /** Minimum stable amount for proposals */
  minStableAmount?: bigint;
  /** Review period in ms */
  reviewPeriodMs?: bigint;
  /** Trading period in ms */
  tradingPeriodMs?: bigint;
  /** AMM total fee in basis points */
  ammTotalFeeBps?: number;
}

/**
 * Update DAO metadata
 */
export interface UpdateDaoMetadataActionConfig {
  type: 'update_dao_metadata';
  /** DAO name (ASCII) */
  daoName?: string;
  /** Icon URL */
  iconUrl?: string;
  /** Description */
  description?: string;
}

/**
 * Update TWAP config action configuration
 */
export interface UpdateTwapConfigActionConfig {
  type: 'update_twap_config';
  /** Start delay for TWAP accumulation */
  startDelay?: bigint;
  /** Maximum step for TWAP */
  stepMax?: bigint;
  /** Initial observation value */
  initialObservation?: bigint;
  /** TWAP threshold for winning (raw bigint value, will be converted to SignedU128) */
  threshold?: bigint;
}

/**
 * Update governance settings
 */
export interface UpdateGovernanceActionConfig {
  type: 'update_governance';
  /** Maximum outcomes per proposal */
  maxOutcomes?: bigint;
  /** Maximum actions per outcome */
  maxActionsPerOutcome?: bigint;
  /** Required bond amount */
  requiredBondAmount?: bigint;
  /** Maximum intents per outcome */
  maxIntentsPerOutcome?: bigint;
  /** Proposal intent expiry (ms) */
  proposalIntentExpiryMs?: bigint;
  /** Optimistic challenge fee */
  optimisticChallengeFee?: bigint;
  /** Optimistic challenge period (ms) */
  optimisticChallengePeriodMs?: bigint;
  /** Proposal creation fee */
  proposalCreationFee?: bigint;
  /** Proposal fee per outcome */
  proposalFeePerOutcome?: bigint;
  /** Accept new proposals */
  acceptNewProposals?: boolean;
  /** Enable premarket reservation lock */
  enablePremarketReservationLock?: boolean;
  /** Show proposal details */
  showProposalDetails?: boolean;
}

/**
 * Update metadata table
 */
export interface UpdateMetadataTableActionConfig {
  type: 'update_metadata_table';
  /** Keys to add/update */
  keys: string[];
  /** Values for keys */
  values: string[];
  /** Keys to remove */
  keysToRemove: string[];
}

/**
 * Update conditional metadata configuration
 */
export interface UpdateConditionalMetadataActionConfig {
  type: 'update_conditional_metadata';
  /** Use outcome index in metadata */
  useOutcomeIndex?: boolean;
  /** Conditional metadata settings (null to clear) */
  conditionalMetadata?: {
    prefix: string;
    suffix: string;
  } | null;
}

/**
 * Update sponsorship configuration
 */
export interface UpdateSponsorshipConfigActionConfig {
  type: 'update_sponsorship_config';
  /** Enable sponsorship */
  enabled?: boolean;
  /** Sponsored threshold (SignedU128) */
  sponsoredThreshold?: SignedU128;
  /** Waive advancement fees */
  waiveAdvancementFees?: boolean;
  /** Default sponsor quota amount */
  defaultSponsorQuotaAmount?: bigint;
}

// ============================================================================
// FUTARCHY QUOTA ACTIONS
// ============================================================================

/**
 * Set quotas for addresses
 */
export interface SetQuotasActionConfig {
  type: 'set_quotas';
  /** Addresses to set quotas for */
  addresses: string[];
  /** Quota amounts */
  amounts: bigint[];
}

// ============================================================================
// FUTARCHY LIQUIDITY ACTIONS
// ============================================================================

/**
 * Pool creation with mint action configuration
 */
export interface CreatePoolWithMintActionConfig {
  type: 'create_pool_with_mint';
  /** Vault to withdraw stable from */
  vaultName: string;
  /** Amount of asset tokens to mint */
  assetAmount: bigint;
  /** Amount of stable tokens from vault */
  stableAmount: bigint;
  /** Fee in basis points (e.g., 30 = 0.3%) */
  feeBps: number;
  /** LP coin type (e.g., "0x123::lp_coin::LP_COIN") */
  lpType: string;
  /** LP TreasuryCap object ID */
  lpTreasuryCapId: string;
  /** LP CoinMetadata object ID */
  lpMetadataId: string;
}

/**
 * Add liquidity to pool
 */
export interface AddLiquidityActionConfig {
  type: 'add_liquidity';
  /** Asset vault name */
  assetVaultName: string;
  /** Stable vault name */
  stableVaultName: string;
  /** Asset amount */
  assetAmount: bigint;
  /** Stable amount */
  stableAmount: bigint;
  /** Minimum LP tokens */
  minLpTokens: bigint;
}

/**
 * Remove liquidity from pool
 */
export interface RemoveLiquidityActionConfig {
  type: 'remove_liquidity';
  /** LP token amount */
  lpAmount: bigint;
  /** Minimum asset out */
  minAssetOut: bigint;
  /** Minimum stable out */
  minStableOut: bigint;
  /** Asset vault name */
  assetVaultName: string;
  /** Stable vault name */
  stableVaultName: string;
}

/**
 * Swap in pool
 */
export interface SwapActionConfig {
  type: 'swap';
  /** Amount in */
  amountIn: bigint;
  /** Minimum amount out */
  minAmountOut: bigint;
  /** Swap direction */
  direction: 'asset_to_stable' | 'stable_to_asset';
  /** Input vault name */
  inputVaultName: string;
  /** Output vault name */
  outputVaultName: string;
}

// ============================================================================
// FUTARCHY DISSOLUTION ACTIONS
// ============================================================================

/**
 * Create dissolution capability
 */
export interface CreateDissolutionCapabilityActionConfig {
  type: 'create_dissolution_capability';
  /** Recipient address */
  recipient: string;
}

/**
 * Union of all DAO action configurations
 */
export type DAOActionConfig =
  // Config
  | SetProposalsEnabledActionConfig
  | TerminateDaoActionConfig
  | UpdateDaoNameActionConfig
  | UpdateTradingParamsActionConfig
  | UpdateDaoMetadataActionConfig
  | UpdateTwapConfigActionConfig
  | UpdateGovernanceActionConfig
  | UpdateMetadataTableActionConfig
  | UpdateConditionalMetadataActionConfig
  | UpdateSponsorshipConfigActionConfig
  // Quota
  | SetQuotasActionConfig
  // Liquidity
  | CreatePoolWithMintActionConfig
  | AddLiquidityActionConfig
  | RemoveLiquidityActionConfig
  | SwapActionConfig
  // Dissolution
  | CreateDissolutionCapabilityActionConfig;
