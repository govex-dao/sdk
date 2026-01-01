/**
 * Shared Action Registry
 *
 * Single source of truth for all action definitions.
 * Used by:
 * - Backend parser: to extract params from staging PTBs
 * - SDK executor: to build execution PTBs
 * - SDK converter: to validate and convert actions
 *
 * @module shared/action-registry
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Package keys - maps to package IDs in config
 */
export type PackageKey =
  | 'accountProtocol'
  | 'accountActions'
  | 'futarchyCore'
  | 'futarchyActions'
  | 'futarchyGovernance'
  | 'futarchyGovernanceActions'
  | 'futarchyOracleActions';

/**
 * Parameter source for staging parser
 * Describes where to extract a param from PTB
 */
export interface ParamSource {
  name: string;
  /** Where to get the value: typeArgs index or args index */
  from: { typeArgs: number } | { args: number };
  /** Optional: expected type for validation */
  type?: 'string' | 'u8' | 'u64' | 'u128' | 'bool' | 'address' | 'id' | 'option_u8' | 'option_u64';
}

/**
 * Type argument template for executor
 * Describes how to build typeArgs array
 */
export type TypeArgTemplate =
  | { from: 'config'; key: 'assetType' | 'stableType' | 'lpType' }
  | { from: 'action'; key: string }  // e.g., 'coinType', 'objectType', 'capType'
  | { from: 'context'; key: 'configType' | 'outcomeType' | 'witnessType' };

/**
 * Argument template for executor
 * Describes how to build args array
 */
export type ArgTemplate =
  | { from: 'context'; key: 'executable' | 'account' | 'registry' | 'versionWitness' | 'intentWitness' | 'clock' }
  | { from: 'action'; key: string };  // for actions that need specific params

/**
 * Complete action definition
 */
export interface ActionDefinition {
  /** Unique identifier used across SDK/backend */
  sdkId: string;

  /** Human-readable description */
  description: string;

  /** Staging info - for parsing PTB (backend) */
  staging: {
    package: PackageKey;
    module: string;
    fn: string;
    params: ParamSource[];
  };

  /** Execution info - for building PTB (SDK) */
  execution: {
    package: PackageKey;
    module: string;
    fn: string;
    typeArgs: TypeArgTemplate[];
    /** Standard args pattern - most actions use the same 6 args */
    argsPattern: 'standard' | 'standard_with_clock' | 'custom';
    /** Custom args if argsPattern is 'custom' */
    customArgs?: ArgTemplate[];
  };
}

// ============================================================================
// Standard Patterns (most actions follow these)
// ============================================================================

/** Standard type args: [ConfigType, OutcomeType, CoinType, WitnessType] */
const STANDARD_TYPE_ARGS_COIN: TypeArgTemplate[] = [
  { from: 'context', key: 'configType' },
  { from: 'context', key: 'outcomeType' },
  { from: 'action', key: 'coinType' },
  { from: 'context', key: 'witnessType' },
];

/** Standard type args for object actions: [ConfigType, OutcomeType, ObjectType, WitnessType] */
const STANDARD_TYPE_ARGS_OBJECT: TypeArgTemplate[] = [
  { from: 'context', key: 'configType' },
  { from: 'context', key: 'outcomeType' },
  { from: 'action', key: 'objectType' },
  { from: 'context', key: 'witnessType' },
];

/** Standard type args for cap actions: [ConfigType, OutcomeType, CapType, WitnessType] */
const STANDARD_TYPE_ARGS_CAP: TypeArgTemplate[] = [
  { from: 'context', key: 'configType' },
  { from: 'context', key: 'outcomeType' },
  { from: 'action', key: 'capType' },
  { from: 'context', key: 'witnessType' },
];

/** No-coin type args: [ConfigType, OutcomeType, WitnessType] */
const STANDARD_TYPE_ARGS_NO_COIN: TypeArgTemplate[] = [
  { from: 'context', key: 'configType' },
  { from: 'context', key: 'outcomeType' },
  { from: 'context', key: 'witnessType' },
];

