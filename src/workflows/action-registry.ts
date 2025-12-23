/**
 * Action Registry - Maps action types to their execution handlers
 *
 * Uses a declarative pattern for action execution, reducing code duplication.
 *
 * @module workflows/action-registry
 */

import { Transaction, TransactionResult, Inputs } from '@mysten/sui/transactions';
import { IntentExecutionConfig, ObjectIdOrRef, isOwnedObjectRef, isTxSharedObjectRef } from './types/index';
import type { IntentExecutorPackages } from './intent-executor';

/**
 * Helper to convert ObjectIdOrRef to transaction object argument.
 * Uses Inputs.ObjectRef for owned objects and sharedObjectRef for shared objects.
 */
function txObject(tx: Transaction, input: ObjectIdOrRef) {
  if (isTxSharedObjectRef(input)) {
    const sharedVersion =
      typeof input.initialSharedVersion === 'string'
        ? input.initialSharedVersion
        : String(input.initialSharedVersion);
    return tx.object(
      Inputs.SharedObjectRef({
        objectId: input.objectId,
        initialSharedVersion: sharedVersion,
        mutable: input.mutable,
      })
    );
  }
  if (isOwnedObjectRef(input)) {
    return tx.object(
      Inputs.ObjectRef({
        objectId: input.objectId,
        version: typeof input.version === 'string' ? input.version : String(input.version),
        digest: input.digest,
      })
    );
  }
  return tx.object(input);
}

/**
 * Action parameters - all possible fields from any action type
 * Using this permissive type allows handlers to access action-specific fields
 */
export interface ActionParams {
  action: string;
  coinType?: string;
  objectType?: string;
  capType?: string;
  keyType?: string;
  assetType?: string;
  stableType?: string;
  lpType?: string;
  lpTreasuryCapId?: string;
  lpMetadataId?: string;
  poolId?: string;
}

/**
 * Context passed to action handlers
 */
export interface ActionContext {
  tx: Transaction;
  executable: TransactionResult;
  versionWitness: TransactionResult;
  intentWitness: TransactionResult;
  config: IntentExecutionConfig;
  packages: IntentExecutorPackages;
  typeContext: {
    configType: string;
    outcomeType: string;
    witnessType: string;
    clockId: string;
  };
}

/**
 * Handler function signature for actions
 */
export type ActionHandler = (ctx: ActionContext, action: ActionParams) => void;

/**
 * Registry of action handlers
 */
const actionHandlers = new Map<string, ActionHandler>();

/**
 * Register an action handler
 */
export function registerAction(actionType: string, handler: ActionHandler): void {
  actionHandlers.set(actionType, handler);
}

/**
 * Execute an action using the registry
 */
export function executeAction(actionType: string, ctx: ActionContext, action: ActionParams): void {
  const handler = actionHandlers.get(actionType);
  if (!handler) {
    throw new Error(`Unknown action type: ${actionType}`);
  }
  handler(ctx, action);
}

/**
 * Check if an action type is registered
 */
export function hasAction(actionType: string): boolean {
  return actionHandlers.has(actionType);
}

// ============================================================================
// ACCOUNT ACTIONS - STREAM
// ============================================================================

registerAction('create_stream', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_init_create_stream`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), tx.object(typeContext.clockId), versionWitness, intentWitness],
  });
});

registerAction('cancel_stream', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_cancel_stream`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), tx.object(typeContext.clockId), versionWitness, intentWitness],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - VAULT
// ============================================================================

