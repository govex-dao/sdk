/**
 * Account Action Types - Action configurations for account-level operations
 *
 * Includes: Stream, Vault, Currency, Transfer, Package Upgrade, Memo
 *
 * @module types/protocol/actions/account
 */

// ============================================================================
// STREAM ACTIONS
// ============================================================================

/**
 * Stream creation action configuration
 */
export interface CreateStreamActionConfig {
  type: 'create_stream';
  /** Vault to withdraw from */
  vaultName: string;
  /** Coin type for the stream (e.g., '0x2::sui::SUI') */
  coinType: string;
  /** Beneficiary address */
  beneficiary: string;
  /** Amount per iteration (in base units) */
  amountPerIteration: bigint;
  /** Start timestamp (ms) */
  startTime: number;
  /** Total number of iterations */
  iterationsTotal: bigint;
  /** Period between iterations (ms) */
  iterationPeriodMs: bigint;
  /** Optional cliff time (ms) */
  cliffTime?: number;
  /** Optional claim window (ms) - use-or-lose */
  claimWindowMs?: bigint;
  /** Max withdrawal per claim */
  maxPerWithdrawal: bigint;
  /** Whether stream is transferable */
  isTransferable: boolean;
  /** Whether stream is cancellable by DAO */
  isCancellable: boolean;
}

/**
 * Cancel stream action configuration
 */
export interface CancelStreamActionConfig {
  type: 'cancel_stream';
  /** Vault name where stream was created */
  vaultName: string;
  /** Stream object ID to cancel */
  streamId: string;
}

// ============================================================================
// VAULT ACTIONS
// ============================================================================

/**
 * Deposit to vault action configuration
 */
export interface DepositActionConfig {
  type: 'deposit';
  /** Vault name */
  vaultName: string;
  /** Amount to deposit */
  amount: bigint;
}

/**
 * Spend from vault action configuration (internal use, returns coin to PTB)
 */
export interface SpendActionConfig {
  type: 'spend';
  /** Vault name */
  vaultName: string;
  /** Amount to spend */
  amount: bigint;
  /** Whether to spend entire balance */
  spendAll: boolean;
}

/**
 * Withdraw from vault and transfer action configuration
 */
export interface WithdrawActionConfig {
  type: 'withdraw';
  /** Vault name */
  vaultName: string;
  /** Amount to withdraw */
  amount: bigint;
  /** Recipient address */
  recipient: string;
  /** Coin type to withdraw (e.g., '0x2::sui::SUI') */
  coinType: string;
}

/**
 * Approve coin type for permissionless deposits
 */
export interface ApproveCoinTypeActionConfig {
  type: 'approve_coin_type';
  /** Vault name */
  vaultName: string;
}

/**
 * Remove coin type approval
 */
export interface RemoveApprovedCoinTypeActionConfig {
  type: 'remove_approved_coin_type';
  /** Vault name */
  vaultName: string;
}

// ============================================================================
// CURRENCY ACTIONS
// ============================================================================

/**
 * Return treasury cap action configuration
 */
export interface ReturnTreasuryCapActionConfig {
  type: 'return_treasury_cap';
  /** Recipient address */
  recipient: string;
}

/**
 * Return metadata action configuration
 */
export interface ReturnMetadataActionConfig {
  type: 'return_metadata';
  /** Recipient address */
  recipient: string;
}

/**
 * Mint tokens action configuration
 * Note: The recipient is determined at execution time for launchpad init actions
 */
export interface MintActionConfig {
  type: 'mint';
  /** Amount to mint */
  amount: bigint;
}

/**
 * Burn tokens action configuration
 * Note: Vault is determined at execution time
 */
export interface BurnActionConfig {
  type: 'burn';
  /** Amount to burn */
  amount: bigint;
}

/**
 * Disable currency operations (irreversible)
 */
export interface DisableCurrencyActionConfig {
  type: 'disable_currency';
  /** Disable minting */
  mint: boolean;
  /** Disable burning */
  burn: boolean;
  /** Disable symbol updates */
  updateSymbol: boolean;
  /** Disable name updates */
  updateName: boolean;
  /** Disable description updates */
  updateDescription: boolean;
  /** Disable icon updates */
  updateIcon: boolean;
}

/**
 * Update currency metadata
 */
export interface UpdateCurrencyActionConfig {
  type: 'update_currency';
  /** New symbol (ASCII) */
  symbol?: string;
  /** New name (UTF-8) */
  name?: string;
  /** New description (UTF-8) */
  description?: string;
  /** New icon URL (ASCII) */
  iconUrl?: string;
}

// ============================================================================
// TRANSFER ACTIONS
// ============================================================================

/**
 * Transfer object action configuration
 * Note: The object is passed at execution time via PTB
 */
export interface TransferActionConfig {
  type: 'transfer';
  /** Recipient address */
  recipient: string;
  /** Object type to transfer (e.g., '0x2::coin::Coin<0x2::sui::SUI>') */
  objectType: string;
}

/**
 * Transfer object to transaction sender (cranker)
 */
export interface TransferToSenderActionConfig {
  type: 'transfer_to_sender';
}

// ============================================================================
// PACKAGE UPGRADE ACTIONS
// ============================================================================

/**
 * Package upgrade action configuration
 */
export interface UpgradePackageActionConfig {
  type: 'upgrade_package';
  /** Package name */
  name: string;
  /** Build digest for the upgrade */
  digest: Uint8Array;
}

/**
 * Commit package upgrade action
 */
export interface CommitUpgradeActionConfig {
  type: 'commit_upgrade';
  /** Package name */
  name: string;
}

/**
 * Restrict package upgrade policy
 */
export interface RestrictUpgradeActionConfig {
  type: 'restrict_upgrade';
  /** Package name */
  name: string;
  /** Policy: 0 = additive, 128 = dep_only, 255 = immutable */
  policy: number;
}

/**
 * Create commit capability and transfer to recipient
 */
export interface CreateCommitCapActionConfig {
  type: 'create_commit_cap';
  /** Package name */
  name: string;
  /** Recipient address */
  recipient: string;
  /** New timelock delay for reclaiming commit authority (ms) */
  newReclaimDelayMs: bigint;
}

// ============================================================================
// MEMO ACTIONS
// ============================================================================

/**
 * Emit memo action configuration
 */
export interface MemoActionConfig {
  type: 'memo';
  /** Memo message */
  message: string;
}

/**
 * Union of all account action configurations
 */
export type AccountActionConfig =
  // Stream
  | CreateStreamActionConfig
  | CancelStreamActionConfig
  // Vault
  | DepositActionConfig
  | SpendActionConfig
  | WithdrawActionConfig
  | ApproveCoinTypeActionConfig
  | RemoveApprovedCoinTypeActionConfig
  // Currency
  | ReturnTreasuryCapActionConfig
  | ReturnMetadataActionConfig
  | MintActionConfig
  | BurnActionConfig
  | DisableCurrencyActionConfig
  | UpdateCurrencyActionConfig
  // Transfer
  | TransferActionConfig
  | TransferToSenderActionConfig
  // Package Upgrade
  | UpgradePackageActionConfig
  | CommitUpgradeActionConfig
  | RestrictUpgradeActionConfig
  | CreateCommitCapActionConfig
  // Memo
  | MemoActionConfig;
