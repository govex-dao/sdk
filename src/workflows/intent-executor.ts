/**
 * Intent Executor - Executes staged actions via PTB pattern
 *
 * Implements the 3-layer action execution pattern:
 * 1. begin_execution → creates Executable hot potato
 * 2. N × do_init_* calls → execute each action in order
 * 3. finalize_execution → confirms all actions executed
 *
 * This hides all the complexity of witnesses, type arguments, and PTB construction.
 *
 * @module workflows/intent-executor
 */

import { Transaction, Inputs } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import {
  IntentExecutionConfig,
  IntentActionConfig,
  WorkflowTransaction,
  ObjectIdOrRef,
  isOwnedObjectRef,
  isTxSharedObjectRef,
} from './types';

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
 * Helper to get the object ID from an ObjectIdOrRef
 */
function getObjectId(input: ObjectIdOrRef): string {
  if (isOwnedObjectRef(input) || isTxSharedObjectRef(input)) {
    return input.objectId;
  }
  return input;
}

/**
 * Package IDs required for intent execution
 */
export interface IntentExecutorPackages {
  accountActionsPackageId: string;
  accountProtocolPackageId: string;
  futarchyCorePackageId: string;
  futarchyActionsPackageId: string;
  futarchyFactoryPackageId: string;
  futarchyGovernancePackageId: string;
  futarchyGovernanceActionsPackageId: string;
  futarchyOracleActionsPackageId: string;
  /** Required for FeeAdminCap type reference in fee admin governance actions */
  futarchyMarketsCorePackageId: string;
  packageRegistryId: string;
}

// NOTE: MetadataKeyTypes removed - CoinMetadata is no longer stored in Account
// Use sui::coin_registry::Currency<T> for metadata access instead

/**
 * Intent Executor - Builds PTBs for executing staged actions
 *
 * Supports all 60+ action types from the Futarchy protocol.
 *
 * @example
 * ```typescript
 * const executor = new IntentExecutor(client, packages);
 *
 * // Execute launchpad init actions
 * const tx = executor.execute({
 *   intentType: 'launchpad',
 *   accountId: '0x...',
 *   raiseId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   actions: [
 *     { action: 'create_stream', coinType: stableType },
 *     { action: 'create_pool_with_mint', assetType, stableType },
 *   ],
 * });
 *
 * // NOTE: return_metadata action was removed - CoinMetadata no longer stored in Account
 * // Use sui::coin_registry::Currency<T> for metadata access instead
 * ```
 */
export class IntentExecutor {
  private packages: IntentExecutorPackages;

  constructor(_client: SuiClient, packages: IntentExecutorPackages) {
    // Client kept for future use (async operations, object fetching)
    this.packages = packages;
  }

  /**
   * Execute a set of staged actions
   */
  execute(config: IntentExecutionConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    if (config.intentType === 'launchpad') {
      return this.executeLaunchpadIntent(tx, config, clockId);
    } else {
      return this.executeProposalIntent(tx, config, clockId);
    }
  }