registerAction('deposit', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_init_deposit`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('spend', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_spend`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('approve_coin_type', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_approve_coin_type`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('remove_approved_coin_type', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_remove_approved_coin_type`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - CURRENCY
// ============================================================================

registerAction('mint', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_mint`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('burn', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_burn`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('disable_currency', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_disable`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('update_currency', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_update`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('return_treasury_cap', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_remove_treasury_cap`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('return_metadata', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  const keyType = action.keyType!;
  const keyModule = keyType.includes('::factory::')
    ? packages.futarchyFactoryPackageId
    : packages.accountActionsPackageId;

  const metadataKey = tx.moveCall({
    target: `${keyModule}::${keyType.includes('::factory::') ? 'factory' : 'currency'}::coin_metadata_key`,
    typeArguments: [action.coinType!],
    arguments: [],
  });

  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_remove_metadata`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, keyType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), metadataKey, versionWitness, intentWitness],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - TRANSFER
// ============================================================================

registerAction('transfer', (ctx, action) => {
  const { tx, executable, intentWitness, typeContext } = ctx;
  tx.moveCall({
    target: `${ctx.packages.accountActionsPackageId}::transfer::do_init_transfer`,
    typeArguments: [typeContext.outcomeType, action.objectType!, typeContext.witnessType],
    arguments: [executable, intentWitness],
  });
});

registerAction('transfer_to_sender', (ctx, action) => {
  const { tx, executable, intentWitness, typeContext } = ctx;
  tx.moveCall({
    target: `${ctx.packages.accountActionsPackageId}::transfer::do_init_transfer_to_sender`,
    typeArguments: [typeContext.outcomeType, action.objectType!, typeContext.witnessType],
    arguments: [executable, intentWitness],
  });
});

registerAction('transfer_coin', (ctx, action) => {
  const { tx, executable, intentWitness, typeContext } = ctx;
  tx.moveCall({
    target: `${ctx.packages.accountActionsPackageId}::transfer::do_init_transfer_coin`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, intentWitness],
  });
});

registerAction('transfer_coin_to_sender', (ctx, action) => {
  const { tx, executable, intentWitness, typeContext } = ctx;
  tx.moveCall({
    target: `${ctx.packages.accountActionsPackageId}::transfer::do_init_transfer_coin_to_sender`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, intentWitness],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - PACKAGE UPGRADE
// ============================================================================

registerAction('upgrade_package', (ctx) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::package_upgrade::do_upgrade`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('commit_upgrade', (ctx) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::package_upgrade::do_commit_dao_only`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('restrict_upgrade', (ctx) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::package_upgrade::do_restrict`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('create_commit_cap', (ctx) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::package_upgrade::do_create_commit_cap`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - ACCESS CONTROL
// ============================================================================

registerAction('borrow_access', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::access_control::do_borrow`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.capType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

registerAction('return_access', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::access_control::do_return`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.capType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - MEMO
// ============================================================================

registerAction('memo', (ctx) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::memo::do_emit_memo`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), intentWitness, tx.object(typeContext.clockId)],
  });
});

// ============================================================================
// FUTARCHY CONFIG ACTIONS
// ============================================================================

const configActionNames = [
  'set_proposals_enabled',
  'terminate_dao',
  'update_dao_name',
  'update_trading_params',
  'update_dao_metadata',
  'update_twap_config',
  'update_governance',
  'update_metadata_table',
  'update_conditional_metadata',
  'update_sponsorship_config',
] as const;

const configActionTargets: Record<typeof configActionNames[number], string> = {
  'set_proposals_enabled': 'do_set_proposals_enabled',
  'terminate_dao': 'do_terminate_dao',
  'update_dao_name': 'do_update_name',
  'update_trading_params': 'do_update_trading_params',
  'update_dao_metadata': 'do_update_metadata',
  'update_twap_config': 'do_update_twap_config',
  'update_governance': 'do_update_governance',
  'update_metadata_table': 'do_update_metadata_table',
  'update_conditional_metadata': 'do_update_conditional_metadata',
  'update_sponsorship_config': 'do_update_sponsorship_config',
};

for (const actionName of configActionNames) {
  registerAction(actionName, (ctx) => {
    const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
    tx.moveCall({
      target: `${packages.futarchyActionsPackageId}::config_actions::${configActionTargets[actionName]}`,
      typeArguments: [typeContext.outcomeType, typeContext.witnessType],
      arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
    });
  });
}

// ============================================================================
// FUTARCHY QUOTA ACTIONS
// ============================================================================

registerAction('set_quotas', (ctx) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::quota_actions::do_set_quotas`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
  });
});

// ============================================================================
// FUTARCHY LIQUIDITY ACTIONS
// ============================================================================

registerAction('create_pool_with_mint', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::liquidity_init_actions::do_init_create_pool_with_mint`,
    typeArguments: [
      typeContext.configType,
      typeContext.outcomeType,
      action.assetType!,
      action.stableType!,
      action.lpType!,
      typeContext.witnessType,
    ],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      tx.object(action.lpTreasuryCapId!),
      tx.object(action.lpMetadataId!),
      tx.object(typeContext.clockId),
      versionWitness,
      intentWitness,
    ],
  });
});

registerAction('update_pool_fee', (ctx, action) => {
  const { tx, executable, versionWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::liquidity_actions::do_update_pool_fee`,
    typeArguments: [
      action.assetType!,
      action.stableType!,
      action.lpType!,
      typeContext.outcomeType,
    ],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(action.poolId!),
      versionWitness,
    ],
  });
});

// ============================================================================
// FUTARCHY DISSOLUTION ACTIONS
// ============================================================================

registerAction('create_dissolution_capability', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::dissolution_actions::do_create_dissolution_capability`,
    typeArguments: [action.assetType!, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
  });
});

// ============================================================================
// GOVERNANCE ACTIONS - PACKAGE REGISTRY
// ============================================================================

const packageRegistryActionNames = [
  'add_package',
  'remove_package',
  'update_package_version',
  'update_package_metadata',
  'pause_account_creation',
  'unpause_account_creation',
] as const;

const packageRegistryActionTargets: Record<typeof packageRegistryActionNames[number], string> = {
  'add_package': 'do_add_package',
  'remove_package': 'do_remove_package',
  'update_package_version': 'do_update_package_version',
  'update_package_metadata': 'do_update_package_metadata',
  'pause_account_creation': 'do_pause_account_creation',
  'unpause_account_creation': 'do_unpause_account_creation',
};

for (const actionName of packageRegistryActionNames) {
  registerAction(actionName, (ctx) => {
    const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
    tx.moveCall({
      target: `${packages.futarchyGovernanceActionsPackageId}::package_registry_actions::${packageRegistryActionTargets[actionName]}`,
      typeArguments: [typeContext.outcomeType, typeContext.witnessType],
      arguments: [executable, txObject(tx, config.accountId), versionWitness, intentWitness, tx.object(packages.packageRegistryId)],
    });
  });
}

// ============================================================================
// GOVERNANCE ACTIONS - PROTOCOL ADMIN (no coin type)
// ============================================================================

const protocolAdminActionNames = [
  'set_factory_paused',
  'disable_factory_permanently',
  'update_dao_creation_fee',
  'update_proposal_fee',
  'update_verification_fee',
  'add_verification_level',
  'remove_verification_level',
] as const;

const protocolAdminActionTargets: Record<typeof protocolAdminActionNames[number], string> = {
  'set_factory_paused': 'do_set_factory_paused',
  'disable_factory_permanently': 'do_disable_factory_permanently',
  'update_dao_creation_fee': 'do_update_dao_creation_fee',
  'update_proposal_fee': 'do_update_proposal_fee',
  'update_verification_fee': 'do_update_verification_fee',
  'add_verification_level': 'do_add_verification_level',
  'remove_verification_level': 'do_remove_verification_level',
};

for (const actionName of protocolAdminActionNames) {
  registerAction(actionName, (ctx) => {
    const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
    tx.moveCall({
      target: `${packages.futarchyGovernanceActionsPackageId}::protocol_admin_actions::${protocolAdminActionTargets[actionName]}`,
      typeArguments: [typeContext.outcomeType, typeContext.witnessType],
      arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
    });
  });
}

// ============================================================================
// GOVERNANCE ACTIONS - PROTOCOL ADMIN (with stable type)
// ============================================================================

registerAction('add_stable_type', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_add_stable_type`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType, action.stableType!],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
  });
});

