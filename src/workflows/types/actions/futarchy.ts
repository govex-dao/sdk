/**
 * Futarchy Action Configs
 *
 * Config, Quota, Liquidity, and Dissolution actions.
 *
 * @module workflows/types/actions/futarchy
 */

// ============================================================================
// FUTARCHY ACTIONS - CONFIG
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
 * NOTE: assetDecimals and stableDecimals removed - decimals are immutable in Sui coins
 * Read from sui::coin_registry::Currency<T> instead
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
  /** TWAP threshold for winning (u128 value in 1e18 scale) */
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
  /** If true, fees paid in AssetType; if false, fees paid in StableType */
  feeInAssetToken?: boolean;
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
  /** Waive advancement fees */
  waiveAdvancementFees?: boolean;
}

// ============================================================================
// FUTARCHY ACTIONS - QUOTA
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
// FUTARCHY ACTIONS - LIQUIDITY
// ============================================================================

/**
 * Pool creation with mint action configuration
 */
export interface CreatePoolWithMintActionConfig {
  type: 'create_pool_with_mint';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** Vault to withdraw stable from */
  vaultName: string;
  /** Amount of asset tokens to mint */
  assetAmount: bigint;
  /** Amount of stable tokens from vault */
  stableAmount: bigint;
  /** Fee in basis points (e.g., 30 = 0.3%) */
  feeBps: number;
  /** Launch fee duration in milliseconds (0 = no launch fee period) */
  launchFeeDurationMs?: bigint;
  /** LP coin type (e.g., "0x123::lp_coin::LP_COIN") */
  lpType: string;
  /** LP TreasuryCap object ID */
  lpTreasuryCapId: string;
  /** LP Currency<LPType> object ID (shared from coin_registry::finalize) */
  lpCurrencyId: string;
}

/**
 * Add liquidity to pool
 */
export interface AddLiquidityActionConfig {
  type: 'add_liquidity';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** LP coin type (required for type-safe staging) */
  lpType?: string;
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
 * Remove liquidity from pool to executable_resources
 * Outputs asset/stable coins for chaining to subsequent actions
 */
export interface RemoveLiquidityToResourcesActionConfig {
  type: 'remove_liquidity_to_resources';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** LP coin type (required for type-safe staging) */
  lpType?: string;
  /** LP token amount */
  lpAmount: bigint;
  /** Minimum asset out */
  minAssetOut: bigint;
  /** Minimum stable out */
  minStableOut: bigint;
  /** Resource name for LP coin input (from prior VaultSpend) */
  lpResourceName: string;
  /** Resource name for asset coin output */
  assetOutputName: string;
  /** Resource name for stable coin output */
  stableOutputName: string;
}

/**
 * Swap in pool
 */
export interface SwapActionConfig {
  type: 'swap';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** LP coin type (required for type-safe staging) */
  lpType?: string;
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
// FUTARCHY ACTIONS - DISSOLUTION
// ============================================================================

/**
 * Create dissolution capability
 */
export interface CreateDissolutionCapabilityActionConfig {
  type: 'create_dissolution_capability';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Recipient address */
  recipient: string;
}