/** Pool type args: [AssetType, StableType, LPType, ConfigType, OutcomeType, WitnessType] */
const POOL_TYPE_ARGS: TypeArgTemplate[] = [
  { from: 'action', key: 'assetType' },
  { from: 'action', key: 'stableType' },
  { from: 'action', key: 'lpType' },
  { from: 'context', key: 'configType' },
  { from: 'context', key: 'outcomeType' },
  { from: 'context', key: 'witnessType' },
];

// ============================================================================
// Action Registry
// ============================================================================

export const ACTION_REGISTRY: ActionDefinition[] = [
  // ==========================================================================
  // account_protocol (5 actions)
  // ==========================================================================
  {
    sdkId: 'toggle_unverified_allowed',
    description: 'Toggle whether unverified packages can be added',
    staging: {
      package: 'accountProtocol',
      module: 'config_init_actions',
      fn: 'add_toggle_unverified_spec',
      params: [],
    },
    execution: {
      package: 'accountProtocol',
      module: 'config_actions',
      fn: 'do_toggle_unverified',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'add_dep',
    description: 'Add package dependency',
    staging: {
      package: 'accountProtocol',
      module: 'config_init_actions',
      fn: 'add_add_dep_spec',
      params: [
        { name: 'packageId', from: { args: 1 }, type: 'address' },
        { name: 'version', from: { args: 2 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'accountProtocol',
      module: 'config_actions',
      fn: 'do_add_dep',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'remove_dep',
    description: 'Remove package dependency',
    staging: {
      package: 'accountProtocol',
      module: 'config_init_actions',
      fn: 'add_remove_dep_spec',
      params: [
        { name: 'packageId', from: { args: 1 }, type: 'address' },
      ],
    },
    execution: {
      package: 'accountProtocol',
      module: 'config_actions',
      fn: 'do_remove_dep',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'withdraw_object',
    description: 'Withdraw owned object',
    staging: {
      package: 'accountProtocol',
      module: 'owned_init_actions',
      fn: 'add_withdraw_object_spec',
      params: [
        { name: 'objectType', from: { typeArgs: 0 } },
        { name: 'objectId', from: { args: 1 }, type: 'id' },
        { name: 'resourceName', from: { args: 2 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountProtocol',
      module: 'owned_actions',
      fn: 'do_withdraw_object',
      typeArgs: STANDARD_TYPE_ARGS_OBJECT,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'withdraw_coin',
    description: 'Withdraw owned coin',
    staging: {
      package: 'accountProtocol',
      module: 'owned_init_actions',
      fn: 'add_withdraw_coin_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'coinId', from: { args: 1 }, type: 'id' },
        { name: 'resourceName', from: { args: 2 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountProtocol',
      module: 'owned_actions',
      fn: 'do_withdraw_coin',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // account_actions - Vault (8 actions)
  // ==========================================================================
  {
    sdkId: 'deposit',
    description: 'Deposit coins into vault',
    staging: {
      package: 'accountActions',
      module: 'vault_init_actions',
      fn: 'add_deposit_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'vaultName', from: { args: 1 }, type: 'string' },
        { name: 'amount', from: { args: 2 }, type: 'u64' },
        { name: 'resourceName', from: { args: 3 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vault',
      fn: 'do_deposit',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'deposit_external',
    description: 'Deposit external coins from PTB',
    staging: {
      package: 'accountActions',
      module: 'vault_init_actions',
      fn: 'add_deposit_external_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'vaultName', from: { args: 1 }, type: 'string' },
        { name: 'amount', from: { args: 2 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vault',
      fn: 'do_deposit_external',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'deposit_from_resources',
    description: 'Deposit from executable_resources',
    staging: {
      package: 'accountActions',
      module: 'vault_init_actions',
      fn: 'add_deposit_from_resources_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'vaultName', from: { args: 1 }, type: 'string' },
        { name: 'resourceName', from: { args: 2 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vault',
      fn: 'do_deposit_from_resources',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'spend',
    description: 'Spend coins from vault',
    staging: {
      package: 'accountActions',
      module: 'vault_init_actions',
      fn: 'add_spend_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'vaultName', from: { args: 1 }, type: 'string' },
        { name: 'amount', from: { args: 2 }, type: 'u64' },
        { name: 'spendAll', from: { args: 3 }, type: 'bool' },
        { name: 'resourceName', from: { args: 4 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vault',
      fn: 'do_spend',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'approve_coin_type',
    description: 'Approve coin type for vault',
    staging: {
      package: 'accountActions',
      module: 'vault_init_actions',
      fn: 'add_approve_coin_type_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vault',
      fn: 'do_approve_coin_type',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'remove_approved_coin_type',
    description: 'Remove approved coin type',
    staging: {
      package: 'accountActions',
      module: 'vault_init_actions',
      fn: 'add_remove_approved_coin_type_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vault',
      fn: 'do_remove_approved_coin_type',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'create_stream',
    description: 'Create vault vesting stream',
    staging: {
      package: 'accountActions',
      module: 'stream_init_actions',
      fn: 'add_create_stream_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'vaultName', from: { args: 1 }, type: 'string' },
        { name: 'beneficiary', from: { args: 2 }, type: 'address' },
        { name: 'amountPerIteration', from: { args: 3 }, type: 'u64' },
        { name: 'startTime', from: { args: 4 }, type: 'u64' },
        { name: 'iterationsTotal', from: { args: 5 }, type: 'u64' },
        { name: 'iterationPeriodMs', from: { args: 6 }, type: 'u64' },
        { name: 'cliffTime', from: { args: 7 }, type: 'option_u64' },
        { name: 'claimWindowMs', from: { args: 8 }, type: 'option_u64' },
        { name: 'maxPerWithdrawal', from: { args: 9 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vault',
      fn: 'do_init_create_stream',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard_with_clock',
    },
  },
  {
    sdkId: 'cancel_stream',
    description: 'Cancel vault stream',
    staging: {
      package: 'accountActions',
      module: 'stream_init_actions',
      fn: 'add_cancel_stream_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'streamId', from: { args: 1 }, type: 'id' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vault',
      fn: 'do_cancel_stream',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // account_actions - Vesting (2 actions)
  // ==========================================================================
  {
    sdkId: 'create_vesting',
    description: 'Create standalone vesting',
    staging: {
      package: 'accountActions',
      module: 'vesting_init_actions',
      fn: 'add_create_vesting_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'beneficiary', from: { args: 1 }, type: 'address' },
        { name: 'totalAmount', from: { args: 2 }, type: 'u64' },
        { name: 'startTime', from: { args: 3 }, type: 'u64' },
        { name: 'duration', from: { args: 4 }, type: 'u64' },
        { name: 'cliffDuration', from: { args: 5 }, type: 'u64' },
        { name: 'isCancellable', from: { args: 6 }, type: 'bool' },
        { name: 'isTransferable', from: { args: 7 }, type: 'bool' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vesting',
      fn: 'do_create_vesting',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard_with_clock',
    },
  },
  {
    sdkId: 'cancel_vesting',
    description: 'Cancel vesting',
    staging: {
      package: 'accountActions',
      module: 'vesting_init_actions',
      fn: 'add_cancel_vesting_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'vestingId', from: { args: 1 }, type: 'id' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'vesting',
      fn: 'do_cancel_vesting',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard_with_clock',
    },
  },

  // ==========================================================================
  // account_actions - Currency (6 actions)
  // ==========================================================================
  {
    sdkId: 'disable_currency',
    description: 'Disable currency operations',
    staging: {
      package: 'accountActions',
      module: 'currency_init_actions',
      fn: 'add_disable_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'currency',
      fn: 'do_disable',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'mint',
    description: 'Mint new tokens',
    staging: {
      package: 'accountActions',
      module: 'currency_init_actions',
      fn: 'add_mint_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'amount', from: { args: 1 }, type: 'u64' },
        { name: 'resourceName', from: { args: 2 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'currency',
      fn: 'do_mint',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'burn',
    description: 'Burn tokens',
    staging: {
      package: 'accountActions',
      module: 'currency_init_actions',
      fn: 'add_burn_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'amount', from: { args: 1 }, type: 'u64' },
        { name: 'resourceName', from: { args: 2 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'currency',
      fn: 'do_burn',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_currency',
    description: 'Update currency metadata',
    staging: {
      package: 'accountActions',
      module: 'currency_init_actions',
      fn: 'add_update_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'name', from: { args: 1 }, type: 'string' },
        { name: 'symbol', from: { args: 2 }, type: 'string' },
        { name: 'description', from: { args: 3 }, type: 'string' },
        { name: 'iconUrl', from: { args: 4 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'currency',
      fn: 'do_update',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'return_treasury_cap',
    description: 'Return treasury cap',
    staging: {
      package: 'accountActions',
      module: 'currency_init_actions',
      fn: 'add_return_treasury_cap_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'recipient', from: { args: 1 }, type: 'address' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'currency',
      fn: 'do_return_treasury_cap',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  // NOTE: 'return_metadata' action removed - CoinMetadata no longer stored in Account
  // Use sui::coin_registry::Currency<T> for metadata access instead

  // ==========================================================================
  // account_actions - Access Control (2 actions)
  // ==========================================================================
  {
    sdkId: 'borrow_access',
    description: 'Borrow capability',
    staging: {
      package: 'accountActions',
      module: 'access_control_init_actions',
      fn: 'add_borrow_spec',
      params: [
        { name: 'capType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'access_control',
      fn: 'do_borrow',
      typeArgs: STANDARD_TYPE_ARGS_CAP,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'return_access',
    description: 'Return capability',
    staging: {
      package: 'accountActions',
      module: 'access_control_init_actions',
      fn: 'add_return_spec',
      params: [
        { name: 'capType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'access_control',
      fn: 'do_return',
      typeArgs: STANDARD_TYPE_ARGS_CAP,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // account_actions - Transfer (4 actions)
  // ==========================================================================
  {
    sdkId: 'transfer',
    description: 'Transfer object to recipient',
    staging: {
      package: 'accountActions',
      module: 'transfer_init_actions',
      fn: 'add_transfer_object_spec',
      params: [
        { name: 'objectType', from: { typeArgs: 0 } },
        { name: 'recipient', from: { args: 1 }, type: 'address' },
        { name: 'resourceName', from: { args: 2 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'transfer',
      fn: 'do_transfer_object',
      typeArgs: STANDARD_TYPE_ARGS_OBJECT,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'transfer_to_sender',
    description: 'Transfer object to sender',
    staging: {
      package: 'accountActions',
      module: 'transfer_init_actions',
      fn: 'add_transfer_to_sender_spec',
      params: [
        { name: 'objectType', from: { typeArgs: 0 } },
        { name: 'resourceName', from: { args: 1 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'transfer',
      fn: 'do_transfer_to_sender',
      typeArgs: STANDARD_TYPE_ARGS_OBJECT,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'transfer_coin',
    description: 'Transfer coin to recipient',
    staging: {
      package: 'accountActions',
      module: 'transfer_init_actions',
      fn: 'add_transfer_coin_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'recipient', from: { args: 1 }, type: 'address' },
        { name: 'resourceName', from: { args: 2 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'transfer',
      fn: 'do_transfer_coin',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'transfer_coin_to_sender',
    description: 'Transfer coin to sender',
    staging: {
      package: 'accountActions',
      module: 'transfer_init_actions',
      fn: 'add_transfer_coin_to_sender_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'resourceName', from: { args: 1 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'transfer',
      fn: 'do_transfer_coin_to_sender',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // account_actions - Package Upgrade (4 actions)
  // ==========================================================================
  {
    sdkId: 'upgrade_package',
    description: 'Execute package upgrade',
    staging: {
      package: 'accountActions',
      module: 'package_upgrade_init_actions',
      fn: 'add_upgrade_spec',
      params: [
        { name: 'packageId', from: { args: 1 }, type: 'address' },
        { name: 'policy', from: { args: 2 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'package_upgrade',
      fn: 'do_upgrade',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'commit_upgrade',
    description: 'Commit package upgrade',
    staging: {
      package: 'accountActions',
      module: 'package_upgrade_init_actions',
      fn: 'add_commit_spec',
      params: [],
    },
    execution: {
      package: 'accountActions',
      module: 'package_upgrade',
      fn: 'do_commit',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'restrict_upgrade',
    description: 'Restrict upgrade policy',
    staging: {
      package: 'accountActions',
      module: 'package_upgrade_init_actions',
      fn: 'add_restrict_spec',
      params: [
        { name: 'policy', from: { args: 1 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'package_upgrade',
      fn: 'do_restrict',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // account_actions - Memo (1 action)
  // ==========================================================================
  {
    sdkId: 'memo',
    description: 'Emit memo event',
    staging: {
      package: 'accountActions',
      module: 'memo_init_actions',
      fn: 'add_emit_memo_spec',
      params: [
        { name: 'message', from: { args: 1 }, type: 'string' },
      ],
    },
    execution: {
      package: 'accountActions',
      module: 'memo',
      fn: 'do_emit_memo',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // futarchy_actions - Liquidity (5 actions)
  // ==========================================================================
  {
    sdkId: 'create_pool_with_mint',
    description: 'Create pool with minted tokens',
    staging: {
      package: 'futarchyActions',
      module: 'liquidity_init_actions',
      fn: 'add_create_pool_with_mint_spec',
      params: [
        { name: 'assetType', from: { typeArgs: 0 } },
        { name: 'stableType', from: { typeArgs: 1 } },
        { name: 'lpType', from: { typeArgs: 2 } },
        { name: 'vaultName', from: { args: 1 }, type: 'string' },
        { name: 'assetAmount', from: { args: 2 }, type: 'u64' },
        { name: 'stableAmount', from: { args: 3 }, type: 'u64' },
        { name: 'feeBps', from: { args: 4 }, type: 'u64' },
        { name: 'launchFeeDurationMs', from: { args: 5 }, type: 'u64' },
        { name: 'lpTreasuryCapId', from: { args: 6 }, type: 'id' },
        { name: 'lpCurrencyId', from: { args: 7 }, type: 'id' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'liquidity_init_actions',
      fn: 'do_init_create_pool_with_mint',
      typeArgs: POOL_TYPE_ARGS,
      argsPattern: 'custom',
      customArgs: [
        { from: 'context', key: 'executable' },
        { from: 'context', key: 'account' },
        { from: 'context', key: 'registry' },
        { from: 'action', key: 'lpTreasuryCapId' },
        { from: 'action', key: 'lpCurrencyId' },
        { from: 'context', key: 'clock' },
        { from: 'context', key: 'versionWitness' },
        { from: 'context', key: 'intentWitness' },
      ],
    },
  },
  {
    sdkId: 'add_liquidity',
    description: 'Add liquidity (ResourceRequest)',
    staging: {
      package: 'futarchyActions',
      module: 'liquidity_init_actions',
      fn: 'add_add_liquidity_spec',
      params: [
        { name: 'assetType', from: { typeArgs: 0 } },
        { name: 'stableType', from: { typeArgs: 1 } },
        { name: 'lpType', from: { typeArgs: 2 } },
        { name: 'assetAmount', from: { args: 1 }, type: 'u64' },
        { name: 'stableAmount', from: { args: 2 }, type: 'u64' },
        { name: 'minLpOut', from: { args: 3 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'liquidity_actions',
      fn: 'do_add_liquidity',
      typeArgs: POOL_TYPE_ARGS,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'remove_liquidity_to_resources',
    description: 'Remove liquidity (ResourceRequest)',
    staging: {
      package: 'futarchyActions',
      module: 'liquidity_init_actions',
      fn: 'add_remove_liquidity_to_resources_spec',
      params: [
        { name: 'assetType', from: { typeArgs: 0 } },
        { name: 'stableType', from: { typeArgs: 1 } },
        { name: 'lpType', from: { typeArgs: 2 } },
        { name: 'lpAmount', from: { args: 1 }, type: 'u64' },
        { name: 'minAssetOut', from: { args: 2 }, type: 'u64' },
        { name: 'minStableOut', from: { args: 3 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'liquidity_actions',
      fn: 'do_remove_liquidity_to_resources',
      typeArgs: POOL_TYPE_ARGS,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'swap',
    description: 'Execute swap (ResourceRequest)',
    staging: {
      package: 'futarchyActions',
      module: 'liquidity_init_actions',
      fn: 'add_swap_spec',
      params: [
        { name: 'assetType', from: { typeArgs: 0 } },
        { name: 'stableType', from: { typeArgs: 1 } },
        { name: 'amountIn', from: { args: 1 }, type: 'u64' },
        { name: 'minAmountOut', from: { args: 2 }, type: 'u64' },
        { name: 'isAssetToStable', from: { args: 3 }, type: 'bool' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'liquidity_actions',
      fn: 'do_swap',
      typeArgs: [
        { from: 'action', key: 'assetType' },
        { from: 'action', key: 'stableType' },
        { from: 'context', key: 'configType' },
        { from: 'context', key: 'outcomeType' },
        { from: 'context', key: 'witnessType' },
      ],
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_pool_fee',
    description: 'Update pool LP fee',
    staging: {
      package: 'futarchyActions',
      module: 'liquidity_init_actions',
      fn: 'add_update_pool_fee_spec',
      params: [
        { name: 'assetType', from: { typeArgs: 0 } },
        { name: 'stableType', from: { typeArgs: 1 } },
        { name: 'lpType', from: { typeArgs: 2 } },
        { name: 'newFeeBps', from: { args: 1 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'liquidity_actions',
      fn: 'do_update_pool_fee',
      typeArgs: POOL_TYPE_ARGS,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // futarchy_actions - Config (10 actions)
  // ==========================================================================
  {
    sdkId: 'set_proposals_enabled',
    description: 'Enable/disable proposals',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_set_proposals_enabled_spec',
      params: [
        { name: 'enabled', from: { args: 1 }, type: 'bool' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_set_proposals_enabled',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'terminate_dao',
    description: 'Permanently terminate DAO',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_terminate_dao_spec',
      params: [],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_terminate_dao',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_dao_name',
    description: 'Update DAO name',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_update_name_spec',
      params: [
        { name: 'newName', from: { args: 1 }, type: 'string' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_update_name',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_trading_params',
    // NOTE: assetDecimals and stableDecimals removed - decimals are immutable in Sui coins
    description: 'Update trading parameters',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_update_trading_params_spec',
      params: [
        { name: 'minAssetAmount', from: { args: 1 }, type: 'option_u64' },
        { name: 'minStableAmount', from: { args: 2 }, type: 'option_u64' },
        { name: 'reviewPeriodMs', from: { args: 3 }, type: 'option_u64' },
        { name: 'tradingPeriodMs', from: { args: 4 }, type: 'option_u64' },
        { name: 'ammTotalFeeBps', from: { args: 5 }, type: 'option_u64' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_update_trading_params',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_dao_metadata',
    description: 'Update DAO metadata',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_update_metadata_spec',
      params: [
        { name: 'description', from: { args: 1 }, type: 'string' },
        { name: 'iconUrl', from: { args: 2 }, type: 'string' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_update_metadata',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_twap_config',
    description: 'Update TWAP configuration',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_update_twap_config_spec',
      params: [
        { name: 'startDelay', from: { args: 1 }, type: 'option_u64' },
        { name: 'stepMax', from: { args: 2 }, type: 'option_u64' },
        { name: 'initialObservation', from: { args: 3 }, type: 'option_u64' },
        // threshold is a complex Signed type
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_update_twap_config',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_governance',
    description: 'Update governance settings',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_update_governance_spec',
      params: [
        { name: 'proposalMinAssetAmount', from: { args: 1 }, type: 'option_u64' },
        { name: 'passThresholdBps', from: { args: 2 }, type: 'option_u64' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_update_governance',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_metadata_table',
    description: 'Update metadata table',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_update_metadata_table_spec',
      params: [
        { name: 'key', from: { args: 1 }, type: 'string' },
        { name: 'value', from: { args: 2 }, type: 'string' },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_update_metadata_table',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_conditional_metadata',
    description: 'Update conditional metadata',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_update_conditional_metadata_spec',
      params: [],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_update_conditional_metadata',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_sponsorship_config',
    description: 'Update sponsorship config',
    staging: {
      package: 'futarchyActions',
      module: 'futarchy_config_init_actions',
      fn: 'add_update_sponsorship_config_spec',
      params: [],
    },
    execution: {
      package: 'futarchyActions',
      module: 'config_actions',
      fn: 'do_update_sponsorship_config',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // futarchy_actions - Quota (1 action)
  // ==========================================================================
  {
    sdkId: 'set_quotas',
    description: 'Set sponsorship quotas',
    staging: {
      package: 'futarchyActions',
      module: 'quota_init_actions',
      fn: 'add_set_quotas_spec',
      params: [],
    },
    execution: {
      package: 'futarchyActions',
      module: 'quota_actions',
      fn: 'do_set_quotas',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // futarchy_actions - Dissolution (1 action)
  // ==========================================================================
  {
    sdkId: 'create_dissolution_capability',
    description: 'Create dissolution capability',
    staging: {
      package: 'futarchyActions',
      module: 'dissolution_init_actions',
      fn: 'add_create_dissolution_capability_spec',
      params: [
        { name: 'assetType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'futarchyActions',
      module: 'dissolution_actions',
      fn: 'do_create_dissolution_capability',
      typeArgs: [
        { from: 'action', key: 'assetType' },
        { from: 'context', key: 'configType' },
        { from: 'context', key: 'outcomeType' },
        { from: 'context', key: 'witnessType' },
      ],
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // futarchy_governance_actions - Protocol Admin (14 actions)
  // ==========================================================================
  {
    sdkId: 'set_factory_paused',
    description: 'Pause/unpause factory',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_set_factory_paused_spec',
      params: [
        { name: 'paused', from: { args: 1 }, type: 'bool' },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_set_factory_paused',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'disable_factory_permanently',
    description: 'Permanently disable factory',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_disable_factory_permanently_spec',
      params: [],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_disable_factory_permanently',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'add_stable_type',
    description: 'Add supported stable type',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_add_stable_type_spec',
      params: [
        { name: 'stableType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_add_stable_type',
      typeArgs: [
        { from: 'action', key: 'stableType' },
        { from: 'context', key: 'configType' },
        { from: 'context', key: 'outcomeType' },
        { from: 'context', key: 'witnessType' },
      ],
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'remove_stable_type',
    description: 'Remove supported stable type',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_remove_stable_type_spec',
      params: [
        { name: 'stableType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_remove_stable_type',
      typeArgs: [
        { from: 'action', key: 'stableType' },
        { from: 'context', key: 'configType' },
        { from: 'context', key: 'outcomeType' },
        { from: 'context', key: 'witnessType' },
      ],
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_dao_creation_fee',
    description: 'Update DAO creation fee',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_update_dao_creation_fee_spec',
      params: [
        { name: 'newFee', from: { args: 1 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_update_dao_creation_fee',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_proposal_fee',
    description: 'Update proposal fee',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_update_proposal_fee_spec',
      params: [
        { name: 'newFee', from: { args: 1 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_update_proposal_fee',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_verification_fee',
    description: 'Update verification fee',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_update_verification_fee_spec',
      params: [
        { name: 'newFee', from: { args: 1 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_update_verification_fee',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'add_verification_level',
    description: 'Add verification level',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_add_verification_level_spec',
      params: [],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_add_verification_level',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'remove_verification_level',
    description: 'Remove verification level',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_remove_verification_level_spec',
      params: [],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_remove_verification_level',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'withdraw_fees_to_treasury',
    description: 'Withdraw fees to treasury',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_withdraw_fees_to_treasury_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_withdraw_fees_to_treasury',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'add_coin_fee_config',
    description: 'Add coin fee configuration',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_add_coin_fee_config_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_add_coin_fee_config',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_coin_creation_fee',
    description: 'Update coin creation fee',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_update_coin_creation_fee_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'newFee', from: { args: 1 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_update_coin_creation_fee',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_coin_proposal_fee',
    description: 'Update coin proposal fee',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_update_coin_proposal_fee_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
        { name: 'newFee', from: { args: 1 }, type: 'u64' },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_update_coin_proposal_fee',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'apply_pending_coin_fees',
    description: 'Apply pending coin fees',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_init_actions',
      fn: 'add_apply_pending_coin_fees_spec',
      params: [
        { name: 'coinType', from: { typeArgs: 0 } },
      ],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'protocol_admin_actions',
      fn: 'do_apply_pending_coin_fees',
      typeArgs: STANDARD_TYPE_ARGS_COIN,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // futarchy_governance_actions - Package Registry (6 actions)
  // ==========================================================================
  {
    sdkId: 'add_package',
    description: 'Add package to registry',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_init_actions',
      fn: 'add_add_package_spec',
      params: [],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_actions',
      fn: 'do_add_package',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'remove_package',
    description: 'Remove package from registry',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_init_actions',
      fn: 'add_remove_package_spec',
      params: [],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_actions',
      fn: 'do_remove_package',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_package_version',
    description: 'Update package version',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_init_actions',
      fn: 'add_update_package_version_spec',
      params: [],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_actions',
      fn: 'do_update_package_version',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'update_package_metadata',
    description: 'Update package metadata',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_init_actions',
      fn: 'add_update_package_metadata_spec',
      params: [],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_actions',
      fn: 'do_update_package_metadata',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'pause_account_creation',
    description: 'Pause account creation',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_init_actions',
      fn: 'add_pause_account_creation_spec',
      params: [],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_actions',
      fn: 'do_pause_account_creation',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'unpause_account_creation',
    description: 'Unpause account creation',
    staging: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_init_actions',
      fn: 'add_unpause_account_creation_spec',
      params: [],
    },
    execution: {
      package: 'futarchyGovernanceActions',
      module: 'package_registry_actions',
      fn: 'do_unpause_account_creation',
      typeArgs: STANDARD_TYPE_ARGS_NO_COIN,
      argsPattern: 'standard',
    },
  },

  // ==========================================================================
  // futarchy_oracle_actions (2 actions)
  // ==========================================================================
  {
    sdkId: 'create_oracle_grant',
    description: 'Create oracle grant',
    staging: {
      package: 'futarchyOracleActions',
      module: 'oracle_init_actions',
      fn: 'add_create_grant_spec',
      params: [
        { name: 'assetType', from: { typeArgs: 0 } },
        { name: 'stableType', from: { typeArgs: 1 } },
      ],
    },
    execution: {
      package: 'futarchyOracleActions',
      module: 'oracle_actions',
      fn: 'do_create_grant',
      typeArgs: [
        { from: 'action', key: 'assetType' },
        { from: 'action', key: 'stableType' },
        { from: 'context', key: 'outcomeType' },
        { from: 'context', key: 'witnessType' },
      ],
      argsPattern: 'standard',
    },
  },
  {
    sdkId: 'cancel_oracle_grant',
    description: 'Cancel oracle grant',
    staging: {
      package: 'futarchyOracleActions',
      module: 'oracle_init_actions',
      fn: 'add_cancel_grant_spec',
      params: [
        { name: 'assetType', from: { typeArgs: 0 } },
        { name: 'stableType', from: { typeArgs: 1 } },
      ],
    },
    execution: {
      package: 'futarchyOracleActions',
      module: 'oracle_actions',
      fn: 'do_cancel_grant',
      typeArgs: [
        { from: 'action', key: 'assetType' },
        { from: 'action', key: 'stableType' },
        { from: 'context', key: 'outcomeType' },
        { from: 'context', key: 'witnessType' },
      ],
      argsPattern: 'standard',
    },
  },
];

// ============================================================================
// Lookup helpers
// ============================================================================

/** Map by sdkId for quick lookup */
export const ACTION_BY_SDK_ID = new Map<string, ActionDefinition>(
  ACTION_REGISTRY.map(a => [a.sdkId, a])
);

/** Map by staging key (module::fn) for backend parser */
export const ACTION_BY_STAGING_KEY = new Map<string, ActionDefinition>(
  ACTION_REGISTRY.map(a => [`${a.staging.module}::${a.staging.fn}`, a])
);

/** Get action by SDK ID */
export function getActionBySdkId(sdkId: string): ActionDefinition | undefined {
  return ACTION_BY_SDK_ID.get(sdkId);
}

/** Get action by staging function key */
export function getActionByStagingKey(module: string, fn: string): ActionDefinition | undefined {
  return ACTION_BY_STAGING_KEY.get(`${module}::${fn}`);
}

/** Get all SDK IDs */
export function getAllSdkIds(): string[] {
  return ACTION_REGISTRY.map(a => a.sdkId);
}