  /**
   * Execute launchpad init actions
   */
  private executeLaunchpadIntent(
    tx: Transaction,
    config: IntentExecutionConfig,
    clockId: string
  ): WorkflowTransaction {
    if (!config.raiseId) {
      throw new Error('raiseId is required for launchpad intent execution');
    }

    const {
      accountActionsPackageId,
      futarchyCorePackageId,
      futarchyFactoryPackageId,
      packageRegistryId,
    } = this.packages;

    // 1. Begin execution - creates Executable hot potato
    const executable = tx.moveCall({
      target: `${futarchyFactoryPackageId}::dao_init_executor::begin_execution_for_launchpad`,
      arguments: [
        tx.pure.id(getObjectId(config.raiseId!)),
        txObject(tx, config.accountId),
        tx.object(packageRegistryId),
        tx.object(clockId),
      ],
    });

    // Create witnesses
    const versionWitness = tx.moveCall({
      target: `${accountActionsPackageId}::actions_version::current`,
      arguments: [],
    });

    const intentWitness = tx.moveCall({
      target: `${futarchyFactoryPackageId}::dao_init_executor::dao_init_intent_witness`,
      arguments: [],
    });

    // 2. Execute each action in order
    for (const action of config.actions) {
      this.executeAction(tx, executable, versionWitness, intentWitness, config, action, {
        configType: `${futarchyCorePackageId}::futarchy_config::FutarchyConfig`,
        outcomeType: `${futarchyFactoryPackageId}::dao_init_outcome::DaoInitOutcome`,
        witnessType: `${futarchyFactoryPackageId}::dao_init_executor::DaoInitIntent`,
        clockId,
      });
    }

    // 3. Finalize execution
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::dao_init_executor::finalize_execution`,
      arguments: [
        txObject(tx, config.accountId),
        executable,
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Execute ${config.actions.length} launchpad init action(s)`,
    };
  }

  /**
   * Execute proposal actions
   *
   * NOTE: begin_execution now does the following BEFORE returning the Executable:
   * - Finalizes market state and proposal (sets FINALIZED)
   * - Restores quantum LP to spot pool (clears active_proposal_id)
   *
   * This means actions execute on a "normal" spot pool with no active proposal blocking.
   */
  private executeProposalIntent(
    tx: Transaction,
    config: IntentExecutionConfig,
    clockId: string
  ): WorkflowTransaction {
    if (!config.proposalId || !config.escrowId || !config.spotPoolId || !config.lpType) {
      throw new Error('proposalId, escrowId, spotPoolId, and lpType are required for proposal intent execution');
    }

    const {
      accountActionsPackageId,
      futarchyCorePackageId,
      futarchyGovernancePackageId,
      packageRegistryId,
    } = this.packages;

    // 1. Begin execution (also finalizes proposal and restores quantum LP)
    const executable = tx.moveCall({
      target: `${futarchyGovernancePackageId}::ptb_executor::begin_execution`,
      typeArguments: [config.assetType, config.stableType, config.lpType!],
      arguments: [
        txObject(tx, config.accountId),
        tx.object(packageRegistryId),
        txObject(tx, config.proposalId!),
        txObject(tx, config.spotPoolId!),
        txObject(tx, config.escrowId!),
        tx.object(clockId),
      ],
    });

    // Create witnesses
    const versionWitness = tx.moveCall({
      target: `${accountActionsPackageId}::actions_version::current`,
      arguments: [],
    });

    const governanceWitness = tx.moveCall({
      target: `${futarchyCorePackageId}::futarchy_config::witness`,
      arguments: [],
    });

    // 2. Execute each action in order (spot pool is now "normal")
    for (const action of config.actions) {
      this.executeAction(tx, executable, versionWitness, governanceWitness, config, action, {
        configType: `${futarchyCorePackageId}::futarchy_config::FutarchyConfig`,
        outcomeType: `${futarchyCorePackageId}::futarchy_config::FutarchyOutcome`,
        witnessType: `${futarchyCorePackageId}::futarchy_config::ConfigWitness`,
        clockId,
      });
    }

    // 3. Finalize execution (confirm, emit events, refund proposer fee)
    tx.moveCall({
      target: `${futarchyGovernancePackageId}::ptb_executor::finalize_execution_success`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.accountId),
        tx.object(packageRegistryId),
        txObject(tx, config.proposalId!),
        txObject(tx, config.escrowId!),
        executable,
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Execute ${config.actions.length} proposal action(s)`,
    };
  }

  /**
   * Helper for PTB borrow/return pattern with capabilities.
   * Borrows a cap from the account, executes the action callback with it,
   * then returns the cap to the account.
   *
   * This implements the standard governance action pattern:
   * 1. access_control::do_borrow<Cap>(...) → returns cap
   * 2. do_some_action(..., &cap)
   * 3. access_control::do_return<Cap>(..., cap)
   */
  private withBorrowedCap(
    tx: Transaction,
    capType: string,
    ctx: {
      executable: ReturnType<Transaction['moveCall']>;
      accountId: ObjectIdOrRef;
      configType: string;
      outcomeType: string;
      witnessType: string;
      versionWitness: ReturnType<Transaction['moveCall']>;
      intentWitness: ReturnType<Transaction['moveCall']>;
    },
    action: (cap: ReturnType<Transaction['moveCall']>) => void
  ): void {
    const { accountActionsPackageId, packageRegistryId } = this.packages;

    // 1. Borrow cap from account
    const cap = tx.moveCall({
      target: `${accountActionsPackageId}::access_control::do_borrow`,
      typeArguments: [ctx.configType, ctx.outcomeType, capType, ctx.witnessType],
      arguments: [
        ctx.executable,
        txObject(tx, ctx.accountId),
        tx.object(packageRegistryId),
        ctx.versionWitness,
        ctx.intentWitness,
      ],
    });

    // 2. Execute the action with borrowed cap
    action(cap);

    // 3. Return cap to account
    tx.moveCall({
      target: `${accountActionsPackageId}::access_control::do_return`,
      typeArguments: [ctx.configType, ctx.outcomeType, capType, ctx.witnessType],
      arguments: [
        ctx.executable,
        txObject(tx, ctx.accountId),
        tx.object(packageRegistryId),
        cap,
        ctx.versionWitness,
        ctx.intentWitness,
      ],
    });
  }

  /**
   * Execute a single action within the intent
   */
  private executeAction(
    tx: Transaction,
    executable: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>,
    config: IntentExecutionConfig,
    action: IntentActionConfig,
    typeContext: {
      configType: string;
      outcomeType: string;
      witnessType: string;
      clockId: string;
    }
  ): void {
    const {
      accountActionsPackageId,
      futarchyActionsPackageId,
      futarchyGovernanceActionsPackageId,
      futarchyOracleActionsPackageId,
      packageRegistryId,
    } = this.packages;

    const { configType, outcomeType, witnessType, clockId } = typeContext;

    // Common context for cap-based actions
    const capContext = {
      executable,
      accountId: config.accountId,
      configType,
      outcomeType,
      witnessType,
      versionWitness,
      intentWitness,
    };

    switch (action.action) {
      // =========================================================================
      // ACCOUNT ACTIONS - STREAM
      // =========================================================================
      case 'create_stream':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_create_stream`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(clockId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'cancel_stream':
        // do_cancel_stream requires: executable, account, registry, clock, version, witness, ctx
        // vault_name is now read from ActionSpec (not passed as parameter)
        // Returns: (Coin<CoinType>, u64)
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_cancel_stream`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(clockId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - VAULT
      // =========================================================================
      case 'deposit':
        // do_init_deposit takes coin from executable_resources (deterministic!)
        // No coin parameter - coin comes from previous action via executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_deposit`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'spend':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_spend`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'approve_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_approve_coin_type`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'remove_approved_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_remove_approved_coin_type`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'deposit_from_resources':
        // Deposits coin from executable_resources into specified vault
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_deposit_from_resources`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - CURRENCY
      // =========================================================================
      case 'mint':
        // do_init_mint mints coins and stores them in executable_resources via provide_coin
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_mint`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'burn':
        // do_init_burn takes coin from executable_resources (deterministic!)
        // No coin parameter - coin comes from previous action via executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_burn`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'disable_currency':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_disable`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'update_currency':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_update`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'return_treasury_cap':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_remove_treasury_cap`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      // NOTE: 'return_metadata' action removed - CoinMetadata is no longer stored in Account
      // Use sui::coin_registry::Currency<T> for metadata access instead

      // =========================================================================
      // ACCOUNT ACTIONS - TRANSFER (objects via provide_object)
      // =========================================================================
      case 'transfer':
        // do_init_transfer takes object from executable_resources (deterministic!)
        // No object parameter - object comes from previous action via executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer::do_init_transfer`,
          typeArguments: [outcomeType, action.objectType, witnessType],
          arguments: [
            executable,
            intentWitness,
          ],
        });
        break;

      case 'transfer_to_sender':
        // do_init_transfer_to_sender takes object from executable_resources (deterministic!)
        // No object parameter - object comes from previous action via executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer::do_init_transfer_to_sender`,
          typeArguments: [outcomeType, action.objectType, witnessType],
          arguments: [
            executable,
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - TRANSFER (coins via provide_coin)
      // =========================================================================
      case 'transfer_coin':
        // do_init_transfer_coin takes coin from executable_resources via take_coin
        // Use this when coin was placed via provide_coin (e.g., VaultSpend, CurrencyMint)
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer::do_init_transfer_coin`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            intentWitness,
          ],
        });
        break;

      case 'transfer_coin_to_sender':
        // do_init_transfer_coin_to_sender takes coin from executable_resources via take_coin
        // Transfers to whoever executes the intent (cranker) - used for crank fees
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer::do_init_transfer_coin_to_sender`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - PACKAGE UPGRADE
      // =========================================================================
      case 'upgrade_package':
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade::do_upgrade`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'commit_upgrade':
        // Use do_commit_dao_only for proposal/launchpad context (no commit cap)
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade::do_commit_dao_only`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'restrict_upgrade':
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade::do_restrict`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - ACCESS CONTROL
      // =========================================================================
      case 'borrow_access':
        tx.moveCall({
          target: `${accountActionsPackageId}::access_control::do_borrow`,
          typeArguments: [configType, outcomeType, action.capType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'return_access':
        tx.moveCall({
          target: `${accountActionsPackageId}::access_control::do_return`,
          typeArguments: [configType, outcomeType, action.capType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - MEMO
      // =========================================================================
      case 'memo':
        // do_emit_memo signature: (executable, account, intent_witness, clock, ctx)
        tx.moveCall({
          target: `${accountActionsPackageId}::memo::do_emit_memo`,
          typeArguments: [configType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // FUTARCHY CONFIG ACTIONS
      // =========================================================================
      case 'set_proposals_enabled':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_set_proposals_enabled`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'terminate_dao':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_terminate_dao`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_dao_name':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_name`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_trading_params':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_trading_params`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_dao_metadata':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_metadata`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_twap_config':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_twap_config`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_governance':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_governance`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_metadata_table':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_metadata_table`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_conditional_metadata':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_conditional_metadata`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_sponsorship_config':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_sponsorship_config`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // FUTARCHY QUOTA ACTIONS
      // =========================================================================
      case 'set_quotas':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::quota_actions::do_set_quotas`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // FUTARCHY LIQUIDITY ACTIONS
      // =========================================================================
      case 'create_pool_with_mint':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_init_actions::do_init_create_pool_with_mint`,
          typeArguments: [
            configType,
            outcomeType,
            action.assetType,
            action.stableType,
            action.lpType,
            witnessType,
          ],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(action.lpTreasuryCapId),
            tx.object(action.lpCurrencyId),
            tx.object(clockId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      // NOTE: The following actions use ResourceRequest pattern and are NOT supported
      // in launchpad/proposal execution. They require separate PTB flows with fulfill_*:
      // - add_liquidity
      // - remove_liquidity_to_resources
      // - swap

      // =========================================================================
      // FUTARCHY DISSOLUTION ACTIONS
      // =========================================================================
      case 'create_dissolution_capability':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_actions::do_create_dissolution_capability`,
          typeArguments: [action.assetType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // GOVERNANCE ACTIONS - PACKAGE REGISTRY
      // PTB Borrow/Return Pattern: These actions require PackageAdminCap
      // =========================================================================
      case 'add_package': {
        const packageAdminCapType = `${this.packages.accountProtocolPackageId}::package_registry::PackageAdminCap`;
        this.withBorrowedCap(tx, packageAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::package_registry_actions::do_add_package`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), versionWitness, intentWitness, tx.object(packageRegistryId), cap],
          });
        });
        break;
      }

      case 'remove_package': {
        const packageAdminCapType = `${this.packages.accountProtocolPackageId}::package_registry::PackageAdminCap`;
        this.withBorrowedCap(tx, packageAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::package_registry_actions::do_remove_package`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), versionWitness, intentWitness, tx.object(packageRegistryId), cap],
          });
        });
        break;
      }

      case 'update_package_version': {
        const packageAdminCapType = `${this.packages.accountProtocolPackageId}::package_registry::PackageAdminCap`;
        this.withBorrowedCap(tx, packageAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::package_registry_actions::do_update_package_version`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), versionWitness, intentWitness, tx.object(packageRegistryId), cap],
          });
        });
        break;
      }

      case 'update_package_metadata': {
        const packageAdminCapType = `${this.packages.accountProtocolPackageId}::package_registry::PackageAdminCap`;
        this.withBorrowedCap(tx, packageAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::package_registry_actions::do_update_package_metadata`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), versionWitness, intentWitness, tx.object(packageRegistryId), cap],
          });
        });
        break;
      }

      // =========================================================================
      // GOVERNANCE ACTIONS - PROTOCOL ADMIN (FactoryOwnerCap)
      // PTB Borrow/Return Pattern: These actions require FactoryOwnerCap
      // =========================================================================
      case 'set_factory_paused': {
        if (!config.factoryId) throw new Error('factoryId is required for set_factory_paused action');
        const factoryOwnerCapType = `${this.packages.futarchyFactoryPackageId}::factory::FactoryOwnerCap`;
        this.withBorrowedCap(tx, factoryOwnerCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_set_factory_paused`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.factoryId!), cap],
          });
        });
        break;
      }

      case 'disable_factory_permanently': {
        if (!config.factoryId) throw new Error('factoryId is required for disable_factory_permanently action');
        const factoryOwnerCapType = `${this.packages.futarchyFactoryPackageId}::factory::FactoryOwnerCap`;
        this.withBorrowedCap(tx, factoryOwnerCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_disable_factory_permanently`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.factoryId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'add_stable_type': {
        if (!config.factoryId) throw new Error('factoryId is required for add_stable_type action');
        const factoryOwnerCapType = `${this.packages.futarchyFactoryPackageId}::factory::FactoryOwnerCap`;
        this.withBorrowedCap(tx, factoryOwnerCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_add_stable_type`,
            typeArguments: [outcomeType, witnessType, action.stableType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.factoryId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'remove_stable_type': {
        if (!config.factoryId) throw new Error('factoryId is required for remove_stable_type action');
        const factoryOwnerCapType = `${this.packages.futarchyFactoryPackageId}::factory::FactoryOwnerCap`;
        this.withBorrowedCap(tx, factoryOwnerCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_remove_stable_type`,
            typeArguments: [outcomeType, witnessType, action.stableType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.factoryId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      // =========================================================================
      // GOVERNANCE ACTIONS - PROTOCOL ADMIN (FeeAdminCap)
      // PTB Borrow/Return Pattern: These actions require FeeAdminCap
      // Exception: apply_pending_coin_fees does NOT require a cap
      // =========================================================================
      case 'update_dao_creation_fee': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for update_dao_creation_fee action');
        const feeAdminCapType = `${this.packages.futarchyMarketsCorePackageId}::fee::FeeAdminCap`;
        this.withBorrowedCap(tx, feeAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_update_dao_creation_fee`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'update_proposal_fee': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for update_proposal_fee action');
        const feeAdminCapType = `${this.packages.futarchyMarketsCorePackageId}::fee::FeeAdminCap`;
        this.withBorrowedCap(tx, feeAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_update_proposal_fee`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'update_verification_fee': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for update_verification_fee action');
        const feeAdminCapType = `${this.packages.futarchyMarketsCorePackageId}::fee::FeeAdminCap`;
        this.withBorrowedCap(tx, feeAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_update_verification_fee`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'add_verification_level': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for add_verification_level action');
        const feeAdminCapType = `${this.packages.futarchyMarketsCorePackageId}::fee::FeeAdminCap`;
        this.withBorrowedCap(tx, feeAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_add_verification_level`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'remove_verification_level': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for remove_verification_level action');
        const feeAdminCapType = `${this.packages.futarchyMarketsCorePackageId}::fee::FeeAdminCap`;
        this.withBorrowedCap(tx, feeAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_remove_verification_level`,
            typeArguments: [outcomeType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'withdraw_fees_to_treasury': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for withdraw_fees_to_treasury action');
        const feeAdminCapType = `${this.packages.futarchyMarketsCorePackageId}::fee::FeeAdminCap`;
        this.withBorrowedCap(tx, feeAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_withdraw_fees_to_treasury`,
            typeArguments: [configType, outcomeType, action.coinType, witnessType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'add_coin_fee_config': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for add_coin_fee_config action');
        const feeAdminCapType = `${this.packages.futarchyMarketsCorePackageId}::fee::FeeAdminCap`;
        this.withBorrowedCap(tx, feeAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_add_coin_fee_config`,
            typeArguments: [outcomeType, witnessType, action.coinType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'update_coin_creation_fee': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for update_coin_creation_fee action');
        const feeAdminCapType = `${this.packages.futarchyMarketsCorePackageId}::fee::FeeAdminCap`;
        this.withBorrowedCap(tx, feeAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_update_coin_creation_fee`,
            typeArguments: [outcomeType, witnessType, action.coinType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      case 'update_coin_proposal_fee': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for update_coin_proposal_fee action');
        const feeAdminCapType = `${this.packages.futarchyMarketsCorePackageId}::fee::FeeAdminCap`;
        this.withBorrowedCap(tx, feeAdminCapType, capContext, (cap) => {
          tx.moveCall({
            target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_update_coin_proposal_fee`,
            typeArguments: [outcomeType, witnessType, action.coinType],
            arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId!), cap, tx.object(clockId)],
          });
        });
        break;
      }

      // apply_pending_coin_fees does NOT require FeeAdminCap - anyone can call after delay
      case 'apply_pending_coin_fees': {
        if (!config.feeManagerId) throw new Error('feeManagerId is required for apply_pending_coin_fees action');
        tx.moveCall({
          target: `${futarchyGovernanceActionsPackageId}::protocol_admin_actions::do_apply_pending_coin_fees`,
          typeArguments: [outcomeType, witnessType, action.coinType],
          arguments: [executable, txObject(tx, config.accountId), tx.object(packageRegistryId), versionWitness, intentWitness, txObject(tx, config.feeManagerId), tx.object(clockId)],
        });
        break;
      }

      // =========================================================================
      // ORACLE ACTIONS
      // =========================================================================
      case 'create_oracle_grant':
        tx.moveCall({
          target: `${futarchyOracleActionsPackageId}::oracle_actions::do_create_oracle_grant`,
          typeArguments: [action.assetType, action.stableType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'cancel_oracle_grant':
        tx.moveCall({
          target: `${futarchyOracleActionsPackageId}::oracle_actions::do_cancel_grant`,
          typeArguments: [action.assetType, action.stableType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      default:
        throw new Error(`Unknown action type: ${(action as { action: string }).action}`);
    }
  }
}
