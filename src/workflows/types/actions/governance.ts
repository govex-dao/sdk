/**
 * Governance Action Configs
 *
 * Package Registry and Protocol Admin actions.
 *
 * @module workflows/types/actions/governance
 */

// ============================================================================
// GOVERNANCE ACTIONS - PACKAGE REGISTRY
// ============================================================================

/**
 * Add package to registry
 */
export interface AddPackageActionConfig {
  type: 'add_package';
  /** Package name */
  name: string;
  /** Package address */
  addr: string;
  /** Package version */
  version: bigint;
  /** Action types as strings */
  actionTypes: string[];
  /** Category */
  category: string;
  /** Description */
  description: string;
}

/**
 * Remove package from registry
 */
export interface RemovePackageActionConfig {
  type: 'remove_package';
  /** Package name */
  name: string;
}

/**
 * Update package version
 */
export interface UpdatePackageVersionActionConfig {
  type: 'update_package_version';
  /** Package name */
  name: string;
  /** New package address */
  addr: string;
  /** New version */
  version: bigint;
}

/**
 * Update package metadata
 */
export interface UpdatePackageMetadataActionConfig {
  type: 'update_package_metadata';
  /** Package name */
  name: string;
  /** New action types */
  newActionTypes: string[];
  /** New category */
  newCategory: string;
  /** New description */
  newDescription: string;
}

// ============================================================================
// GOVERNANCE ACTIONS - PROTOCOL ADMIN
// ============================================================================

/**
 * Set factory paused state
 */
export interface SetFactoryPausedActionConfig {
  type: 'set_factory_paused';
  /** Paused state */
  paused: boolean;
}

/**
 * Disable factory permanently (IRREVERSIBLE)
 */
export interface DisableFactoryPermanentlyActionConfig {
  type: 'disable_factory_permanently';
}

/**
 * Add stable type to factory whitelist
 */
export interface AddStableTypeActionConfig {
  type: 'add_stable_type';
  /** Stable coin type */
  stableType: string;
}

/**
 * Remove stable type from factory whitelist
 */
export interface RemoveStableTypeActionConfig {
  type: 'remove_stable_type';
  /** Stable coin type */
  stableType: string;
}

/**
 * Update DAO creation fee
 */
export interface UpdateDaoCreationFeeActionConfig {
  type: 'update_dao_creation_fee';
  /** New fee */
  newFee: bigint;
}

/**
 * Update proposal fee per outcome
 */
export interface UpdateProposalFeeActionConfig {
  type: 'update_proposal_fee';
  /** New fee per outcome */
  newFeePerOutcome: bigint;
}

/**
 * Update verification fee for a level
 */
export interface UpdateVerificationFeeActionConfig {
  type: 'update_verification_fee';
  /** Verification level */
  level: number;
  /** New fee */
  newFee: bigint;
}

/**
 * Add verification level
 */
export interface AddVerificationLevelActionConfig {
  type: 'add_verification_level';
  /** Level number */
  level: number;
  /** Fee for this level */
  fee: bigint;
}

/**
 * Remove verification level
 */
export interface RemoveVerificationLevelActionConfig {
  type: 'remove_verification_level';
  /** Level number */
  level: number;
}

/**
 * Withdraw fees to treasury
 */
export interface WithdrawFeesToTreasuryActionConfig {
  type: 'withdraw_fees_to_treasury';
  /** Coin type to withdraw (required for type-safe staging) */
  coinType?: string;
  /** Vault name */
  vaultName: string;
  /** Amount to withdraw */
  amount: bigint;
}

/**
 * Add coin fee configuration
 */
export interface AddCoinFeeConfigActionConfig {
  type: 'add_coin_fee_config';
  /** Coin type */
  coinType: string;
  /** Decimals */
  decimals: number;
  /** DAO creation fee */
  daoCreationFee: bigint;
  /** Proposal fee per outcome */
  proposalFeePerOutcome: bigint;
}

/**
 * Update coin creation fee (with delay)
 */
export interface UpdateCoinCreationFeeActionConfig {
  type: 'update_coin_creation_fee';
  /** Coin type */
  coinType: string;
  /** New fee */
  newFee: bigint;
}

/**
 * Update coin proposal fee (with delay)
 */
export interface UpdateCoinProposalFeeActionConfig {
  type: 'update_coin_proposal_fee';
  /** Coin type */
  coinType: string;
  /** New fee per outcome */
  newFeePerOutcome: bigint;
}

/**
 * Apply pending coin fees after delay
 */
export interface ApplyPendingCoinFeesActionConfig {
  type: 'apply_pending_coin_fees';
  /** Coin type */
  coinType: string;
}

// ============================================================================
