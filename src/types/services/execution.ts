/**
 * Intent Execution Types - Types for executing intents
 *
 * @module types/protocol/execution
 */

import { Transaction } from '@mysten/sui/transactions';

/**
 * Callback to prepend calls to the transaction before intent execution
 */
export type PrependCallsFn = (tx: Transaction) => void;

/**
 * Configuration for intent execution
 */
export interface IntentExecutionConfig {
  /** Type of intent */
  intentType: 'launchpad' | 'proposal';
  /** Account object ID */
  accountId: string;
  /** For launchpad: raise ID */
  raiseId?: string;
  /** For proposal: proposal ID */
  proposalId?: string;
  /** For proposal: escrow ID */
  escrowId?: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Actions to execute (in order) */
  actions: IntentActionConfig[];
  /** Optional callback to prepend calls before the begin/action/finalize sequence */
  prependCalls?: PrependCallsFn;

  /** Clock object ID */
  clockId?: string;
}

/**
 * Intent action configuration with type info for execution
 */
export type IntentActionConfig =
  // Account Actions - Stream
  | { action: 'create_stream'; coinType: string }
  | { action: 'cancel_stream'; coinType: string }
  // Account Actions - Vault
  | { action: 'deposit'; coinType: string }
  | { action: 'spend'; coinType: string }
  | { action: 'withdraw'; coinType: string }
  | { action: 'approve_coin_type'; coinType: string }
  | { action: 'remove_approved_coin_type'; coinType: string }
  // Account Actions - Currency
  | { action: 'return_treasury_cap'; coinType: string }
  | { action: 'return_metadata'; coinType: string; keyType: string }
  | { action: 'mint'; coinType: string }
  | { action: 'burn'; coinType: string }
  | { action: 'disable_currency'; coinType: string }
  | { action: 'update_currency'; coinType: string }
  // Account Actions - Transfer
  | { action: 'transfer'; objectType: string }
  | { action: 'transfer_to_sender'; objectType: string }
  // Account Actions - Package Upgrade
  | { action: 'upgrade_package' }
  | { action: 'commit_upgrade' }
  | { action: 'restrict_upgrade' }
  | { action: 'create_commit_cap' }
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
  | { action: 'create_pool_with_mint'; assetType: string; stableType: string; lpType: string; lpTreasuryCapId: string; lpMetadataId: string }
  | { action: 'add_liquidity'; assetType: string; stableType: string }
  | { action: 'remove_liquidity'; assetType: string; stableType: string }
  | { action: 'swap'; assetType: string; stableType: string }
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
