/**
 * Intent Execution Types
 *
 * Configuration types for intent execution.
 *
 * @module workflows/types/intent
 */

import type { WorkflowBaseConfig, ObjectIdOrRef } from './common';


/**
 * Configuration for intent execution
 */
export interface IntentExecutionConfig extends WorkflowBaseConfig {
  /** Type of intent */
  intentType: 'launchpad' | 'proposal';
  /** Account object ID or full ObjectRef */
  accountId: ObjectIdOrRef;
  /** For launchpad: raise ID or full ObjectRef */
  raiseId?: ObjectIdOrRef;
  /** For proposal: proposal ID or full ObjectRef */
  proposalId?: ObjectIdOrRef;
  /** For proposal: escrow ID or full ObjectRef */
  escrowId?: ObjectIdOrRef;
  /** For proposal: spot pool ID or full ObjectRef */
  spotPoolId?: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** For proposal: LP type for spot pool */
  lpType?: string;
  /** Actions to execute (in order) */
  actions: IntentActionConfig[];
}

/**
 * Intent action configuration with type info for execution
 */
export type IntentActionConfig =
  // Account Protocol - Dependencies Management
  | { action: 'toggle_unverified_allowed' }
  | { action: 'add_dep' }
  | { action: 'remove_dep' }
  // Account Protocol - Owned Object Actions
  | { action: 'withdraw_object'; objectType: string }
  | { action: 'withdraw_coin'; coinType: string }
  // Account Actions - Stream
  | { action: 'create_stream'; coinType: string }
  | { action: 'cancel_stream'; coinType: string }
  // Account Actions - Vault
  | { action: 'deposit'; coinType: string }
  | { action: 'deposit_external'; coinType: string }
  | { action: 'spend'; coinType: string }
  | { action: 'approve_coin_type'; coinType: string }
  | { action: 'remove_approved_coin_type'; coinType: string }
  | { action: 'deposit_from_resources'; coinType: string }
  // Account Actions - Vesting
  | { action: 'create_vesting'; coinType: string }
  | { action: 'cancel_vesting'; coinType: string }
  // Account Actions - Currency
  | { action: 'return_treasury_cap'; coinType: string }
  | { action: 'mint'; coinType: string }
  | { action: 'burn'; coinType: string }
  | { action: 'disable_currency'; coinType: string }
  | { action: 'update_currency'; coinType: string }
  // Account Actions - Transfer (objects via provide_object)
  | { action: 'transfer'; objectType: string }
  | { action: 'transfer_to_sender'; objectType: string }
  // Account Actions - Transfer (coins via provide_coin)
  | { action: 'transfer_coin'; coinType: string }
  | { action: 'transfer_coin_to_sender'; coinType: string }
  // Account Actions - Package Upgrade
  | { action: 'upgrade_package' }
  | { action: 'commit_upgrade' }
  | { action: 'restrict_upgrade' }
  // Account Actions - Access Control
  | { action: 'borrow_access'; capType: string }
  | { action: 'return_access'; capType: string }
  // Account Actions - Memo
  | { action: 'memo' }
  // Futarchy Config Actions
  | { action: 'set_proposals_enabled' }
  | { action: 'terminate_dao' }
  | { action: 'update_dao_name' }
  | { action: 'update_trading_params' }
  | { action: 'update_dao_metadata' }
  | { action: 'update_twap_config' }
  | { action: 'update_governance' }
  | { action: 'update_metadata_table' }
  | { action: 'update_conditional_metadata' }
  | { action: 'update_sponsorship_config' }
  // Futarchy Quota Actions
  | { action: 'set_quotas' }
  // Futarchy Liquidity Actions
  | { action: 'create_pool_with_mint'; assetType: string; stableType: string; lpType: string; lpTreasuryCapId: string; lpCurrencyId: string }
  | { action: 'add_liquidity'; assetType: string; stableType: string }
  | { action: 'remove_liquidity_to_resources'; assetType: string; stableType: string; lpType: string }
  | { action: 'swap'; assetType: string; stableType: string }
  | { action: 'update_pool_fee'; assetType: string; stableType: string; lpType: string }
  // Futarchy Dissolution Actions
  | { action: 'create_dissolution_capability'; assetType: string }
  // Governance - Package Registry Actions
  | { action: 'add_package' }
  | { action: 'remove_package' }
  | { action: 'update_package_version' }
  | { action: 'update_package_metadata' }
  | { action: 'pause_account_creation' }
  | { action: 'unpause_account_creation' }
  // Governance - Protocol Admin Actions
  | { action: 'set_factory_paused' }
  | { action: 'disable_factory_permanently' }
  | { action: 'add_stable_type'; stableType: string }
  | { action: 'remove_stable_type'; stableType: string }
  | { action: 'update_dao_creation_fee' }
  | { action: 'update_proposal_fee' }
  | { action: 'update_verification_fee' }
  | { action: 'add_verification_level' }
  | { action: 'remove_verification_level' }
  | { action: 'withdraw_fees_to_treasury'; coinType: string }
  | { action: 'add_coin_fee_config'; coinType: string }
  | { action: 'update_coin_creation_fee'; coinType: string }
  | { action: 'update_coin_proposal_fee'; coinType: string }
  | { action: 'apply_pending_coin_fees'; coinType: string }
  // Oracle Actions
  | { action: 'create_oracle_grant'; assetType: string; stableType: string }
  | { action: 'cancel_oracle_grant'; assetType: string; stableType: string };
