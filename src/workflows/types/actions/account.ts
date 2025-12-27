/**
 * Account Action Configs
 *
 * Stream, Vault, Currency, Transfer, Package Upgrade, and Memo actions.
 *
 * @module workflows/types/actions/account
 */

// ============================================================================
// ACCOUNT ACTIONS - STREAM
// ============================================================================

/**
 * Stream creation action configuration
 */
export interface CreateStreamActionConfig {
  type: 'create_stream';
  /** Coin type for the stream (required for type-safe staging) */
  coinType?: string;
  /** Vault to withdraw from */
  vaultName: string;
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
  // Note: All streams are always cancellable by DAO governance
}

/**
 * Cancel stream action configuration
 */
export interface CancelStreamActionConfig {
  type: 'cancel_stream';
  /** Coin type for the stream (required for type-safe staging) */
  coinType?: string;
  /** Vault name where stream was created */
  vaultName: string;
  /** Stream object ID to cancel */
  streamId: string;
}

// ============================================================================
// ACCOUNT ACTIONS - VAULT
// ============================================================================

/**
 * Deposit to vault action configuration
 * The coin is taken from executable_resources using the given resourceName
 */
export interface DepositActionConfig {
  type: 'deposit';
  /** Coin type being deposited (required for type-safe staging) */
  coinType?: string;
  /** Vault name */
  vaultName: string;
  /** Amount to deposit */
  amount: bigint;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

/**
 * Spend from vault action configuration
 * The coin is placed in executable_resources under the given resourceName
 * for consumption by subsequent actions (e.g., TransferObject, Deposit)
 */
export interface SpendActionConfig {
  type: 'spend';
  /** Coin type being spent (required for type-safe staging) */
  coinType?: string;
  /** Vault name */
  vaultName: string;
  /** Amount to spend */
  amount: bigint;
  /** Whether to spend entire balance */
  spendAll: boolean;
  /** Resource name to store the coin in executable_resources */
  resourceName: string;
}

/**
 * Approve coin type for permissionless deposits
 */
export interface ApproveCoinTypeActionConfig {
  type: 'approve_coin_type';
  /** Coin type to approve (required for type-safe staging) */
  coinType?: string;
  /** Vault name */
  vaultName: string;
}

/**
 * Remove coin type approval
 */
export interface RemoveApprovedCoinTypeActionConfig {
  type: 'remove_approved_coin_type';
  /** Coin type to remove approval for (required for type-safe staging) */
  coinType?: string;
  /** Vault name */
  vaultName: string;
}

/**
 * Deposit coins from executable_resources into a vault
 *
 * SECURITY: This is safe because:
 * - Coins come from executable_resources (from prior governance-approved actions)
 * - Amount deposited = exactly what prior action produced (deterministic)
 *
 * Use case: Deposit LP tokens, swap outputs, or other dynamic-amount coins
 * that are produced by a previous action in the proposal.
 */
export interface DepositFromResourcesActionConfig {
  type: 'deposit_from_resources';
  /** Coin type being deposited (required for type-safe staging) */
  coinType?: string;
  /** Target vault name */
  vaultName: string;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

// ============================================================================
// ACCOUNT ACTIONS - CURRENCY
// ============================================================================

/**
 * Return treasury cap action configuration
 */
export interface ReturnTreasuryCapActionConfig {
  type: 'return_treasury_cap';
  /** Coin type of the treasury cap (required for type-safe staging) */
  coinType?: string;
  /** Recipient address */
  recipient: string;
}

/**
 * Return metadata action configuration
 */
export interface ReturnMetadataActionConfig {
  type: 'return_metadata';
  /** Coin type of the metadata (required for type-safe staging) */
  coinType?: string;
  /** Recipient address */
  recipient: string;
}

/**
 * Mint tokens action configuration
 * Mints tokens and stores them in executable_resources for subsequent actions.
 * For example: mint → create_vesting (vesting takes from executable_resources)
 */
export interface MintActionConfig {
  type: 'mint';
  /** Coin type to mint (required for type-safe staging) */
  coinType?: string;
  /** Amount to mint */
  amount: bigint;
  /** Resource name to store the minted coin in executable_resources */
  resourceName: string;
}

/**
 * Burn tokens action configuration
 * Burns tokens taken from executable_resources
 */
export interface BurnActionConfig {
  type: 'burn';
  /** Coin type to burn (required for type-safe staging) */
  coinType?: string;
  /** Amount to burn */
  amount: bigint;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

/**
 * Disable currency operations (irreversible)
 */
export interface DisableCurrencyActionConfig {
  type: 'disable_currency';
  /** Coin type to disable (required for type-safe staging) */
  coinType?: string;
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
  /** Coin type to update (required for type-safe staging) */
  coinType?: string;
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
// ACCOUNT ACTIONS - TRANSFER
// ============================================================================

/**
 * Transfer object action configuration (for objects via provide_object)
 * The object is taken from executable_resources using the given resourceName
 * Key format: "name::object::Type"
 */
export interface TransferActionConfig {
  type: 'transfer';
  /** Recipient address */
  recipient: string;
  /** Resource name to take the object from executable_resources */
  resourceName: string;
}

/**
 * Transfer object to transaction sender (for objects via provide_object)
 * The object is taken from executable_resources using the given resourceName
 * Key format: "name::object::Type"
 */
export interface TransferToSenderActionConfig {
  type: 'transfer_to_sender';
  /** Resource name to take the object from executable_resources */
  resourceName: string;
}

/**
 * Transfer coin action configuration (for coins via provide_coin)
 * The coin is taken from executable_resources using the given resourceName
 * Key format: "name::coin::CoinType"
 *
 * Use this instead of TransferActionConfig when the coin was placed via provide_coin
 * (e.g., from VaultSpend, CurrencyMint)
 */
export interface TransferCoinActionConfig {
  type: 'transfer_coin';
  /** Coin type being transferred (required for type-safe staging) */
  coinType?: string;
  /** Recipient address */
  recipient: string;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

/**
 * Transfer coin to transaction sender (for coins via provide_coin)
 * The coin is taken from executable_resources using the given resourceName
 * Key format: "name::coin::CoinType"
 *
 * Use this for crank fees when the coin was placed via provide_coin
 */
export interface TransferCoinToSenderActionConfig {
  type: 'transfer_coin_to_sender';
  /** Coin type being transferred (required for type-safe staging) */
  coinType?: string;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

// ============================================================================
// ACCOUNT ACTIONS - PACKAGE UPGRADE
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
// ACCOUNT ACTIONS - MEMO
// ============================================================================

/**
 * Emit memo action configuration
 */
export interface MemoActionConfig {
  type: 'memo';
  /** Memo message */
  message: string;
}