registerAction('remove_stable_type', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_remove_stable_type`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType, action.stableType!],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
  });
});

// ============================================================================
// GOVERNANCE ACTIONS - PROTOCOL ADMIN (with coin type)
// ============================================================================

registerAction('withdraw_fees_to_treasury', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_withdraw_fees_to_treasury`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
  });
});

const coinFeeActionNames = [
  'add_coin_fee_config',
  'update_coin_creation_fee',
  'update_coin_proposal_fee',
  'apply_pending_coin_fees',
] as const;

const coinFeeActionTargets: Record<typeof coinFeeActionNames[number], string> = {
  'add_coin_fee_config': 'do_add_coin_fee_config',
  'update_coin_creation_fee': 'do_update_coin_creation_fee',
  'update_coin_proposal_fee': 'do_update_coin_proposal_fee',
  'apply_pending_coin_fees': 'do_apply_pending_coin_fees',
};

for (const actionName of coinFeeActionNames) {
  registerAction(actionName, (ctx, action) => {
    const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
    tx.moveCall({
      target: `${packages.futarchyGovernanceActionsPackageId}::protocol_admin_actions::${coinFeeActionTargets[actionName]}`,
      typeArguments: [typeContext.outcomeType, typeContext.witnessType, action.coinType!],
      arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
    });
  });
}

// ============================================================================
// ORACLE ACTIONS
// ============================================================================

registerAction('create_oracle_grant', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyOracleActionsPackageId}::oracle_actions::do_create_oracle_grant`,
    typeArguments: [action.assetType!, action.stableType!, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
  });
});

registerAction('cancel_oracle_grant', (ctx, action) => {
  const { tx, executable, versionWitness, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyOracleActionsPackageId}::oracle_actions::do_cancel_grant`,
    typeArguments: [action.assetType!, action.stableType!, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), versionWitness, intentWitness, tx.object(typeContext.clockId)],
  });
});
